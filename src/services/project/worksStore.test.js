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
  saveDraft,
  loadDraft,
  clearDraft,
  DRAFT_SLOT,
  listVersions,
  appendVersion,
  pruneVersions,
  clearVersions,
  estimateVersionBytes,
  __resetForTests,
} from './worksStore'

const LEGACY_KEY = 'saved-works'
const R = '#E53935'
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
          req.onsuccess?.()
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

/**
 * 自动保存草稿槽(规格 03 §7)。
 *
 * 草稿与作品是两条独立的链路:草稿只进 IndexedDB,不写 localStorage、
 * 不进作品列表 —— 半成品混进「我的作品」比丢草稿更糟。
 */
describe('worksStore · 自动保存草稿', () => {
  const draft = (extra = {}) => ({
    canvasData: [[null, R]],
    gridSize: 2,
    paletteId: 'perler',
    ...extra,
  })

  it('没有草稿时返回 null', async () => {
    expect(await loadDraft()).toBeNull()
  })

  it('保存后能读回,且带 slot 与 savedAt', async () => {
    const res = await saveDraft(draft({ savedAt: '2026-10-23T00:00:00.000Z' }))
    expect(res.ok).toBe(true)

    const loaded = await loadDraft()
    expect(loaded.slot).toBe(DRAFT_SLOT)
    expect(loaded.savedAt).toBe('2026-10-23T00:00:00.000Z')
    expect(loaded.canvasData).toEqual([[null, R]])
  })

  it('再次保存覆盖同一条草稿,不会堆积', async () => {
    await saveDraft(draft({ gridSize: 2 }))
    await saveDraft(draft({ gridSize: 5 }))

    const loaded = await loadDraft()
    expect(loaded.gridSize).toBe(5)
  })

  it('草稿不写 localStorage(不落进旧的作品键)', async () => {
    await saveDraft(draft())
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('草稿不出现在作品列表里', async () => {
    await saveDraft(draft())
    expect(await listWorks()).toEqual([])
  })

  it('清空作品不会清掉草稿', async () => {
    await saveWorkRecord(work(1))
    await saveDraft(draft())
    await clearWorks()

    expect(await listWorks()).toEqual([])
    expect(await loadDraft()).not.toBeNull()
  })

  it('clearDraft 后读不到', async () => {
    await saveDraft(draft())
    expect(await clearDraft()).toBe(true)
    expect(await loadDraft()).toBeNull()
  })

  it('非法草稿(没有 canvasData)被拒绝,不写库', async () => {
    expect((await saveDraft({ gridSize: 2 })).ok).toBe(false)
    expect(await loadDraft()).toBeNull()
  })

  it('IndexedDB 不可用时保存草稿返回 unavailable,不抛异常', async () => {
    globalThis.indexedDB = undefined
    __resetForTests()

    const res = await saveDraft(draft())
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('unavailable')
    expect(await loadDraft()).toBeNull()
  })
})

describe('worksStore · 历史版本(C2)', () => {
  const version = (workId, extra = {}) => ({
    workId,
    canvasData: [[R]],
    savedAt: `2026-10-19T00:00:00.000Z`,
    ...extra,
  })

  it('追加后能按时间倒序列出', async () => {
    await appendVersion(version(1, { canvasData: [[R]], savedAt: '2026-10-19T00:00:01.000Z' }))
    await appendVersion(version(1, { canvasData: [[R, R]], savedAt: '2026-10-19T00:00:02.000Z' }))

    const list = await listVersions(1)
    expect(list).toHaveLength(2)
    expect(list[0].savedAt).toBe('2026-10-19T00:00:02.000Z')
    expect(list[1].savedAt).toBe('2026-10-19T00:00:01.000Z')
  })

  it('同一毫秒的两次保存不会互相覆盖(自增主键,不是时间戳)', async () => {
    const stamp = '2026-10-19T00:00:00.000Z'
    await appendVersion(version(1, { canvasData: [[R]], savedAt: stamp }))
    await appendVersion(version(1, { canvasData: [[R, R]], savedAt: stamp }))

    const list = await listVersions(1)
    expect(list).toHaveLength(2)
    // 同毫秒时按自增 id 倒序:后写入的在前
    expect(list[0].versionId).toBeGreaterThan(list[1].versionId)
  })

  it('不同作品的版本互不干扰', async () => {
    await appendVersion(version(1))
    await appendVersion(version(2))
    await appendVersion(version(2))

    expect(await listVersions(1)).toHaveLength(1)
    expect(await listVersions(2)).toHaveLength(2)
    expect(await listVersions(3)).toHaveLength(0)
  })

  it('超过保留上限时淘汰最旧的', async () => {
    for (let i = 0; i < 5; i++) {
      await appendVersion(
        version(1, { canvasData: [[R]], savedAt: `2026-10-19T00:00:0${i}.000Z` }),
        { keep: 3 }
      )
    }
    const list = await listVersions(1)
    expect(list).toHaveLength(3)
    // 留下的是最新的三条
    expect(list.map((v) => v.savedAt)).toEqual([
      '2026-10-19T00:00:04.000Z',
      '2026-10-19T00:00:03.000Z',
      '2026-10-19T00:00:02.000Z',
    ])
  })

  it('pruneVersions 在未超限时什么都不删', async () => {
    await appendVersion(version(1))
    expect(await pruneVersions(1, 5)).toBe(0)
    expect(await listVersions(1)).toHaveLength(1)
  })

  it('删除作品时清掉它的全部版本', async () => {
    await appendVersion(version(1))
    await appendVersion(version(1))
    await appendVersion(version(2))

    expect(await clearVersions(1)).toBe(true)
    expect(await listVersions(1)).toHaveLength(0)
    expect(await listVersions(2)).toHaveLength(1) // 其他作品不受影响
  })

  it('非法版本(缺 workId 或 canvasData)被拒绝,不写库', async () => {
    expect((await appendVersion({ canvasData: [[R]] })).ok).toBe(false)
    expect((await appendVersion({ workId: 1 })).ok).toBe(false)
    expect((await appendVersion(null)).ok).toBe(false)
    expect(await listVersions(1)).toHaveLength(0)
  })

  it('IndexedDB 不可用时静默降级为空历史,不抛异常', async () => {
    globalThis.indexedDB = undefined
    __resetForTests()

    expect((await appendVersion(version(1))).ok).toBe(false)
    expect(await listVersions(1)).toEqual([])
    expect(await clearVersions(1)).toBe(false)
  })

  it('estimateVersionBytes 按 JSON 长度累加', async () => {
    const list = [
      { workId: 1, canvasData: [[R]] },
      { workId: 1, canvasData: [[R, R]] },
    ]
    const expected = list.reduce((n, v) => n + JSON.stringify(v).length, 0)
    expect(estimateVersionBytes(list)).toBe(expected)
    expect(estimateVersionBytes(null)).toBe(0)
  })
})
