-- ============================================================
-- 0026: 图库首页区块配置(gallery_home_sections)
--
-- 背景:0022 加了主题/合集,但首页区块的顺序、标题、数量、开关仍写死在前端。
-- 本表让管理员显式配置「首页展示哪些区块、按什么顺序、展示多少」。
--
-- 设计取舍:
--   · **不设外键**到 gallery_themes / gallery_collections:
--     被引用对象删除后配置行保留,由健康检查报告「引用了不存在的对象」,
--     而不是级联删掉运营配置(与 works.source_template_id 同一取舍)。
--   · **表为空 = 使用默认区块**:前端在无配置时回退到 精选/热门/最新/主题/合集,
--     保证未执行本迁移或管理员尚未配置时首页行为不变。
--   · kind='theme'|'collection' 时 source_id 必填;其余 kind 忽略 source_id。
--
-- 权限模型(与 0022 一致):
--   · 匿名/普通用户:只能 SELECT 已启用(is_enabled)的区块。
--   · 管理员:public.is_admin() 全权读写。
--   · 匿名/普通用户没有任何写策略 —— 前端 if (isAdmin) 只是界面控制。
--
-- 幂等:create table/index if not exists + drop policy if exists,可重复执行。
-- ============================================================

create table if not exists public.gallery_home_sections (
  id uuid primary key default gen_random_uuid(),
  -- featured=编辑精选(主题+合集合并) popular=热门 latest=最新
  -- themes=主题 rail collections=合集 rail
  -- theme/collection=单个对象独立成区块(需 source_id)
  kind text not null check (
    kind in ('featured', 'popular', 'latest', 'themes', 'collections', 'theme', 'collection')
  ),
  source_id uuid,
  -- 空 = 使用 i18n 默认标题;管理员可覆盖
  title text,
  subtitle text,
  limit_count integer not null default 12 check (limit_count between 1 and 50),
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- theme/collection 必须有 source_id,其余 kind 不需要
  constraint gallery_home_sections_source_check check (
    (kind in ('theme', 'collection') and source_id is not null)
    or (kind not in ('theme', 'collection') and source_id is null)
  )
);

create index if not exists gallery_home_sections_order_idx
  on public.gallery_home_sections (is_enabled, sort_order);

-- ── 行级安全(RLS) ──────────────────────────────────────────
alter table public.gallery_home_sections enable row level security;

-- 匿名/普通用户:只能读启用中的区块;管理员读全部(后台需要看到禁用的)
drop policy if exists "gallery_home_sections_public_read" on public.gallery_home_sections;
create policy "gallery_home_sections_public_read"
  on public.gallery_home_sections for select
  using (is_enabled = true or public.is_admin());

-- 写:仅管理员
drop policy if exists "gallery_home_sections_admin_write" on public.gallery_home_sections;
create policy "gallery_home_sections_admin_write"
  on public.gallery_home_sections for all
  using (public.is_admin())
  with check (public.is_admin());
