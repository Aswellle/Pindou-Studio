/**
 * cloud-profile-mirror — 登录用户昵称/头像的本地镜像。
 *
 * 为什么需要它:会话恢复是「getSession 返回 → 建 user(avatarUrl 恒空) →
 * profiles 查询回填」三步,中间隔着一次网络往返。这段时间 Header 只能渲染
 * 首字母兜底头像,刷新页面/回到标签页时用户会看到「默认头像 → 真实头像」
 * 的闪变。把最后一次已知的昵称/头像按 userId 存进 localStorage,
 * getSession 返回的瞬间就能同步回填,闪变窗口消失。
 *
 * 惯例与 cloud-works-mirror 一致:
 *   - kebab-case 独立键,不进 bead_studio_settings(那是唯一 settings 键);
 *   - 读写全部 try/catch,隐私模式/配额超限静默降级;
 *   - 按 userId 分条存储,登出不清理 —— 换账号登录时各自读各自的条目,
 *     不会串用;数据本身就是服务端公开资料的非敏感缓存。
 */

const KEY = 'cloud-profile-mirror'

/** @returns {{nickname:string, avatarUrl:string}|null} */
export function readProfileMirror(userId) {
  if (!userId) return null
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}')
    const entry = all[userId]
    if (!entry || (!entry.nickname && !entry.avatarUrl)) return null
    return { nickname: entry.nickname || '', avatarUrl: entry.avatarUrl || '' }
  } catch {
    return null
  }
}

export function writeProfileMirror(userId, { nickname, avatarUrl } = {}) {
  if (!userId || (!nickname && !avatarUrl)) return
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}')
    all[userId] = {
      nickname: nickname || '',
      avatarUrl: avatarUrl || '',
      savedAt: Date.now(),
    }
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch { /* 写失败不影响登录流程 */ }
}
