-- ============================================================
-- 自定义账号(用户名 + 安全密钥)支持
-- 方案:合成邮箱映射 —— 自定义账号以 `${username}@custom.local` 注册为
-- Supabase auth 用户,username 存于 raw_user_meta_data,登录时按用户名
-- 解析回合成邮箱。安全密钥哈希存 profiles.security_key_hash,用于找回密码。
-- 幂等,可重复执行
-- ============================================================

-- bcrypt 哈希(crypt/gen_salt)依赖 pgcrypto 扩展
create extension if not exists pgcrypto;

-- ── profiles 增加安全密钥哈希列 ─────────────────────────────
alter table public.profiles
  add column if not exists security_key_hash text;

-- ── 按用户名解析合成邮箱(登录用) ────────────────────────────
-- security definer:anon 无法直接读 auth.users
create or replace function public.resolve_auth_email(p_username text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select email
  from auth.users
  where raw_user_meta_data->>'username' = p_username
  limit 1;
$$;
revoke execute on function public.resolve_auth_email(text) from public;
grant execute on function public.resolve_auth_email(text) to anon, authenticated;

-- ── 用户名是否已占用(注册校验) ──────────────────────────────
create or replace function public.username_exists(p_username text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists(
    select 1 from auth.users
    where raw_user_meta_data->>'username' = p_username
  );
$$;
revoke execute on function public.username_exists(text) from public;
grant execute on function public.username_exists(text) to anon, authenticated;

-- ── 设置安全密钥哈希(注册时,需已登录会话) ──────────────────
create or replace function public.set_security_key(p_security_key text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.profiles
  set security_key_hash = crypt(p_security_key, gen_salt('bf'))
  where id = auth.uid();
$$;
revoke execute on function public.set_security_key(text) from public;
grant execute on function public.set_security_key(text) to authenticated;

-- ── 自定义账号找回密码:用户名 + 安全密钥校验后重置密码 ───────
create or replace function public.reset_password_custom(
  p_username text,
  p_security_key text,
  p_new_password text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_key_hash text;
begin
  select id into v_user_id
  from auth.users
  where raw_user_meta_data->>'username' = p_username
  limit 1;
  if v_user_id is null then
    raise exception 'user_not_found';
  end if;

  select security_key_hash into v_key_hash
  from public.profiles where id = v_user_id;
  if v_key_hash is null or v_key_hash = '' or v_key_hash <> crypt(p_security_key, v_key_hash) then
    raise exception 'invalid_security_key';
  end if;

  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  where id = v_user_id;
end;
$$;
revoke execute on function public.reset_password_custom(text, text, text) from public;
grant execute on function public.reset_password_custom(text, text, text) to anon, authenticated;
