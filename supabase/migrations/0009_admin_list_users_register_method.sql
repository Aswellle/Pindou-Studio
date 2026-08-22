-- ============================================================
-- 用户仪表盘:区分注册方式(邮箱注册 vs 自定义账号)
--   自定义账号以合成邮箱 `${username}@custom.local` 注册,username 存于
--   raw_user_meta_data(见 0006_custom_accounts.sql);邮箱 OTP 注册
--   (sendOtp)不写入 username。故 raw_user_meta_data->>'username'
--   IS NOT NULL 即可判定为自定义账号。
-- 说明:admin_list_users 返回列结构变更,create or replace 无法修改返回类型,
--       先 drop 再重建(与 0008 相同模式)。
-- 合规不变:security definer 内强制 is_admin() 校验,仅返回注册元数据。
-- 幂等,可重复执行。
-- ============================================================

drop function if exists public.admin_list_users(text, int, int);

create function public.admin_list_users(
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
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_custom boolean
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
    select u.id, u.email::text, p.role,
           -- 昵称回退:profiles 空则取 auth 元数据(自定义账号/历史用户)
           coalesce(nullif(p.nickname, ''), u.raw_user_meta_data->>'nickname') as nickname,
           (u.email_confirmed_at is not null) as email_confirmed,
           u.created_at,
           u.last_sign_in_at,
           -- 注册方式:自定义账号写入 username 元数据,邮箱注册没有
           (u.raw_user_meta_data->>'username' is not null) as is_custom
    from auth.users u
    left join public.profiles p on p.id = u.id
    where search = ''
       or u.email ilike '%' || search || '%'
       or coalesce(p.nickname, u.raw_user_meta_data->>'nickname', '') ilike '%' || search || '%'
    order by u.created_at desc
    limit page_size offset page * page_size;
end;
$$;

-- 授权:authenticated 可调用(函数内部再做 admin 校验)
grant execute on function public.admin_list_users(text, int, int) to authenticated;
