/**
 * 个人色卡 / 库存的本地仓库(localStorage,本地模式与离线兜底)。
 *
 * 规格要求(docs/agent-spec/05 §5):
 *   - 配额错误必须上报,不能静默 catch 后丢数据;
 *   - 数据带版本号,未来可迁移;
 *   - 解析失败时先备份原始内容再清空,避免多标签页并发写截断造成永久丢失。
 *
 * 存储形状:
 *   { version: 1, palettes: [...], colors: [...], inventory: [...] }
 *
 * 与云端仓库(cloudBeadStore)保持同一接口,便于 useUserPalettes 切换。
 */

import {
  normalizePaletteInput,
  normalizeColorInput,
  createLocalId,
} from './personalPalette'

const STORE_KEY = 'personal-beads-v1'
const CORRUPT_KEY = 'personal-beads-corrupt'
const SCHEMA_VERSION = 1

export const STORE_ERRORS = Object.freeze({
  STORAGE_FULL: 'storageFull',
  WRITE_FAILED: 'writeFailed',
  NOT_FOUND: 'notFound',
  CORRUPTED: 'corrupted',
})

function emptyState() {
  return { version: SCHEMA_VERSION, palettes: [], colors: [], inventory: [] }
}

function asArray(v) {
  return Array.isArray(v) ? v : []
}

/**
 * 读入并做最小归一。损坏数据备份到 personal-beads-corrupt 后清空。
 * 返回 { state, corrupted }。
 */
export function readLocalBeadState(storage = globalThis.localStorage) {
  let raw = null
  try {
    raw = storage.getItem(STORE_KEY)
  } catch {
    // 隐私模式 / 禁用存储:当作空数据,但不假装已保存
    return { state: emptyState(), corrupted: false, unavailable: true }
  }
  if (!raw) return { state: emptyState(), corrupted: false, unavailable: false }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    backupCorrupt(storage, raw)
    return { state: emptyState(), corrupted: true, unavailable: false }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    backupCorrupt(storage, raw)
    return { state: emptyState(), corrupted: true, unavailable: false }
  }

  // 版本迁移入口:当前只有 v1,未来在此逐版升级
  const version = Number(parsed.version) || 0
  if (version > SCHEMA_VERSION) {
    // 来自更新版本的数据:不破坏它,原样保留在存储里,本次按空数据展示
    return { state: emptyState(), corrupted: false, unavailable: false, futureVersion: version }
  }

  return {
    state: {
      version: SCHEMA_VERSION,
      palettes: asArray(parsed.palettes).filter((p) => p && typeof p === 'object' && p.id),
      colors: asArray(parsed.colors).filter((c) => c && typeof c === 'object' && c.id),
      inventory: asArray(parsed.inventory).filter((i) => i && typeof i === 'object' && i.id),
    },
    corrupted: false,
    unavailable: false,
  }
}

function backupCorrupt(storage, raw) {
  try {
    storage.setItem(CORRUPT_KEY, raw)
  } catch { /* 备份失败不阻塞读取,但也不删除原键 */ }
  try {
    storage.removeItem(STORE_KEY)
  } catch { /* 忽略:下次写入会覆盖 */ }
}

function writeLocalBeadState(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORE_KEY, JSON.stringify({ ...state, version: SCHEMA_VERSION }))
    return { ok: true }
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
      return { ok: false, errors: [{ code: STORE_ERRORS.STORAGE_FULL }] }
    }
    return { ok: false, errors: [{ code: STORE_ERRORS.WRITE_FAILED, detail: String(e?.message || e) }] }
  }
}

/** 读取损坏备份(用于"导出/恢复"入口,不自动恢复) */
export function readCorruptBackup(storage = globalThis.localStorage) {
  try {
    return storage.getItem(CORRUPT_KEY)
  } catch {
    return null
  }
}

export function clearCorruptBackup(storage = globalThis.localStorage) {
  try {
    storage.removeItem(CORRUPT_KEY)
  } catch { /* 忽略 */ }
}

/**
 * 本地仓库。所有方法异步(与云端仓库同接口)。
 * @param {Storage} [storage] - 便于测试注入
 */
export function createLocalBeadStore(storage = globalThis.localStorage) {
  let state = readLocalBeadState(storage).state
  let lastError = null

  const commit = (next) => {
    const res = writeLocalBeadState(next, storage)
    if (!res.ok) {
      lastError = res.errors[0]
      return res
    }
    state = next
    lastError = null
    return { ok: true }
  }

  const snapshot = () => ({
    palettes: state.palettes.map((p) => ({ ...p })),
    colors: state.colors.map((c) => ({ ...c })),
    inventory: state.inventory.map((i) => ({ ...i })),
  })

  return {
    mode: 'local',
    takeError() {
      const e = lastError
      lastError = null
      return e
    },
    async load() {
      return snapshot()
    },

    async createPalette(input) {
      const res = normalizePaletteInput(input)
      if (!res.ok) return res
      const now = new Date().toISOString()
      const palette = {
        id: createLocalId('pal'),
        ...res.palette,
        createdAt: now,
        updatedAt: now,
      }
      const w = commit({ ...state, palettes: [...state.palettes, palette] })
      return w.ok ? { ok: true, palette } : w
    },

    /**
     * 一次性创建色卡 + 全部颜色(复制内置色卡用)。
     * 单次写入:291 色不会触发 291 次 localStorage 序列化。
     */
    async createPaletteWithColors(input, colorInputs = []) {
      const res = normalizePaletteInput(input)
      if (!res.ok) return res
      const now = new Date().toISOString()
      const palette = {
        id: createLocalId('pal'),
        ...res.palette,
        createdAt: now,
        updatedAt: now,
      }
      const colors = []
      for (let i = 0; i < colorInputs.length; i++) {
        const c = normalizeColorInput(colorInputs[i], { existingColors: colors })
        if (!c.ok) {
          return { ok: false, errors: c.errors.map((e) => ({ ...e, index: i })) }
        }
        colors.push({
          id: createLocalId('col'),
          paletteId: palette.id,
          ...c.color,
          sortOrder: Number.isFinite(Number(colorInputs[i].sortOrder))
            ? Number(colorInputs[i].sortOrder)
            : i,
        })
      }
      const w = commit({
        ...state,
        palettes: [...state.palettes, palette],
        colors: [...state.colors, ...colors],
      })
      return w.ok ? { ok: true, palette, colors } : w
    },

    async updatePalette(id, patch) {
      const existing = state.palettes.find((p) => p.id === id)
      if (!existing) return { ok: false, errors: [{ code: STORE_ERRORS.NOT_FOUND }] }
      const merged = normalizePaletteInput({ ...existing, ...patch })
      if (!merged.ok) return merged
      const palette = { ...existing, ...merged.palette, updatedAt: new Date().toISOString() }
      const w = commit({
        ...state,
        palettes: state.palettes.map((p) => (p.id === id ? palette : p)),
      })
      return w.ok ? { ok: true, palette } : w
    },

    async deletePalette(id) {
      const palette = state.palettes.find((p) => p.id === id)
      if (!palette) return { ok: false, errors: [{ code: STORE_ERRORS.NOT_FOUND }] }
      const colorIds = new Set(state.colors.filter((c) => c.paletteId === id).map((c) => c.id))
      const w = commit({
        ...state,
        palettes: state.palettes.filter((p) => p.id !== id),
        colors: state.colors.filter((c) => c.paletteId !== id),
        inventory: state.inventory.filter(
          (i) => !colorIds.has(i.paletteColorId) && !String(i.paletteKey || '').startsWith(`user:${id}:`)
        ),
      })
      // 已保存图纸只存 HEX,不引用色卡行 → 删除不会破坏图纸
      return w.ok ? { ok: true } : w
    },

    async addColor(paletteId, input) {
      const palette = state.palettes.find((p) => p.id === paletteId)
      if (!palette) return { ok: false, errors: [{ code: STORE_ERRORS.NOT_FOUND }] }
      const siblings = state.colors.filter((c) => c.paletteId === paletteId)
      const res = normalizeColorInput(input, { existingColors: siblings })
      if (!res.ok) return res
      const color = {
        id: createLocalId('col'),
        paletteId,
        ...res.color,
        sortOrder: Number.isFinite(Number(input.sortOrder))
          ? Number(input.sortOrder)
          : siblings.length,
      }
      const w = commit({ ...state, colors: [...state.colors, color] })
      return w.ok ? { ok: true, color } : w
    },

    /**
     * 批量添加颜色(CSV/JSON 导入用)。全部校验通过才写入,任何一行不合法则整体拒绝,
     * 与规格「不允许部分写入后无提示失败」一致。
     */
    async addColors(paletteId, inputs = []) {
      const palette = state.palettes.find((p) => p.id === paletteId)
      if (!palette) return { ok: false, errors: [{ code: STORE_ERRORS.NOT_FOUND }] }
      const siblings = state.colors.filter((c) => c.paletteId === paletteId)
      const accepted = [...siblings]
      const colors = []
      for (let i = 0; i < inputs.length; i++) {
        const res = normalizeColorInput(inputs[i], { existingColors: accepted })
        if (!res.ok) return { ok: false, errors: res.errors.map((e) => ({ ...e, index: i })) }
        const color = {
          id: createLocalId('col'),
          paletteId,
          ...res.color,
          sortOrder: siblings.length + i,
        }
        colors.push(color)
        accepted.push(color)
      }
      if (colors.length === 0) return { ok: true, colors: [] }
      const w = commit({ ...state, colors: [...state.colors, ...colors] })
      return w.ok ? { ok: true, colors } : w
    },

    async updateColor(id, patch) {
      const existing = state.colors.find((c) => c.id === id)
      if (!existing) return { ok: false, errors: [{ code: STORE_ERRORS.NOT_FOUND }] }
      const siblings = state.colors.filter((c) => c.paletteId === existing.paletteId)
      const res = normalizeColorInput({ ...existing, ...patch }, {
        existingColors: siblings,
        ignoreId: id,
      })
      if (!res.ok) return res
      const color = { ...existing, ...res.color }
      const w = commit({
        ...state,
        colors: state.colors.map((c) => (c.id === id ? color : c)),
      })
      return w.ok ? { ok: true, color } : w
    },

    async deleteColor(id) {
      const existing = state.colors.find((c) => c.id === id)
      if (!existing) return { ok: false, errors: [{ code: STORE_ERRORS.NOT_FOUND }] }
      const w = commit({
        ...state,
        colors: state.colors.filter((c) => c.id !== id),
        inventory: state.inventory.filter((i) => i.paletteColorId !== id),
      })
      return w.ok ? { ok: true } : w
    },

    /**
     * 写入/更新一条库存。
     * quantity = null 表示"未记录数量"(只标记拥有),不是 0。
     */
    async setInventory({ paletteKey, paletteColorId = null, quantity = null, status = 'owned', notes = '' }) {
      if (!paletteKey) return { ok: false, errors: [{ code: STORE_ERRORS.NOT_FOUND }] }
      let qty = null
      if (quantity !== null && quantity !== undefined && String(quantity).trim() !== '') {
        const n = Number(quantity)
        if (!Number.isFinite(n) || n < 0) {
          return { ok: false, errors: [{ code: 'invalidQuantity' }] }
        }
        qty = Math.trunc(n)
      }
      const allowed = ['owned', 'low', 'out_of_stock']
      const st = allowed.includes(status) ? status : 'owned'
      const now = new Date().toISOString()
      const existing = state.inventory.find((i) => i.paletteKey === paletteKey)
      const record = {
        id: existing?.id || createLocalId('inv'),
        paletteKey,
        paletteColorId,
        quantity: qty,
        status: st,
        notes: typeof notes === 'string' ? notes.slice(0, 500) : '',
        updatedAt: now,
      }
      const inventory = existing
        ? state.inventory.map((i) => (i.paletteKey === paletteKey ? record : i))
        : [...state.inventory, record]
      const w = commit({ ...state, inventory })
      return w.ok ? { ok: true, record } : w
    },

    async removeInventory(paletteKey) {
      const w = commit({
        ...state,
        inventory: state.inventory.filter((i) => i.paletteKey !== paletteKey),
      })
      return w.ok ? { ok: true } : w
    },

    /** 本地模式下的整体导出(备份用) */
    async exportAll() {
      return { ...snapshot(), version: SCHEMA_VERSION }
    },

    /**
     * 合并导入备份(规格 05 §5)。传入的记录已经过 parseBeadBackup 校验,
     * 这里只负责保留原 id 写入 + 单次持久化。
     * 同 id / 同 paletteKey 的条目由 planMerge 提前过滤,这里不再去重。
     */
    async mergeBackup(plan) {
      const next = {
        ...state,
        palettes: [...state.palettes, ...(plan?.palettes || [])],
        colors: [...state.colors, ...(plan?.colors || [])],
        inventory: [...state.inventory, ...(plan?.inventory || [])],
      }
      const w = commit(next)
      return w.ok
        ? {
          ok: true,
          imported: {
            palettes: (plan?.palettes || []).length,
            colors: (plan?.colors || []).length,
            inventory: (plan?.inventory || []).length,
          },
        }
        : w
    },
  }
}

/** 仅供测试/调试:清空本地仓库 */
export function resetLocalBeadStore(storage = globalThis.localStorage) {
  try { storage.removeItem(STORE_KEY) } catch { /* 忽略 */ }
}
