-- ============================================================
-- 后台访问的第二道独立判据 + 安全审计(2026-10-03)
--
-- 背景:此前「是否管理员」只由 profiles.role='admin' 单点决定 —— 任何能改动该列
-- 的路径(未来某个 RPC 疏漏、误操作 SQL、凭据泄漏)都会直接等于拿到管理员权限。
-- 本迁移增加三层,均为「只增不减」的收紧,不改变正常管理员的日常操作:
--   ① admin_allowlist:管理员白名单。is_admin() 改为「角色为 admin 且在白名单内」,
--      白名单表无任何 anon/authenticated 策略 → 客户端永远无法写入,只能由
--      service_role(SQL / Edge Function)维护。
--   ② security_settings.admin_require_mfa:管理员是否强制两步验证(aal2)。
--      默认 false,在你完成 TOTP 绑定后置为 true 即可**服务端强制**每次后台访问
--      都必须是已通过第二因子的会话;未开 MFA 时切换不影响使用。
--   ③ admin_audit_log:角色变更、白名单增删由触发器在服务端落库(客户端无法伪造),
--      便于事后发现「有人拿到了管理员」。
--
-- 播种:白名单在迁移内从当前 profiles.role='admin' 快照生成 → 不会把现有管理员锁在门外。
-- 恢复:万一白名单被清空导致进不去,用 service_role 执行
--       select public.admin_grant_by_email('你的邮箱');
-- 幂等,可重复执行。
-- ============================================================

-- ── ① 管理员白名单 ────────────────────────────────────────────
create table if not exists public.admin_allowlist (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,                                   -- 冗余保存便于运维辨识(以 user_id 为准)
  note text,
  created_at timestamptz not null default now()
);

alter table public.admin_allowlist enable row level security;
-- 不设任何策略:仅 service_role 可读写(RLS 默认拒绝 anon/authenticated)

-- 从当前管理员快照播种(已存在则跳过)
insert into public.admin_allowlist (user_id, email, note)
select p.id, u.email::text, 'seeded from profiles.role=admin'
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin'
on conflict (user_id) do nothing;

-- ── ② 安全设置(单行表) ───────────────────────────────────────
create table if not exists public.security_settings (
  id boolean primary key default true check (id),                 -- 仅允许一行
  admin_require_mfa boolean not null default false,               -- 是否要求管理员 aal2
  updated_at timestamptz not null default now()
);

alter table public.security_settings enable row level security;
-- 同样不设策略:仅 service_role 可读写

insert into public.security_settings (id) values (true) on conflict (id) do nothing;

-- ── ③ 安全审计日志 ────────────────────────────────────────────
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,                                   -- 触发者(auth.uid();SQL/service_role 为 null)
  actor_email text,
  action text not null,                         -- role_grant | role_revoke | allowlist_add | allowlist_remove
  target uuid,
  target_email text,
  detail jsonb
);

create index if not exists admin_audit_log_at_idx on public.admin_audit_log (at desc);

alter table public.admin_audit_log enable row level security;
-- 不设策略:客户端不可读写;管理员经 admin_list_audit() RPC 读取

-- 角色变更 → 审计
create or replace function public.admin_audit_role_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor_email text;
begin
  if tg_op = 'UPDATE' and coalesce(new.role, '') is not distinct from coalesce(old.role, '') then
    return new;                                  -- 角色未变,不记录
  end if;

  select email::text into v_actor_email from auth.users where id = auth.uid();

  insert into public.admin_audit_log (actor, actor_email, action, target, target_email, detail)
  select auth.uid(),
         v_actor_email,
         case when new.role = 'admin' then 'role_grant' else 'role_revoke' end,
         new.id,
         u.email::text,
         jsonb_build_object('from', old.role, 'to', new.role)
  from (select 1) x
  left join auth.users u on u.id = new.id;

  return new;
end;
$$;

drop trigger if exists on_profile_role_change on public.profiles;
create trigger on_profile_role_change
  after update on public.profiles
  for each row execute procedure public.admin_audit_role_change();

-- 白名单增删 → 审计
create or replace function public.admin_audit_allowlist_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor_email text;
begin
  select email::text into v_actor_email from auth.users where id = auth.uid();

  insert into public.admin_audit_log (actor, actor_email, action, target, target_email, detail)
  values (
    auth.uid(),
    v_actor_email,
    case when tg_op = 'INSERT' then 'allowlist_add' else 'allowlist_remove' end,
    coalesce(new.user_id, old.user_id),
    coalesce(new.email, old.email),
    jsonb_build_object('note', coalesce(new.note, old.note))
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists on_allowlist_change on public.admin_allowlist;
create trigger on_allowlist_change
  after insert or delete on public.admin_allowlist
  for each row execute procedure public.admin_audit_allowlist_change();

-- ── is_admin():角色 + 白名单(+ 可选强制 aal2) ─────────────────
-- 收紧点:仅改 profiles.role 已不足以获得管理员权限,必须同时在白名单内。
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
      from public.profiles p
      join public.admin_allowlist a on a.user_id = p.id
      where p.id = auth.uid() and p.role = 'admin'
    )
    and (
      not coalesce((select s.admin_require_mfa from public.security_settings s limit 1), false)
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    );
$$;

-- ── 运维助手:原子地授予/撤销管理员(SQL 与 Edge Function 专用) ──
create or replace function public.admin_grant_by_email(p_email text, p_note text default null)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = p_email limit 1;
  if v_id is null then
    return 'user_not_found';
  end if;
  insert into public.admin_allowlist (user_id, email, note)
    values (v_id, p_email, p_note)
    on conflict (user_id) do update set email = excluded.email, note = coalesce(excluded.note, public.admin_allowlist.note);
  update public.profiles set role = 'admin' where id = v_id;
  return 'granted';
end;
$$;

create or replace function public.admin_revoke_by_email(p_email text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = p_email limit 1;
  if v_id is null then
    return 'user_not_found';
  end if;
  update public.profiles set role = 'user' where id = v_id;
  delete from public.admin_allowlist where user_id = v_id;
  return 'revoked';
end;
$$;

-- 仅 service_role 可执行(否则等于给了提权入口!)
revoke all on function public.admin_grant_by_email(text, text) from public, anon, authenticated;
revoke all on function public.admin_revoke_by_email(text) from public, anon, authenticated;
grant execute on function public.admin_grant_by_email(text, text) to service_role;
grant execute on function public.admin_revoke_by_email(text) to service_role;

-- 审计读取:管理员可读(security definer + is_admin 校验)
create or replace function public.admin_list_audit(p_limit int default 50)
returns table (id bigint, at timestamptz, actor_email text, action text, target_email text, detail jsonb)
language plpgsql security definer stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select l.id, l.at, l.actor_email, l.action, l.target_email, l.detail
    from public.admin_audit_log l
    order by l.at desc
    limit least(greatest(p_limit, 1), 200);
end;
$$;

revoke all on function public.admin_list_audit(int) from public, anon;
grant execute on function public.admin_list_audit(int) to authenticated;
