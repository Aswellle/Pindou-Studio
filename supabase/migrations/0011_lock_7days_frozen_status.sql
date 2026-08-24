-- ============================================================
-- 冻结细化:锁定 7 天 + 登录门禁返回剩余冻结天数
--   - 冻结(banned_until)改为 7 天:到期自动解冻,无需管理员手动解锁
--   - user_account_status 返回 (status, frozen_days):前端 toast 可告知冻结限期
-- 幂等,可重复执行。
-- ============================================================

-- ── 锁定:7 天到期自动解冻 ────────────────────────────────
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
  update auth.users set banned_until = now() + interval '7 days' where id = p_user_id;
end;
$$;

-- ── 登录门禁:返回 (status, frozen_days) ──────────────────
drop function if exists public.user_account_status(text, text);
create function public.user_account_status(p_email text default null, p_username text default null)
returns table (status text, frozen_days int)
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_email text;
  v_until timestamptz;
begin
  if p_email is null and p_username is not null then
    select email into v_email from auth.users
      where raw_user_meta_data->>'username' = lower(p_username) limit 1;
    if v_email is null then
      if exists(select 1 from public.removed_accounts where username = lower(p_username)) then
        return query select 'deleted'::text, null::int;
        return;
      end if;
      return query select 'none'::text, null::int;
      return;
    end if;
  else
    v_email := p_email;
  end if;

  if v_email is null then
    return query select 'none'::text, null::int;
    return;
  end if;

  if exists(select 1 from public.removed_accounts where email = v_email) then
    return query select 'deleted'::text, null::int;
    return;
  end if;

  select banned_until into v_until from auth.users where email = v_email limit 1;
  if v_until is not null and v_until > now() then
    return query select 'banned'::text, greatest(1, ceil(extract(day from (v_until - now()))))::int;
    return;
  end if;

  return query select 'none'::text, null::int;
end;
$$;
revoke execute on function public.user_account_status(text, text) from public;
grant execute on function public.user_account_status(text, text) to anon, authenticated;

-- ============================================================
-- Realtime:将后台仪表盘关注的表加入 supabase_realtime 发布,
-- 使 postgres_changes 订阅在新注册/模板增删改时即时触发(幂等)。
-- ============================================================
do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='templates') then
    alter publication supabase_realtime add table public.templates;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='categories') then
    alter publication supabase_realtime add table public.categories;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
