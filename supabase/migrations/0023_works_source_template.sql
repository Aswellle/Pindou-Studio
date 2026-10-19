-- ============================================================
-- 0023: 作品记录来源模板(图库复制溯源)
--
-- 从图库复制公共图纸生成个人作品时,记录来源模板 id:
--   · 内置模板 id 是数字,云端模板是 uuid —— 同一列必须容纳两种形态,
--     因此用 text 而不是 uuid + 外键(否则复制内置模板会直接违反外键);
--   · 删除源模板后,已有个人副本必须继续存在 —— 不设外键、不级联,
--     溯源信息失效时保留原值即可。
--
-- 幂等:add column if not exists。
-- RLS 无需改动:works 既有策略已按 user_id 隔离整行。
-- ============================================================

alter table public.works
  add column if not exists source_template_id text;

comment on column public.works.source_template_id is
  '复制来源的图库模板 id(内置为数字串、云端为 uuid);仅溯源用,不设外键';
