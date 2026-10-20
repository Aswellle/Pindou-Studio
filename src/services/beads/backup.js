/**
 * 个人色卡 / 库存的备份与恢复(规格 05 §5:本地模式需支持导出备份)。
 *
 * 备份只包含**用户自己的**色卡、颜色与库存,不含账号信息、作品或任何 token。
 * 导入是「合并」而不是覆盖:
 *   - 同 id 的色卡/颜色/库存跳过(计入 skipped),不覆盖现有数据;
 *   - 未知版本或形状不合法时整体拒绝,不改动现有数据。
 *
 * 本文件是纯函数(输入 JSON 文本 / state,输出结果对象),不做文件 I/O。
 */

import {
  normalizePaletteInput,
  normalizeColorInput,
  normalizeColorSource,
  COLOR_SOURCES,
  MAX_PALETTE_NAME,
  MAX_COLOR_CODE,
  MAX_NOTE,
} from './personalPalette'

export const BACKUP_KIND = 'pindou-personal-beads'
export const BACKUP_VERSION = 1
/** 备份文件体积上限:个人色卡是纯文本,1MB 足够容纳上千色 */
export const MAX_BACKUP_BYTES = 1024 * 1024

export const BACKUP_ERRORS = Object.freeze({
  NOT_JSON: 'notJson',
  NOT_BACKUP: 'notBackup',
  FUTURE_VERSION: 'futureVersion',
  TOO_LARGE: 'tooLarge',
  BAD_SHAPE: 'badShape',
})

/**
 * 从仓库 state 生成备份对象。
 * @param {{palettes:Array, colors:Array, inventory:Array}} state
 * @param {object} [meta] - { exportedAt, app }
 */
export function buildBeadBackup(state, meta = {}) {
  const palettes = Array.isArray(state?.palettes) ? state.palettes : []
  const colors = Array.isArray(state?.colors) ? state.colors : []
  const inventory = Array.isArray(state?.inventory) ? state.inventory : []
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: meta.exportedAt || new Date().toISOString(),
    // 只导出业务字段,不把内部运行时字段(如 lastError)带出去
    palettes: palettes.map((p) => ({
      id: p.id,
      name: p.name,
      brandName: p.brandName || '',
      seriesName: p.seriesName || '',
      beadSizeMm: p.beadSizeMm ?? null,
      notes: p.notes || '',
      createdAt: p.createdAt || null,
      updatedAt: p.updatedAt || null,
    })),
    colors: colors.map((c) => ({
      id: c.id,
      paletteId: c.paletteId,
      code: c.code,
      name: c.name || '',
      hex: c.hex,
      notes: c.notes || '',
      sortOrder: c.sortOrder || 0,
      source: normalizeColorSource(c.source),
    })),
    inventory: inventory.map((i) => ({
      paletteKey: i.paletteKey,
      paletteColorId: i.paletteColorId || null,
      quantity: i.quantity === null || i.quantity === undefined ? null : Number(i.quantity),
      status: i.status || 'owned',
      notes: i.notes || '',
      updatedAt: i.updatedAt || null,
    })),
  }
}

function text(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

/**
 * 解析并校验备份文本。
 * @returns {{ ok: true, backup: object } | { ok: false, errors: Array<{code:string,detail?:string}> }}
 */
export function parseBeadBackup(input) {
  const raw = typeof input === 'string' ? input : ''
  if (raw.length > MAX_BACKUP_BYTES) {
    return { ok: false, errors: [{ code: BACKUP_ERRORS.TOO_LARGE }] }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return { ok: false, errors: [{ code: BACKUP_ERRORS.NOT_JSON, detail: e?.message }] }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: [{ code: BACKUP_ERRORS.NOT_BACKUP }] }
  }
  if (parsed.kind !== BACKUP_KIND) {
    return { ok: false, errors: [{ code: BACKUP_ERRORS.NOT_BACKUP }] }
  }
  const version = Number(parsed.version)
  if (!Number.isFinite(version) || version < 1) {
    return { ok: false, errors: [{ code: BACKUP_ERRORS.NOT_BACKUP }] }
  }
  if (version > BACKUP_VERSION) {
    // 来自更新版本的备份:拒绝而不是猜字段
    return { ok: false, errors: [{ code: BACKUP_ERRORS.FUTURE_VERSION, detail: String(version) }] }
  }
  if (!Array.isArray(parsed.palettes) || !Array.isArray(parsed.colors) || !Array.isArray(parsed.inventory)) {
    return { ok: false, errors: [{ code: BACKUP_ERRORS.BAD_SHAPE }] }
  }

  const palettes = []
  for (const p of parsed.palettes) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) continue
    const normalized = normalizePaletteInput(p)
    if (!normalized.ok) continue
    palettes.push({
      id: p.id,
      ...normalized.palette,
      name: text(normalized.palette.name, MAX_PALETTE_NAME),
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : null,
      updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : null,
    })
  }

  const paletteIds = new Set(palettes.map((p) => p.id))
  const colors = []
  for (const c of parsed.colors) {
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id) continue
    // 颜色必须挂在本次备份里存在的色卡下,否则会成为孤儿行
    if (!paletteIds.has(c.paletteId)) continue
    const siblings = colors.filter((x) => x.paletteId === c.paletteId)
    const normalized = normalizeColorInput(c, { existingColors: siblings })
    if (!normalized.ok) continue
    colors.push({
      id: c.id,
      paletteId: c.paletteId,
      ...normalized.color,
      name: text(normalized.color.name, MAX_PALETTE_NAME),
      code: text(normalized.color.code, MAX_COLOR_CODE),
      notes: text(normalized.color.notes, MAX_NOTE),
      source: normalizeColorSource(c.source || COLOR_SOURCES.FACTORY),
    })
  }

  const colorIds = new Set(colors.map((c) => c.id))
  const inventory = []
  for (const i of parsed.inventory) {
    if (!i || typeof i !== 'object' || typeof i.paletteKey !== 'string' || !i.paletteKey) continue
    // 个人色卡的库存必须指向本次备份里的颜色;内置色卡(builtin:)没有本地颜色行
    if (i.paletteColorId && !colorIds.has(i.paletteColorId)) continue
    let quantity = null
    if (i.quantity !== null && i.quantity !== undefined) {
      const n = Number(i.quantity)
      if (!Number.isFinite(n) || n < 0) continue
      quantity = Math.trunc(n)
    }
    const status = ['owned', 'low', 'out_of_stock'].includes(i.status) ? i.status : 'owned'
    inventory.push({
      paletteKey: i.paletteKey,
      paletteColorId: i.paletteColorId || null,
      quantity,
      status,
      notes: text(i.notes, MAX_NOTE),
      updatedAt: typeof i.updatedAt === 'string' ? i.updatedAt : null,
    })
  }

  return {
    ok: true,
    backup: { kind: BACKUP_KIND, version, exportedAt: parsed.exportedAt || null, palettes, colors, inventory },
  }
}

/**
 * 计算「合并」需要写入哪些记录(不执行写入,便于单测与预览)。
 * 同 id 视为已存在,跳过;返回 skipped 计数。
 */
export function planMerge(current, backup) {
  const paletteIds = new Set((current?.palettes || []).map((p) => p.id))
  const colorIds = new Set((current?.colors || []).map((c) => c.id))
  const invKeys = new Set((current?.inventory || []).map((i) => i.paletteKey))

  const palettes = []
  let skippedPalettes = 0
  for (const p of backup?.palettes || []) {
    if (paletteIds.has(p.id)) { skippedPalettes++; continue }
    palettes.push(p)
    paletteIds.add(p.id)
  }

  const colors = []
  let skippedColors = 0
  for (const c of backup?.colors || []) {
    if (colorIds.has(c.id) || !paletteIds.has(c.paletteId)) { skippedColors++; continue }
    colors.push(c)
    colorIds.add(c.id)
  }

  const inventory = []
  let skippedInventory = 0
  for (const i of backup?.inventory || []) {
    if (invKeys.has(i.paletteKey)) { skippedInventory++; continue }
    // 个人色卡库存必须指向已存在或本次导入的颜色
    if (i.paletteColorId && !colorIds.has(i.paletteColorId)) { skippedInventory++; continue }
    inventory.push(i)
    invKeys.add(i.paletteKey)
  }

  return {
    palettes,
    colors,
    inventory,
    skipped: { palettes: skippedPalettes, colors: skippedColors, inventory: skippedInventory },
  }
}
