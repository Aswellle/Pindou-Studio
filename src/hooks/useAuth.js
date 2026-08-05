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
        setUser(buildUser(data.session.user))
        refreshProfile(data.session.user.id)
      }
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null)
        setIsAdmin(false)
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setUser(buildUser(session.user))
        refreshProfile(session.user.id)
      }
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

  const logout = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
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
  }
}
