/**
 * worksStore — 本地作品仓储(IndexedDB 主存 + localStorage 兼容层)
 *
 * 为什么从 localStorage 迁到 IndexedDB:
 *   `saved-works` 把所有作品塞进一个 JSON 数组。localStorage 只有 ~5MB,
 *   200×200 的图纸单件就接近 1MB,存几件就顶到配额。届时只能靠
 *   「接近上限」的 confirm 提示让用户自己删 —— 规格 03 §6 要求为大量私人
 *   图纸评估 IndexedDB,避免继续无限追加。
 *
 * 为什么保留 localStorage 兼容:
 *   - 老用户的 `saved-works` 必须无损迁过来,不能要求他们重新保存;
 *   - IndexedDB 在隐私模式 / 被策略禁用时不可用,这时必须还能存 ——
 *     localStorage 是兜底路径,不是遗留包袱。
 *
 * 迁移策略(只在 IndexedDB 可用时发生):
 *   1. 读 `saved-works`;空则什么都不做。
 *   2. 逐条 upsert 进 IndexedDB(以 id 为键,幂等)。
 *   3. **全部成功后**才删除 `saved-works`,失败则保留本地数组不动。
 *   4. 迁移前把原始 JSON 备份到 `saved-works-migrated`,便于用户回溯。
 *
 * 仓储 API 统一为 list/get/save/delete/clear,调用方不关心底层是哪个存储。
 */

const DB_NAME = 'pindou-works'
// v2 增加草稿槽(drafts),v3 增加历史版本仓(versions)。
// 升级处理器对新旧库都只补缺失的 store,因此从任意旧版本升级和全新安装走同一条路径。
const DB_VERSION = 3
const STORE = 'works'
const DRAFT_STORE = 'drafts'
const VERSION_STORE = 'versions'
const LEGACY_KEY = 'saved-works'
const LEGACY_BACKUP_KEY = 'saved-works-migrated'
const LEGACY_CORRUPT_KEY = 'saved-works-corrupt'

/** 作品排序:新的在前。savedAt 是 ISO 字符串,可直接字典序比较 */
function bySavedAtDesc(a, b) {
  return String(b?.savedAt || '').localeCompare(String(a?.savedAt || ''))
}

function hasIndexedDB() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

let dbPromise = null

function openDb() {
  if (!hasIndexedDB()) return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    let req
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('savedAt', 'savedAt')
      }
      // 草稿槽:keyPath 固定为 'slot',全库只有一条「当前草稿」。
      // 不做多草稿 —— 自动保存的语义是「保住正在做的这一张」,不是版本库(C2 才做时间线)。
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: 'slot' })
      }
      // 历史版本仓:按 workId 建索引,主键自增(同一件作品可以有很多版本)。
      // 存的是**快照**而非 diff —— 版本要能独立还原,而拼豆图纸的 diff
      // 本身并不比快照小多少(改一格就要记一次),快照的还原路径最不容易出错。
      if (!db.objectStoreNames.contains(VERSION_STORE)) {
        const versions = db.createObjectStore(VERSION_STORE, { keyPath: 'versionId', autoIncrement: true })
        versions.createIndex('workId', 'workId')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

/** 在 store 上执行一个操作并等待事务结束;任何失败都解析为 null,不 reject */
function run(db, mode, op, storeName = STORE) {
  return new Promise((resolve) => {
    let transaction
    try {
      transaction = db.transaction(storeName, mode)
    } catch {
      resolve(null)
      return
    }
    let request
    try {
      request = op(transaction.objectStore(storeName))
    } catch {
      resolve(null)
      return
    }
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    transaction.oncomplete = () => finish(request ? request.result : undefined)
    transaction.onerror = () => finish(null)
    transaction.onabort = () => finish(null)
  })
}

/* ── localStorage 兼容层 ───────────────────────────────── */

function readLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLegacy(works) {
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(works))
    return true
  } catch {
    return false
  }
}

/** 备份损坏的本地数据后再清空,避免多标签页并发写的截断被当成永久丢失 */
function backupCorrupt() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (raw) localStorage.setItem(LEGACY_CORRUPT_KEY, raw)
    localStorage.removeItem(LEGACY_KEY)
  } catch { /* 备份失败不阻塞 */ }
}

/* ── 仓储 API ─────────────────────────────────────────── */

/**
 * 列出全部作品(按 savedAt 倒序)。
 * IndexedDB 可用时读库;否则读 localStorage。
 *
 * @returns {Promise<Array>}
 */
export async function listWorks() {
  const db = await openDb()
  if (!db) return readLegacy()
  const items = await run(db, 'readonly', (store) => store.getAll())
  if (!Array.isArray(items)) return readLegacy()
  return items.slice().sort(bySavedAtDesc)
}

/**
 * 保存一件作品(以 id 覆盖同 id 的旧记录)。
 *
 * @param {Object} work
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 *   reason: 'quota' 配额不足 / 'unavailable' 存储不可用
 */
export async function saveWorkRecord(work) {
  if (!work || work.id == null) return { ok: false, reason: 'unavailable' }
  const db = await openDb()
  if (!db) {
    // 兜底:localStorage 追加(与迁移前行为一致)
    const next = [...readLegacy(), work]
    return writeLegacy(next) ? { ok: true } : { ok: false, reason: 'quota' }
  }
  const result = await run(db, 'readwrite', (store) => store.put(work))
  return result === null ? { ok: false, reason: 'quota' } : { ok: true }
}

/**
 * 批量写入(登录迁移 / 一次性搬运用)。
 * @param {Array<Object>} works
 * @returns {Promise<boolean>}
 */
export async function putMany(works) {
  const list = Array.isArray(works) ? works.filter((w) => w && w.id != null) : []
  if (list.length === 0) return true
  const db = await openDb()
  if (!db) return false
  return new Promise((resolve) => {
    let transaction
    try {
      transaction = db.transaction(STORE, 'readwrite')
    } catch {
      resolve(false)
      return
    }
    const store = transaction.objectStore(STORE)
    for (const work of list) {
      try {
        store.put(work)
      } catch {
        resolve(false)
        return
      }
    }
    transaction.oncomplete = () => resolve(true)
    transaction.onerror = () => resolve(false)
    transaction.onabort = () => resolve(false)
  })
}

/**
 * 删除一件作品。
 * @param {number|string} id
 * @returns {Promise<boolean>}
 */
export async function deleteWorkRecord(id) {
  if (id == null) return false
  const db = await openDb()
  if (!db) {
    return writeLegacy(readLegacy().filter((w) => w.id !== id))
  }
  const result = await run(db, 'readwrite', (store) => store.delete(id))
  return result !== null
}

/**
 * 把 localStorage 里的旧作品一次性搬进 IndexedDB。
 *
 * **全部成功后才清空 `saved-works`** —— 任何一条写失败都保留原数据,
 * 用户不会因为迁移失败而丢作品。原始 JSON 另存一份到
 * `saved-works-migrated`,给用户留回溯余地。
 *
 * @returns {Promise<number>} 迁移条数(0 表示没有可迁移数据或不可用)
 */
export async function migrateLegacyWorks() {
  const db = await openDb()
  if (!db) return 0

  let parsed
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return 0
    parsed = JSON.parse(raw)
  } catch {
    // 本地数据本身已损坏:备份后清空,不让它继续拖累每次读取
    backupCorrupt()
    return 0
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return 0

  const valid = parsed.filter((w) => w && w.id != null)
  if (valid.length === 0) return 0

  const ok = await putMany(valid)
  if (!ok) return 0

  // 成功:先备份原始 JSON,再清空主键
  try {
    localStorage.setItem(LEGACY_BACKUP_KEY, JSON.stringify(parsed))
    localStorage.removeItem(LEGACY_KEY)
  } catch { /* 备份失败不影响迁移结果 */ }
  return valid.length
}

/**
 * 清空全部本地作品。
 *
 * 用于「登录后本地作品已全部迁到云端」这一场景:必须同时清掉 IndexedDB
 * 与 localStorage 残留,否则登出后旧作品会重新冒出来。
 *
 * **不动草稿槽** —— 草稿不是作品,登录迁移清的是作品;把草稿一并清掉会让
 * 正在编辑、还没保存的内容凭空消失。
 *
 * @returns {Promise<boolean>}
 */
export async function clearWorks() {
  const db = await openDb()
  let idbCleared = true
  if (db) {
    const result = await run(db, 'readwrite', (store) => store.clear())
    idbCleared = result !== null
  }
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch { /* 清不掉不影响主流程 */ }
  return idbCleared
}

/**
 * 估算本地作品占用字节数。
 * IndexedDB 不提供单库大小,按记录的 JSON 长度估算 —— 用于配额提示,
 * 不需要精确。localStorage 模式下返回真实字符串长度。
 *
 * @param {Array} works
 * @returns {number}
 */
export function estimateBytes(works) {
  if (!Array.isArray(works)) return 0
  let total = 0
  for (const work of works) {
    try {
      total += JSON.stringify(work).length
    } catch {
      // 循环引用等异常值直接跳过,不因为估算失败打断保存
    }
  }
  return total
}

/** IndexedDB 是否可用(供 UI 决定是否提示「仅本机」) */
export function isIdbAvailable() {
  return hasIndexedDB()
}

/* ── 自动保存草稿(规格 03 §7)───────────────────────────── */

/** 草稿槽主键:全库唯一一条,自动保存只覆盖它 */
export const DRAFT_SLOT = 'current'

/**
 * 写入自动保存草稿。
 *
 * 草稿**只进 IndexedDB,不进 localStorage,也绝不进 `works` 表**:
 *   - 它是半成品,写进作品库会让「我的作品」混入大量自动生成的条目;
 *   - 它是本地恢复用的,同步到云端等于把未完成内容外传(规格 03 §7 明确要求
 *     「未经用户同意不把私有内容上传」)。
 *
 * IndexedDB 不可用(隐私模式/被策略禁用)时返回 `{ ok: false, reason: 'unavailable' }`,
 * 由调用方决定是否提示 —— 自动保存失败不该打断创作,所以这里不 toast、不抛异常。
 *
 * @param {Object} draft - 至少含 canvasData;其余字段由调用方决定
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function saveDraft(draft) {
  if (!draft || !Array.isArray(draft.canvasData)) return { ok: false, reason: 'invalid' }
  const db = await openDb()
  if (!db) return { ok: false, reason: 'unavailable' }
  const record = { ...draft, slot: DRAFT_SLOT, savedAt: draft.savedAt || new Date().toISOString() }
  const result = await run(db, 'readwrite', (store) => store.put(record), DRAFT_STORE)
  return result === null ? { ok: false, reason: 'quota' } : { ok: true }
}

/**
 * 读取自动保存草稿;没有草稿时返回 null。
 * @returns {Promise<Object|null>}
 */
export async function loadDraft() {
  const db = await openDb()
  if (!db) return null
  const record = await run(db, 'readonly', (store) => store.get(DRAFT_SLOT), DRAFT_STORE)
  if (!record || !Array.isArray(record.canvasData)) return null
  return record
}

/**
 * 丢弃草稿(显式保存成功后、或用户选择「不恢复」时)。
 * @returns {Promise<boolean>}
 */
export async function clearDraft() {
  const db = await openDb()
  if (!db) return false
  const result = await run(db, 'readwrite', (store) => store.delete(DRAFT_SLOT), DRAFT_STORE)
  return result !== null
}

/** 仅供测试:重置连接缓存 */
export function __resetForTests() {
  dbPromise = null
}

/* ── 作品历史版本(C2 版本时间线)────────────────────────── */

/**
 * 列出一件作品的版本(新的在前)。
 *
 * IndexedDB 不可用时返回空数组而不是抛错:版本时间线是增强功能,
 * 存储不可用时应静默降级为「没有历史」,不能让作品本身打不开。
 *
 * @param {number|string} workId
 * @param {{ limit?: number }} [options]
 * @returns {Promise<Array>}
 */
export async function listVersions(workId, { limit = 0 } = {}) {
  if (workId == null) return []
  const db = await openDb()
  if (!db) return []
  const items = await run(db, 'readonly', (store) => store.index('workId').getAll(workId), VERSION_STORE)
  if (!Array.isArray(items)) return []
  // savedAt 是 ISO 字符串,字典序即时间序;versionId 自增作为同毫秒的次序兜底
  const sorted = items.slice().sort((a, b) => {
    const t = String(b.savedAt || '').localeCompare(String(a.savedAt || ''))
    return t !== 0 ? t : (b.versionId || 0) - (a.versionId || 0)
  })
  return limit > 0 ? sorted.slice(0, limit) : sorted
}

/**
 * 追加一个版本,并按上限淘汰最旧的。
 *
 * @param {Object} version - 至少含 workId 与 canvasData
 * @param {{ keep?: number }} [options]
 * @returns {Promise<{ ok: boolean, versionId?: number }>}
 */
export async function appendVersion(version, { keep = 20 } = {}) {
  if (!version || version.workId == null || !Array.isArray(version.canvasData)) {
    return { ok: false }
  }
  const db = await openDb()
  if (!db) return { ok: false }

  const record = {
    ...version,
    savedAt: version.savedAt || new Date().toISOString(),
  }
  // 不传 versionId:交给 autoIncrement,同一毫秒的两次保存也不会互相覆盖
  delete record.versionId

  const written = await run(db, 'readwrite', (store) => store.add(record), VERSION_STORE)
  if (written === null || written === undefined) return { ok: false }

  if (keep > 0) await pruneVersions(version.workId, keep)
  return { ok: true, versionId: written }
}

/**
 * 只保留最近 `keep` 个版本,更早的删除。
 * @returns {Promise<number>} 删除条数
 */
export async function pruneVersions(workId, keep) {
  if (workId == null || !(keep > 0)) return 0
  const all = await listVersions(workId)
  if (all.length <= keep) return 0
  const db = await openDb()
  if (!db) return 0
  const stale = all.slice(keep)
  let removed = 0
  for (const item of stale) {
    const res = await run(db, 'readwrite', (store) => store.delete(item.versionId), VERSION_STORE)
    if (res !== null) removed++
  }
  return removed
}

/** 删除某件作品的全部版本(作品本身被删除时调用,避免孤儿版本占空间) */
export async function clearVersions(workId) {
  if (workId == null) return false
  const db = await openDb()
  if (!db) return false
  const all = await listVersions(workId)
  if (all.length === 0) return true
  for (const item of all) {
    const res = await run(db, 'readwrite', (store) => store.delete(item.versionId), VERSION_STORE)
    if (res === null) return false
  }
  return true
}

/** 统计全部版本的占用字节数(配额提示用) */
export function estimateVersionBytes(versions) {
  if (!Array.isArray(versions)) return 0
  let total = 0
  for (const v of versions) {
    try {
      total += JSON.stringify(v).length
    } catch {
      // 循环引用等异常值跳过,估算失败不该打断版本列表渲染
    }
  }
  return total
}
