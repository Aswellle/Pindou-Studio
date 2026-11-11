-- ============================================================
-- 登录环境快照:最近一次登录的 IP 与 User-Agent(后台用户管理用)
--
-- 为什么不在客户端采集:浏览器拿不到真实公网 IP,自报 UA 也可以伪造;
--   PostgREST 会把本次请求头放进 request.headers 自定义设置,
--   服务端(security definer)从那里取 x-forwarded-for / user-agent,
--   客户端只在建立新会话后触发一次 record_login_snapshot。
--
-- 合规:表开启 RLS 且不写任何 policy —— 客户端(包括用户本人)一律
--   读不到,只有 admin_list_users(内部强制 is_admin)聚合返回最近一条;
--   存的是原始 IP/UA,不接第三方接口入库,归属地在后台界面按需查询。
--
-- 幂等,可重复执行。
-- ============================================================

create table if not exists public.user_login_metadata (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ip text,
  user_agent text,
  updated_at timestamptz not null default now()
);

alter table public.user_login_metadata enable row level security;

comment on table public.user_login_metadata is
  '最近一次登录的环境快照(IP/UA)。RLS 无 policy:客户端不可读写,仅服务端安全函数访问。';

-- 登录成功后由客户端触发:服务端从请求头提取 IP/UA 并 upsert。
-- 每个用户只保留最近一条 —— 这是「最近登录」快照,不是行为日志。
create or replace function public.record_login_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  headers jsonb;
  raw_ip text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  headers := nullif(current_setting('request.headers', true), '')::jsonb;
  if headers is null then
    return; -- 非 HTTP 上下文(CLI / 定时任务)没有请求头,静默跳过
  end if;

  -- x-forwarded-for 形如「client, proxy1, proxy2」:第一段才是真实来源
  raw_ip := coalesce(
    headers->>'x-forwarded-for',
    headers->>'cf-connecting-ip',
    headers->>'x-real-ip'
  );
  if raw_ip is not null then
    raw_ip := trim(split_part(raw_ip, ',', 1));
  end if;

  insert into public.user_login_metadata (user_id, ip, user_agent, updated_at)
  values (
    auth.uid(),
    nullif(raw_ip, ''),
    nullif(left(coalesce(headers->>'user-agent', ''), 512), ''),
    now()
  )
  on conflict (user_id) do update
    set ip = excluded.ip,
        user_agent = excluded.user_agent,
        updated_at = excluded.updated_at;
end;
$$;

revoke execute on function public.record_login_snapshot() from anon;
grant execute on function public.record_login_snapshot() to authenticated;

-- ============================================================
-- 用户列表 v3:追加最近登录环境三列。
-- admin_list_users 返回列结构变更,create or replace 无法修改返回类型,
-- 先 drop 再重建(与 0008/0009 相同模式);查询体与 0009 一致,仅多
-- left join user_login_metadata 与三列输出。
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
  is_custom boolean,
  last_login_ip text,
  last_login_user_agent text,
  last_login_snapshot_at timestamptz
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
           (u.raw_user_meta_data->>'username' is not null) as is_custom,
           m.ip as last_login_ip,
           m.user_agent as last_login_user_agent,
           m.updated_at as last_login_snapshot_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_login_metadata m on m.user_id = u.id
    where search = ''
       or u.email ilike '%' || search || '%'
       or coalesce(p.nickname, u.raw_user_meta_data->>'nickname', '') ilike '%' || search || '%'
    order by u.created_at desc
    limit page_size offset page * page_size;
end;
$$;

-- 授权:authenticated 可调用(函数内部再做 admin 校验)
grant execute on function public.admin_list_users(text, int, int) to authenticated;
