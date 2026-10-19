import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  listWorks,
  saveWorkRecord,
  deleteWorkRecord,
  putMany,
  clearWorks,
  migrateLegacyWorks,
  estimateBytes,
  isIdbAvailable,
  __resetForTests,
} from './worksStore'

const LEGACY_KEY = 'saved-works'
const work = (id, extra = {}) => ({
  id,
  name: `作品 ${id}`,
  canvasData: [[null]],
  gridSize: 1,
  paletteId: 'perler',
  savedAt: `2026-10-19T00:00:0${id}.000Z`,
  ...extra,
})

beforeEach(() => {
  localStorage.clear()
  globalThis.indexedDB = new IDBFactory()
  __resetForTests()
})

describe('worksStore · 基本读写', () => {
  it('保存后能列出,按 savedAt 倒序', async () => {
    await saveWorkRecord(work(1))
    await saveWorkRecord(work(2))
    await saveWorkRecord(work(3))

    const items = await listWorks()
    expect(items.map((w) => w.id)).toEqual([3, 2, 1])
  })

  it('同 id 再保存是覆盖,不会产生重复', async () => {
    await saveWorkRecord(work(1, { name: '旧名' }))
    await saveWorkRecord(work(1, { name: '新名' }))

    const items = await listWorks()
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('新名')
  })

  it('删除后列表里不再出现', async () => {
    await saveWorkRecord(work(1))
    await saveWorkRecord(work(2))

    expect(await deleteWorkRecord(1)).toBe(true)
    const items = await listWorks()
    expect(items.map((w) => w.id)).toEqual([2])
  })

  it('删除不存在的 id 不报错', async () => {
    expect(await deleteWorkRecord(999)).toBe(true)
  })

  it('缺少 id 的记录拒绝保存', async () => {
    const res = await saveWorkRecord({ name: '没有 id' })
    expect(res.ok).toBe(false)
  })

  it('putMany 批量写入', async () => {
    expect(await putMany([work(1), work(2), work(3)])).toBe(true)
    expect(await listWorks()).toHaveLength(3)
  })

  it('putMany 过滤掉没有 id 的条目', async () => {
    await putMany([work(1), { name: '坏数据' }, work(2)])
    expect(await listWorks()).toHaveLength(2)
  })

  it('clearWorks 清空全部', async () => {
    await saveWorkRecord(work(1))
    await saveWorkRecord(work(2))
    expect(await clearWorks()).toBe(true)
    expect(await listWorks()).toEqual([])
  })
})

describe('worksStore · localStorage 兼容与迁移', () => {
  it('localStorage 有数据时一次性搬进 IndexedDB,并清掉原键', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([work(1), work(2)]))

    const migrated = await migrateLegacyWorks()
    expect(migrated).toBe(2)

    expect(await listWorks()).toHaveLength(2)
    // 原键清空,备份保留原始 JSON 供回溯
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    expect(JSON.parse(localStorage.getItem('saved-works-migrated'))).toHaveLength(2)
  })

  it('没有 localStorage 数据时迁移是空操作', async () => {
    expect(await migrateLegacyWorks()).toBe(0)
    expect(await listWorks()).toEqual([])
  })

  it('损坏的 localStorage 被备份后清空,不抛错', async () => {
    localStorage.setItem(LEGACY_KEY, '{not json')
    expect(await migrateLegacyWorks()).toBe(0)
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    expect(localStorage.getItem('saved-works-corrupt')).toBe('{not json')
  })

  it('迁移不删除没有 id 的条目所在的原键(避免静默丢数据)', async () => {
    // 全部条目都无 id → 没有可迁移内容,原键保持不动
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ name: '无 id' }]))
    expect(await migrateLegacyWorks()).toBe(0)
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull()
  })

  it('写入失败时保留 localStorage 原数据(迁移失败不能丢作品)', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([work(1), work(2)]))

    // 让 IndexedDB 事务在写入时失败:open 正常返回,但 transaction 抛错
    const fakeDb = {
      transaction() { throw new Error('tx failed') },
    }
    globalThis.indexedDB = {
      open() {
        const req = {}
        setTimeout(() => {
          req.result = fakeDb
          req.onsuccess && req.onsuccess()
        }, 0)
        return req
      },
    }
    __resetForTests()

    const migrated = await migrateLegacyWorks()
    expect(migrated).toBe(0)
    // 关键:原数据必须还在,用户不会因为迁移失败而丢作品
    const raw = localStorage.getItem(LEGACY_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw)).toHaveLength(2)
  })

  it('IndexedDB 不可用时 listWorks 回退读 localStorage', async () => {
    globalThis.indexedDB = undefined
    __resetForTests()
    localStorage.setItem(LEGACY_KEY, JSON.stringify([work(1)]))

    expect(isIdbAvailable()).toBe(false)
    const items = await listWorks()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(1)
  })

  it('IndexedDB 不可用时保存与删除仍走 localStorage', async () => {
    globalThis.indexedDB = undefined
    __resetForTests()

    expect((await saveWorkRecord(work(1))).ok).toBe(true)
    expect(JSON.parse(localStorage.getItem(LEGACY_KEY))).toHaveLength(1)

    expect(await deleteWorkRecord(1)).toBe(true)
    expect(JSON.parse(localStorage.getItem(LEGACY_KEY))).toHaveLength(0)
  })
})

describe('worksStore · 占用估算', () => {
  it('按 JSON 长度累加', () => {
    const works = [work(1), work(2)]
    const bytes = estimateBytes(works)
    const expected = works.reduce((n, w) => n + JSON.stringify(w).length, 0)
    expect(bytes).toBe(expected)
  })

  it('空数组与非法输入返回 0', () => {
    expect(estimateBytes([])).toBe(0)
    expect(estimateBytes(null)).toBe(0)
    expect(estimateBytes(undefined)).toBe(0)
  })
})
