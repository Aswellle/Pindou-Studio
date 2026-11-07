-- ============================================================
-- 0033: 图纸分享(独立公开快照 + 私有归属映射 + 服务端发布门禁)
--
-- 背景:个人作品表 public.works 的 RLS 为「仅本人读写」,迁移 0024 明确
-- visibility 只有 private 一个合法值,并规定「将来如需分享,必须新增迁移与
-- 复制/审核流程,不能直接把 works 行改成公开」。本迁移实现该流程:
--
--   · public.work_shares          —— 显式发布产生的独立快照(白名单字段)
--   · private.work_share_owners   —— 私有归属映射(不进 Data API)
--   · private.work_share_release_gate —— 服务端发布开关,初始 false
--   · public.work_share_reports   —— 举报记录(受理人/处置在后台)
--   · public.work_share_moderation_log —— 处置留痕
--   · storage bucket work-share-cards —— 公开只读的分享卡 PNG
--
-- 权限铁律:
--   1. works 的 RLS / visibility CHECK 一律不变;匿名永远读不到 works。
--   2. work_shares 只允许匿名 SELECT status='published' 且门禁开启的行;
--      没有任何 INSERT/UPDATE/DELETE 策略 —— 生命周期只能走 SECURITY DEFINER RPC。
--   3. 归属映射在 private schema,anon/authenticated 无任何对象级权限。
--   4. 门禁在 publish RPC 与公开读策略两处同时校验;客户端没有写入口。
--   5. Storage 写入/删除只允许该 share 的 owner;读取是公开资产(有意为之)。
--
-- 幂等,可重复执行。
-- ============================================================

-- ── 0. 私有 schema ───────────────────────────────────────────
create schema if not exists private;

-- ── 1. 服务端发布门禁(默认关闭) ─────────────────────────────
-- 单行表:有没有这一行 = 配置是否初始化;enabled = 是否允许公开分享。
-- 仅运营者通过受控 SQL 修改;本迁移只写入 false,不提供任何客户端路径。
create table if not exists private.work_share_release_gate (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  note text
);

insert into private.work_share_release_gate (id, enabled)
values (true, false)
on conflict (id) do nothing;

-- ── 2. 公开快照表 ───────────────────────────────────────────
-- 只存分享页展示所必需的字段:
--   · 不存 owner_id / user_id / 邮箱 / 用户名 / 头像路径 / security_key_hash
--   · 不存库存、个人色卡、收藏、版本历史、内部备注、原始上传文件名
create table if not exists public.work_shares (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 160),
  -- 默认中性署名。MVP 不提供公开昵称/头像选项。
  author_label text not null default '拼豆创作者'
    check (char_length(btrim(author_label)) between 1 and 40),
  grid_width integer not null check (grid_width between 9 and 200),
  grid_height integer not null check (grid_height between 9 and 200),
  canvas_data jsonb not null,
  -- 与 src/data/palettes 的品牌 id 白名单一致
  palette_id text not null default 'perler'
    check (palette_id in ('coco', 'mard', 'mard291', 'perler', 'hama', 'artkal')),
  -- Storage 对象路径,固定 <share-id>/r1.png;draft 阶段可为空
  preview_image_path text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  revoked_at timestamptz,
  -- 单张分享最多 200×200(与项目模型 MAX_GRID_CELLS 一致)
  constraint work_shares_cells_limit check (grid_width * grid_height <= 40000),
  -- 已发布必须有卡片图;否则 OG 抓取会拿到空图
  constraint work_shares_published_needs_preview
    check (status <> 'published' or preview_image_path is not null),
  -- 状态与时间戳一致性(防止后台误改出「published 但没有发布时间」的行)
  constraint work_shares_published_needs_time
    check (status <> 'published' or published_at is not null),
  constraint work_shares_revoked_needs_time
    check (status <> 'revoked' or revoked_at is not null)
);

create index if not exists work_shares_published_idx
  on public.work_shares (published_at desc)
  where status = 'published';

alter table public.work_shares enable row level security;

-- ── 3. 私有归属映射 ─────────────────────────────────────────
create table if not exists private.work_share_owners (
  share_id uuid primary key references public.work_shares (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- 来源作品删除后分享继续存在(快照独立),这里置空
  source_work_id uuid references public.works (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists work_share_owners_owner_created_idx
  on private.work_share_owners (owner_id, created_at desc);

-- 没有任何策略 = 任何 API 角色都读不到;只有 SECURITY DEFINER 函数内部可用
alter table private.work_share_owners enable row level security;

-- ── 4. 举报与处置记录 ───────────────────────────────────────
create table if not exists public.work_share_reports (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.work_shares (id) on delete cascade,
  category text not null
    check (category in ('illegal', 'copyright', 'privacy', 'impersonation', 'other')),
  detail text not null default '' check (char_length(detail) <= 1000),
  -- 可选联系方式:仅用于处理投诉,不公开、不进入公开快照
  contact text check (contact is null or char_length(contact) <= 120),
  status text not null default 'received'
    check (status in ('received', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_share_reports_share_idx
  on public.work_share_reports (share_id, created_at desc);

alter table public.work_share_reports enable row level security;

-- 处置留痕:share_id 不设外键 —— 分享行被删除后记录仍需保留
create table if not exists public.work_share_moderation_log (
  id bigint generated always as identity primary key,
  share_id uuid not null,
  actor_id uuid,
  action text not null check (action in ('freeze', 'restore', 'dismiss', 'note')),
  reason text not null default '' check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists work_share_moderation_log_share_idx
  on public.work_share_moderation_log (share_id, created_at desc);

alter table public.work_share_moderation_log enable row level security;

-- ── 5. 显式 GRANT(新对象不自动暴露,见 config.toml 注释) ─────
revoke all on public.work_shares from anon, authenticated;
grant select on public.work_shares to anon, authenticated;

-- 举报:只允许经 RPC 写入,表本身不给写权限
revoke all on public.work_share_reports from anon, authenticated;
grant select on public.work_share_reports to authenticated;  -- 读取由 RLS 限定为管理员

revoke all on public.work_share_moderation_log from anon, authenticated;
grant select on public.work_share_moderation_log to authenticated;

-- ── 6. 安全判定函数(public schema,RLS/Storage 策略可用) ─────
-- 为什么放在 public:RLS 表达式以调用者权限求值。若判定函数位于 private,
-- anon 需要 USAGE ON SCHEMA private 才能解析它,等于把整个私有 schema 暴露给匿名角色。
-- 函数体内部只读 private 表,对外只返回布尔值,不泄漏任何行。

-- 6.1 门禁是否开启
create or replace function public.work_share_release_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select g.enabled from private.work_share_release_gate g where g.id = true),
    false
  );
$$;
revoke execute on function public.work_share_release_enabled() from public;
grant execute on function public.work_share_release_enabled() to anon, authenticated;

-- 6.2 发布资格(实名核验占位)
-- 默认实现只要求「有登录主体」。若 M0 结论确认本服务属于信息发布服务,
-- 运营者在此替换为受信任的核验实现(读取供应商签名状态),RPC 调用点不变。
-- 禁止在此读取客户端传入的布尔值或用户可写的 profiles 字段。
create or replace function public.work_share_identity_ok(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uid is not null;
$$;
revoke execute on function public.work_share_identity_ok(uuid) from public;
grant execute on function public.work_share_identity_ok(uuid) to authenticated;

-- 6.3 Storage 路径归属判定
-- 输入是对象名(如 <share-id>/r1.png),CASE 保证先做形状校验再 cast,
-- 避免非法路径在策略里触发 invalid input syntax for type uuid。
create or replace function public.is_work_share_owner_path(p_name text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_name is null or p_uid is null then false
    when split_part(p_name, '/', 1)
      !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then false
    when p_name <> split_part(p_name, '/', 1) || '/r1.png' then false
    else exists (
      select 1
      from private.work_share_owners o
      where o.share_id = split_part(p_name, '/', 1)::uuid
        and o.owner_id = p_uid
    )
  end;
$$;
revoke execute on function public.is_work_share_owner_path(text, uuid) from public, anon;
grant execute on function public.is_work_share_owner_path(text, uuid) to authenticated;

-- 6.4 矩阵合法性(行数/列数/HEX/null/尺寸/格数上限)
-- 纯函数,只用于 create_work_share 内部的第二道防线。
create or replace function public.work_share_matrix_valid(
  p_data jsonb,
  p_width integer,
  p_height integer
) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_row jsonb;
  v_cell jsonb;
  v_index integer;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'array' then
    return false;
  end if;
  if p_width is null or p_height is null then
    return false;
  end if;
  if p_width < 9 or p_width > 200 or p_height < 9 or p_height > 200 then
    return false;
  end if;
  if p_width * p_height > 40000 then
    return false;
  end if;
  if jsonb_array_length(p_data) <> p_height then
    return false;
  end if;

  for v_row in select value from jsonb_array_elements(p_data) loop
    if jsonb_typeof(v_row) <> 'array' then
      return false;
    end if;
    if jsonb_array_length(v_row) <> p_width then
      return false;
    end if;
    for v_index in 0 .. jsonb_array_length(v_row) - 1 loop
      v_cell := v_row -> v_index;
      if jsonb_typeof(v_cell) = 'null' then
        continue;
      end if;
      if jsonb_typeof(v_cell) <> 'string' then
        return false;
      end if;
      if (v_cell #>> '{}') !~* '^#[0-9a-f]{6}$' then
        return false;
      end if;
    end loop;
  end loop;

  return true;
end;
$$;
revoke execute on function public.work_share_matrix_valid(jsonb, integer, integer) from public;

-- ── 7. 公开读策略 ───────────────────────────────────────────
-- 只读已发布、未撤销、且门禁开启的行。draft / revoked 一律不可见。
-- 注意:这不是「ID 难猜所以安全」,而是 RLS 的确定性拒绝。
drop policy if exists "work_shares_public_read" on public.work_shares;
create policy "work_shares_public_read"
  on public.work_shares for select
  to anon, authenticated
  using (
    status = 'published'
    and revoked_at is null
    and public.work_share_release_enabled()
  );

-- 举报:管理员可读;写入只经 RPC(6.5)
drop policy if exists "work_share_reports_admin_read" on public.work_share_reports;
create policy "work_share_reports_admin_read"
  on public.work_share_reports for select
  to authenticated
  using (public.is_admin());

drop policy if exists "work_share_moderation_log_admin_read" on public.work_share_moderation_log;
create policy "work_share_moderation_log_admin_read"
  on public.work_share_moderation_log for select
  to authenticated
  using (public.is_admin());

-- ── 8. 生命周期 RPC(全部 SECURITY DEFINER) ─────────────────

-- 8.1 创建草稿:服务端从 works 读取本人作品,拒绝伪造 work id
create or replace function public.create_work_share(
  p_work_id uuid,
  p_title text,
  p_description text default '',
  p_author_label text default '拼豆创作者'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_work public.works%rowtype;
  v_width integer;
  v_height integer;
  v_title text;
  v_desc text;
  v_author text;
  v_share_id uuid;
  v_recent integer;
  v_palette text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.work_share_identity_ok(v_uid) then
    raise exception 'identity_required';
  end if;

  -- 只接受当前用户自己的作品;客户端提交的矩阵不参与任何判定
  select * into v_work
  from public.works w
  where w.id = p_work_id and w.user_id = v_uid;

  if not found then
    raise exception 'work_not_found';
  end if;

  if v_work.canvas_data is null or jsonb_typeof(v_work.canvas_data) <> 'array' then
    raise exception 'invalid_pattern';
  end if;

  -- 尺寸以数据实际形状为准(与客户端 normalizeLegacyWork 同一纪律):
  -- 声明的 grid_size/grid_width 可能历史不一致,按声明裁剪会错位。
  v_height := jsonb_array_length(v_work.canvas_data);
  if v_height = 0 then
    raise exception 'invalid_pattern';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_work.canvas_data) as t(elem)
    where jsonb_typeof(t.elem) <> 'array'
  ) then
    raise exception 'invalid_pattern';
  end if;
  select max(jsonb_array_length(t.elem)) into v_width
  from jsonb_array_elements(v_work.canvas_data) as t(elem);

  if not public.work_share_matrix_valid(v_work.canvas_data, v_width, v_height) then
    raise exception 'invalid_pattern';
  end if;

  -- 标题:优先用户输入;为空时退回作品名;仍为空则拒绝
  v_title := btrim(coalesce(p_title, ''));
  if v_title = '' then
    v_title := btrim(coalesce(v_work.name, ''));
  end if;
  if v_title = '' then
    raise exception 'title_required';
  end if;
  v_title := left(v_title, 80);

  v_desc := left(btrim(coalesce(p_description, '')), 160);

  -- 署名:默认中性;不接受空串
  v_author := btrim(coalesce(p_author_label, ''));
  if v_author = '' then
    v_author := '拼豆创作者';
  end if;
  v_author := left(v_author, 40);

  -- 色卡:历史行可能带白名单外的值,快照统一回退到默认品牌,
  -- 否则 CHECK 约束会让整条创建失败(宁可降级,不可丢失分享动作)
  v_palette := case
    when v_work.palette_id in ('coco', 'mard', 'mard291', 'perler', 'hama', 'artkal')
      then v_work.palette_id
    else 'perler'
  end;

  -- 频率限制:单用户每小时最多 20 条草稿(防刷 Storage)
  select count(*) into v_recent
  from private.work_share_owners o
  where o.owner_id = v_uid
    and o.created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception 'rate_limited';
  end if;

  insert into public.work_shares (
    title, description, author_label, grid_width, grid_height,
    canvas_data, palette_id, status
  ) values (
    v_title, v_desc, v_author, v_width, v_height,
    v_work.canvas_data, v_palette, 'draft'
  )
  returning id into v_share_id;

  insert into private.work_share_owners (share_id, owner_id, source_work_id)
  values (v_share_id, v_uid, v_work.id);

  -- 返回快照本身:卡片按服务端快照渲染,而不是客户端可能已被改动的副本
  return jsonb_build_object(
    'share_id', v_share_id,
    'title', v_title,
    'description', v_desc,
    'author_label', v_author,
    'grid_width', v_width,
    'grid_height', v_height,
    'palette_id', v_palette,
    'status', 'draft',
    'canvas_data', v_work.canvas_data
  );
end;
$$;
revoke execute on function public.create_work_share(uuid, text, text, text) from public, anon;
grant execute on function public.create_work_share(uuid, text, text, text) to authenticated;

-- 8.2 发布:必须已有卡片对象,且门禁开启
create or replace function public.publish_work_share(
  p_share_id uuid,
  p_preview_image_path text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_share public.work_shares%rowtype;
  v_path text;
  v_bucket text;
  v_metadata jsonb;
  v_mime text;
  v_size_text text;
  v_size bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.work_share_release_enabled() then
    raise exception 'release_gate_closed';
  end if;
  if not public.work_share_identity_ok(v_uid) then
    raise exception 'identity_required';
  end if;

  if not exists (
    select 1 from private.work_share_owners o
    where o.share_id = p_share_id and o.owner_id = v_uid
  ) then
    raise exception 'not_owner';
  end if;

  select * into v_share from public.work_shares s where s.id = p_share_id;
  if not found then
    raise exception 'share_not_found';
  end if;
  if v_share.status <> 'draft' then
    raise exception 'invalid_state';
  end if;

  -- 路径必须与 share id 绑定,拒绝任意 bucket 路径与路径穿越
  v_path := btrim(coalesce(p_preview_image_path, ''));
  if v_path <> p_share_id::text || '/r1.png' then
    raise exception 'invalid_preview_path';
  end if;

  select o.bucket_id, o.metadata into v_bucket, v_metadata
  from storage.objects o
  where o.bucket_id = 'work-share-cards' and o.name = v_path;
  if v_bucket is null then
    raise exception 'preview_missing';
  end if;

  -- 只接受 PNG,且大小不超过 2MB(与 bucket 限制一致)
  select lower(coalesce(v_metadata ->> 'mimetype', '')) into v_mime;
  if v_mime <> 'image/png' then
    raise exception 'invalid_preview_type';
  end if;

  select (v_metadata ->> 'size') into v_size_text;
  if v_size_text is null or v_size_text !~ '^[0-9]+$' then
    raise exception 'invalid_preview_size';
  end if;
  v_size := v_size_text::bigint;
  if v_size <= 0 or v_size > 2097152 then
    raise exception 'invalid_preview_size';
  end if;

  update public.work_shares
  set preview_image_path = v_path,
      status = 'published',
      published_at = now(),
      updated_at = now()
  where id = p_share_id;
end;
$$;
revoke execute on function public.publish_work_share(uuid, text) from public, anon;
grant execute on function public.publish_work_share(uuid, text) to authenticated;

-- 8.3 撤销(draft 或 published 均可;已撤销幂等)
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
end;
$$;
revoke execute on function public.revoke_work_share(uuid) from public, anon;
grant execute on function public.revoke_work_share(uuid) to authenticated;

-- 8.4 我的分享列表(不返回矩阵,不返回任何账号字段)
create or replace function public.list_my_work_shares()
returns table (
  share_id uuid,
  source_work_id uuid,
  title text,
  description text,
  author_label text,
  grid_width integer,
  grid_height integer,
  palette_id text,
  preview_image_path text,
  status text,
  created_at timestamptz,
  published_at timestamptz,
  revoked_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    o.source_work_id,
    s.title,
    s.description,
    s.author_label,
    s.grid_width,
    s.grid_height,
    s.palette_id,
    s.preview_image_path,
    s.status,
    s.created_at,
    s.published_at,
    s.revoked_at
  from private.work_share_owners o
  join public.work_shares s on s.id = o.share_id
  where o.owner_id = auth.uid()
  order by s.created_at desc
  limit 100;
$$;
revoke execute on function public.list_my_work_shares() from public, anon;
grant execute on function public.list_my_work_shares() to authenticated;

-- 8.5 举报(匿名可提交,频率受限;不写入公开字段)
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

  -- 同一分享 24 小时内最多 30 条举报(防刷;不依赖客户端)
  select count(*) into v_recent
  from public.work_share_reports r
  where r.share_id = p_share_id
    and r.created_at > now() - interval '24 hours';
  if v_recent >= 30 then
    raise exception 'rate_limited';
  end if;

  insert into public.work_share_reports (share_id, category, detail, contact)
  values (p_share_id, v_category, v_detail, nullif(v_contact, ''));
end;
$$;
revoke execute on function public.submit_work_share_report(uuid, text, text, text) from public, authenticated;
grant execute on function public.submit_work_share_report(uuid, text, text, text) to anon, authenticated;

-- 8.6 管理员紧急冻结
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

  insert into public.work_share_moderation_log (share_id, actor_id, action, reason)
  values (p_share_id, auth.uid(), 'freeze', v_reason);
end;
$$;
revoke execute on function public.admin_freeze_work_share(uuid, text) from public, anon;
grant execute on function public.admin_freeze_work_share(uuid, text) to authenticated;

-- ── 9. Storage:分享卡桶 ─────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-share-cards', 'work-share-cards', true, 2097152, array['image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png'];

-- 公开读:分享卡是刻意公开的资产
drop policy if exists "work_share_cards_public_read" on storage.objects;
create policy "work_share_cards_public_read"
  on storage.objects for select
  using (bucket_id = 'work-share-cards');

-- 写入:仅该 share 的 owner,且路径必须是 <share-id>/r1.png
drop policy if exists "work_share_cards_insert_owner" on storage.objects;
create policy "work_share_cards_insert_owner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'work-share-cards'
    and public.is_work_share_owner_path(name, auth.uid())
  );

-- 删除:仅该 share 的 owner(撤销清理用)
drop policy if exists "work_share_cards_delete_owner" on storage.objects;
create policy "work_share_cards_delete_owner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'work-share-cards'
    and public.is_work_share_owner_path(name, auth.uid())
  );

-- 不提供 UPDATE 策略:卡片不可原地覆盖(新分享用新 UUID / 新路径)

-- ── 10. works.source_kind 增加 shared-copy ─────────────────
-- 只**增加**一个允许值,不改变隐私语义:works 仍然只有本人可读写,
-- visibility 仍然只能是 private。
alter table public.works
  drop constraint if exists works_source_kind_check;
alter table public.works
  add constraint works_source_kind_check
  check (
    source_kind is null
    or source_kind in ('blank', 'photo-quantized', 'chart-import', 'native-file', 'gallery-copy', 'shared-copy')
  );

-- ── 11. 注释(说明语义,便于后续维护) ───────────────────────
comment on table public.work_shares is
  '用户显式发布的图纸公开快照。只含展示白名单字段;owner 映射在 private.work_share_owners。匿名仅可读 published 且门禁开启的行。';
comment on column public.work_shares.canvas_data is
  '规范化矩阵:等长二维数组,null 或 #RRGGBB;行数=grid_height,行长=grid_width,总格数 ≤40000。';
comment on column public.work_shares.preview_image_path is
  'Storage 对象路径,固定 <share-id>/r1.png;published 时必填。';
comment on table private.work_share_release_gate is
  '服务端发布门禁。默认 false;只有运营者在 M0-COMPLIANCE 通过后手工开启。';
comment on table private.work_share_owners is
  '分享归属映射(私有 schema,不暴露给 Data API)。作者列表/发布/撤销均以此表判定。';
