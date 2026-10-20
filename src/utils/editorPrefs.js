/**
 * 编辑器偏好设置的持久化(目前只有选区填充的「含空白格」开关)。
 *
 * 存储位置沿用 `bead_studio_settings`(与语言、记住登录同一份 JSON),
 * 不新开 localStorage 键 —— 用户清缓存时不会出现「语言还在、编辑器偏好丢了」
 * 这种不一致。所有读写都容错:损坏的 JSON、隐私模式下的写入异常都静默回退默认值。
 */

export const SETTINGS_KEY = 'bead_studio_settings'

/** 选区填充默认「不填空白格」(规格 04 §2:不要无提示地填满空白区域) */
export const DEFAULT_FILL_INCLUDE_EMPTY = false

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}
  } catch {
    return {}
  }
}

/** 读取「填充时是否包含空白格」。缺省或类型不对时回默认值 false。 */
export function loadFillIncludeEmpty() {
  const value = readSettings().fillIncludeEmpty
  return typeof value === 'boolean' ? value : DEFAULT_FILL_INCLUDE_EMPTY
}

/** 写回「填充时是否包含空白格」,保留 settings 里的其他字段(如 language)。 */
export function saveFillIncludeEmpty(value) {
  try {
    const settings = readSettings()
    settings.fillIncludeEmpty = Boolean(value)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 隐私模式 / 配额不足:偏好无法持久化,但本次会话内仍然生效
  }
}
