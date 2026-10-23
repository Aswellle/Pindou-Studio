import { describe, it, expect } from 'vitest'
import { normalizeAuthUser, accountIdentity, displayNameOf } from './normalizeAuthUser'

/**
 * 身份归一化:两类账号必须严格区分。
 *
 * 核心不变式:
 *   1. 用户名账号的任何对外标识都不能出现 `@custom.local`;
 *   2. 缺失的元数据(时间、确认状态)保持 null,不猜;
 *   3. 既有字段 id/email/name 的语义不变,下游无需改造。
 */

const emailUser = {
  id: 'u-email',
  email: 'alice@example.com',
  created_at: '2026-01-02T03:04:05Z',
  last_sign_in_at: '2026-10-20T08:00:00Z',
  email_confirmed_at: '2026-01-02T03:10:00Z',
  user_metadata: { nickname: '爱丽丝' },
}

const usernameUser = {
  id: 'u-name',
  email: 'bead_master@custom.local',
  created_at: '2026-03-04T00:00:00Z',
  last_sign_in_at: '2026-10-21T00:00:00Z',
  email_confirmed_at: '2026-03-04T00:00:00Z', // Supabase 会给合成邮箱也打确认时间
  user_metadata: { username: 'bead_master', nickname: '拼豆达人' },
}

describe('normalizeAuthUser · 邮箱账号', () => {
  it('识别为 email 类型,保留真实邮箱与确认时间', () => {
    const u = normalizeAuthUser(emailUser)
    expect(u.authType).toBe('email')
    expect(u.email).toBe('alice@example.com')
    expect(u.username).toBe('')
    expect(u.emailConfirmedAt).toBe('2026-01-02T03:10:00Z')
    expect(u.createdAt).toBe('2026-01-02T03:04:05Z')
    expect(u.lastSignInAt).toBe('2026-10-20T08:00:00Z')
  })

  it('昵称取自 metadata,同时保留 metaNickname 供 profiles 为空时兜底', () => {
    const u = normalizeAuthUser(emailUser)
    expect(u.nickname).toBe('爱丽丝')
    expect(u.metaNickname).toBe('爱丽丝')
    expect(u.name).toBe('爱丽丝')
  })

  it('没有 metadata 昵称时 name 回退到邮箱前缀', () => {
    const u = normalizeAuthUser({ id: 'x', email: 'bob@example.com' })
    expect(u.nickname).toBe('')
    expect(u.name).toBe('bob')
    expect(displayNameOf(u)).toBe('bob')
  })
})

describe('normalizeAuthUser · 用户名账号', () => {
  it('识别为 username 类型,展示用户名而不是合成邮箱', () => {
    const u = normalizeAuthUser(usernameUser)
    expect(u.authType).toBe('username')
    expect(u.username).toBe('bead_master')
    expect(accountIdentity(u)).toBe('bead_master')
    expect(displayNameOf(u)).toBe('拼豆达人')
  })

  it('邮箱验证状态对用户名账号恒为 null(合成邮箱不存在真实验证)', () => {
    expect(normalizeAuthUser(usernameUser).emailConfirmedAt).toBeNull()
  })

  it('任何对外标识都不含 @custom.local', () => {
    const u = normalizeAuthUser(usernameUser)
    for (const value of [u.username, u.name, accountIdentity(u), displayNameOf(u)]) {
      expect(value).not.toContain('custom.local')
    }
    // 内部认证参数仍保留完整邮箱 —— changePassword 需要它
    expect(u.email).toBe('bead_master@custom.local')
  })

  it('历史账号缺少 user_metadata.username 时从合成邮箱反推', () => {
    const legacy = { id: 'u-old', email: 'old_timer@custom.local', created_at: '2025-01-01T00:00:00Z' }
    const u = normalizeAuthUser(legacy)
    expect(u.authType).toBe('username')
    expect(u.username).toBe('old_timer')
    expect(u.name).toBe('old_timer')
    expect(displayNameOf(u)).toBe('old_timer')
  })

  it('元数据缺失且昵称为空时,显示名也不会变成合成邮箱', () => {
    const u = normalizeAuthUser({ id: 'u-old2', email: 'quiet@custom.local' })
    expect(displayNameOf(u)).toBe('quiet')
    expect(displayNameOf(u)).not.toContain('@')
  })
})

describe('normalizeAuthUser · 缺失与边界', () => {
  it('缺少 created_at / last_sign_in_at 时保持 null,不虚构日期', () => {
    const u = normalizeAuthUser({ id: 'u-bare', email: 'bare@example.com' })
    expect(u.createdAt).toBeNull()
    expect(u.lastSignInAt).toBeNull()
    expect(u.emailConfirmedAt).toBeNull()
    expect(u.pendingEmail).toBeNull()
  })

  it('邮箱待确认时保留旧 email,并单独暴露 pendingEmail', () => {
    const u = normalizeAuthUser({
      ...emailUser,
      email: 'alice@example.com',
      new_email: 'alice.new@example.com',
    })
    expect(u.email).toBe('alice@example.com')
    expect(u.pendingEmail).toBe('alice.new@example.com')
  })

  it('非法输入返回 null,不抛异常', () => {
    expect(normalizeAuthUser(null)).toBeNull()
    expect(normalizeAuthUser(undefined)).toBeNull()
    expect(normalizeAuthUser({})).toBeNull()
    expect(normalizeAuthUser('not-an-object')).toBeNull()
  })

  it('accountIdentity / displayNameOf 对空值安全', () => {
    expect(accountIdentity(null)).toBe('')
    expect(displayNameOf(null)).toBe('')
  })
})
