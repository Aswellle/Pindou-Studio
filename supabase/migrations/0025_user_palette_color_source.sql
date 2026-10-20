-- ============================================================
-- 拼豆 Studio · 个人色卡颜色来源(幂等,可在 SQL Editor 重跑)
--
-- 规格 05 §2 P0:颜色记录需带「来源/置信度」——
--   factory   原厂色值(默认;从内置色卡复制来的颜色属于这一类)
--   measured  自己用色卡/取色器实测
--   estimated 凭屏幕或记忆估算
--
-- 只加一列,不改已有列、不新增表、不动 RLS:
-- 该列随 user_palette_colors 行走已有策略(auth.uid() = user_id)。
-- 旧行自动取默认值 'factory',旧客户端不读该列也不会报错。
-- ============================================================

alter table public.user_palette_colors
  add column if not exists source text not null default 'factory';

-- 约束单独添加:add column 里内联 check 在「列已存在」时不会补上,
-- 拆成独立的幂等块,保证重复执行后约束一定存在。
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_palette_colors_source_check'
      and conrelid = 'public.user_palette_colors'::regclass
  ) then
    alter table public.user_palette_colors
      add constraint user_palette_colors_source_check
      check (source in ('factory', 'measured', 'estimated'));
  end if;
end
$$;
