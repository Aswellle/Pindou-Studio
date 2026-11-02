-- ============================================================
-- 图库公开读门槛:引用对象未发布的关系行不再对匿名可见。
--
--   · gallery_home_sections(0026):kind='theme'/'collection' 的区块此前
--     只要求 is_enabled —— 区块行会向匿名泄露其 source_id(可能是草稿
--     主题/合集的 UUID)与管理员填写的标题。改为引用对象已发布才公开;
--     管理员仍经 admin_write(FOR ALL)看到全部区块。
--   · gallery_theme_children(0027):只要求父主题已发布,子主题可以是
--     草稿 —— 草稿子主题的 id 与排序经由关系行泄露。改为父子都已发布。
--   · gallery_theme_collections(0027):同上,合集未发布时关系行也不公开。
--
-- 前端已按 publishedOnly 再过滤(discovery.js),这里收紧后公开页行为不变;
-- 后台经 is_admin() 全量读写,不受影响。
--
-- 幂等,可重复执行。
-- ============================================================

drop policy if exists "gallery_home_sections_public_read" on public.gallery_home_sections;
create policy "gallery_home_sections_public_read"
  on public.gallery_home_sections for select
  using (
    is_enabled = true
    and (
      kind not in ('theme', 'collection')
      or exists (
        select 1 from public.gallery_themes t
        where t.id = gallery_home_sections.source_id and t.status = 'published'
      )
      or exists (
        select 1 from public.gallery_collections c
        where c.id = gallery_home_sections.source_id and c.status = 'published'
      )
    )
  );

drop policy if exists "gallery_theme_children_public_read" on public.gallery_theme_children;
create policy "gallery_theme_children_public_read"
  on public.gallery_theme_children for select
  using (
    exists (
      select 1 from public.gallery_themes p
      where p.id = gallery_theme_children.parent_id and p.status = 'published'
    )
    and exists (
      select 1 from public.gallery_themes c
      where c.id = gallery_theme_children.child_id and c.status = 'published'
    )
  );

drop policy if exists "gallery_theme_collections_public_read" on public.gallery_theme_collections;
create policy "gallery_theme_collections_public_read"
  on public.gallery_theme_collections for select
  using (
    exists (
      select 1 from public.gallery_themes t
      where t.id = gallery_theme_collections.theme_id and t.status = 'published'
    )
    and exists (
      select 1 from public.gallery_collections c
      where c.id = gallery_theme_collections.collection_id and c.status = 'published'
    )
  );
