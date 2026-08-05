-- ============================================================
-- 个人资料设置:profiles 增加昵称/头像字段 + 头像存储桶
-- 幂等,可重复执行
-- ============================================================

-- ── profiles 扩展字段 ────────────────────────────────────────
alter table public.profiles
  add column if not exists nickname text,
  add column if not exists avatar_url text;

-- ── 头像存储桶(公开读,本人读写) ──────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 公开读(头像展示)
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- 本人可上传/更新/删除(bucket 内路径按 {userId}/ 组织)
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
