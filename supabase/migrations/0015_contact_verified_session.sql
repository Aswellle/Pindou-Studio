-- ============================================================
-- 「联系我们」会话级人机验证 + 限流:
--   · Turnstile token 一次性,消费后即失效。为避免「每发一条就重新验证」,
--     改为「会话级信任」:首条消息带有效 token → 服务端记录 verified_at;
--     信任窗口(24h)内的后续消息免 token,由服务端按 participant 限流兜底。
--   · submit_contact_message 为 SECURITY DEFINER,仅 service_role 可执行
--     (Edge Function 用 secret key 调用);anon/authenticated 无权直接调用,
--     无法绕过 Turnstile(前端拿不到 verified_now=true 的能力)。
-- 幂等,可重复执行。
-- ============================================================

-- ── 参与者验证/限流状态(仅 service_role 经 SECURITY DEFINER 触达) ──
create table if not exists public.contact_participants (
  participant_id text primary key,
  verified_at timestamptz,                       -- 最近一次真实 Turnstile 验证通过时间
  window_start timestamptz not null default now(),-- 限流窗口起点
  window_count integer not null default 0,        -- 窗口内消息计数
  last_message_at timestamptz                     -- 最近发消息时间(防突发)
);

alter table public.contact_participants enable row level security;
-- 不设任何 anon/authenticated 策略:仅 service_role(绕过 RLS)可读写

-- ── 原子提交:限流 + 人机验证门禁 + 入库 ────────────────────────
-- p_verified_now:Edge Function 刚用有效 token 过了 siteverify 则为 true
-- 返回:'ok' | 'captcha_required' | 'rate_limited'
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
  v_trust_window interval := interval '24 hours';  -- 验证信任窗口
  v_rate_window interval := interval '1 hour';     -- 限流窗口
  v_rate_max integer := 30;                        -- 每窗口每 participant 上限
  v_min_gap interval := interval '2 seconds';      -- 防突发最小间隔
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
    -- 新 participant
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
