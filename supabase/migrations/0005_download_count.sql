-- ============================================================
-- 模板下载量统计:download_count 列 + 匿名可调用的递增函数
-- 游客与登录用户在图库中成功导出图纸均计数(任一格式)
-- 幂等,可重复执行
-- ============================================================

alter table public.templates
  add column if not exists download_count integer not null default 0;

-- security definer 递增:以函数所有者身份执行,绕过 RLS(匿名不可直接 UPDATE templates)
create or replace function public.increment_template_download(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.templates
  set download_count = download_count + 1
  where id = p_id;
$$;

-- 授权匿名与登录用户调用
revoke execute on function public.increment_template_download(uuid) from public;
grant execute on function public.increment_template_download(uuid) to anon, authenticated;
