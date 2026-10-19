import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  fingerprintImage,
  saveSession,
  loadSession,
  deleteSession,
  pruneOld,
  MAX_STORED_IMAGE_BYTES,
  SESSION_TTL_MS,
  __resetForTests,
} from './chartImportStore'

/** 造一个带确定字节的 Blob,模拟用户选的图片文件 */
function makeBlob(text, type = 'image/jpeg') {
  return new Blob([text], { type })
}

/** 每个用例一个干净的 IndexedDB(避免用例之间互相看到会话) */
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  __resetForTests()
})

describe('chartImportStore · 指纹', () => {
  it('同一份字节得到同一个指纹', async () => {
    const a = await fingerprintImage(makeBlob('hello-image'))
    const b = await fingerprintImage(makeBlob('hello-image'))
    expect(a).toBe(b)
    expect(a).toMatch(/^img-\d+-/)
  })

  it('内容不同则指纹不同', async () => {
    const a = await fingerprintImage(makeBlob('image-one'))
    const b = await fingerprintImage(makeBlob('image-two'))
    expect(a).not.toBe(b)
  })

  it('长度不同必然不同(即使头 4KB 相同)', async () => {
    const a = await fingerprintImage(makeBlob('x'.repeat(100)))
    const b = await fingerprintImage(makeBlob('x'.repeat(200)))
    expect(a).not.toBe(b)
  })

  it('没有 slice 的坏输入不抛错', async () => {
    const fp = await fingerprintImage({ size: 42 })
    expect(fp).toBe('img-42-0')
  })
})

describe('chartImportStore · 会话往返', () => {
  it('保存后能原样读回参数与逐格修正', async () => {
    const state = {
      cols: 17,
      rows: 7,
      paletteId: 'mard',
      removeBackground: false,
      bounds: { x0: 10, y0: 20, x1: 210, y1: 100 },
      overrides: { '3,2': '#E53935', '5,1': null },
    }
    const ok = await saveSession({ id: 'img-1', imageBlob: makeBlob('src'), state, name: '小鸭' })
    expect(ok).toBe(true)

    const got = await loadSession('img-1')
    expect(got).not.toBeNull()
    expect(got.state.cols).toBe(17)
    expect(got.state.rows).toBe(7)
    expect(got.state.paletteId).toBe('mard')
    expect(got.state.removeBackground).toBe(false)
    expect(got.state.bounds).toEqual(state.bounds)
    // null(标记空白)必须原样保留,不能被当成「没设过」
    expect(got.state.overrides['3,2']).toBe('#E53935')
    expect(got.state.overrides['5,1']).toBeNull()
    expect(got.name).toBe('小鸭')
  })

  it('覆盖保存保留 createdAt,并刷新 updatedAt', async () => {
    await saveSession({ id: 'img-1', imageBlob: makeBlob('a'), state: { cols: 5 } })
    const first = await loadSession('img-1')

    await new Promise((r) => setTimeout(r, 5))
    await saveSession({ id: 'img-1', imageBlob: makeBlob('a'), state: { cols: 9 } })
    const second = await loadSession('img-1')

    expect(second.state.cols).toBe(9)
    expect(second.createdAt).toBe(first.createdAt)
    expect(Date.parse(second.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first.updatedAt))
  })

  it('不存在的会话返回 null', async () => {
    expect(await loadSession('nope')).toBeNull()
    expect(await loadSession('')).toBeNull()
  })

  it('删除后读不到', async () => {
    await saveSession({ id: 'img-1', imageBlob: makeBlob('a'), state: {} })
    expect(await deleteSession('img-1')).toBe(true)
    expect(await loadSession('img-1')).toBeNull()
  })
})

describe('chartImportStore · 边界与降级', () => {
  it('超过字节上限的图片不入库(但仍返回 false 而非抛错)', async () => {
    const huge = { size: MAX_STORED_IMAGE_BYTES + 1, slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) }
    const ok = await saveSession({ id: 'big', imageBlob: huge, state: {} })
    expect(ok).toBe(false)
  })

  it('缺少 id 或图片时拒绝保存', async () => {
    expect(await saveSession({ id: '', imageBlob: makeBlob('a'), state: {} })).toBe(false)
    expect(await saveSession({ id: 'x', imageBlob: null, state: {} })).toBe(false)
  })

  it('IndexedDB 不可用时全部降级,不抛错', async () => {
    globalThis.indexedDB = undefined
    __resetForTests()

    expect(await saveSession({ id: 'a', imageBlob: makeBlob('a'), state: {} })).toBe(false)
    expect(await loadSession('a')).toBeNull()
    expect(await deleteSession('a')).toBe(false)
    expect(await pruneOld()).toBe(0)
  })

  it('清理只删过期会话', async () => {
    await saveSession({ id: 'old', imageBlob: makeBlob('a'), state: {} })
    await saveSession({ id: 'fresh', imageBlob: makeBlob('b'), state: {} })

    // 把 old 的 updatedAt 改到 TTL 之前
    const db = await new Promise((resolve) => {
      const req = indexedDB.open('pindou-chart-import', 1)
      req.onsuccess = () => resolve(req.result)
    })
    await new Promise((resolve) => {
      const t = db.transaction('sessions', 'readwrite')
      const store = t.objectStore('sessions')
      const getReq = store.get('old')
      getReq.onsuccess = () => {
        const rec = getReq.result
        rec.updatedAt = new Date(Date.now() - SESSION_TTL_MS - 1000).toISOString()
        store.put(rec)
      }
      t.oncomplete = resolve
    })

    const removed = await pruneOld()
    expect(removed).toBe(1)
    expect(await loadSession('old')).toBeNull()
    expect(await loadSession('fresh')).not.toBeNull()
  })
})
