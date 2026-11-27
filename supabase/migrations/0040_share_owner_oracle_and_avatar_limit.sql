-- ============================================================
-- 1) is_work_share_owner_path:只回答「当前登录用户是否拥有该路径」
--
-- 该函数原本接受任意 p_uid,又直接授予 authenticated。登录用户只要知道
-- 一个公开分享 UUID 和一个候选用户 UUID,就能逐个确认分享归属;
-- 分享页刻意使用中性署名,这等于提供了作者去匿名化 oracle。
-- Storage 策略调用时 p_uid 恒为 auth.uid(),因此函数内部改为只认当前用户,
-- 直接 RPC 传入他人 id 时返回 false。
--
-- 2) avatars 桶补 5MB 上限。客户端 imageGuard 的 5MB 只保护 UI,
--    直接调用 Storage API 可以绕过;桶级 file_size_limit 才是服务端约束。
--
-- 幂等,可重复执行。
-- ============================================================

create or replace function public.is_work_share_owner_path(p_name text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_name is null or p_uid is null then false
    -- 只允许查询当前会话自己的归属;不暴露 p_uid 任意查询能力
    when p_uid is distinct from auth.uid() then false
    when split_part(p_name, '/', 1)
      !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then false
    when p_name <> split_part(p_name, '/', 1) || '/r1.png' then false
    else exists (
      select 1
      from private.work_share_owners o
      where o.share_id = split_part(p_name, '/', 1)::uuid
        and o.owner_id = auth.uid()
    )
  end;
$$;
revoke execute on function public.is_work_share_owner_path(text, uuid) from public, anon;
grant execute on function public.is_work_share_owner_path(text, uuid) to authenticated;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg']
where id = 'avatars';

comment on function public.is_work_share_owner_path(text, uuid) is
  '分享卡 Storage 路径归属:只认 auth.uid(),防止登录用户查询他人分享归属。';
