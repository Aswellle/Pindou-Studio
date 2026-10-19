-- ============================================================
-- 0022: 图库内容发现 —— 主题(themes)与合集(collections)
--
-- 在既有 templates / categories 之上增加「策展关系」,不复制图纸数据:
--   · gallery_themes          主题(封面、slug、多语言标题/简介、发布状态、排序)
--   · gallery_collections     合集(额外有策展说明)
--   · gallery_theme_templates / gallery_collection_templates  有序关联表
--
-- 权限模型(全部启用 RLS):
--   · 匿名/普通用户:只能 SELECT 已发布(status = 'published')的主题/合集,
--     以及它们关联的模板;草稿对公众不可见。
--   · 管理员:public.is_admin() 全权读写(与 templates/categories 同一判定函数)。
--   · 匿名/普通用户没有任何写策略 —— 前端 if (isAdmin) 只是界面控制,不是安全边界。
--
-- 幂等:create table/index if not exists + drop policy if exists,可重复执行。
-- ============================================================

-- ── 主题 ────────────────────────────────────────────────────
create table if not exists public.gallery_themes (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text,
  cover_url text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  -- 多语言字段:缺失时前端回退到 title/description(健康检查会提示缺失)
  title_en text,
  title_ja text,
  title_ko text,
  description_en text,
  description_ja text,
  description_ko text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- slug 唯一(大小写不敏感):URL /gallery/theme/:slug 的稳定标识
create unique index if not exists gallery_themes_slug_key
  on public.gallery_themes (lower(slug));
create index if not exists gallery_themes_status_sort_idx
  on public.gallery_themes (status, sort_order);

-- ── 合集 ────────────────────────────────────────────────────
create table if not exists public.gallery_collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text,
  curation_note text,
  cover_url text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  title_en text,
  title_ja text,
  title_ko text,
  description_en text,
  description_ja text,
  description_ko text,
  curation_note_en text,
  curation_note_ja text,
  curation_note_ko text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists gallery_collections_slug_key
  on public.gallery_collections (lower(slug));
create index if not exists gallery_collections_status_sort_idx
  on public.gallery_collections (status, sort_order);

-- ── 关联表(主键防重复,排序由管理员显式维护) ────────────────
create table if not exists public.gallery_theme_templates (
  theme_id uuid not null references public.gallery_themes (id) on delete cascade,
  template_id uuid not null references public.templates (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (theme_id, template_id)
);
create index if not exists gallery_theme_templates_order_idx
  on public.gallery_theme_templates (theme_id, sort_order);

create table if not exists public.gallery_collection_templates (
  collection_id uuid not null references public.gallery_collections (id) on delete cascade,
  template_id uuid not null references public.templates (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (collection_id, template_id)
);
create index if not exists gallery_collection_templates_order_idx
  on public.gallery_collection_templates (collection_id, sort_order);

-- ── 行级安全 ────────────────────────────────────────────────
alter table public.gallery_themes enable row level security;
alter table public.gallery_collections enable row level security;
alter table public.gallery_theme_templates enable row level security;
alter table public.gallery_collection_templates enable row level security;

-- 主题:公众只读已发布
drop policy if exists "gallery_themes_public_read" on public.gallery_themes;
create policy "gallery_themes_public_read"
  on public.gallery_themes for select
  using (status = 'published');

-- 主题:管理员全权(select 与写操作都走 is_admin)
drop policy if exists "gallery_themes_admin_all" on public.gallery_themes;
create policy "gallery_themes_admin_all"
  on public.gallery_themes for all
  using (public.is_admin())
  with check (public.is_admin());

-- 合集:公众只读已发布
drop policy if exists "gallery_collections_public_read" on public.gallery_collections;
create policy "gallery_collections_public_read"
  on public.gallery_collections for select
  using (status = 'published');

drop policy if exists "gallery_collections_admin_all" on public.gallery_collections;
create policy "gallery_collections_admin_all"
  on public.gallery_collections for all
  using (public.is_admin())
  with check (public.is_admin());

-- 关联表:只有父对象已发布时才公开可读(草稿的关联不会泄露内容组织)
drop policy if exists "gallery_theme_templates_public_read" on public.gallery_theme_templates;
create policy "gallery_theme_templates_public_read"
  on public.gallery_theme_templates for select
  using (exists (
    select 1 from public.gallery_themes t
    where t.id = theme_id and t.status = 'published'
  ));

drop policy if exists "gallery_theme_templates_admin_all" on public.gallery_theme_templates;
create policy "gallery_theme_templates_admin_all"
  on public.gallery_theme_templates for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "gallery_collection_templates_public_read" on public.gallery_collection_templates;
create policy "gallery_collection_templates_public_read"
  on public.gallery_collection_templates for select
  using (exists (
    select 1 from public.gallery_collections c
    where c.id = collection_id and c.status = 'published'
  ));

drop policy if exists "gallery_collection_templates_admin_all" on public.gallery_collection_templates;
create policy "gallery_collection_templates_admin_all"
  on public.gallery_collection_templates for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── 说明 ────────────────────────────────────────────────────
comment on table public.gallery_themes is
  '图库主题:策展维度,通过 gallery_theme_templates 关联既有 templates;公开仅已发布';
comment on table public.gallery_collections is
  '图库合集:管理员显式排序的策展集合;公开仅已发布';
comment on table public.gallery_theme_templates is
  '主题-模板关联;删除主题或模板级联清理,不复制 pattern 数据';
comment on table public.gallery_collection_templates is
  '合集-模板关联;sort_order 由管理员维护,不依赖 SQL 返回顺序';
