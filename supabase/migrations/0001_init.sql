-- ============================================================
-- 拼豆 Studio 云端模板库初始化(在 Supabase SQL Editor 中一次性执行)
-- 表: templates / categories / profiles
-- 权限模型:
--   · templates / categories:匿名可读(游客浏览图库),仅 admin 可写
--   · profiles:本人可读自己,admin 可读全部
--   · 管理员身份:auth.users 注册后由 profiles.role = 'admin' 标记
-- ============================================================

-- ── 模板表(云端模板库,内置与自定义模板统一存放) ──────────────
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_zh text,
  category text not null,
  difficulty text not null default 'easy',
  size integer not null,
  colors jsonb not null default '[]',
  pattern jsonb not null,
  source text not null default 'custom',      -- builtin | custom
  created_at timestamptz not null default now()
);

-- 同一来源下名称唯一(迁移/种子操作可幂等 upsert)
create unique index if not exists templates_source_name_key
  on public.templates (source, name);

-- ── 分类表(内置 + 管理员自定义) ──────────────────────────────
create table if not exists public.categories (
  id text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

-- ── 用户角色表 ──────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user',           -- user | admin
  created_at timestamptz not null default now()
);

-- 新注册用户自动创建 profile(role 默认 user)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 管理员判定函数(security definer 绕过 RLS,避免策略子查询递归) ──
-- 策略内禁止直接子查询 profiles(会触发 infinite recursion),统一走此函数。
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ── 行级安全(RLS) ───────────────────────────────────────────
alter table public.templates enable row level security;
alter table public.categories enable row level security;
alter table public.profiles enable row level security;

-- 模板:任何人可读(游客浏览图库)
drop policy if exists "templates_public_read" on public.templates;
create policy "templates_public_read"
  on public.templates for select
  using (true);

-- 模板:仅 admin 可写
drop policy if exists "templates_admin_write" on public.templates;
create policy "templates_admin_write"
  on public.templates for all
  using (public.is_admin())
  with check (public.is_admin());

-- 分类:任何人可读
drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read"
  on public.categories for select
  using (true);

-- 分类:仅 admin 可写
drop policy if exists "categories_admin_write" on public.categories;
create policy "categories_admin_write"
  on public.categories for all
  using (public.is_admin())
  with check (public.is_admin());

-- profiles:本人可读自己,admin 可读全部
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read"
  on public.profiles for select
  using (public.is_admin());

-- ── 管理员账号开通(注册并验证邮箱后执行,email 换成你的管理员邮箱) ──
-- 注意:trigger 只为新注册用户建 profiles 行,历史注册用户没有行时 UPDATE 命中 0 行且无提示,
-- 必须用 upsert 形式:
-- insert into public.profiles (id, role, updated_at)
--   select id, 'admin', now() from auth.users where email = 'admin@example.com' limit 1
--   on conflict (id) do update set role = 'admin';
