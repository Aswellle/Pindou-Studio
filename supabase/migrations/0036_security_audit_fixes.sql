-- ============================================================
-- 0036 安全审计修复(run-2 findings F2):
--   1) reset_password_custom:失败节流 + 会话撤销
--   2) user_account_status:查询限速(审核状态 oracle)
--   3) submit_work_share_report:举报限频收紧(单 share 5/24h + 分类去重 + 全局封顶)
--   4) revoke_work_share / admin_freeze_work_share:同步删除公开卡片对象
--      (撤销语义此前只覆盖 DB 行,storage 对象永久公开)
--   5) get_contact_thread:匿名调用注册用户线程一律拒绝(读侧能力收紧)
--   6) submit_contact_message:信任窗不再被 p_verified_now 续期
--   7) record_login_snapshot:IP 取链尾/cf-connecting-ip(首段可伪造,
--      与 contact-us edge function 的结论对齐);授权卫生(revoke public)
-- 全部 drop+create 重放完整 grants(0035 的教训:drop 会连带丢失 revoke)。
-- 幂等,可重复执行。
-- ============================================================

-- ── 0. 通用限流基础设施(private schema,不暴露给 API 角色) ──
create table if not exists private.rpc_rate_window (
  bucket text not null,            -- 限流用途标识(reset_attempt / status_lookup / share_report_global)
  subject text not null,           -- 限流主体(用户名 / email / 常量)
  window_start timestamptz not null default now(),
  count integer not null default 0,
  locked_until timestamptz,                     -- reset_attempt:失败锁定截止
  primary key (bucket, subject)
);
-- 无 grants:仅 SECURITY DEFINER 函数(属主)读写,API 角色不可达

-- ============================================================
-- 1. reset_password_custom:失败节流 + 成功后撤销既有会话
--    (0030:41-46 的 admin_lock_user 已示范会话清理;用户自助重置
--     同样需要踢掉已泄露会话,否则补救闭环失效)
-- ============================================================
drop function if exists public.reset_password_custom(text, text, text);
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
  v_failures integer;
  v_locked_until timestamptz;
begin
  if p_security_key is null or p_security_key = '' then
    raise exception 'invalid_security_key';
  end if;
  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'weak_password';
  end if;

  v_username_key := lower(coalesce(p_username, ''));

  -- 节流:同一用户名 8 次失败后锁定 15 分钟(在线爆破防护)。
  -- 锁定只影响重置端点,不影响密码登录;攻击者可通过换用户名绕过单桶,
  -- 但每桶独立爆破的成本已从「无限次」降为「每 15 分钟 8 次」。
  select count, locked_until into v_failures, v_locked_until
  from private.rpc_rate_window
  where bucket = 'reset_attempt' and subject = v_username_key
  for update;
  v_failures := coalesce(v_failures, 0);
  if coalesce(v_locked_until, to_timestamp(0)) > now() then
    raise exception 'temporarily_locked';
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
    -- 失败计数:8 次后锁定 15 分钟
    insert into private.rpc_rate_window (bucket, subject, window_start, count)
    values ('reset_attempt', v_username_key, now(), 1)
    on conflict (bucket, subject) do update
      set count = private.rpc_rate_window.count + 1,
          locked_until = case
            when private.rpc_rate_window.count + 1 >= 8 then now() + interval '15 minutes'
            else private.rpc_rate_window.locked_until
          end;
    raise exception 'invalid_security_key';
  end if;

  -- 成功:清零失败计数
  delete from private.rpc_rate_window
  where bucket = 'reset_attempt' and subject = v_username_key;

  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf', 10)),
      updated_at = now()
  where id = v_user_id;

  -- 会话撤销:重置成功即踢掉全部活跃会话(与 0030 admin_lock_user 一致)
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

-- ============================================================
-- 2. user_account_status:查询限速(60 秒窗口每邮箱 10 次)
--    收敛审核状态 oracle 的批量探测面;正常登录流单次 1-2 次调用不受影响
-- ============================================================
drop function if exists public.user_account_status(text, text);
create function public.user_account_status(p_email text default null, p_username text default null)
returns table (status text, frozen_days int)
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text;
  v_until timestamptz;
  v_bucket text;
  v_window_start timestamptz;
  v_count integer;
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

  -- 查询限速:同一邮箱 60 秒内最多 10 次(超限按 none 返回,不泄露真实状态)
  v_bucket := 'status_lookup';
  insert into private.rpc_rate_window (bucket, subject, window_start, count)
  values (v_bucket, lower(v_email), now(), 1)
  on conflict (bucket, subject) do update
    set count = case
          when private.rpc_rate_window.window_start < now() - interval '60 seconds' then 1
          else private.rpc_rate_window.count + 1
        end,
        window_start = case
          when private.rpc_rate_window.window_start < now() - interval '60 seconds' then now()
          else private.rpc_rate_window.window_start
        end
    returning window_start, count into v_window_start, v_count;
  if v_count > 10 then
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
revoke execute on function public.user_account_status(text, text) from anon;
grant execute on function public.user_account_status(text, text) to anon, authenticated;

-- ============================================================
-- 3. submit_work_share_report:举报限频收紧
--    单 share 30→5 / 24h;同 (share,category) 24h 去重;全局每日封顶
--    (原 30 条/每个 share 使匿名者可对每个 share 各刷一桶灌满处置队列)
-- ============================================================
drop function if exists public.submit_work_share_report(uuid, text, text, text);
create or replace function public.submit_work_share_report(
  p_share_id uuid,
  p_category text,
  p_detail text default '',
  p_contact text default ''
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text := btrim(coalesce(p_category, ''));
  v_detail text := left(btrim(coalesce(p_detail, '')), 1000);
  v_contact text := left(btrim(coalesce(p_contact, '')), 120);
  v_recent integer;
  v_global integer;
begin
  if v_category not in ('illegal', 'copyright', 'privacy', 'impersonation', 'other') then
    raise exception 'invalid_category';
  end if;

  if not exists (
    select 1 from public.work_shares s
    where s.id = p_share_id and s.status = 'published'
  ) then
    raise exception 'share_not_found';
  end if;

  -- 单分享 24h 上限 30→5
  select count(*) into v_recent
  from public.work_share_reports r
  where r.share_id = p_share_id
    and r.created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'rate_limited';
  end if;

  -- 同 (share, category) 24h 去重:同因举报一条足够,防稀释
  if exists (
    select 1 from public.work_share_reports r
    where r.share_id = p_share_id and r.category = v_category
      and r.created_at > now() - interval '24 hours'
  ) then
    raise exception 'rate_limited';
  end if;

  -- 全局每日封顶(所有 share 合计):阻断跨 share 灌队列
  insert into private.rpc_rate_window (bucket, subject, window_start, count)
  values ('share_report_global', 'daily', date_trunc('day', now()), 1)
  on conflict (bucket, subject) do update
    set count = case
          when private.rpc_rate_window.window_start < date_trunc('day', now()) then 1
          else private.rpc_rate_window.count + 1
        end,
        window_start = date_trunc('day', now())
    returning count into v_global;
  if v_global > 500 then
    raise exception 'rate_limited';
  end if;

  insert into public.work_share_reports (share_id, category, detail, contact)
  values (p_share_id, v_category, v_detail, nullif(v_contact, ''));
end;
$$;
revoke execute on function public.submit_work_share_report(uuid, text, text, text) from public, authenticated;
revoke execute on function public.submit_work_share_report(uuid, text, text, text) from anon;
grant execute on function public.submit_work_share_report(uuid, text, text, text) to anon, authenticated;

-- ============================================================
-- 4. 分享撤销/冻结同步删除公开卡片对象:
--    卡片桶 public 且策略无状态条件,DB 行状态拦不住公开直链;
--    撤销/冻结必须回收对象本体(revoke 语义闭环)。
--    search_path 为空:storage.objects 需全限定。
-- ============================================================
drop function if exists public.revoke_work_share(uuid);
create or replace function public.revoke_work_share(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from private.work_share_owners o
    where o.share_id = p_share_id and o.owner_id = v_uid
  ) then
    raise exception 'not_owner';
  end if;

  select s.status into v_status from public.work_shares s where s.id = p_share_id;
  if v_status is null then
    raise exception 'share_not_found';
  end if;
  if v_status = 'revoked' then
    return;
  end if;

  update public.work_shares
  set status = 'revoked',
      revoked_at = now(),
      updated_at = now()
  where id = p_share_id;

  -- 回收公开卡片对象(撤销语义覆盖产物本体;对象已不存在时为空操作)
  delete from storage.objects
  where bucket_id = 'work-share-cards'
    and (name = p_share_id::text || '/r1.png' or name like p_share_id::text || '/%');
end;
$$;
revoke execute on function public.revoke_work_share(uuid) from public, anon;
grant execute on function public.revoke_work_share(uuid) to authenticated;

drop function if exists public.admin_freeze_work_share(uuid, text);
create or replace function public.admin_freeze_work_share(p_share_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  if v_reason = '' then
    raise exception 'reason_required';
  end if;

  update public.work_shares
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, now()),
      updated_at = now()
  where id = p_share_id;

  if not found then
    raise exception 'share_not_found';
  end if;

  -- 冻结同样回收公开卡片(与撤销同语义)
  delete from storage.objects
  where bucket_id = 'work-share-cards'
    and (name = p_share_id::text || '/r1.png' or name like p_share_id::text || '/%');

  insert into public.work_share_moderation_log (share_id, actor_id, action, reason)
  values (p_share_id, auth.uid(), 'freeze', v_reason);
end;
$$;
revoke execute on function public.admin_freeze_work_share(uuid, text) from public, anon;
grant execute on function public.admin_freeze_work_share(uuid, text) to authenticated;

-- ============================================================
-- 5. get_contact_thread:匿名调用注册用户线程一律拒绝
--    (注册用户的 participant_id 即其 auth UUID,匿名持有它读线程是
--     纯 IDOR;注册用户本人经带 JWT 的会话调用 auth.uid() 匹配放行)
-- ============================================================
drop function if exists public.get_contact_thread(text, int);
create or replace function public.get_contact_thread(p_participant_id text, p_limit int default 60)
returns table (id bigint, author text, message text, created_at timestamptz)
language plpgsql security definer stable
set search_path = public
as $$
begin
  if p_participant_id is null or p_participant_id = '' then
    raise exception 'invalid_participant';
  end if;
  if auth.uid() is not null and p_participant_id::uuid != auth.uid() then
    raise exception 'not authorized';
  end if;
  -- 匿名 + 注册用户线程:拒绝(此前仅凭 participant_id 即可读取)
  if auth.uid() is null then
    begin
      if exists (select 1 from auth.users where id = p_participant_id::uuid) then
        raise exception 'not authorized';
      end if;
    exception when invalid_text_representation then
      null; -- 非 uuid 形态(游客 id),走下方查询
    end;
  end if;
  return query
    select c.id, c.author, c.message, c.created_at
    from public.contact_messages c
    where c.participant_id = p_participant_id
    order by c.created_at asc
    limit least(greatest(p_limit, 1), 100);
end;
$$;
revoke execute on function public.get_contact_thread(text, int) from public;
revoke execute on function public.get_contact_thread(text, int) from anon;
grant execute on function public.get_contact_thread(text, int) to anon, authenticated;

-- ============================================================
-- 6. submit_contact_message:信任窗不再被 p_verified_now 续期
--    (24h 免 captcha 窗此前被每次验证刷新,攻击者解一次 captcha 即可
--     维持对已知 participant 的免验证写入;p_verified_now 的当次提交
--     仍被 Turnstile 覆盖,窗口只保护「首次验证后的连续对话」)
-- ============================================================
drop function if exists public.submit_contact_message(text, text, text, boolean);
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
begin
  if p_participant_id is null or p_participant_id = '' then
    raise exception 'invalid_participant';
  end if;
  if v_msg is null or length(v_msg) > 2000 then
    raise exception 'invalid_message';
  end if;

  select * into v_rec from public.contact_participants
    where participant_id = p_participant_id for update;

  -- 验证判定:刚验证通过 OR 信任窗口内曾验证通过
  v_is_verified := p_verified_now
    or (v_rec.verified_at is not null and v_rec.verified_at > v_now - v_trust_window);
  if not v_is_verified then
    return 'captcha_required';
  end if;

  -- 防突发:距上条消息过近
  if v_rec.last_message_at is not null and v_rec.last_message_at > v_now - v_min_gap then
    return 'rate_limited';
  end if;

  if v_rec.participant_id is null then
    -- 新 participant:verified_at 只记录本次真实验证
    insert into public.contact_participants
      (participant_id, verified_at, window_start, window_count, last_message_at)
    values (p_participant_id,
            case when p_verified_now then v_now else null end,
            v_now, 1, v_now);
  else
    -- 限流窗口过期则重置
    if v_rec.window_start < v_now - v_rate_window then
      v_rec.window_start := v_now;
      v_rec.window_count := 0;
    end if;
    if v_rec.window_count >= v_rate_max then
      return 'rate_limited';
    end if;
    -- 变更:verified_at 不再被 p_verified_now 续期 —— 固定 24h 窗口,
    -- 过期必须重新过 Turnstile,防「一次验证长期有效」的凭据化
    update public.contact_participants
      set window_start = v_rec.window_start,
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

-- ============================================================
-- 7. record_login_snapshot:IP 取链尾/cf-connecting-ip
--    (XFF 首段是客户端可伪造值 —— 与 contact-us edge function 的
--     结论对齐;后台「最近登录 IP」不再可被用户单方面改写)
--    授权卫生:补 revoke from public(anon 此前可经 PUBLIC 授权触达)
-- ============================================================
drop function if exists public.record_login_snapshot();
create or replace function public.record_login_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  headers jsonb;
  raw_ip text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  headers := nullif(current_setting('request.headers', true), '')::jsonb;
  if headers is null then
    return; -- 非 HTTP 上下文(CLI / 定时任务)没有请求头,静默跳过
  end if;

  -- 与 contact-us 对齐:优先 CF 边缘注入的 cf-connecting-ip;
  -- XFF 取链尾(最后写入者是可信网关),首段是客户端可伪造值
  -- XFF 链尾:最后写入者是可信网关;首段是客户端可伪造值
  raw_ip := headers->>'x-forwarded-for';
  if raw_ip is not null then
    raw_ip := (string_to_array(raw_ip, ','))[array_length(string_to_array(raw_ip, ','), 1)];
  end if;
  raw_ip := coalesce(
    nullif(btrim(headers->>'cf-connecting-ip'), ''),
    nullif(btrim(raw_ip), ''),
    nullif(btrim(headers->>'x-real-ip'), '')
  );

  insert into public.user_login_metadata (user_id, ip, user_agent, updated_at)
  values (
    auth.uid(),
    nullif(raw_ip, ''),
    nullif(left(coalesce(headers->>'user-agent', ''), 512), ''),
    now()
  )
  on conflict (user_id) do update
    set ip = excluded.ip,
        user_agent = excluded.user_agent,
        updated_at = excluded.updated_at;
end;
$$;

revoke execute on function public.record_login_snapshot() from public;
revoke execute on function public.record_login_snapshot() from anon;
grant execute on function public.record_login_snapshot() to authenticated;

-- 授权卫生:admin_list_users 重建后恢复默认 PUBLIC EXECUTE(0035 遗留),
-- 函数体内 is_admin 兜底完整,这里补上显式 revoke 收紧授权面
revoke execute on function public.admin_list_users(text, int, int) from public;
revoke execute on function public.admin_list_users(text, int, int) from anon;
