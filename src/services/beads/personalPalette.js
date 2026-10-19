/**
 * 个人色卡(personal palette)纯函数层 —— M6。
 *
 * 设计约束(对应 docs/agent-spec/05_个人色卡与库存规格.md):
 *   - 颜色 ID 与色号是不同字段:主键由调用方生成,色号只用于展示与去重;
 *   - HEX 统一规范化为大写 `#RRGGBB`,非法值显式拒绝,不静默修正;
 *   - 同一色卡内色号唯一(大小写不敏感、忽略首尾空白);
 *   - 自定义色卡的颜色**不写入 canvasData**:画布仍只存 HEX,
 *     因此删除色卡不会让已保存图纸变黑或出现非法 fillStyle。
 *
 * 本文件不做 I/O,不依赖 React / Supabase,便于独立测试。
 */

/** 色卡名 / 色号 / 备注长度上限(与迁移里的 check 约束保持一致) */
export const MAX_PALETTE_NAME = 60
export const MAX_COLOR_CODE = 24
export const MAX_NOTE = 500
/** 豆子直径合理区间(mm):迁移里的 numeric(4,2) check 与此一致 */
export const MIN_BEAD_SIZE_MM = 0.1
export const MAX_BEAD_SIZE_MM = 20

export const PALETTE_ERRORS = Object.freeze({
  NOT_OBJECT: 'notObject',
  NAME_REQUIRED: 'nameRequired',
  NAME_TOO_LONG: 'nameTooLong',
  NOTE_TOO_LONG: 'noteTooLong',
  INVALID_BEAD_SIZE: 'invalidBeadSize',
  CODE_REQUIRED: 'codeRequired',
  CODE_TOO_LONG: 'codeTooLong',
  INVALID_HEX: 'invalidHex',
  DUPLICATE_CODE: 'duplicateCode',
})

const HEX_RE = /^#?([0-9a-fA-F]{6})$/

/**
 * 规范化 HEX:接受 `#ff0000` / `ff0000` / 前后空白,统一输出 `#FF0000`。
 * 其余输入(3 位缩写、颜色名、null)一律返回 null —— 调用方负责报错。
 */
export function normalizeHex(input) {
  if (typeof input !== 'string') return null
  const m = HEX_RE.exec(input.trim())
  return m ? `#${m[1].toUpperCase()}` : null
}

/** 生成本地 ID(云端由数据库生成 uuid,本地模式用它保证唯一) */
export function createLocalId(prefix = 'id') {
  const rand = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${rand}`
}

function textOrEmpty(v) {
  return typeof v === 'string' ? v.trim() : ''
}

function optionalText(v, max = MAX_NOTE) {
  const s = textOrEmpty(v)
  if (!s) return ''
  return s.slice(0, max)
}

/**
 * 校验并规范化色卡元数据。
 * @returns {{ ok: true, palette: object } | { ok: false, errors: Array<{code:string}> }}
 */
export function normalizePaletteInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: [{ code: PALETTE_ERRORS.NOT_OBJECT }] }
  }
  const errors = []
  const name = textOrEmpty(input.name)
  if (!name) errors.push({ code: PALETTE_ERRORS.NAME_REQUIRED })
  else if (name.length > MAX_PALETTE_NAME) errors.push({ code: PALETTE_ERRORS.NAME_TOO_LONG })

  // beadSizeMm:空 / null 表示未知;其余必须是区间内的数字
  let beadSizeMm = null
  const rawSize = input.beadSizeMm
  if (rawSize !== null && rawSize !== undefined && String(rawSize).trim() !== '') {
    const n = Number(rawSize)
    if (!Number.isFinite(n) || n < MIN_BEAD_SIZE_MM || n > MAX_BEAD_SIZE_MM) {
      errors.push({ code: PALETTE_ERRORS.INVALID_BEAD_SIZE })
    } else {
      beadSizeMm = Math.round(n * 100) / 100
    }
  }

  const notes = optionalText(input.notes)
  if (typeof input.notes === 'string' && input.notes.trim().length > MAX_NOTE) {
    errors.push({ code: PALETTE_ERRORS.NOTE_TOO_LONG })
  }

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    palette: {
      name,
      brandName: optionalText(input.brandName, MAX_PALETTE_NAME),
      seriesName: optionalText(input.seriesName, MAX_PALETTE_NAME),
      beadSizeMm,
      notes,
    },
  }
}

/**
 * 校验并规范化颜色输入。
 * @param {object} input - { code, name, hex, notes, sortOrder }
 * @param {object} [opts]
 * @param {Array} [opts.existingColors] - 同色卡已有颜色(用于重复色号检查)
 * @param {string} [opts.ignoreId] - 编辑自身时忽略该 ID 的色号
 */
export function normalizeColorInput(input, { existingColors = [], ignoreId = null } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: [{ code: PALETTE_ERRORS.NOT_OBJECT }] }
  }
  const errors = []
  const code = textOrEmpty(input.code)
  if (!code) errors.push({ code: PALETTE_ERRORS.CODE_REQUIRED })
  else if (code.length > MAX_COLOR_CODE) errors.push({ code: PALETTE_ERRORS.CODE_TOO_LONG })

  const hex = normalizeHex(input.hex)
  if (!hex) errors.push({ code: PALETTE_ERRORS.INVALID_HEX })

  if (code) {
    const lower = code.toLowerCase()
    const dup = existingColors.some(
      (c) => c && c.id !== ignoreId && textOrEmpty(c.code).toLowerCase() === lower
    )
    if (dup) errors.push({ code: PALETTE_ERRORS.DUPLICATE_CODE, detail: code })
  }

  const notes = optionalText(input.notes)
  if (typeof input.notes === 'string' && input.notes.trim().length > MAX_NOTE) {
    errors.push({ code: PALETTE_ERRORS.NOTE_TOO_LONG })
  }

  const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Math.trunc(Number(input.sortOrder)) : 0

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    color: {
      code,
      name: optionalText(input.name, MAX_PALETTE_NAME),
      hex,
      notes,
      sortOrder,
    },
  }
}

/**
 * 内置色卡 → 私人副本。返回可直接写入存储的 palette + colors。
 * 名称由调用方提供(通常是 `原名 副本`),服务层不嵌入任何语言的文案。
 */
export function buildPaletteFromBuiltin(builtin, { name } = {}) {
  const source = builtin && Array.isArray(builtin.colors) ? builtin : null
  if (!source) return { palette: null, colors: [] }
  const paletteId = createLocalId('pal')
  const palette = {
    id: paletteId,
    name: textOrEmpty(name) || textOrEmpty(source.nameZh) || textOrEmpty(source.name) || 'Palette',
    brandName: textOrEmpty(source.nameZh) || textOrEmpty(source.name),
    seriesName: '',
    beadSizeMm: Number.isFinite(Number(source.beadSize)) ? Number(source.beadSize) : null,
    notes: '',
  }
  const colors = source.colors.map((c, index) => ({
    id: createLocalId('col'),
    paletteId,
    code: String(c.id ?? c.code ?? '').trim(),
    name: textOrEmpty(c.nameZh) || textOrEmpty(c.name),
    hex: normalizeHex(c.hex) || '#000000',
    notes: '',
    sortOrder: index,
  }))
  return { palette, colors }
}

/** 内置色卡库存键:builtin:<paletteId>:<colorId> */
export function paletteKeyForBuiltin(paletteId, colorId) {
  return `builtin:${paletteId}:${colorId}`
}

/** 个人色卡库存键:user:<paletteId>:<colorId> */
export function paletteKeyForUser(paletteId, colorId) {
  return `user:${paletteId}:${colorId}`
}

/** 从库存键解析归属(用于删除/筛选时判断是否属于个人色卡) */
export function parsePaletteKey(key) {
  if (typeof key !== 'string') return null
  const parts = key.split(':')
  if (parts.length !== 3) return null
  const [kind, paletteId, colorId] = parts
  if (kind !== 'builtin' && kind !== 'user') return null
  return { kind, paletteId, colorId }
}
