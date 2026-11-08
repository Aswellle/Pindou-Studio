-- ═══════════════════════════════════════════════════════════════
-- 0034 — 分享举报后台处置闭环
--
-- 背景:0033 建了 work_share_reports(举报入库 + 速率限制)与
-- work_share_moderation_log(处置留痕),但后台没有查看/处置入口,
-- 举报提交后成为无人认领的垃圾记录。本迁移补齐运营闭环:
--
--   · admin_list_work_share_reports   —— 举报列表(可按状态过滤,带分享摘要)
--   · admin_resolve_work_share_report —— 逐条处置(reviewing/actioned/dismissed)
--       actioned 附带冻结分享;dismissed 记录理由;全部写 moderation_log
--   · admin_restore_work_share        —— 恢复误冻结的分享(补 restore 动作)
--
-- 安全边界(与 0033 一致):
--   · 全部 SECURITY DEFINER + 空 search_path
--   · 入口检查 public.is_admin()(allowlist + 可选 MFA)
--   · REVOKE public/authenticated 后 GRANT authenticated;匿名不可达
--   · 不向 anon 暴露任何新对象;works RLS 不动
-- ═══════════════════════════════════════════════════════════════

-- ── 1. 举报列表 ─────────────────────────────────────────────
-- p_status: 'all' | 'received' | 'reviewing' | 'actioned' | 'dismissed'
-- 返回举报字段 + 分享当前摘要(标题/状态/作者/尺寸),运营者不必跳页核对。
create or replace function public.admin_list_work_share_reports(
  p_status text default 'all',
  p_limit integer default 100
)
returns table (
  id uuid,
  share_id uuid,
  category text,
  detail text,
  contact text,
  status text,
  created_at timestamptz,
  share_title text,
  share_status text,
  share_author text,
  share_grid_width integer,
  share_grid_height integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  return query
  select
    r.id,
    r.share_id,
    r.category,
    r.detail,
    r.contact,
    r.status,
    r.created_at,
    s.title,
    s.status,
    s.author_label,
    s.grid_width,
    s.grid_height
  from public.work_share_reports r
  left join public.work_shares s on s.id = r.share_id
  where
    p_status = 'all'
    or r.status = p_status
  order by
    -- 待处理的排前面,同状态内按时间倒序
    case r.status when 'received' then 0 when 'reviewing' then 1 else 2 end,
    r.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;
revoke execute on function public.admin_list_work_share_reports(text, integer) from public, anon, authenticated;
grant execute on function public.admin_list_work_share_reports(text, integer) to authenticated;

-- ── 2. 逐条处置 ─────────────────────────────────────────────
-- p_action:
--   'reviewing'  → 标记受理中(开始核对)
--   'actioned'   → 举报成立:冻结分享(可已撤销则跳过冻结)+ 留痕
--   'dismissed'  → 举报不成立:记录理由 + 留痕
-- 幂等性:重复对同一状态处置返回成功(不重复写日志);终态(actioned/dismissed)
-- 不可再改,避免两名单冲突 —— 需要反悔走 admin_restore_work_share / 重新冻结。
create or replace function public.admin_resolve_work_share_report(
  p_report_id uuid,
  p_action text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_report public.work_share_reports%rowtype;
  v_share_status text;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  if p_action not in ('reviewing', 'actioned', 'dismissed') then
    raise exception 'invalid_action';
  end if;
  if p_action = 'dismissed' and v_reason = '' then
    raise exception 'reason_required';
  end if;

  select * into v_report
  from public.work_share_reports
  where id = p_report_id
  for update;
  if not found then
    raise exception 'report_not_found';
  end if;

  -- 终态锁定:actioned/dismissed 已有结论,不允许覆盖(审计一致性)
  if v_report.status in ('actioned', 'dismissed') then
    raise exception 'report_already_resolved';
  end if;
  if v_report.status = p_action then
    return; -- 幂等:同状态重复提交视为成功
  end if;

  update public.work_share_reports
  set status = p_action,
      updated_at = now()
  where id = p_report_id;

  if p_action = 'actioned' then
    -- 冻结分享(若已被作者撤销则只记录,不再改状态)
    select status into v_share_status
    from public.work_shares
    where id = v_report.share_id;
    if v_share_status is null then
      -- 分享行已被物理删除:举报结论照常落库,留痕说明无分享可冻结
      insert into public.work_share_moderation_log (share_id, actor_id, action, reason)
      values (v_report.share_id, auth.uid(), 'note', '举报成立,但分享已删除:' || v_reason);
    elsif v_share_status = 'published' then
      update public.work_shares
      set status = 'revoked',
          revoked_at = coalesce(revoked_at, now()),
          updated_at = now()
      where id = v_report.share_id;
      insert into public.work_share_moderation_log (share_id, actor_id, action, reason)
      values (v_report.share_id, auth.uid(), 'freeze', v_reason);
    else
      -- draft / revoked:无需冻结,留痕说明即可
      insert into public.work_share_moderation_log (share_id, actor_id, action, reason)
      values (v_report.share_id, auth.uid(), 'note', '举报成立,分享当前状态 ' || v_share_status || ':' || v_reason);
    end if;
  elsif p_action = 'dismissed' then
    insert into public.work_share_moderation_log (share_id, actor_id, action, reason)
    values (v_report.share_id, auth.uid(), 'dismiss', v_reason);
  end if;
  -- 'reviewing' 只改状态,不留痕(还不是结论)
end;
$$;
revoke execute on function public.admin_resolve_work_share_report(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_resolve_work_share_report(uuid, text, text) to authenticated;

-- ── 3. 恢复误冻结的分享 ─────────────────────────────────────
-- 与 0033 的 admin_freeze_work_share 成对;moderation_log 的 action 枚举
-- 本就包含 'restore',这里补上运营入口。
create or replace function public.admin_restore_work_share(p_share_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'reason_required';
  end if;

  update public.work_shares
  set status = 'published',
      revoked_at = null,
      updated_at = now()
  where id = p_share_id;
  if not found then
    raise exception 'share_not_found';
  end if;

  insert into public.work_share_moderation_log (share_id, actor_id, action, reason)
  values (p_share_id, auth.uid(), 'restore', left(btrim(p_reason), 500));
end;
$$;
revoke execute on function public.admin_restore_work_share(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_restore_work_share(uuid, text) to authenticated;
