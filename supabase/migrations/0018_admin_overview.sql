-- ============================================================
-- 管理概览(/admin/dashboard)聚合数据源:一次调用返回后台首页所需的
-- 用户增长、14 天注册趋势、留言待办统计。
--
-- 为什么不复用 admin_user_stats / admin_list_users 在客户端拼装:
--   · 7 日活跃、冻结账号、用户名账号等口径需要遍历全部用户,而
--     admin_list_users 单页上限 100 条 —— 用户超过一页时客户端统计
--     会把「首页采样」当成全量,数字静默失真;
--   · 逐个 RPC 拼装要发 3~4 个请求,概览页首屏延迟与失败面都更大。
-- 安全:security definer + is_admin() 内部校验;只返回聚合计数、
--       日期序列与留言摘要(participant_id/正文/时间),不含密码等敏感字段。
-- 幂等,可重复执行。
-- ============================================================

create or replace function public.admin_overview()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_users jsonb;
  v_regs jsonb;
  v_contact jsonb;
begin
  if not (select public.is_admin()) then
    raise exception 'not authorized';
  end if;

  -- ── 用户口径 ──────────────────────────────────────────────
  select jsonb_build_object(
    'total', count(*),
    'verified', count(*) filter (where u.email_confirmed_at is not null),
    'unverified', count(*) filter (where u.email_confirmed_at is null),
    'admins', count(*) filter (where p.role = 'admin'),
    'new7d', count(*) filter (where u.created_at > now() - interval '7 days'),
    'new30d', count(*) filter (where u.created_at > now() - interval '30 days'),
    'active7d', count(*) filter (where u.last_sign_in_at > now() - interval '7 days'),
    'neverSignedIn', count(*) filter (where u.last_sign_in_at is null),
    'banned', count(*) filter (where u.banned_until is not null and u.banned_until > now()),
    'usernameAccounts', count(*) filter (where u.raw_user_meta_data ? 'username')
  )
  into v_users
  from auth.users u
  left join public.profiles p on p.id = u.id;

  -- ── 近 14 天注册趋势(逐日补零,按注册方式拆分) ────────────
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'date', to_char(d.day, 'YYYY-MM-DD'),
               'email', coalesce(c.email_cnt, 0),
               'username', coalesce(c.username_cnt, 0)
             )
             order by d.day
           ),
           '[]'::jsonb
         )
  into v_regs
  from generate_series(
         (current_date - interval '13 days')::date,
         current_date,
         interval '1 day'
       ) as d(day)
  left join (
    select r.created_at::date as day,
           count(*) filter (where r.method = 'email') as email_cnt,
           count(*) filter (where r.method = 'username') as username_cnt
    from public.registration_notifications r
    where r.created_at >= (current_date - interval '13 days')
    group by 1
  ) c on c.day = d.day::date;

  -- ── 留言待办(一条线程 = 一个 participant_id) ───────────────
  -- pending:每个线程最后一条消息来自用户 → 尚未回复
  select jsonb_build_object(
    'threads', (
      select count(distinct cm.participant_id)
      from public.contact_messages cm
      where cm.participant_id is not null
    ),
    'messages', (select count(*) from public.contact_messages),
    'lastAt', (select max(cm.created_at) from public.contact_messages cm),
    'pending', (
      select count(*)
      from (
        select distinct on (cm.participant_id) cm.author
        from public.contact_messages cm
        where cm.participant_id is not null
        order by cm.participant_id, cm.created_at desc
      ) t
      where t.author = 'user'
    ),
    'pendingList', (
      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'participantId', t.participant_id,
                   'email', t.email,
                   'message', t.message,
                   'createdAt', t.created_at
                 )
                 order by t.created_at desc
               ),
               '[]'::jsonb
             )
      from (
        select cm.participant_id, cm.email, cm.message, cm.created_at, cm.author,
               row_number() over (
                 partition by cm.participant_id order by cm.created_at desc
               ) as rn
        from public.contact_messages cm
        where cm.participant_id is not null
      ) t
      where t.rn = 1 and t.author = 'user'
      limit 8
    )
  )
  into v_contact;

  return jsonb_build_object(
    'users', v_users,
    'registrations', v_regs,
    'contact', v_contact,
    'generatedAt', now()
  );
end;
$$;

revoke execute on function public.admin_overview() from public;
grant execute on function public.admin_overview() to authenticated;
