-- ============================================================
-- 账号删除清理:公开分享、公开对象、留言线程一并回收
--
-- 0030 的 admin_delete_user 只删除 works / profiles / auth.users:
--   · work_shares 没有 owner 列,归属只在 private.work_share_owners;
--     auth.users 删除后该映射级联消失,已发布分享却仍能被匿名读取;
--   · work-share-cards 与 avatars 都是 public bucket,DB 行删除不会回收对象;
--   · contact_messages / contact_participants 的 participant_id 是 text,
--     没有指向 auth.users 的外键,删除账号后邮箱与留言仍留在后台。
--
-- 本迁移保持原有权限判定(仅管理员、拒绝删除 admin、写墓碑与审计),
-- 在删除主体前补齐上述清理。删除顺序很重要:先从 owner 映射拿到 share id,
-- 再删公开卡片、分享行,最后才让 auth.users 级联删除映射。
--
-- 幂等,可重复执行。
-- ============================================================

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_username text;
  v_role text;
begin
  if not (select public.is_admin()) then
    raise exception 'not authorized';
  end if;

  select u.email, u.raw_user_meta_data ->> 'username', p.role
    into v_email, v_username, v_role
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;

  if v_role = 'admin' then
    raise exception 'cannot_modify_admin';
  end if;

  -- 墓碑:阻止同一邮箱/用户名重新注册。与 0030 保持一致。
  if v_email is not null then
    insert into public.removed_accounts(email, username, reason)
    values (v_email, v_username, 'deleted')
    on conflict (email) do update
      set username = excluded.username,
          reason = 'deleted',
          removed_at = now();
  end if;

  -- 审计必须在删除主体前写入:actor_email 还要从 auth.users 读取。
  insert into public.admin_audit_log (actor, actor_email, action, target, target_email, detail)
  values (
    auth.uid(),
    (select email::text from auth.users where id = auth.uid()),
    'user_delete',
    p_user_id,
    v_email,
    jsonb_build_object('username', v_username)
  );

  -- 1) 公开分享卡对象:路径固定 <share-id>/r1.png。
  delete from storage.objects o
  using private.work_share_owners w
  where w.owner_id = p_user_id
    and o.bucket_id = 'work-share-cards'
    and (
      o.name = w.share_id::text || '/r1.png'
      or o.name like w.share_id::text || '/%'
    );

  -- 2) 公开分享行:report 通过 share_id 外键级联,owner 映射随分享删除级联。
  delete from public.work_shares s
  using private.work_share_owners w
  where w.owner_id = p_user_id
    and s.id = w.share_id;

  -- 3) 头像对象:路径约定 <user-id>/...。桶是 public,只删 DB 行不够。
  delete from storage.objects
  where bucket_id = 'avatars'
    and (name = p_user_id::text or name like p_user_id::text || '/%');

  -- 4) 留言线程:participant_id 没有外键,必须显式删除。
  delete from public.contact_messages
  where participant_id = p_user_id::text;

  delete from public.contact_participants
  where participant_id = p_user_id::text;

  -- 5) 原有主体删除:works -> profiles -> auth.users。
  delete from public.works where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
  delete from auth.users where id = p_user_id;
end;
$$;

revoke execute on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

comment on function public.admin_delete_user(uuid) is
  '管理员删除用户:先回收公开分享/分享卡/头像对象/留言线程,再删除 works/profiles/auth.users;拒绝删除管理员。';
