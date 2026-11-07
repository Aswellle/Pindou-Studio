-- ============================================================
-- 分享系统 RLS / RPC 权限矩阵(pgTAP)
--
-- 运行方式(需要 Supabase 本地栈):
--   supabase start
--   supabase db reset
--   supabase test db
--
-- 本轮状态:**NOT RUN** —— 本机未安装 Docker / 未启动 Supabase 本地栈。
-- 交付时不得把本文件引用为「已验证通过」。
--
-- 写法说明:所有「以 anon / authenticated 身份执行」的动作都放进 DO 块,
-- 在块内 set local role 并捕获结果到临时表,断言统一由 postgres 角色完成 ——
-- 这样不依赖 pgTAP 函数对 anon/authenticated 的执行授权。
--
-- 覆盖:
--   1. 门禁默认关闭
--   2. 表/函数级 GRANT 矩阵
--   3. 门禁关闭时匿名读不到任何分享;开启后只能读 published
--   4. draft / revoked 对匿名不可见
--   5. 非 owner 不能发布/撤销,列表为空
--   6. 发布必须指向真实存在的 PNG,路径必须与 share id 绑定
--   7. 非法矩阵被拒;伪造 work id 创建被拒
-- ============================================================

begin;

select plan(25);

create temporary table t_results (k text primary key, v text not null);
grant all on t_results to public;

-- ── 固定测试主体(不写入任何真实个人信息) ─────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@example.test', crypt('x', gen_salt('bf')),
   now(), now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'other@example.test', crypt('x', gen_salt('bf')),
   now(), now(), now())
on conflict (id) do nothing;

-- 一件 9×9 的合法作品(归属 owner)
insert into public.works (id, user_id, name, canvas_data, grid_size, palette_id)
values (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'rls-test',
  (select jsonb_agg(
            (select jsonb_agg(case when x % 3 = 0 then '#FFFFFF'::text else null end order by x)
             from generate_series(0, 8) as x)
          order by y)
   from generate_series(0, 8) as y),
  9,
  'perler'
);

-- 三条快照:published / draft / revoked(直接造行,仅用于读策略测试)
insert into public.work_shares (
  id, title, grid_width, grid_height, canvas_data, status, preview_image_path, published_at, revoked_at
) values
  ('44444444-4444-4444-8444-444444444444', 'published', 9, 9,
   (select jsonb_agg(jsonb_build_array(null,null,null,null,null,null,null,null,null) order by y)
    from generate_series(0,8) as y),
   'published', '44444444-4444-4444-8444-444444444444/r1.png', now(), null),
  ('55555555-5555-4555-8555-555555555555', 'draft', 9, 9,
   (select jsonb_agg(jsonb_build_array(null,null,null,null,null,null,null,null,null) order by y)
    from generate_series(0,8) as y),
   'draft', null, null, null),
  ('66666666-6666-4666-8666-666666666666', 'revoked', 9, 9,
   (select jsonb_agg(jsonb_build_array(null,null,null,null,null,null,null,null,null) order by y)
    from generate_series(0,8) as y),
   'revoked', null, null, now());

insert into private.work_share_owners (share_id, owner_id, source_work_id)
values
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'),
  ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'),
  ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', null);

-- ── 1. 门禁默认关闭 ─────────────────────────────────────────
select is(
  (select enabled from private.work_share_release_gate where id = true),
  false,
  'release gate 默认关闭'
);

-- ── 2. GRANT 矩阵(静态权限,与 RLS 无关) ──────────────────
select is(has_table_privilege('anon', 'public.works', 'SELECT'), false,
  'anon 没有 works SELECT');
select is(has_table_privilege('anon', 'public.work_shares', 'INSERT'), false,
  'anon 不能插入 work_shares');
select is(has_table_privilege('authenticated', 'public.work_shares', 'UPDATE'), false,
  'authenticated 不能更新 work_shares');
select is(has_function_privilege('anon', 'public.create_work_share(uuid,text,text,text)', 'EXECUTE'), false,
  'anon 没有 create_work_share 执行权');
select is(has_function_privilege('anon', 'public.publish_work_share(uuid,text)', 'EXECUTE'), false,
  'anon 没有 publish_work_share 执行权');
select is(has_function_privilege('anon', 'public.revoke_work_share(uuid)', 'EXECUTE'), false,
  'anon 没有 revoke_work_share 执行权');
select is(has_function_privilege('anon', 'public.list_my_work_shares()', 'EXECUTE'), false,
  'anon 没有 list_my_work_shares 执行权');
select is(has_function_privilege('authenticated', 'public.create_work_share(uuid,text,text,text)', 'EXECUTE'), true,
  'authenticated 可以调用 create_work_share');

-- ── 3. 门禁关闭时匿名读不到任何分享 ─────────────────────────
do $$
declare v_count integer;
begin
  set local role anon;
  select count(*) into v_count from public.work_shares;
  reset role;
  insert into t_results values ('anon_count_gate_closed', v_count::text);
end $$;

select is((select v from t_results where k = 'anon_count_gate_closed'), '0',
  '门禁关闭时 anon 读不到任何分享');

-- 开门禁(仅测试事务内)
update private.work_share_release_gate set enabled = true where id = true;

do $$
declare
  v_count integer;
  v_status text;
  v_draft integer;
  v_revoked integer;
begin
  set local role anon;
  select count(*) into v_count from public.work_shares;
  select status into v_status from public.work_shares limit 1;
  select count(*) into v_draft from public.work_shares
    where id = '55555555-5555-4555-8555-555555555555';
  select count(*) into v_revoked from public.work_shares
    where id = '66666666-6666-4666-8666-666666666666';
  reset role;

  insert into t_results values
    ('anon_count_open', v_count::text),
    ('anon_status', coalesce(v_status, 'none')),
    ('anon_draft', v_draft::text),
    ('anon_revoked', v_revoked::text);
end $$;

select is((select v from t_results where k = 'anon_count_open'), '1',
  '门禁开启后 anon 只能看到 1 条 published');
select is((select v from t_results where k = 'anon_status'), 'published',
  '可见行状态是 published');
select is((select v from t_results where k = 'anon_draft'), '0',
  'draft 对 anon 不可见');
select is((select v from t_results where k = 'anon_revoked'), '0',
  'revoked 对 anon 不可见');

-- ── 4. 非 owner 不能撤销/发布/列表 ──────────────────────────
do $$
declare v_list integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

  begin
    perform public.revoke_work_share('44444444-4444-4444-8444-444444444444');
    insert into t_results values ('revoke_other', 'no_error');
  exception when others then
    insert into t_results values ('revoke_other', sqlerrm);
  end;

  begin
    perform public.publish_work_share('44444444-4444-4444-8444-444444444444',
      '44444444-4444-4444-8444-444444444444/r1.png');
    insert into t_results values ('publish_other', 'no_error');
  exception when others then
    insert into t_results values ('publish_other', sqlerrm);
  end;

  select count(*) into v_list from public.list_my_work_shares();
  insert into t_results values ('list_other', v_list::text);
  reset role;
end $$;

select is((select v from t_results where k = 'revoke_other'), 'not_owner',
  '非 owner 撤销被拒');
select is((select v from t_results where k = 'publish_other'), 'not_owner',
  '非 owner 发布被拒');
select is((select v from t_results where k = 'list_other'), '0',
  '非 owner 的分享列表为空');

-- ── 5. owner 发布校验 ──────────────────────────────────────
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

  begin
    perform public.publish_work_share('55555555-5555-4555-8555-555555555555',
      '55555555-5555-4555-8555-555555555555/r1.png');
    insert into t_results values ('publish_missing', 'no_error');
  exception when others then
    insert into t_results values ('publish_missing', sqlerrm);
  end;

  begin
    perform public.publish_work_share('55555555-5555-4555-8555-555555555555',
      '55555555-5555-4555-8555-555555555555/r2.png');
    insert into t_results values ('publish_bad_path', 'no_error');
  exception when others then
    insert into t_results values ('publish_bad_path', sqlerrm);
  end;

  begin
    perform public.create_work_share('99999999-9999-4999-8999-999999999999', 'x', '', '');
    insert into t_results values ('create_fake_work', 'no_error');
  exception when others then
    insert into t_results values ('create_fake_work', sqlerrm);
  end;

  reset role;
end $$;

select is((select v from t_results where k = 'publish_missing'), 'preview_missing',
  '卡片对象不存在时发布被拒');
select is((select v from t_results where k = 'publish_bad_path'), 'invalid_preview_path',
  '路径必须与 share id 绑定');
select is((select v from t_results where k = 'create_fake_work'), 'work_not_found',
  '伪造 work id 创建被拒');

-- ── 6. 矩阵校验 ────────────────────────────────────────────
select is(public.work_share_matrix_valid('[[null]]'::jsonb, 1, 1), false,
  '尺寸过小被拒');
select is(
  public.work_share_matrix_valid(
    (select jsonb_agg(jsonb_build_array(
       '#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF') order by y)
     from generate_series(0,8) as y),
    9, 9),
  true,
  '合法 9×9 矩阵通过');
select is(
  public.work_share_matrix_valid(
    (select jsonb_agg(jsonb_build_array(
       'P18','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF') order by y)
     from generate_series(0,8) as y),
    9, 9),
  false,
  '品牌色号(非 HEX)被拒');
select is(
  public.work_share_matrix_valid(
    (select jsonb_agg(jsonb_build_array(
       null,null,null,null,null,null,null,null,null) order by y)
     from generate_series(0,7) as y),
    9, 9),
  false,
  '行数与高度不符被拒');

-- ── 7. 门禁关闭时 owner 也不能发布 ─────────────────────────
update private.work_share_release_gate set enabled = false where id = true;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
  begin
    perform public.publish_work_share('55555555-5555-4555-8555-555555555555',
      '55555555-5555-4555-8555-555555555555/r1.png');
    insert into t_results values ('publish_gate_closed', 'no_error');
  exception when others then
    insert into t_results values ('publish_gate_closed', sqlerrm);
  end;
  reset role;
end $$;

select is((select v from t_results where k = 'publish_gate_closed'), 'release_gate_closed',
  '门禁关闭时发布被拒');

select * from finish();
rollback;
