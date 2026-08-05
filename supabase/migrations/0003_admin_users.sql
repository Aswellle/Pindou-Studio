-- ============================================================
-- 用户管理面板:管理员查询注册用户列表与统计
-- 合规:仅返回平台运营管理所需的注册元数据(邮箱/昵称/角色/
--       验证状态/注册时间),不返回密码等任何敏感字段,
--       不做用户行为数据收集。
-- 安全:security definer 函数内部强制 is_admin() 校验,
--       非 admin 调用一律 raise exception。
-- ============================================================

-- ── 用户列表(搜索 + 分页) ──────────────────────────────────
create or replace function public.admin_list_users(
  search text default '',
  page int default 0,
  page_size int default 20
)
returns table (
  id uuid,
  email text,
  role text,
  nickname text,
  email_confirmed boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'not authorized';
  end if;
  -- 分页上限保护,防止拖库
  page_size := least(greatest(page_size, 1), 100);
  page := greatest(page, 0);
  return query
    select u.id, u.email::text, p.role, p.nickname,
           (u.email_confirmed_at is not null) as email_confirmed,
           u.created_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    where search = ''
       or u.email ilike '%' || search || '%'
       or coalesce(p.nickname, '') ilike '%' || search || '%'
    order by u.created_at desc
    limit page_size offset page * page_size;
end;
$$;

-- ── 用户统计(总数/验证/管理员/近30天) ────────────────────────
create or replace function public.admin_user_stats()
returns table (
  total bigint,
  verified bigint,
  unverified bigint,
  admins bigint,
  recent_30d bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'not authorized';
  end if;
  return query
    select
      count(*)::bigint as total,
      count(*) filter (where u.email_confirmed_at is not null)::bigint as verified,
      count(*) filter (where u.email_confirmed_at is null)::bigint as unverified,
      count(p.id) filter (where p.role = 'admin')::bigint as admins,
      count(*) filter (where u.created_at > now() - interval '30 days')::bigint as recent_30d
    from auth.users u
    left join public.profiles p on p.id = u.id;
end;
$$;

-- 授权:authenticated 可调用(函数内部再做 admin 校验)
grant execute on function public.admin_list_users(text, int, int) to authenticated;
grant execute on function public.admin_user_stats() to authenticated;
