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
        .select('role')
        .eq('id', userId)
        .maybeSingle()
      setIsAdmin(data?.role === 'admin')
    } catch {
      setIsAdmin(false)
    }
  }, [])

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
        setUser({
          id: data.session.user.id,
          email: data.session.user.email,
          name: data.session.user.email?.split('@')[0] || '',
        })
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
        setUser({
          id: session.user.id,
          email: session.user.email,
          name: session.user.email?.split('@')[0] || '',
        })
        refreshProfile(session.user.id)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [refreshProfile])

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
  }
}
