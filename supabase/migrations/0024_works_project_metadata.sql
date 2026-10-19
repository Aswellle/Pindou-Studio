-- ============================================================
-- 0024: 作品记录项目元数据(来源类别 + 项目 schema 版本 + 可见性)
--
-- 背景:项目模型(services/project)自 M1 起就带 schemaVersion / source.kind /
-- privacy.visibility,但这些字段此前**只存在于导出的 .pindou.json**,保存到
-- works 表后即丢失 —— 重新打开导入的图纸时无法区分「导入 / 图库复制 / 手绘」,
-- 也无法判断一行是哪个版本的模型写出来的。本迁移把它们落到可空列。
--
-- 设计约束(规格 06 §5「如果扩展 works」):
--   · 只新增可空列,不删除/重命名既有列,旧行无需回填;
--   · canvas_data / grid_size / palette_id 等既有列完全不动,老代码照常可读;
--   · RLS 不新增策略:works 既有 works_own_all 已按 auth.uid() = user_id 隔离整行,
--     新增列自动受同一策略保护 —— 私有作品不会因为多一列而变得可被他人读取;
--   · source_kind 用 check 约束收窄取值,数据库层拒绝白名单外的值
--     (客户端适配层已过滤,这里是第二道防线,防止未来旁路写入脏值);
--   · visibility 目前只有 'private' 一个合法值。加列不是为了让作品变公开 ——
--     公开内容走 templates / 图库策展表,个人 works 永远私有(规格 06 §2.7)。
--
-- 幂等:add column if not exists + drop constraint if exists + add constraint。
-- 重复执行安全。
-- ============================================================

alter table public.works
  add column if not exists source_kind text;

alter table public.works
  add column if not exists schema_version integer;

alter table public.works
  add column if not exists visibility text not null default 'private';

-- 来源类别白名单,与 src/services/project/projectModel.js 的 SOURCE_KINDS 一致。
-- 'legacy-work' 不作为存储值:它表示「读取时补的默认值」,不是真实来源。
alter table public.works
  drop constraint if exists works_source_kind_check;
alter table public.works
  add constraint works_source_kind_check
  check (
    source_kind is null
    or source_kind in ('blank', 'photo-quantized', 'chart-import', 'native-file', 'gallery-copy')
  );

-- 可见性目前只允许私有。将来若要支持发布,必须新增迁移并走复制/审核流程,
-- 不能直接把个人 works 行改成公开(规格 06 §5)。
alter table public.works
  drop constraint if exists works_visibility_check;
alter table public.works
  add constraint works_visibility_check
  check (visibility in ('private'));

comment on column public.works.source_kind is
  '图纸来源类别:blank/photo-quantized/chart-import/native-file/gallery-copy;null 表示历史行(按 legacy-work 读取)';
comment on column public.works.schema_version is
  '写入该行时使用的项目模型版本(projectModel.PROJECT_SCHEMA_VERSION);null 表示历史行';
comment on column public.works.visibility is
  '可见性,目前恒为 private;公开内容走 templates/策展表,个人 works 始终私有';
