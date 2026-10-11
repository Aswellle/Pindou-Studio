-- 0020: 管理员授予/撤销助手的邮箱匹配改为大小写不敏感。
-- GoTrue 注册时邮箱统一转小写,而 Postgres 的 = 区分大小写:
-- 用大写/混写邮箱调用会得到误导性的 user_not_found(fail-safe,无安全影响,纯运维体验)。
-- 函数体与 0019 一致,仅 select 条件改为 lower(email) = lower(p_email);
-- create or replace 幂等,可对已应用 0019 的库直接执行。

create or replace function public.admin_grant_by_email(p_email text, p_note text default null)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_id is null then
    return 'user_not_found';
  end if;
  insert into public.admin_allowlist (user_id, email, note)
    values (v_id, p_email, p_note)
    on conflict (user_id) do update set email = excluded.email, note = coalesce(excluded.note, public.admin_allowlist.note);
  update public.profiles set role = 'admin' where id = v_id;
  return 'granted';
end;
$$;

create or replace function public.admin_revoke_by_email(p_email text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_id is null then
    return 'user_not_found';
  end if;
  update public.profiles set role = 'user' where id = v_id;
  delete from public.admin_allowlist where user_id = v_id;
  return 'revoked';
end;
$$;

-- 权限面与 0019 保持一致:仅 service_role 可执行(否则等于给了提权入口!)
revoke all on function public.admin_grant_by_email(text, text) from public, anon, authenticated;
revoke all on function public.admin_revoke_by_email(text) from public, anon, authenticated;
grant execute on function public.admin_grant_by_email(text, text) to service_role;
grant execute on function public.admin_revoke_by_email(text) to service_role;
