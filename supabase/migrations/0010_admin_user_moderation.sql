-- ============================================================
-- 用户管理:删除 / 锁定(封禁)站内违规用户
--   - 管理员自身拥有最高权限:所有操作拒绝作用于 admin 账号
--   - 删除:从 works/profiles/auth.users 级联移除,写墓碑(removed_accounts)
--     供登录时给出"因违反条款/不当行为被封禁删除"的明确提示
--   - 锁定:设置 auth.users.banned_until,冻结登录与使用权限,不删数据库行
--   - user_account_status:登录门禁查询,返回 'banned' | 'deleted' | 'none'
-- 幂等,可重复执行。
-- ============================================================

-- ── 被删除账号墓碑表(登录时提示用) ────────────────────────
create table if not exists public.removed_accounts (
  email text primary key,
  username text,
  reason text not null default 'violation',
  removed_at timestamptz not null default now()
);
alter table public.removed_accounts enable row level security;
drop policy if exists "removed_accounts_admin_all" on public.removed_accounts;
create policy "removed_accounts_admin_all"
  on public.removed_accounts for all
  using (public.is_admin()) with check (public.is_admin());

-- ── 登录门禁状态:解析邮箱/用户名 → banned | deleted | none ──
create or replace function public.user_account_status(p_email text default null, p_username text default null)
returns text
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_email text;
  v_uid uuid;
begin
  if p_email is null and p_username is not null then
    select email into v_email from auth.users
      where raw_user_meta_data->>'username' = lower(p_username) limit 1;
    if v_email is null then
      -- 已删除的自定义账号:resolve 不到,查墓碑
      if exists(select 1 from public.removed_accounts where username = lower(p_username)) then
        return 'deleted';
      end if;
      return 'none';
    end if;
  else
    v_email := p_email;
  end if;

  if v_email is null then return 'none'; end if;

  if exists(select 1 from public.removed_accounts where email = v_email) then
    return 'deleted';
  end if;

  select id into v_uid from auth.users where email = v_email limit 1;
  if v_uid is not null and exists(
    select 1 from auth.users
    where id = v_uid and banned_until is not null and banned_until > now()
  ) then
    return 'banned';
  end if;
  return 'none';
end;
$$;
revoke execute on function public.user_account_status(text, text) from public;
grant execute on function public.user_account_status(text, text) to anon, authenticated;

-- ── 删除用户(级联 + 墓碑) ────────────────────────────────
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text;
  v_username text;
  v_role text;
begin
  if not (select public.is_admin()) then
    raise exception 'not authorized';
  end if;
  select u.email, u.raw_user_meta_data->>'username', p.role
    into v_email, v_username, v_role
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
  if v_role = 'admin' then
    raise exception 'cannot_modify_admin';
  end if;
  if v_email is not null then
    insert into public.removed_accounts(email, username, reason)
    values (v_email, v_username, 'deleted')
    on conflict (email) do update
      set username = excluded.username, reason = 'deleted', removed_at = now();
  end if;
  delete from public.works where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
  delete from auth.users where id = p_user_id;
end;
$$;
revoke execute on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ── 锁定用户(冻结登录,banned_until 设为远期,不删数据库行) ──
create or replace function public.admin_lock_user(p_user_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if not (select public.is_admin()) then
    raise exception 'not authorized';
  end if;
  select p.role into v_role from public.profiles p where p.id = p_user_id;
  if v_role = 'admin' then
    raise exception 'cannot_modify_admin';
  end if;
  update auth.users set banned_until = now() + interval '100 years' where id = p_user_id;
end;
$$;
revoke execute on function public.admin_lock_user(uuid) from public;
grant execute on function public.admin_lock_user(uuid) to authenticated;

-- ── 解锁用户(清除 banned_until) ─────────────────────────
create or replace function public.admin_unlock_user(p_user_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'not authorized';
  end if;
  update auth.users set banned_until = null where id = p_user_id;
end;
$$;
revoke execute on function public.admin_unlock_user(uuid) from public;
grant execute on function public.admin_unlock_user(uuid) to authenticated;

-- ── admin_list_users 增加 banned 列(锁定状态展示) ────────
drop function if exists public.admin_list_users(text, int, int);
create function public.admin_list_users(
  search text default '',
  page int default 0,
  page_size int default 20
)
returns table (
  id uuid,
  email text,
  role text,
  nickname text,
  email_confirmed boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_custom boolean,
  banned boolean
)
language plpgsql security definer
set search_path = public
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'not authorized';
  end if;
  page_size := least(greatest(page_size, 1), 100);
  page := greatest(page, 0);
  return query
    select u.id, u.email::text, p.role,
           coalesce(nullif(p.nickname, ''), u.raw_user_meta_data->>'nickname') as nickname,
           (u.email_confirmed_at is not null) as email_confirmed,
           u.created_at,
           u.last_sign_in_at,
           (u.raw_user_meta_data->>'username' is not null) as is_custom,
           (u.banned_until is not null and u.banned_until > now()) as banned
    from auth.users u
    left join public.profiles p on p.id = u.id
    where search = ''
       or u.email ilike '%' || search || '%'
       or coalesce(p.nickname, u.raw_user_meta_data->>'nickname', '') ilike '%' || search || '%'
    order by u.created_at desc
    limit page_size offset page * page_size;
end;
$$;
grant execute on function public.admin_list_users(text, int, int) to authenticated;
