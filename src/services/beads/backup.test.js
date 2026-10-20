import { describe, it, expect } from 'vitest'
import {
  BACKUP_KIND,
  BACKUP_VERSION,
  BACKUP_ERRORS,
  buildBeadBackup,
  parseBeadBackup,
  planMerge,
} from './backup'

/**
 * 备份与恢复(规格 05 §5)。
 * 重点:往返无损、非法输入整体拒绝、合并只增不改。
 */

const STATE = {
  palettes: [{
    id: 'pal-1', name: '我的 5mm', brandName: 'MARD', seriesName: '标准', beadSizeMm: 5, notes: '',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  }],
  colors: [
    { id: 'col-1', paletteId: 'pal-1', code: 'A1', name: '白', hex: '#FFFFFF', notes: '', sortOrder: 0, source: 'factory' },
    { id: 'col-2', paletteId: 'pal-1', code: 'A2', name: '黑', hex: '#000000', notes: '', sortOrder: 1, source: 'measured' },
  ],
  inventory: [
    { paletteKey: 'user:pal-1:col-1', paletteColorId: 'col-1', quantity: 500, status: 'owned', notes: '两盒', updatedAt: null },
    { paletteKey: 'builtin:perler:P01', paletteColorId: null, quantity: null, status: 'owned', notes: '', updatedAt: null },
  ],
}

describe('backup · 导出', () => {
  it('带上 kind/version 与三类记录', () => {
    const b = buildBeadBackup(STATE)
    expect(b.kind).toBe(BACKUP_KIND)
    expect(b.version).toBe(BACKUP_VERSION)
    expect(b.palettes).toHaveLength(1)
    expect(b.colors).toHaveLength(2)
    expect(b.inventory).toHaveLength(2)
  })

  it('不导出运行时字段与账号信息', () => {
    const b = buildBeadBackup({ ...STATE, userId: 'secret', lastError: { code: 'x' } })
    const json = JSON.stringify(b)
    expect(json).not.toContain('secret')
    expect(json).not.toContain('lastError')
  })

  it('缺失 source 时回退 factory', () => {
    const b = buildBeadBackup({ ...STATE, colors: [{ ...STATE.colors[0], source: undefined }] })
    expect(b.colors[0].source).toBe('factory')
  })
})

describe('backup · 导入校验', () => {
  const text = (obj) => JSON.stringify(obj)

  it('合法备份往返后数据一致', () => {
    const res = parseBeadBackup(text(buildBeadBackup(STATE)))
    expect(res.ok).toBe(true)
    expect(res.backup.palettes).toHaveLength(1)
    expect(res.backup.colors.map((c) => c.code)).toEqual(['A1', 'A2'])
    expect(res.backup.colors[1].source).toBe('measured')
    expect(res.backup.inventory).toHaveLength(2)
  })

  it('非法 JSON 被拒绝', () => {
    const res = parseBeadBackup('{not json')
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(BACKUP_ERRORS.NOT_JSON)
  })

  it('不是本项目的备份被拒绝', () => {
    const res = parseBeadBackup(text({ kind: 'something-else', version: 1 }))
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(BACKUP_ERRORS.NOT_BACKUP)
  })

  it('更高版本被拒绝(不猜字段)', () => {
    const res = parseBeadBackup(text({ kind: BACKUP_KIND, version: 99, palettes: [], colors: [], inventory: [] }))
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(BACKUP_ERRORS.FUTURE_VERSION)
  })

  it('三类记录不是数组时被拒绝', () => {
    const res = parseBeadBackup(text({ kind: BACKUP_KIND, version: 1, palettes: {}, colors: [], inventory: [] }))
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(BACKUP_ERRORS.BAD_SHAPE)
  })

  it('超大文件被拒绝(不解析)', () => {
    const res = parseBeadBackup('x'.repeat(1024 * 1024 + 1))
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(BACKUP_ERRORS.TOO_LARGE)
  })

  it('孤儿颜色(色卡不在备份里)被丢弃', () => {
    const b = buildBeadBackup(STATE)
    b.colors.push({ id: 'col-x', paletteId: 'missing', code: 'X', name: '', hex: '#123456', notes: '', sortOrder: 9 })
    const res = parseBeadBackup(text(b))
    expect(res.ok).toBe(true)
    expect(res.backup.colors.map((c) => c.id)).not.toContain('col-x')
  })

  it('非法 HEX 的颜色被丢弃,不影响其余记录', () => {
    const b = buildBeadBackup(STATE)
    b.colors.push({ id: 'col-bad', paletteId: 'pal-1', code: 'BAD', name: '', hex: 'red', notes: '', sortOrder: 9 })
    const res = parseBeadBackup(text(b))
    expect(res.ok).toBe(true)
    expect(res.backup.colors.map((c) => c.id)).not.toContain('col-bad')
    expect(res.backup.colors).toHaveLength(2)
  })

  it('负数库存被丢弃', () => {
    const b = buildBeadBackup(STATE)
    b.inventory.push({ paletteKey: 'builtin:perler:P02', quantity: -5, status: 'owned', notes: '' })
    const res = parseBeadBackup(text(b))
    expect(res.ok).toBe(true)
    expect(res.backup.inventory.some((i) => i.paletteKey === 'builtin:perler:P02')).toBe(false)
  })
})

describe('backup · 合并计划', () => {
  it('同 id 跳过,新记录进入导入列表', () => {
    const backup = buildBeadBackup({
      palettes: [
        { id: 'pal-1', name: '重复' },
        { id: 'pal-2', name: '新的' },
      ],
      colors: [{ id: 'col-1', paletteId: 'pal-1', code: 'A1', hex: '#FFFFFF' }],
      inventory: [{ paletteKey: 'builtin:perler:P01', quantity: 1, status: 'owned' }],
    })
    const plan = planMerge(STATE, backup)
    expect(plan.palettes.map((p) => p.id)).toEqual(['pal-2'])
    expect(plan.colors).toHaveLength(0)
    expect(plan.inventory).toHaveLength(0)
    expect(plan.skipped).toEqual({ palettes: 1, colors: 1, inventory: 1 })
  })

  it('只增不改:现有记录不被覆盖', () => {
    const current = { palettes: [{ id: 'pal-1', name: '原名' }], colors: [], inventory: [] }
    const backup = { palettes: [{ id: 'pal-1', name: '新名' }], colors: [], inventory: [] }
    const plan = planMerge(current, backup)
    expect(plan.palettes).toHaveLength(0)
    expect(current.palettes[0].name).toBe('原名')
  })
})
