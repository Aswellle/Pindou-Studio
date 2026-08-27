-- ============================================================
-- 新用户注册通知(入库):每次新用户创建(邮箱 / 用户名)自动写一条注册记录,
-- 管理员在后台「用户管理」页直接查看。不做任何发信,不触碰 163 邮箱。
--   · 触发器在 auth.users AFTER INSERT 时写入(与 handle_new_user 触发器并存互不干扰)
--   · 邮箱注册的昵称在注册时通过 sendOtp(email, true, { nickname }) 写入
--     auth.users.raw_user_meta_data;用户名注册的昵称本就写入 raw_user_meta_data
--   · RLS:仅管理员可读;读取走 security definer RPC + is_admin 校验
-- 幂等,可重复执行。
-- ============================================================

-- ── 注册记录表 ────────────────────────────────────────────────
create table if not exists public.registration_notifications (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  email text,
  nickname text,
  method text not null default 'email',   -- email | username
  created_at timestamptz not null default now()
);

create index if not exists registration_notifications_created_at_idx
  on public.registration_notifications (created_at desc);

-- ── 触发器:新用户创建即入库 ───────────────────────────────────
create or replace function public.record_registration()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.registration_notifications (user_id, email, nickname, method)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nickname', null),
    case when new.raw_user_meta_data ? 'username' then 'username' else 'email' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_registration on auth.users;
create trigger on_auth_user_registration
  after insert on auth.users
  for each row execute procedure public.record_registration();

-- ── 行级安全:仅管理员可读 ────────────────────────────────────
alter table public.registration_notifications enable row level security;

drop policy if exists "registration_notifications_admin_read" on public.registration_notifications;
create policy "registration_notifications_admin_read"
  on public.registration_notifications for select
  using (public.is_admin());

-- ── 读取最近注册(security definer + is_admin 校验) ───────────
create or replace function public.admin_list_registrations(p_limit int default 20)
returns table (id bigint, email text, nickname text, method text, created_at timestamptz)
language plpgsql security definer stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select r.id, r.email, r.nickname, r.method, r.created_at
    from public.registration_notifications r
    order by r.created_at desc
    limit least(greatest(p_limit, 1), 200);
end;
$$;

revoke execute on function public.admin_list_registrations(int) from public;
grant execute on function public.admin_list_registrations(int) to authenticated;
