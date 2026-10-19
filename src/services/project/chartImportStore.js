/**
 * chartImportStore — 图纸识别的「原图 + 人工修正」本地仓储
 *
 * 为什么需要它:
 *   ChartImportWizard 的人工修正是组件内 state,关掉页面就丢。用户对一张
 *   29×29 图纸手工改十几格后若误关页面,只能从头再来。规格 03 §8 要求
 *   「识别结果可人工修正并保存;重新打开后修改结果不丢失」。
 *
 * 为什么用 IndexedDB 而不是 localStorage:
 *   原图是二进制(几百 KB 到几 MB),localStorage 只有 ~5MB 且必须存成
 *   base64(体积再涨 33%),放几张就把作品数据挤爆。IndexedDB 直接存 Blob,
 *   与规格 03 §6「不把原始图片 data URL/base64 塞进 localStorage」一致。
 *
 * 会话以**图片指纹**为键:用户重新选中同一张图,就能拿回当时的参数与逐格修正。
 * 不依赖作品 id —— 本地作品的 id 是时间戳、云端是 uuid,保存后会变,
 * 拿它当键会在第一次重新保存后失联。
 *
 * 隐私:原图**只存本机**,不上传云端,不进 `works` 表。
 *
 * 失败可降级:浏览器禁用 IndexedDB / 隐私模式 / 配额不足时,所有 API 返回
 * 失败或空值,调用方按「无历史修正」继续工作,绝不因此阻断导入主流程。
 */

const DB_NAME = 'pindou-chart-import'
const DB_VERSION = 1
const STORE = 'sessions'

/** 单张原图字节上限:超过则不入库(识别本身仍可进行,只是不能恢复) */
export const MAX_STORED_IMAGE_BYTES = 8 * 1024 * 1024

/** 会话最长保留时间:超过后由 pruneOld 清理 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

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
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    // 打开失败(隐私模式/配额)不抛错:调用方按「无历史」处理
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

/**
 * 在给定 store 上执行一个操作并等待事务结束。
 * op(store) 返回一个 IDBRequest;其 result 作为 Promise 的解析值。
 * 任何失败(打不开库、事务异常、op 抛错)都解析为 null,不 reject。
 */
function run(db, mode, op) {
  return new Promise((resolve) => {
    let transaction
    try {
      transaction = db.transaction(STORE, mode)
    } catch {
      resolve(null)
      return
    }
    let request
    try {
      request = op(transaction.objectStore(STORE))
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

/**
 * 计算原图指纹:用于判断「重新导入的图」是不是同一张。
 * 取字节长度 + 头 4KB 的 FNV-1a 哈希 —— 同一文件重选必然一致,
 * 不同图片碰撞概率极低,且不需要读完整文件。
 *
 * @param {File|Blob} file
 * @returns {Promise<string>} 形如 `img-<size>-<hash>`
 */
export async function fingerprintImage(file) {
  const size = typeof file?.size === 'number' ? file.size : 0
  let hash = 0x811c9dc5
  try {
    const head = await file.slice(0, 4096).arrayBuffer()
    const bytes = new Uint8Array(head)
    for (let i = 0; i < bytes.length; i++) {
      hash ^= bytes[i]
      // FNV-1a 32 位,用 Math.imul 避免溢出成浮点
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
  } catch {
    // 读不出字节头时只用长度做弱指纹
    return `img-${size}-0`
  }
  return `img-${size}-${hash.toString(36)}`
}

/**
 * 保存(或覆盖)一个识别会话。
 *
 * @param {Object} session
 * @param {string} session.id - 会话 id(图片指纹)
 * @param {Blob} session.imageBlob - 原图
 * @param {Object} session.state - { cols, rows, paletteId, removeBackground, bounds, overrides }
 * @param {string} [session.name] - 作品名,便于识别会话归属
 * @returns {Promise<boolean>} 是否写入成功(失败不抛错)
 */
export async function saveSession({ id, imageBlob, state, name = '' }) {
  if (!id || !imageBlob) return false
  if (typeof imageBlob.size === 'number' && imageBlob.size > MAX_STORED_IMAGE_BYTES) return false
  const db = await openDb()
  if (!db) return false

  // 先读旧记录保留 createdAt;读失败按新会话处理
  const prev = await run(db, 'readonly', (store) => store.get(id))
  const now = new Date().toISOString()
  const record = {
    id,
    name: typeof name === 'string' ? name.slice(0, 120) : '',
    imageBlob,
    state: {
      cols: state?.cols ?? null,
      rows: state?.rows ?? null,
      paletteId: state?.paletteId ?? null,
      removeBackground: state?.removeBackground ?? true,
      bounds: state?.bounds ?? null,
      overrides: state?.overrides ?? {},
    },
    createdAt: prev?.createdAt || now,
    updatedAt: now,
  }
  const result = await run(db, 'readwrite', (store) => store.put(record))
  return result !== null
}

/**
 * 读取一个识别会话。
 * @param {string} id
 * @returns {Promise<Object|null>} 不存在/不可用 → null
 */
export async function loadSession(id) {
  if (!id) return null
  const db = await openDb()
  if (!db) return null
  const record = await run(db, 'readonly', (store) => store.get(id))
  return record || null
}

/**
 * 删除一个识别会话。
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteSession(id) {
  if (!id) return false
  const db = await openDb()
  if (!db) return false
  const result = await run(db, 'readwrite', (store) => store.delete(id))
  return result !== null
}

/**
 * 清理过期会话(超过 SESSION_TTL_MS)。在导入页挂载时调用一次即可。
 * @returns {Promise<number>} 清理条数
 */
export async function pruneOld(now = Date.now()) {
  const db = await openDb()
  if (!db) return 0
  const items = await run(db, 'readonly', (store) => store.getAll())
  if (!Array.isArray(items)) return 0
  const cutoff = now - SESSION_TTL_MS
  let removed = 0
  for (const item of items) {
    const t = Date.parse(item?.updatedAt || '')
    if (Number.isFinite(t) && t < cutoff) {
      if (await deleteSession(item.id)) removed++
    }
  }
  return removed
}

/** 仅供测试:重置连接缓存 */
export function __resetForTests() {
  dbPromise = null
}
