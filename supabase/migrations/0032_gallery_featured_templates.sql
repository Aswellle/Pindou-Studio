-- ============================================================
-- 0032: 精选资源(人工策展的单张图纸关系)
--
-- 「精选」此前只能表达为主题/合集(gallery_themes / gallery_collections 的
-- is_featured),热门/最新是按下载量与创建时间计算的数据 feed —— 都不等于
-- 「管理员人工挑选若干张图纸并手动排序」。本迁移补上这个最小关系:
--
--   · gallery_featured_templates:template_id 主键(同一模板不会重复精选),
--     引用 public.templates,on delete cascade 只清理精选关系本身,
--     不触碰作品副本与主题/合集内容;sort_order 表达管理员排序。
--
-- 权限模型(与 0022 策展关系表一致,全部依赖 RLS):
--   · 匿名/普通用户:只读 —— 且仅可见「模板本身可读」的关系行。
--     读取策略用 exists 子查询引用 public.templates,子查询会按查询角色
--     应用 templates 自己的 RLS;不可读的模板 id 不会暴露给匿名用户。
--   · 管理员:public.is_admin() 全权读写(与 templates/themes 同一判定)。
--   · 匿名/普通用户没有任何写策略 —— 前端 if (isAdmin) 只是界面控制。
--
-- 显式 GRANT:2026-10-30 起 PostgREST 对新表的自动暴露进入收紧阶段
-- (supabase/config.toml 注释),不依赖默认行为。读权限给匿名/登录用户,
-- 写权限只给 authenticated —— RLS 再把写操作限制到 is_admin()。
-- 只授予 select 会让后台保存(先写后清理)因表级权限不足直接 42501。
--
-- 幂等,可重复执行。
-- ============================================================

create table if not exists public.gallery_featured_templates (
  template_id uuid primary key references public.templates (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists gallery_featured_templates_order_idx
  on public.gallery_featured_templates (sort_order);

alter table public.gallery_featured_templates enable row level security;

-- 公众只读:只有「模板本身可读」的关系行可见。
-- 子查询应用 public.templates 的 RLS,避免匿名用户看到不可读模板的 id。
drop policy if exists "gallery_featured_templates_public_read" on public.gallery_featured_templates;
create policy "gallery_featured_templates_public_read"
  on public.gallery_featured_templates for select
  using (
    exists (
      select 1
      from public.templates t
      where t.id = gallery_featured_templates.template_id
    )
  );

-- 管理员全权
drop policy if exists "gallery_featured_templates_admin_all" on public.gallery_featured_templates;
create policy "gallery_featured_templates_admin_all"
  on public.gallery_featured_templates for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.gallery_featured_templates to anon, authenticated;
-- 后台保存走 authenticated 角色(RLS 内再校验 is_admin())
grant insert, update, delete on public.gallery_featured_templates to authenticated;
