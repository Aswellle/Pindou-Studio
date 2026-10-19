import { describe, it, expect, beforeEach } from 'vitest'
import {
  createLocalBeadStore,
  readLocalBeadState,
  readCorruptBackup,
  resetLocalBeadStore,
  STORE_ERRORS,
} from './localBeadStore'

const KEY = 'personal-beads-v1'

function makeQuotaStorage() {
  // 包装真实 localStorage:写入时抛 QuotaExceededError
  return {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => {
      if (k === KEY) {
        const err = new Error('quota')
        err.name = 'QuotaExceededError'
        throw err
      }
      localStorage.setItem(k, v)
    },
    removeItem: (k) => localStorage.removeItem(k),
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('localBeadStore · 读取与损坏保护', () => {
  it('空存储返回空状态', () => {
    expect(readLocalBeadState()).toEqual({
      state: { version: 1, palettes: [], colors: [], inventory: [] },
      corrupted: false,
      unavailable: false,
    })
  })

  it('损坏 JSON:先备份原始内容再清空,不静默丢弃', () => {
    localStorage.setItem(KEY, '{not-json')
    const res = readLocalBeadState()
    expect(res.corrupted).toBe(true)
    expect(res.state.palettes).toEqual([])
    expect(readCorruptBackup()).toBe('{not-json')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('未来版本数据不覆盖、不误读', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 99, palettes: [{ id: 'p1' }] }))
    const res = readLocalBeadState()
    expect(res.futureVersion).toBe(99)
    expect(res.state.palettes).toEqual([])
    // 原始数据仍在
    expect(JSON.parse(localStorage.getItem(KEY)).version).toBe(99)
  })

  it('过滤缺少 id 的脏条目', () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 1,
      palettes: [{ id: 'p1', name: 'A' }, { name: 'no id' }, null],
      colors: [{ id: 'c1', paletteId: 'p1', code: 'A1', hex: '#FFFFFF' }],
      inventory: [{ paletteKey: 'x' }],
    }))
    const res = readLocalBeadState()
    expect(res.state.palettes).toHaveLength(1)
    expect(res.state.colors).toHaveLength(1)
    expect(res.state.inventory).toHaveLength(0)
  })
})

describe('localBeadStore · 色卡与颜色 CRUD', () => {
  it('新建色卡后重新读取仍在(持久化)', async () => {
    const store = createLocalBeadStore()
    const res = await store.createPalette({ name: '我的色卡', beadSizeMm: 2.6 })
    expect(res.ok).toBe(true)

    // 新实例模拟刷新页面
    const again = createLocalBeadStore()
    const data = await again.load()
    expect(data.palettes).toHaveLength(1)
    expect(data.palettes[0]).toMatchObject({ name: '我的色卡', beadSizeMm: 2.6 })
  })

  it('缺失必填字段被拒绝,不写入存储', async () => {
    const store = createLocalBeadStore()
    const res = await store.createPalette({ name: '  ' })
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe('nameRequired')
    expect((await store.load()).palettes).toHaveLength(0)
  })

  it('新增颜色:非法 HEX / 重复色号被拒绝', async () => {
    const store = createLocalBeadStore()
    const { palette } = await store.createPalette({ name: 'P' })

    const badHex = await store.addColor(palette.id, { code: 'A1', hex: '#f00' })
    expect(badHex.ok).toBe(false)
    expect(badHex.errors[0].code).toBe('invalidHex')

    const ok = await store.addColor(palette.id, { code: 'A1', hex: '#ff0000' })
    expect(ok.ok).toBe(true)
    expect(ok.color.hex).toBe('#FF0000')

    const dup = await store.addColor(palette.id, { code: 'a1', hex: '#00FF00' })
    expect(dup.ok).toBe(false)
    expect(dup.errors[0].code).toBe('duplicateCode')
  })

  it('编辑颜色时忽略自身色号;改成别人的色号仍被拒绝', async () => {
    const store = createLocalBeadStore()
    const { palette } = await store.createPalette({ name: 'P' })
    const a = await store.addColor(palette.id, { code: 'A1', hex: '#FF0000' })
    const b = await store.addColor(palette.id, { code: 'A2', hex: '#00FF00' })

    const self = await store.updateColor(a.color.id, { code: 'A1', hex: '#0000FF' })
    expect(self.ok).toBe(true)

    const clash = await store.updateColor(a.color.id, { code: 'A2', hex: '#0000FF' })
    expect(clash.ok).toBe(false)
    expect(clash.errors[0].code).toBe('duplicateCode')
    expect(b.ok).toBe(true)
  })

  it('删除色卡级联删除颜色与库存,但不会影响外部矩阵数据', async () => {
    const store = createLocalBeadStore()
    const { palette } = await store.createPalette({ name: 'P' })
    const { color } = await store.addColor(palette.id, { code: 'A1', hex: '#FF0000' })
    await store.setInventory({
      paletteKey: `user:${palette.id}:${color.id}`,
      paletteColorId: color.id,
      quantity: 10,
    })

    const res = await store.deletePalette(palette.id)
    expect(res.ok).toBe(true)
    const data = await store.load()
    expect(data.palettes).toHaveLength(0)
    expect(data.colors).toHaveLength(0)
    expect(data.inventory).toHaveLength(0)
  })
})

describe('localBeadStore · 库存', () => {
  it('quantity = null 表示未知,不是 0', async () => {
    const store = createLocalBeadStore()
    const res = await store.setInventory({ paletteKey: 'builtin:perler:P01', quantity: null })
    expect(res.ok).toBe(true)
    expect(res.record.quantity).toBeNull()
  })

  it('负数库存被拒绝', async () => {
    const store = createLocalBeadStore()
    const res = await store.setInventory({ paletteKey: 'builtin:perler:P01', quantity: -3 })
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe('invalidQuantity')
  })

  it('同一 paletteKey 重复写入是更新而不是新增', async () => {
    const store = createLocalBeadStore()
    await store.setInventory({ paletteKey: 'builtin:perler:P01', quantity: 5 })
    await store.setInventory({ paletteKey: 'builtin:perler:P01', quantity: 9, status: 'low' })
    const data = await store.load()
    expect(data.inventory).toHaveLength(1)
    expect(data.inventory[0]).toMatchObject({ quantity: 9, status: 'low' })
  })
})

describe('localBeadStore · 配额错误上报', () => {
  it('QuotaExceededError 明确返回 storageFull,不静默吞掉', async () => {
    const store = createLocalBeadStore(makeQuotaStorage())
    const res = await store.createPalette({ name: 'P' })
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(STORE_ERRORS.STORAGE_FULL)
    expect(store.takeError().code).toBe(STORE_ERRORS.STORAGE_FULL)
    // takeError 后清空,避免同一错误反复弹 toast
    expect(store.takeError()).toBeNull()
  })
})

describe('localBeadStore · 重置', () => {
  it('resetLocalBeadStore 清空存储', async () => {
    const store = createLocalBeadStore()
    await store.createPalette({ name: 'P' })
    resetLocalBeadStore()
    expect((await createLocalBeadStore().load()).palettes).toHaveLength(0)
  })
})
