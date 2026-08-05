-- ============================================================
-- 修复:profiles 缺少 UPDATE 策略,导致个人资料(昵称/头像)保存失败
-- 安全:with check 强制 role 与当前值一致 —— 用户无法篡改自己的
--       角色列(防自我提权为 admin);仅允许更新 nickname/avatar_url。
-- ============================================================

-- 读取当前用户角色的 security definer 函数(避免 with check 内
-- 子查询 profiles 触发 RLS 递归)
create or replace function public.profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- 本人可更新自己的资料,但 role 必须保持不变
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = public.profile_role()
  );
