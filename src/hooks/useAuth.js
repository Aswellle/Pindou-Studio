import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../services/supabase'

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
      // 同步昵称/头像到当前 user(若已登录)
      setUser(prev => prev && prev.id === userId ? {
        ...prev,
        nickname: data?.nickname || '',
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
  const buildUser = (sessionUser) => {
    const email = sessionUser.email || ''
    return {
      id: sessionUser.id,
      email,
      name: email.split('@')[0] || '',
      nickname: '',
      avatarUrl: '',
    }
  }

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

  const login = useCallback(async (email, password) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // 登录状态由 onAuthStateChange 统一更新
  }, [])

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
  const sendOtp = useCallback(async (email, shouldCreateUser = true) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser },
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
    // autoconfirm 下 signUp 即建会话:登记昵称 + 安全密钥哈希
    if (data?.session) {
      const uid = data.session.user.id
      await supabase.from('profiles').update({ nickname: nickname || uname }).eq('id', uid).catch(() => {})
      if (securityKey) {
        await supabase.rpc('set_security_key', { p_security_key: securityKey }).catch(() => {})
      }
    }
    return data
  }, [usernameExists])

  // 自定义账号登录:用户名 → 合成邮箱 → 密码登录
  const loginByUsername = useCallback(async (username, password) => {
    if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED')
    const { data, error: resolveError } = await supabase.rpc('resolve_auth_email', { p_username: (username || '').toLowerCase() })
    if (resolveError || !data) throw new Error('USERNAME_NOT_FOUND')
    const { error } = await supabase.auth.signInWithPassword({ email: data, password })
    if (error) throw error
  }, [])

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

  const logout = useCallback(async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) console.warn('signOut failed:', error.message) // 服务端失败也清本地状态,留可观测信号
    }
    setUser(null)
    setIsAdmin(false)
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
    // 自定义账号(用户名 + 安全密钥)
    registerUsername,
    loginByUsername,
    forgotPasswordCustom,
    usernameExists,
  }
}
