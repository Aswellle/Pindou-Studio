import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../services/supabase'
import { normalizeAuthUser } from '../utils/normalizeAuthUser'

/**
 * 真实账号体系(Supabase Auth):
 * 邮箱+密码注册(需邮箱验证)/ 登录 / 密码重置邮件 / 退出。
 * 会话由 Supabase 管理(refresh token 持久化),跨设备同一账号登录。
 * 管理员身份:profiles.role === 'admin'(见 supabase/migrations/0001_init.sql)。
 * 云端未配置(VITE_SUPABASE_URL 缺失)时,本 hook 返回未登录状态,
 * 不抛错 —— 站点其余功能可继续以本地模式运行。
 */
export function useAuth() {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async (userId) => {
    if (!supabase || !userId) {
      setIsAdmin(false)
      return
    }
    try {
      const { data } = await supabase
        .from('profiles')
        .select('role, nickname, avatar_url')
        .eq('id', userId)
        .maybeSingle()
      setIsAdmin(data?.role === 'admin')
      // 同步昵称/头像到当前 user(若已登录)。
      // 昵称为空时退回 user_metadata.nickname —— 早期账号注册时把昵称写进了元数据,
      // profiles 行却可能是空的;不回退会让这类账号在个人中心显示成邮箱前缀。
      setUser(prev => prev && prev.id === userId ? {
        ...prev,
        nickname: data?.nickname || prev.metaNickname || '',
        avatarUrl: data?.avatar_url || '',
      } : prev)
    } catch {
      setIsAdmin(false)
    }
  }, [])

  // 更新个人资料(昵称 / 头像),成功后刷新本地 user
  const updateProfile = useCallback(async ({ nickname, avatarUrl }) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) throw new Error('NOT_SIGNED_IN')
    const patch = {}
    if (nickname !== undefined) patch.nickname = nickname
    if (avatarUrl !== undefined) patch.avatar_url = avatarUrl
    const { error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', authUser.id)
    if (error) throw error
    await refreshProfile(authUser.id)
  }, [refreshProfile])

  // 会话恢复 + 实时监听登录态变化
  // biome-ignore lint/correctness/useExhaustiveDependencies: 会话恢复只挂载一次;mergeBuildUser 是稳定函数
  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      if (data.session?.user) {
        // 记住我关闭 → 不恢复持久化会话(会话仅本次浏览有效,刷新即登出)
        let rememberMe = true
        try {
          rememberMe = (JSON.parse(localStorage.getItem('bead_studio_settings') || '{}').rememberMe) !== false
        } catch { /* 默认记住 */ }
        if (rememberMe) {
          mergeBuildUser(data.session.user)
          refreshProfile(data.session.user.id)
        } else {
          supabase.auth.signOut().catch(() => {})
        }
      }
      setLoading(false)
    }).catch(() => {
      // token 刷新等网络失败时也不能卡死在 loading(否则整站白屏)
      if (mounted) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null)
        setIsAdmin(false)
        return
      }
      if (event === 'SIGNED_IN') {
        mergeBuildUser(session.user)
        refreshProfile(session.user.id)
      }
      // TOKEN_REFRESHED(约每小时):仅静默续期会话,不覆盖昵称/头像
      // (buildUser 会重置为空,导致每小时闪烁 + 多余 profiles 查询)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [refreshProfile])

  // 登录/会话恢复时带出昵称与头像
  //
  // 身份字段统一由 normalizeAuthUser 生成:两类账号(真实邮箱 / 用户名 + 合成邮箱)
  // 的区分只在这里做一次。合成邮箱 `${username}@custom.local` 仅供认证 API 使用,
  // 页面展示走 user.username / accountIdentity(),永远不会把它当邮箱显示。
  // 新增字段全部是只读派生值,既有 id/email/name/nickname/avatarUrl 语义不变。
  const buildUser = (sessionUser) => normalizeAuthUser(sessionUser)

  // 同一用户会话重建(切回标签页触发 token 刷新等)时保留已加载的昵称/头像,
  // 避免头像闪回默认、昵称闪回初始值再恢复的跳动
  const mergeBuildUser = (sessionUser) => {
    return setUser(prev => {
      if (prev && prev.id === sessionUser.id && (prev.nickname || prev.avatarUrl)) {
        return { ...buildUser(sessionUser), nickname: prev.nickname, avatarUrl: prev.avatarUrl }
      }
      return buildUser(sessionUser)
    })
  }

  // 登录门禁:查询账号是否被删除/冻结(含剩余冻结天数),用于登录失败时给出明确提示
  const accountStatus = useCallback(async (email, username) => {
    if (!supabase) return { status: 'none', frozenDays: null }
    try {
      const { data, error } = await supabase.rpc('user_account_status', { p_email: email || null, p_username: username || null })
      if (error) return { status: 'none', frozenDays: null }
      return { status: data?.status || 'none', frozenDays: data?.frozen_days ?? null }
    } catch {
      return { status: 'none', frozenDays: null }
    }
  }, [])

  const login = useCallback(async (email, password) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // 被删除 / 冻结的账号:给出明确提示(含冻结期限)
      const st = await accountStatus(email, null)
      if (st.status === 'banned') throw new Error(`ACCOUNT_FROZEN:${st.frozenDays ?? 7}`)
      if (st.status === 'deleted') throw new Error('ACCOUNT_DELETED')
      throw error
    }
    // 登录状态由 onAuthStateChange 统一更新
  }, [accountStatus])

  const register = useCallback(async (email, password, confirmPassword) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    if (password !== confirmPassword) {
      throw new Error('PASSWORD_MISMATCH')
    }
    // 开启邮箱验证:注册后需点击邮件中的验证链接才能登录
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) throw error
  }, [])

  const resetPassword = useCallback(async (email) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) throw error
  }, [])

  // ── 邮箱验证码(OTP)流程:国内网络无法打开 Supabase 验证链接,
  //    验证码在站点内输入,全程无需打开外部链接 ────────────────
  // 发送 6 位验证码(shouldCreateUser=false 时仅对已存在邮箱发码,用于
  // 重置密码/登录;注册流程传 true 自动创建占位用户)
  // meta:注册流程带上昵称 → 写入 raw_user_meta_data,供 record_registration 触发器
  //   入库注册通知;非注册场景不传(shouldCreateUser=false 时不建用户,data 被忽略)。
  const sendOtp = useCallback(async (email, shouldCreateUser = true, meta) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser,
        data: meta || undefined,
      },
    })
    if (error) throw error
  }, [])

  // 校验验证码并建立会话(等价于验证邮箱归属)
  const verifyOtp = useCallback(async (email, token) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) throw error
    // 会话状态由 onAuthStateChange 统一更新
  }, [])

  // 设置/更新密码(需要会话:验证码验证后或已登录)
  const setPassword = useCallback(async (password) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }, [])

  // 验证旧密码(通过再次登录校验)
  const verifyPassword = useCallback(async (email, password) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  // 已登录用户修改密码:旧密码验证 + 设置新密码
  const changePassword = useCallback(async (email, oldPassword, newPassword) => {
    await verifyPassword(email, oldPassword)
    await setPassword(newPassword)
  }, [verifyPassword, setPassword])

  /**
   * 邮箱验证码重设密码(适用于「用验证码登录、从未设置过密码」的账号)。
   *
   * 安全性关键:verifyOtp 会建立**新会话** —— 如果用户填了别人的邮箱验证码,
   * 当前会话会被顶替成那个账号,之后直接 setPassword 就会改掉别人的密码。
   * 所以验证后必须比对 getUser().id 与调用前的期望用户 id,不一致立即中止。
   *
   * @param {string} email - 当前账号的真实邮箱(用户名账号不适用,调用方不应展示该入口)
   * @param {string} token - 6 位验证码
   * @param {string} password - 新密码
   * @param {string} expectedUserId - 调用前当前登录用户的 id
   */
  const setPasswordWithOtp = useCallback(async (email, token, password, expectedUserId) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    if (!expectedUserId) throw new Error('NOT_SIGNED_IN')
    await verifyOtp(email, token)
    const { data } = await supabase.auth.getUser()
    if (!data?.user || data.user.id !== expectedUserId) {
      throw new Error('SESSION_USER_MISMATCH')
    }
    await setPassword(password)
  }, [verifyOtp, setPassword])

  /**
   * 发起邮箱变更(Supabase Auth 官方流程)。
   *
   * 返回后 user.email 仍是**旧邮箱**,user.new_email 是待确认的新邮箱;
   * 只有用户点开确认邮件才真正切换。调用方不得本地改写 email 字段。
   * 仅真实邮箱账号可用 —— 用户名账号的邮箱是内部合成地址。
   */
  const changeEmail = useCallback(async (newEmail) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) throw error
  }, [])

  /**
   * 更新安全密钥(仅自定义用户名账号)。
   *
   * 服务端 `set_security_key`(migration 0006)是 security definer + `auth.uid()` 限定,
   * 只保存 bcrypt 哈希,不返回任何内容 —— 前端既读不到旧密钥,也无法判断是否已设置。
   * 因此这里只提供「设置/覆盖」,不提供「查看」。
   *
   * 调用方必须先 verifyPassword 重新验证当前密码,再调本方法。
   */
  const setSecurityKey = useCallback(async (securityKey) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.rpc('set_security_key', { p_security_key: securityKey })
    if (error) throw error
  }, [])

  // ── 自定义账号(用户名 + 安全密钥,合成邮箱映射) ──────────────
  // 用户名规则:3-20 位字母/数字/下划线
  const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/
  const CUSTOM_EMAIL_DOMAIN = 'custom.local'

  const usernameExists = useCallback(async (username) => {
    if (!supabase) return false
    const { data, error } = await supabase.rpc('username_exists', { p_username: (username || '').toLowerCase() })
    if (error) return false
    return !!data
  }, [])

  // 自定义账号注册:用户名 → 合成邮箱映射到 Supabase Auth,并设置安全密钥哈希
  const registerUsername = useCallback(async ({ username, nickname, password, securityKey }) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const uname = (username || '').toLowerCase()
    if (!USERNAME_RE.test(uname)) throw new Error('INVALID_USERNAME')
    if (await usernameExists(uname)) throw new Error('USERNAME_TAKEN')
    const authEmail = `${uname}@${CUSTOM_EMAIL_DOMAIN}`
    const { data, error } = await supabase.auth.signUp({
      email: authEmail,
      password,
      options: {
        data: { username: uname, nickname: nickname || uname },
        emailRedirectTo: window.location.origin,
      },
    })
    if (error) throw error
    // autoconfirm 下 signUp 即建会话:登记昵称 + 安全密钥哈希。
    // 注意:PostgrestFilterBuilder 是 thenable 但无 .catch —— 此前用 .catch(()=>{})
    // 会抛 "catch is not a function",致注册成功却报"操作失败"。改为 try/catch。
    if (data?.session) {
      const uid = data.session.user.id
      try { await supabase.from('profiles').update({ nickname: nickname || uname }).eq('id', uid) } catch { /* 非关键,忽略 */ }
      if (securityKey) {
        try { await supabase.rpc('set_security_key', { p_security_key: securityKey }) } catch { /* 非关键,忽略 */ }
      }
    }
    return data
  }, [usernameExists])

  // 自定义账号登录:用户名 → 合成邮箱 → 密码登录
  const loginByUsername = useCallback(async (username, password) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { data, error: resolveError } = await supabase.rpc('resolve_auth_email', { p_username: (username || '').toLowerCase() })
    if (resolveError || !data) {
      // 已删除 / 冻结的自定义账号:给出明确提示
      const st = await accountStatus(null, username)
      if (st.status === 'deleted') throw new Error('ACCOUNT_DELETED')
      if (st.status === 'banned') throw new Error(`ACCOUNT_FROZEN:${st.frozenDays ?? 7}`)
      throw new Error('USERNAME_NOT_FOUND')
    }
    const { error } = await supabase.auth.signInWithPassword({ email: data, password })
    if (error) {
      const st = await accountStatus(data, null)
      if (st.status === 'banned') throw new Error(`ACCOUNT_FROZEN:${st.frozenDays ?? 7}`)
      if (st.status === 'deleted') throw new Error('ACCOUNT_DELETED')
      throw error
    }
  }, [accountStatus])

  // 自定义账号找回密码:用户名 + 安全密钥校验后重置密码
  const forgotPasswordCustom = useCallback(async (username, securityKey, newPassword) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.rpc('reset_password_custom', {
      p_username: (username || '').toLowerCase(),
      p_security_key: securityKey,
      p_new_password: newPassword,
    })
    if (error) throw error
  }, [])

  const logout = useCallback(async () => {    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) console.warn('signOut failed:', error.message) // 服务端失败也清本地状态,留可观测信号
    }
    setUser(null)
    setIsAdmin(false)
  }, [])

  // ── 后台用户管理:删除 / 锁定 / 解锁(仅管理员;服务端 security definer + is_admin 校验,
  //    并拒绝操作 admin 账号) ─────────────────────────────────
  const adminDeleteUser = useCallback(async (userId) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userId })
    if (error) throw new Error(error.message || 'ADMIN_OP_FAILED')
  }, [])

  const adminLockUser = useCallback(async (userId) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.rpc('admin_lock_user', { p_user_id: userId })
    if (error) throw new Error(error.message || 'ADMIN_OP_FAILED')
  }, [])

  const adminUnlockUser = useCallback(async (userId) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.rpc('admin_unlock_user', { p_user_id: userId })
    if (error) throw new Error(error.message || 'ADMIN_OP_FAILED')
  }, [])

  return {
    user,
    isAdmin,
    loading,
    login,
    register,
    resetPassword,
    logout,
    refreshProfile,
    updateProfile,
    sendOtp,
    verifyOtp,
    setPassword,
    verifyPassword,
    changePassword,
    // 邮箱验证码重设密码(验证后校验会话归属,防止改到别人账号)
    setPasswordWithOtp,
    // 更换邮箱(Supabase Auth 确认流程;确认前 user.email 不变)
    changeEmail,
    // 安全密钥(仅用户名账号;只写不读,哈希永不出现在前端)
    setSecurityKey,
    // 自定义账号(用户名 + 安全密钥)
    registerUsername,
    loginByUsername,
    forgotPasswordCustom,
    usernameExists,
    // 后台用户管理(删除 / 锁定 / 解锁,仅管理员,服务端拒绝操作 admin)
    adminDeleteUser,
    adminLockUser,
    adminUnlockUser,
  }
}
