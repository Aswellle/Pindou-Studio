-- ============================================================
-- 模板所属拼豆品牌色卡持久化:palette_id 列
-- 幂等,可重复执行
-- ============================================================

alter table public.templates
  add column if not exists palette_id text not null default 'perler';
