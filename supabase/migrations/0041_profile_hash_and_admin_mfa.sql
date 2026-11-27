-- ============================================================
-- 1) profiles 列级 SELECT:收回 security_key_hash
--
-- profiles 的行级策略允许本人/管理员读取整行,而 security_key_hash 是
-- 用户名账号找回密码的唯一因子(bcrypt)。管理员会话若拿到整表 SELECT,
-- 就可以离线爆破所有用户的安全密钥,进而调用 reset_password_custom 接管账号。
-- 应用侧只读取 role/nickname/avatar_url/id,不需要哈希;SECURITY DEFINER
-- 函数仍以属主身份读取,不受列级授权影响。
--
-- 2) 管理员 MFA:新库默认要求 aal2;已有库只在「所有管理员都已绑定
--    已验证的 TOTP 因子」时自动开启,避免把尚未绑定的管理员锁在门外。
--    未满足条件时保持原值,由运营者在绑定后手动置 true。
--
-- 幂等,可重复执行。
-- ============================================================

-- profiles 列级授权:先收回整表 SELECT,再只授业务需要的列。
-- 注意:不能用「只 revoke security_key_hash」——表级 SELECT 授权不会被子列
-- revoke 覆盖;必须收回整表后重新授予白名单列。
revoke select on public.profiles from anon, authenticated;
grant select (id, role, created_at, nickname, avatar_url)
  on public.profiles to authenticated;

-- 新安装默认要求管理员 aal2(已有行不被这条改动)。
alter table public.security_settings
  alter column admin_require_mfa set default true;

-- 已有库:仅当白名单内每个管理员都有已验证 TOTP 时才自动开启。
do $$
begin
  if to_regclass('auth.mfa_factors') is null then
    raise notice 'skip admin MFA auto-enable: auth.mfa_factors unavailable';
    return;
  end if;

  begin
    execute $sql$
      update public.security_settings s
      set admin_require_mfa = true,
          updated_at = now()
      where s.id = true
        and exists (select 1 from public.admin_allowlist)
        and not exists (
          select 1
          from public.profiles p
          join public.admin_allowlist a on a.user_id = p.id
          where p.role = 'admin'
            and not exists (
              select 1
              from auth.mfa_factors f
              where f.user_id = p.id
                and f.factor_type = 'totp'
                and f.status = 'verified'
            )
        )
    $sql$;
  exception when undefined_table or undefined_column then
    raise notice 'skip admin MFA auto-enable: %', sqlerrm;
  end;
end;
$$;

comment on column public.profiles.security_key_hash is
  '用户名账号找回密码的安全密钥 bcrypt 哈希;仅 SECURITY DEFINER 函数可读写,API 角色无列级 SELECT。';
