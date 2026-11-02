-- ============================================================
-- 管理员用户管理操作补全审计与即时生效:
--
--   1. admin_audit_log 此前只覆盖「角色变更」与「白名单增删」(0019 触发器)。
--      删除 / 锁定 / 解锁用户这三个管理动作没有任何审计记录 —— 运营上是
--      最敏感的三个操作。改为在各 SECURITY DEFINER 函数内显式落审计行。
--   2. admin_lock_user 只设置 banned_until,拦不住**已经登录**的会话:
--      access token 在有效期内(默认 1 小时)照常读写。锁定时删除该用户的
--      refresh tokens / sessions,让既有会话立即失效,冻结真正即时生效。
--   3. 白名单审计触发器只挂了 insert or delete;admin_grant_by_email 的
--      ON CONFLICT DO UPDATE 路径(给已在白名单的用户换邮箱/备注)不会
--      触发任何审计。补上 UPDATE 分支。
--
-- 幂等,可重复执行。
-- ============================================================

-- ── 1. 锁定用户:7 天冻结 + 即时踢下线 + 审计 ────────────────
create or replace function public.admin_lock_user(p_user_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text;
  v_email text;
begin
  if not (select public.is_admin()) then
    raise exception 'not authorized';
  end if;
  select p.role, u.email::text into v_role, v_email
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = p_user_id;
  if v_role = 'admin' then
    raise exception 'cannot_modify_admin';
  end if;
  update auth.users set banned_until = now() + interval '7 days' where id = p_user_id;

  -- 冻结要即时生效:已签发的 access token 在有效期内仍然可用,只靠
  -- banned_until 拦不住。删除会话记录与刷新令牌,下次刷新/请求即失败,
  -- 重新登录时被 banned_until 门禁拦住。sessions 表在旧版 GoTrue 不存在。
  begin
    delete from auth.sessions where user_id = p_user_id;
  exception
    when undefined_table then null;
  end;
  delete from auth.refresh_tokens where user_id = p_user_id;

  insert into public.admin_audit_log (actor, actor_email, action, target, target_email, detail)
  values (
    auth.uid(),
    (select email::text from auth.users where id = auth.uid()),
    'user_lock', p_user_id, v_email,
    jsonb_build_object('until', now() + interval '7 days')
  );
end;
$$;
revoke execute on function public.admin_lock_user(uuid) from public;
grant execute on function public.admin_lock_user(uuid) to authenticated;

-- ── 2. 解锁用户:清除冻结 + 审计 ─────────────────────────────
create or replace function public.admin_unlock_user(p_user_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not (select public.is_admin()) then
    raise exception 'not authorized';
  end if;
  select email::text into v_email from auth.users where id = p_user_id;
  update auth.users set banned_until = null where id = p_user_id;

  insert into public.admin_audit_log (actor, actor_email, action, target, target_email)
  values (
    auth.uid(),
    (select email::text from auth.users where id = auth.uid()),
    'user_unlock', p_user_id, v_email
  );
end;
$$;
revoke execute on function public.admin_unlock_user(uuid) from public;
grant execute on function public.admin_unlock_user(uuid) to authenticated;

-- ── 3. 删除用户:级联 + 墓碑 + 审计 ──────────────────────────
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

  insert into public.admin_audit_log (actor, actor_email, action, target, target_email, detail)
  values (
    auth.uid(),
    (select email::text from auth.users where id = auth.uid()),
    'user_delete', p_user_id, v_email,
    jsonb_build_object('username', v_username)
  );

  delete from public.works where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
  delete from auth.users where id = p_user_id;
end;
$$;
revoke execute on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ── 4. 白名单审计:补上 UPDATE 路径 ──────────────────────────
create or replace function public.admin_audit_allowlist_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor_email text;
begin
  select email::text into v_actor_email from auth.users where id = auth.uid();

  insert into public.admin_audit_log (actor, actor_email, action, target, target_email, detail)
  values (
    auth.uid(),
    v_actor_email,
    case
      when tg_op = 'INSERT' then 'allowlist_add'
      when tg_op = 'UPDATE' then 'allowlist_update'
      else 'allowlist_remove'
    end,
    coalesce(new.user_id, old.user_id),
    coalesce(new.email, old.email),
    jsonb_build_object('note', coalesce(new.note, old.note))
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists on_allowlist_change on public.admin_allowlist;
create trigger on_allowlist_change
  after insert or update or delete on public.admin_allowlist
  for each row execute procedure public.admin_audit_allowlist_change();
