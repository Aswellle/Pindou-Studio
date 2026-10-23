/**
 * profileSummary — 个人中心的资产聚合(纯函数)。
 *
 * 输入是 App 已持有的两份 hook 状态(useSavedWorks / useUserPalettes),
 * 这里只做计数与筛选,不读 DOM、不碰 localStorage、不请求网络。
 *
 * 口径约束(与实施计划 §4.3 一致):
 *   · 加载中 / 出错时返回 null,UI 显示骨架或错误,**绝不显示 0**;
 *   · inventory.quantity === null 表示「拥有但数量未知」,不是 0;
 *   · quantity === 0 是合法值(确实一颗都没有),要计入已知总量;
 *   · pendingLocal 是「本机待导入」,单独展示,不并入任何云端总数。
 */

/** 有效的已知数量:有限非负数。null / undefined / NaN / 负数一律不算。 */
function isKnownQuantity(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/**
 * @param {object} input
 * @param {Array} [input.works] - useSavedWorks.works
 * @param {boolean} [input.worksLoading]
 * @param {object|null} [input.worksError] - 云端读取失败信息;存在表示当前显示的是本机降级数据
 * @param {object} [input.beadStore] - useUserPalettes 的返回值
 * @returns {object} 概览指标
 */
export function buildProfileSummary({ works, worksLoading, worksError, beadStore } = {}) {
  const workList = Array.isArray(works) ? works : []
  const palettes = Array.isArray(beadStore?.palettes) ? beadStore.palettes : []
  const colors = Array.isArray(beadStore?.colors) ? beadStore.colors : []
  const inventory = Array.isArray(beadStore?.inventory) ? beadStore.inventory : []

  // 作品:加载未结束或云端失败时,数量不是终值 → null
  const worksReady = !worksLoading && !worksError

  // 拼豆资产:useUserPalettes 自带 loading / error,失败时它已把列表清空,
  // 此时空数组不代表「真的没有」,必须一并归为未知
  const beadsReady = !!beadStore && !beadStore.loading && !beadStore.error

  let knownQuantityTotal = 0
  let unknownQuantityEntriesCount = 0
  for (const item of inventory) {
    if (isKnownQuantity(item?.quantity)) knownQuantityTotal += item.quantity
    else if (item?.quantity === null || item?.quantity === undefined) unknownQuantityEntriesCount += 1
    // 其余(非法数值)既不计入总量,也不计入「未知」—— 属于脏数据,静默跳过
  }

  return {
    worksCount: worksReady ? workList.length : null,
    worksLoading: !!worksLoading,
    // 云端失败但已回退本机:数据是真实的,只是来源降级 —— UI 需要能区分这两种状态
    worksDegraded: !!worksError,
    worksError: worksError || null,

    palettesCount: beadsReady ? palettes.length : null,
    colorsCount: beadsReady ? colors.length : null,
    inventoryEntriesCount: beadsReady ? inventory.length : null,
    knownQuantityTotal: beadsReady ? knownQuantityTotal : null,
    unknownQuantityEntriesCount: beadsReady ? unknownQuantityEntriesCount : null,
    beadsLoading: !!beadStore?.loading,
    beadsError: beadStore?.error || null,

    // 本机待导入:只有云端模式才有意义;非 0 时是独立提示,不进任何总数
    pendingLocalCount: beadStore?.pendingLocal || 0,
    beadMode: beadStore?.mode || 'local',

    recentWorks: worksReady ? pickRecentWorks(workList, 3) : [],
  }
}

/**
 * 最近保存的作品摘要。
 *
 * 只取元数据,不复制 canvasData —— 概览不需要整张图纸。
 * savedAt 是 ISO 字符串,字典序即时间序;缺失的排到最后而不是当成最新。
 */
export function pickRecentWorks(works, limit = 3) {
  if (!Array.isArray(works)) return []
  const sorted = [...works].sort((a, b) => {
    const ta = typeof a?.savedAt === 'string' ? a.savedAt : ''
    const tb = typeof b?.savedAt === 'string' ? b.savedAt : ''
    if (!ta && !tb) return 0
    if (!ta) return 1
    if (!tb) return -1
    return tb.localeCompare(ta)
  })
  return sorted.slice(0, Math.max(0, limit)).map(work => ({
    id: work?.id,
    name: typeof work?.name === 'string' ? work.name : '',
    // 宽高以旧字段为准,与 Gallery 作品卡片一致(gridWidth 缺失时回退 gridSize)
    width: Number(work?.gridWidth) || Number(work?.gridSize) || null,
    height: Number(work?.gridHeight) || Number(work?.gridSize) || null,
    savedAt: typeof work?.savedAt === 'string' ? work.savedAt : null,
  }))
}

/**
 * 库存摘要的一句话描述(纯函数,返回状态码而非文案,便于 i18n)。
 *
 * - 'empty'    —— 没有任何库存记录
 * - 'known'    —— 全部有数量
 * - 'unknown'  —— 全部只有「拥有」标记
 * - 'mixed'    —— 两种都有
 */
export function inventoryQuantityState(summary) {
  if (!summary || summary.inventoryEntriesCount === null) return 'unknown-loading'
  if (summary.inventoryEntriesCount === 0) return 'empty'
  const unknown = summary.unknownQuantityEntriesCount || 0
  if (unknown === 0) return 'known'
  if (unknown === summary.inventoryEntriesCount) return 'unknown'
  return 'mixed'
}
