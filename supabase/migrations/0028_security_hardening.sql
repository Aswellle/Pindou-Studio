-- ============================================================
-- 安全加固:收紧几处「授权面大于实际调用面」的 RPC,并修正两处
-- 依赖 NULL / MIME 语义的判断。
--
--   1. reset_password_custom:NULL 安全密钥会让 crypt() 返回 NULL,
--      PL/pgSQL 的 IF 把 NULL 当作非真,校验分支被整体跳过 ——
--      任何携带公钥 anon key 的访客都能重设他人密码。此处显式拒绝
--      NULL / 空密钥,并对新密码加上与服务端一致的 8 位下限。
--   2. ensure_contact_nickname:本身是 SECURITY DEFINER,却只授予
--      authenticated,函数体内不做任何归属/管理员判断,等于把
--      profiles.nickname 的 RLS 读限制绕开。拆成「内部实现 + 管理员
--      入口」两个函数:客户端只保留管理员入口,submit_contact_message
--      走内部实现。
--   3. admin_list_users / admin_user_stats:仍在默认的 PUBLIC EXECUTE
--      授权下,anon 可以调用(随后被 is_admin() 拒绝)。与其它管理
--      RPC 保持一致,撤销 PUBLIC 后仅授予 authenticated。
--   4. avatars 桶:未限制 MIME,且 SELECT 策略覆盖整个桶,使对象名
--      中的 {userId}/ 前缀成为可枚举的账号 UUID。限制 MIME 为图片,
--      并把 SELECT 收窄到本人目录;公开 URL 展示不经过 RLS,不受影响。
--
-- 幂等,可重复执行。
-- ============================================================

-- ── 1. 找回密码:显式拒绝 NULL / 空的安全密钥 ────────────────
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
  set encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  where id = v_user_id;
end;
$$;
revoke execute on function public.reset_password_custom(text, text, text) from public;
grant execute on function public.reset_password_custom(text, text, text) to anon, authenticated;

-- ── 2. 昵称:内部实现 + 管理员入口 ────────────────────────────
-- 内部实现保留原有逻辑,但不向任何 API 角色授权;只有 SECURITY DEFINER
-- 的 submit_contact_message(以属主身份执行)可以调用。
create or replace function public.contact_nickname_internal(p_participant_id text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_profile_nick text;
  v_nick text;
begin
  if p_participant_id is null or p_participant_id = '' then
    return null;
  end if;

  -- 注册用户:返回站内昵称(不占用游客昵称空间)
  begin
    select nickname into v_profile_nick from public.profiles
      where id = p_participant_id::uuid and nickname is not null;
    if v_profile_nick is not null then
      return v_profile_nick;
    end if;
  exception when invalid_text_representation then
    null; -- 非 uuid(游客 id),继续走游客昵称
  end;

  -- 已分配:返回现有昵称
  select nickname into v_nick from public.contact_participants
    where participant_id = p_participant_id;
  if v_nick is not null then
    return v_nick;
  end if;

  -- 未分配:生成一个全局未被占用的昵称并持久化(唯一索引兜底,冲突则换一个)
  loop
    v_nick := public.anon_nickname_gen();
    insert into public.contact_participants (participant_id, nickname)
    values (p_participant_id, v_nick)
    on conflict (participant_id) do nothing;
    exit when exists (
      select 1 from public.contact_participants where participant_id = p_participant_id and nickname = v_nick
    );
  end loop;
  return v_nick;
end;
$$;
revoke execute on function public.contact_nickname_internal(text) from public, anon, authenticated, service_role;

-- 管理员入口:仅站内管理员(且满足可选的 aal2 要求)可调用。
create or replace function public.ensure_contact_nickname(p_participant_id text)
returns text
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return public.contact_nickname_internal(p_participant_id);
end;
$$;
revoke execute on function public.ensure_contact_nickname(text) from public, anon, service_role;
grant execute on function public.ensure_contact_nickname(text) to authenticated;

-- submit_contact_message 改调内部实现(其余逻辑与 0016 完全一致)
create or replace function public.submit_contact_message(
  p_participant_id text,
  p_email text,
  p_message text,
  p_verified_now boolean
)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_rec public.contact_participants%rowtype;
  v_now timestamptz := now();
  v_trust_window interval := interval '24 hours';
  v_rate_window interval := interval '1 hour';
  v_rate_max integer := 30;
  v_min_gap interval := interval '2 seconds';
  v_msg text := nullif(trim(p_message), '');
  v_is_verified boolean;
  v_nick text;
begin
  if p_participant_id is null or p_participant_id = '' then
    raise exception 'invalid_participant';
  end if;
  if v_msg is null or length(v_msg) > 2000 then
    raise exception 'invalid_message';
  end if;

  select * into v_rec from public.contact_participants
    where participant_id = p_participant_id for update;

  v_is_verified := p_verified_now
    or (v_rec.verified_at is not null and v_rec.verified_at > v_now - v_trust_window);
  if not v_is_verified then
    return 'captcha_required';
  end if;

  if v_rec.last_message_at is not null and v_rec.last_message_at > v_now - v_min_gap then
    return 'rate_limited';
  end if;

  if v_rec.participant_id is null then
    -- 新参与者:先确保唯一昵称(会创建行),再补全限流/验证字段
    v_nick := public.contact_nickname_internal(p_participant_id);
    insert into public.contact_participants
      (participant_id, nickname, verified_at, window_start, window_count, last_message_at)
    values (p_participant_id, v_nick,
            case when p_verified_now then v_now else null end,
            v_now, 1, v_now)
    on conflict (participant_id) do update
      set verified_at = excluded.verified_at,
          window_start = excluded.window_start,
          window_count = excluded.window_count,
          last_message_at = excluded.last_message_at;
  else
    if v_rec.window_start < v_now - v_rate_window then
      v_rec.window_start := v_now;
      v_rec.window_count := 0;
    end if;
    if v_rec.window_count >= v_rate_max then
      return 'rate_limited';
    end if;
    update public.contact_participants
      set verified_at = case when p_verified_now then v_now else verified_at end,
          window_start = v_rec.window_start,
          window_count = v_rec.window_count + 1,
          last_message_at = v_now
      where participant_id = p_participant_id;
  end if;

  insert into public.contact_messages (participant_id, email, message, author)
  values (p_participant_id, p_email, v_msg, 'user');

  return 'ok';
end;
$$;
revoke execute on function public.submit_contact_message(text, text, text, boolean) from public;
revoke execute on function public.submit_contact_message(text, text, text, boolean) from anon, authenticated;
grant execute on function public.submit_contact_message(text, text, text, boolean) to service_role;

-- ── 3. 管理 RPC:撤销默认的 PUBLIC EXECUTE ───────────────────
revoke execute on function public.admin_list_users(text, int, int) from public;
revoke execute on function public.admin_list_users(text, int, int) from anon;
grant execute on function public.admin_list_users(text, int, int) to authenticated;

revoke execute on function public.admin_user_stats() from public;
revoke execute on function public.admin_user_stats() from anon;
grant execute on function public.admin_user_stats() to authenticated;

-- ── 4. 头像桶:限制 MIME,SELECT 收窄到本人目录 ───────────────
update storage.buckets
set allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg']
where id = 'avatars';

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and auth.uid()::text = (storage.foldername(name))[1]
  );
