-- ============================================================
-- 账号资料与安全密钥的写入面收紧:
--
--   1. profiles 列级授权:此前 authenticated 对整表持有 UPDATE,RLS 的
--      profiles_self_update 只拦「role 被改」—— 用户可以直接 UPDATE 自己的
--      security_key_hash(绕开 set_security_key 的语义)或 created_at。
--      改为列级授权:普通用户只能改 nickname / avatar_url,其余列
--      (role / created_at / security_key_hash / id)对 API 不可写。
--      SECURITY DEFINER 的管理 RPC 以表属主身份执行,不受影响。
--   2. set_security_key:此前接受任意值(含空串与 1 位密钥)。安全密钥是
--      用户名账号找回密码的唯一因子,过短的密钥等于没有。服务端加 6 位
--      下限,并把 bcrypt 成本显式提到 10(pgcrypto 默认 6)。
--   3. reset_password_custom:新密码哈希同样用 cost 10。
--      既有哈希仍按其内嵌成本校验,不需要迁移旧数据。
--
-- 幂等,可重复执行。
-- ============================================================

-- ── 1. profiles:收回表级 UPDATE,只放行昵称/头像两列 ────────
revoke update on public.profiles from anon, authenticated;
grant update (nickname, avatar_url) on public.profiles to authenticated;

-- ── 2. set_security_key:长度下限 + bcrypt cost 10 ──────────
create or replace function public.set_security_key(p_security_key text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- 找回密码的唯一因子不能是 1 位字符串;空值会让 crypt() 写入 NULL 哈希,
  -- 之后 reset_password_custom 直接按「未设置密钥」拒绝,找回通道整体失效。
  if p_security_key is null or length(p_security_key) < 6 then
    raise exception 'security_key_too_short';
  end if;

  update public.profiles
  set security_key_hash = crypt(p_security_key, gen_salt('bf', 10))
  where id = auth.uid();
end;
$$;
revoke execute on function public.set_security_key(text) from public;
grant execute on function public.set_security_key(text) to authenticated;

-- ── 3. reset_password_custom:新密码哈希 cost 10 ──
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
  -- crypt() 是 STRICT:密钥为 NULL 时比较结果整体为 NULL,
  -- 下面的 IF 不会进入,校验会被静默跳过。必须在比较之前拦下。
  if p_security_key is null or p_security_key = '' then
    raise exception 'invalid_security_key';
  end if;
  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'weak_password';
  end if;

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
  set encrypted_password = crypt(p_new_password, gen_salt('bf', 10)),
      updated_at = now()
  where id = v_user_id;
end;
$$;
revoke execute on function public.reset_password_custom(text, text, text) from public;
grant execute on function public.reset_password_custom(text, text, text) to anon, authenticated;
