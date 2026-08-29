-- ============================================================
-- 游客唯一昵称:为每位访客持久化分配「独一无二」的社交风昵称。
--   · 昵称在 contact_participants.nickname 持久化,首次需要时分配并全局唯一检查
--   · 注册用户返回 profiles.nickname(站内昵称);游客返回分配的唯一昵称
--   · anon_nickname_gen():形容词+名词+4位数字 → 20×20×9000 = 360万候选;
--     分配时 exists 检查是否已被占用,确保全局唯一(配合唯一索引双保险)
--   · submit_contact_message 新参与者入库时自动分配昵称,后续消息沿用
-- 幂等,可重复执行。
-- ============================================================

-- ── 昵称列 + 全局唯一(仅游客昵称,非空时唯一) ────────────────
alter table public.contact_participants
  add column if not exists nickname text;

create unique index if not exists contact_participants_nickname_key
  on public.contact_participants (nickname)
  where nickname is not null;

-- ── 生成候选昵称(形容词 + 的 + 名词 + 4位随机数) ─────────────
create or replace function public.anon_nickname_gen()
returns text
language plpgsql volatile
set search_path = public
as $$
declare
  v_adj text[] := array['快乐','元气','机智','暖暖','闪光','悠闲','手作','像素','缤纷','灵动','俏皮','温柔','酷炫','软萌','清爽','神秘','好奇','勇敢','梦幻','热情'];
  v_noun text[] := array['拼豆师','小豆丁','豆豆侠','像素手','手作者','豆工','拼客','豆芽','小匠人','手绘师','豆豆星','拼织客','色块君','图纸师','珠珠侠','小贝珠','胶珠手','点点匠','豆花糖','方块客'];
  v_num text;
begin
  v_num := floor(random() * 9000 + 1000)::text;
  return v_adj[1 + floor(random() * cardinality(v_adj))] || '的'
      || v_noun[1 + floor(random() * cardinality(v_noun))] || v_num;
end;
$$;

-- ── 确保参与者有唯一展示昵称:注册用户→profiles 昵称;游客→分配唯一昵称 ──
create or replace function public.ensure_contact_nickname(p_participant_id text)
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

revoke execute on function public.ensure_contact_nickname(text) from public, anon;
grant execute on function public.ensure_contact_nickname(text) to authenticated, service_role;

-- ── submit_contact_message:新参与者入库时分配唯一昵称 ────────────
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
    v_nick := public.ensure_contact_nickname(p_participant_id);
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
