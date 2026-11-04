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
--   · 匿名/普通用户:只读 —— 且仅可见「模板本身可读」的关系行
--     (公开模板由 templates 的 RLS 决定;这里不额外校验发布状态,
--     因为精选入口展示的是可公开读取的模板,删除/下架后关系行 cascade
--     或模板不可读,前端 resolve 会跳过,不制造断链卡片)。
--   · 管理员:public.is_admin() 全权读写(与 templates/themes 同一判定)。
--   · 匿名/普通用户没有任何写策略 —— 前端 if (isAdmin) 只是界面控制。
--
-- 显式 GRANT:2026-10-30 起 PostgREST 对新表的自动暴露进入收紧阶段
-- (supabase/config.toml 注释),不依赖默认行为。
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

-- 公众只读(读取哪些模板仍由 templates 的 RLS 决定,这里不二次过滤)
drop policy if exists "gallery_featured_templates_public_read" on public.gallery_featured_templates;
create policy "gallery_featured_templates_public_read"
  on public.gallery_featured_templates for select
  using (true);

-- 管理员全权
drop policy if exists "gallery_featured_templates_admin_all" on public.gallery_featured_templates;
create policy "gallery_featured_templates_admin_all"
  on public.gallery_featured_templates for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.gallery_featured_templates to anon, authenticated;
