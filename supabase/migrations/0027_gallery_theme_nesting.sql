-- ============================================================
-- 0027: 主题嵌套(子主题 / 主题下的合集)
--
-- 规格 02 §5 / 07 §3 允许「主题包含多个合集,也可以直接聚合图纸」,
-- 且主题页可展示「可选子主题/合集」。0022 只做了主题↔模板、合集↔模板,
-- 没有主题↔主题 / 主题↔合集的关系。本迁移补这两张表。
--
-- 设计取舍:
--   · **只做两层**:主题可以有子主题与合集,但子主题不能再有子主题。
--     用触发器阻止「把父主题设成自己的子主题」和「子主题再挂子主题」,
--     避免出现任意深度的环与 N+1 递归查询。
--   · **不设级联删除到父主题之外**:删主题会级联删它自己的子关系,
--     但不会删除被引用的子主题/合集本身(它们可能同时属于别处)。
--   · **公开可见性跟随父主题**:父主题未发布时,其子关系对匿名不可见。
--
-- 权限模型(与 0022 一致):
--   · 匿名/普通用户:只能 SELECT 父主题已发布的关系行。
--   · 管理员:public.is_admin() 全权读写。
--
-- 幂等:create table/index if not exists + drop policy if exists,可重复执行。
-- ============================================================

-- ── 主题 → 子主题 ──────────────────────────────────────────
create table if not exists public.gallery_theme_children (
  parent_id uuid not null references public.gallery_themes (id) on delete cascade,
  child_id uuid not null references public.gallery_themes (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (parent_id, child_id),
  constraint gallery_theme_children_not_self check (parent_id <> child_id)
);
create index if not exists gallery_theme_children_order_idx
  on public.gallery_theme_children (parent_id, sort_order);

-- ── 主题 → 合集 ────────────────────────────────────────────
create table if not exists public.gallery_theme_collections (
  theme_id uuid not null references public.gallery_themes (id) on delete cascade,
  collection_id uuid not null references public.gallery_collections (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (theme_id, collection_id)
);
create index if not exists gallery_theme_collections_order_idx
  on public.gallery_theme_collections (theme_id, sort_order);

-- ── 嵌套深度约束:子主题本身不能再有子主题 ──────────────────
-- 用触发器而不是 check 约束:check 不能跨行查询。
-- 函数不用 security definer:以调用者身份执行,RLS 仍然生效。
create or replace function public.check_theme_child_depth()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- 被挂为子主题的主题,自己不能已经有子主题(只允许两层)
  if exists (
    select 1 from public.gallery_theme_children
    where parent_id = new.child_id
  ) then
    raise exception 'nested theme depth exceeds 1 level';
  end if;
  -- 也不能把已经是别人子主题的主题当作父主题(反向同样只允许两层)
  if exists (
    select 1 from public.gallery_theme_children
    where child_id = new.parent_id
  ) then
    raise exception 'a child theme cannot have children';
  end if;
  return new;
end;
$$;

drop trigger if exists gallery_theme_children_depth on public.gallery_theme_children;
create trigger gallery_theme_children_depth
  before insert or update on public.gallery_theme_children
  for each row execute procedure public.check_theme_child_depth();

-- ── 行级安全 ────────────────────────────────────────────────
alter table public.gallery_theme_children enable row level security;
alter table public.gallery_theme_collections enable row level security;

-- 子主题关系:父主题已发布才公开可读(草稿的组织结构不泄露)
drop policy if exists "gallery_theme_children_public_read" on public.gallery_theme_children;
create policy "gallery_theme_children_public_read"
  on public.gallery_theme_children for select
  using (exists (
    select 1 from public.gallery_themes t
    where t.id = parent_id and t.status = 'published'
  ));

drop policy if exists "gallery_theme_children_admin_all" on public.gallery_theme_children;
create policy "gallery_theme_children_admin_all"
  on public.gallery_theme_children for all
  using (public.is_admin())
  with check (public.is_admin());

-- 主题→合集关系:同上
drop policy if exists "gallery_theme_collections_public_read" on public.gallery_theme_collections;
create policy "gallery_theme_collections_public_read"
  on public.gallery_theme_collections for select
  using (exists (
    select 1 from public.gallery_themes t
    where t.id = theme_id and t.status = 'published'
  ));

drop policy if exists "gallery_theme_collections_admin_all" on public.gallery_theme_collections;
create policy "gallery_theme_collections_admin_all"
  on public.gallery_theme_collections for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── 说明 ────────────────────────────────────────────────────
comment on table public.gallery_theme_children is
  '主题→子主题(仅两层;触发器阻止更深嵌套与环)';
comment on table public.gallery_theme_collections is
  '主题→合集(主题页展示相关合集);删除主题或合集时级联清理关系';
