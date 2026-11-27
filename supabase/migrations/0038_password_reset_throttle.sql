-- ============================================================
-- 用户名账号找回密码:失败节流改为「用户名 + 请求来源」维度
--
-- 0036 的节流按用户名计数:任意匿名者连续提交 8 次错误安全密钥,
-- 就能把受害者的找回入口锁 15 分钟,而且可以持续续锁;同时
-- user_not_found 与 invalid_security_key 分开返回,等于免费的用户名探测器。
--
-- 本次调整:
--   1. 失败计数键加入请求 IP(尽力从请求头提取);攻击者只能锁住自己的
--      IP+用户名组合,受害者在其他网络仍可正常找回。
--   2. 用户不存在与密钥错误统一返回 invalid_security_key,并同样计入失败;
--      不再提供 user_not_found 枚举信号。
--   3. 失败 8 次后只锁该组合 15 分钟;成功仍清零并撤销全部会话。
--
-- IP 头不是强身份(可被伪造),这里只用于降低「远程锁死他人」的成本;
-- 真正的凭据仍是安全密钥。幂等,可重复执行。
-- ============================================================

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
  v_username_key text;
  v_headers jsonb;
  v_ip text;
  v_subject text;
  v_failures integer;
  v_locked_until timestamptz;
  v_key_ok boolean := false;
begin
  if p_security_key is null or p_security_key = '' then
    raise exception 'invalid_security_key';
  end if;
  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'weak_password';
  end if;

  v_username_key := lower(coalesce(p_username, ''));

  -- 请求头只在 PostgREST 上下文存在;取 cf-connecting-ip / x-real-ip,
  -- 最后才用 x-forwarded-for 的链尾。异常一律降级为 unknown。
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    v_ip := btrim(coalesce(
      v_headers ->> 'cf-connecting-ip',
      v_headers ->> 'x-real-ip',
      v_headers ->> 'x-forwarded-for',
      ''
    ));
    if v_ip like '%,%' then
      v_ip := btrim((string_to_array(v_ip, ','))[array_length(string_to_array(v_ip, ','), 1)]);
    end if;
  exception when others then
    v_ip := null;
  end;

  v_subject := v_username_key || '|' || left(coalesce(nullif(v_ip, ''), 'unknown'), 64);

  select count, locked_until into v_failures, v_locked_until
  from private.rpc_rate_window
  where bucket = 'reset_attempt' and subject = v_subject
  for update;

  v_failures := coalesce(v_failures, 0);
  if coalesce(v_locked_until, to_timestamp(0)) > now() then
    raise exception 'temporarily_locked';
  end if;

  select id into v_user_id
  from auth.users
  where raw_user_meta_data ->> 'username' = p_username
  limit 1;

  if v_user_id is not null then
    select security_key_hash into v_key_hash
    from public.profiles
    where id = v_user_id;

    v_key_ok := v_key_hash is not null
      and v_key_hash <> ''
      and v_key_hash = crypt(p_security_key, v_key_hash);
  end if;

  if not v_key_ok then
    -- 不区分「用户不存在」与「密钥错误」:两者都计数,都返回同一错误。
    insert into private.rpc_rate_window (bucket, subject, window_start, count)
    values ('reset_attempt', v_subject, now(), 1)
    on conflict (bucket, subject) do update
      set count = private.rpc_rate_window.count + 1,
          locked_until = case
            when private.rpc_rate_window.count + 1 >= 8 then now() + interval '15 minutes'
            else private.rpc_rate_window.locked_until
          end;

    if v_failures + 1 >= 8 then
      raise exception 'temporarily_locked';
    end if;
    raise exception 'invalid_security_key';
  end if;

  delete from private.rpc_rate_window
  where bucket = 'reset_attempt' and subject = v_subject;

  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf', 10)),
      updated_at = now()
  where id = v_user_id;

  begin
    delete from auth.sessions where user_id = v_user_id;
  exception when undefined_table then
    null;
  end;
  begin
    delete from auth.refresh_tokens where user_id = v_user_id;
  exception when undefined_table then
    null;
  end;
end;
$$;

revoke execute on function public.reset_password_custom(text, text, text) from public;
revoke execute on function public.reset_password_custom(text, text, text) from anon;
grant execute on function public.reset_password_custom(text, text, text) to anon, authenticated;

comment on function public.reset_password_custom(text, text, text) is
  '用户名+安全密钥找回密码:按用户名+请求来源节流,未知用户与错误密钥统一报错,成功后撤销既有会话。';
