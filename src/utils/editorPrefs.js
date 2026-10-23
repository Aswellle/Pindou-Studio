/**
 * 编辑器偏好设置的持久化(选区填充的「含空白格」开关、导出后扣库存、自动保存)。
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

/**
 * 「导出后扣减库存」(规格 05 §3)。
 * 默认 false —— 规格明文要求只有用户主动开启「完成一张作品后记账」才执行。
 */
export const DEFAULT_DEDUCT_INVENTORY = false

export function loadDeductInventory() {
  const value = readSettings().deductInventory
  return typeof value === 'boolean' ? value : DEFAULT_DEDUCT_INVENTORY
}

export function saveDeductInventory(value) {
  try {
    const settings = readSettings()
    settings.deductInventory = Boolean(value)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 同上:偏好不落盘也不影响本次会话
  }
}

/**
 * 自动保存草稿(规格 03 §7)。
 *
 * 默认 **true** —— 自动保存的全部价值就在于「用户没想过要保存时也在保存」,
 * 默认关闭等于没有这个功能。开关存在的意义是给介意本地写入的用户一个出口,
 * 而不是把它当成需要用户主动发现的高级选项。
 */
export const DEFAULT_AUTO_SAVE = true

export function loadAutoSaveEnabled() {
  const value = readSettings().autoSave
  return typeof value === 'boolean' ? value : DEFAULT_AUTO_SAVE
}

export function saveAutoSaveEnabled(value) {
  try {
    const settings = readSettings()
    settings.autoSave = Boolean(value)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 隐私模式 / 配额不足:开关无法持久化,但本次会话内仍然生效
  }
}
