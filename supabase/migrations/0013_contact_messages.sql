-- ============================================================
-- 「联系我们」留言表:站点访客/用户通过「联系我们」聊天弹层提交的消息。
--   · 写入仅走 Edge Function contact-us(service_role,先做 Cloudflare Turnstile
--     service 端校验再入库);表中不授予 anon/authenticated 直接 insert 权限,
--     避免绕开人机验证。anon/authenticated 只能作为「被管理员」读取。
--   · 邮箱选填:未填为 null(前端发送时提示无法通过邮件收到回复)。
-- 幂等,可重复执行。
-- ============================================================

-- ── 留言表 ──────────────────────────────────────────────────
create table if not exists public.contact_messages (
  id bigint generated always as identity primary key,
  email text,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);

-- ── 行级安全:无普通写入口,仅管理员可读 ───────────────────────
alter table public.contact_messages enable row level security;

drop policy if exists "contact_messages_admin_read" on public.contact_messages;
create policy "contact_messages_admin_read"
  on public.contact_messages for select
  using (public.is_admin());

-- ── 读取留言(security definer + is_admin 校验) ───────────────
create or replace function public.admin_list_contact_messages(p_limit int default 30)
returns table (id bigint, email text, message text, created_at timestamptz)
language plpgsql security definer stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select c.id, c.email, c.message, c.created_at
    from public.contact_messages c
    order by c.created_at desc
    limit least(greatest(p_limit, 1), 200);
end;
$$;

revoke execute on function public.admin_list_contact_messages(int) from public;
grant execute on function public.admin_list_contact_messages(int) to authenticated;
