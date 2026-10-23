import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

/**
 * useAuth 的身份归一化与账号操作测试。
 *
 * 用假 Supabase 客户端,绝不触达真实网络:
 *   · getSession / onAuthStateChange 可控地驱动登录态;
 *   · from('profiles') 返回可配置的昵称/头像行;
 *   · auth.getUser 用于验证「OTP 后会话归属」这类安全判定。
 *
 * 未覆盖(仓库无隔离测试环境):真实邮件发送、邮箱确认链接、线上 RLS。
 * 这些在交付报告中明确标为未验证,不以本文件的结果冒充。
 */

const state = {
  session: null,
  profile: null,
  profileError: null,
  authUser: null,
  listeners: [],
  updateUserError: null,
  rpcError: null,
  getUserResult: null,
  signOutCalls: 0,
}

function makeClient() {
  const client = {
    auth: {
      getSession: async () => ({ data: { session: state.session }, error: null }),
      onAuthStateChange: cb => {
        state.listeners.push(cb)
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      getUser: async () =>
        state.getUserResult ? { data: { user: state.getUserResult } } : { data: { user: state.authUser } },
      signInWithPassword: async () => ({ error: null }),
      signUp: async () => ({ data: {}, error: null }),
      resetPasswordForEmail: async () => ({ error: null }),
      signInWithOtp: async () => ({ error: null }),
      verifyOtp: async ({ email, token }) => {
        if (state.verifyOtpError) return { error: state.verifyOtpError }
        state.lastOtpToken = token
        state.authUser = { id: 'u-verified', email }
        return { error: null }
      },
      updateUser: async attrs => {
        if (state.updateUserError) return { error: state.updateUserError }
        state.lastUpdateUser = attrs
        return { data: {}, error: null }
      },
      signOut: async () => {
        state.signOutCalls += 1
        return { error: null }
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: state.profileError ? null : state.profile,
            error: state.profileError,
          }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: async (name, args) => {
      state.lastRpc = { name, args }
      return { data: null, error: state.rpcError }
    },
  }
  return client
}

vi.mock('../services/supabase', () => ({
  supabase: makeClient(),
  SUPABASE_URL: '',
  SUPABASE_DIRECT_URL: '',
  SUPABASE_PROXIED: false,
}))

const { useAuth } = await import('./useAuth')

const emailSession = {
  user: {
    id: 'u-email',
    email: 'alice@example.com',
    created_at: '2026-01-02T03:04:05Z',
    last_sign_in_at: '2026-10-20T08:00:00Z',
    email_confirmed_at: '2026-01-02T03:10:00Z',
    user_metadata: { nickname: '爱丽丝' },
  },
}

const usernameSession = {
  user: {
    id: 'u-name',
    email: 'bead_master@custom.local',
    created_at: '2026-03-04T00:00:00Z',
    user_metadata: { username: 'bead_master', nickname: '拼豆达人' },
  },
}

beforeEach(() => {
  state.session = null
  state.profile = null
  state.profileError = null
  state.authUser = null
  state.listeners = []
  state.updateUserError = null
  state.rpcError = null
  state.getUserResult = null
  state.signOutCalls = 0
  state.lastUpdateUser = undefined
  state.lastRpc = undefined
  localStorage.clear()
})

const mount = async () => {
  const hook = renderHook(() => useAuth())
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

describe('useAuth · 身份归一化', () => {
  it('邮箱账号:带出真实邮箱、类型与时间字段', async () => {
    state.session = emailSession
    state.profile = { role: 'user', nickname: '爱丽丝', avatar_url: '' }
    const { result } = await mount()

    await waitFor(() => expect(result.current.user?.id).toBe('u-email'))
    expect(result.current.user.authType).toBe('email')
    expect(result.current.user.username).toBe('')
    expect(result.current.user.createdAt).toBe('2026-01-02T03:04:05Z')
    expect(result.current.user.emailConfirmedAt).toBe('2026-01-02T03:10:00Z')
  })

  it('用户名账号:暴露 username,不把合成邮箱当身份标识', async () => {
    state.session = usernameSession
    state.profile = { role: 'user', nickname: '拼豆达人', avatar_url: '' }
    const { result } = await mount()

    await waitFor(() => expect(result.current.user?.id).toBe('u-name'))
    expect(result.current.user.authType).toBe('username')
    expect(result.current.user.username).toBe('bead_master')
    expect(result.current.user.name).not.toContain('custom.local')
    // 内部认证参数保留完整邮箱(changePassword 需要),但界面不会展示
    expect(result.current.user.email).toBe('bead_master@custom.local')
  })

  it('历史账号无 user_metadata.username 时仍识别为用户名账号', async () => {
    state.session = {
      user: { id: 'u-legacy', email: 'old_timer@custom.local', user_metadata: {} },
    }
    const { result } = await mount()

    await waitFor(() => expect(result.current.user?.id).toBe('u-legacy'))
    expect(result.current.user.authType).toBe('username')
    expect(result.current.user.username).toBe('old_timer')
  })

  it('profiles 昵称为空时回退到 metadata 昵称,而不是清空', async () => {
    state.session = emailSession
    state.profile = { role: 'user', nickname: '', avatar_url: '' }
    const { result } = await mount()

    await waitFor(() => expect(result.current.user?.id).toBe('u-email'))
    await waitFor(() => expect(result.current.user.nickname).toBe('爱丽丝'))
  })

  it('profiles 读取失败时不崩溃,用户对象仍然可用', async () => {
    state.session = emailSession
    state.profileError = { message: 'network down' }
    const { result } = await mount()

    await waitFor(() => expect(result.current.user?.id).toBe('u-email'))
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.user.email).toBe('alice@example.com')
  })

  it('管理员角色来自 profiles.role', async () => {
    state.session = emailSession
    state.profile = { role: 'admin', nickname: '管理员', avatar_url: '' }
    const { result } = await mount()

    await waitFor(() => expect(result.current.isAdmin).toBe(true))
  })
})

describe('useAuth · 会话事件', () => {
  it('TOKEN_REFRESHED 不覆盖已加载的昵称与头像', async () => {
    state.session = emailSession
    state.profile = { role: 'user', nickname: '已加载昵称', avatar_url: 'https://x/avatars/a.webp' }
    const { result } = await mount()
    await waitFor(() => expect(result.current.user?.nickname).toBe('已加载昵称'))

    // 模拟 token 刷新(约每小时一次):只续期,不应触发重建
    await act(async () => {
      for (const cb of state.listeners) cb('TOKEN_REFRESHED', emailSession)
    })

    expect(result.current.user.nickname).toBe('已加载昵称')
    expect(result.current.user.avatarUrl).toBe('https://x/avatars/a.webp')
  })

  it('SIGNED_IN 重建用户对象时保留已加载的昵称', async () => {
    state.session = emailSession
    state.profile = { role: 'user', nickname: '旧昵称', avatar_url: '' }
    const { result } = await mount()
    await waitFor(() => expect(result.current.user?.nickname).toBe('旧昵称'))

    await act(async () => {
      for (const cb of state.listeners) cb('SIGNED_IN', emailSession)
    })

    expect(result.current.user.nickname).toBe('旧昵称')
    expect(result.current.user.authType).toBe('email')
  })

  it('SIGNED_OUT 清空用户与管理员态', async () => {
    state.session = emailSession
    state.profile = { role: 'admin', nickname: '管理员', avatar_url: '' }
    const { result } = await mount()
    await waitFor(() => expect(result.current.isAdmin).toBe(true))

    await act(async () => {
      for (const cb of state.listeners) cb('SIGNED_OUT', null)
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isAdmin).toBe(false)
  })

  it('关闭「记住我」时不恢复持久化会话', async () => {
    localStorage.setItem('bead_studio_settings', JSON.stringify({ rememberMe: false }))
    state.session = emailSession
    const { result } = await mount()

    await waitFor(() => expect(state.signOutCalls).toBe(1))
    expect(result.current.user).toBeNull()
  })
})

describe('useAuth · 账号操作', () => {
  it('changeEmail 走 Auth updateUser,不在本地改写邮箱', async () => {
    state.session = emailSession
    state.profile = { role: 'user', nickname: '', avatar_url: '' }
    const { result } = await mount()
    await waitFor(() => expect(result.current.user?.id).toBe('u-email'))

    await act(async () => {
      await result.current.changeEmail('alice.new@example.com')
    })

    expect(state.lastUpdateUser).toEqual({ email: 'alice.new@example.com' })
    // 确认前身份仍是旧邮箱 —— 不得本地替换
    expect(result.current.user.email).toBe('alice@example.com')
  })

  it('setPasswordWithOtp:验证后会话归属不符时中止,不设置密码', async () => {
    state.session = emailSession
    state.profile = { role: 'user', nickname: '', avatar_url: '' }
    const { result } = await mount()
    await waitFor(() => expect(result.current.user?.id).toBe('u-email'))

    // 验证码属于另一个账号 → getUser 返回不同 id
    state.getUserResult = { id: 'someone-else', email: 'other@example.com' }

    await act(async () => {
      await expect(
        result.current.setPasswordWithOtp('alice@example.com', '123456', 'NewPass123', 'u-email')
      ).rejects.toThrow('SESSION_USER_MISMATCH')
    })
    expect(state.lastUpdateUser).toBeUndefined()
  })

  it('setPasswordWithOtp:会话归属一致时正常设置密码', async () => {
    state.session = emailSession
    state.profile = { role: 'user', nickname: '', avatar_url: '' }
    const { result } = await mount()
    await waitFor(() => expect(result.current.user?.id).toBe('u-email'))

    state.getUserResult = { id: 'u-email', email: 'alice@example.com' }

    await act(async () => {
      await result.current.setPasswordWithOtp('alice@example.com', '123456', 'NewPass123', 'u-email')
    })
    expect(state.lastUpdateUser).toEqual({ password: 'NewPass123' })
  })

  it('setSecurityKey 调用 RPC,不读取也不回显哈希', async () => {
    state.session = usernameSession
    state.profile = { role: 'user', nickname: '', avatar_url: '' }
    const { result } = await mount()
    await waitFor(() => expect(result.current.user?.id).toBe('u-name'))

    await act(async () => {
      await result.current.setSecurityKey('my-secret-key')
    })

    expect(state.lastRpc).toEqual({ name: 'set_security_key', args: { p_security_key: 'my-secret-key' } })
  })

  it('changePassword 先验证旧密码再设置新密码', async () => {
    state.session = emailSession
    state.profile = { role: 'user', nickname: '', avatar_url: '' }
    const { result } = await mount()
    await waitFor(() => expect(result.current.user?.id).toBe('u-email'))

    await act(async () => {
      await result.current.changePassword('alice@example.com', 'old-pass', 'NewPass123')
    })
    expect(state.lastUpdateUser).toEqual({ password: 'NewPass123' })
  })
})
