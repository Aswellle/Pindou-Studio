import { useState, useEffect, useCallback, useRef } from 'react'
import i18n from '../i18n'
import { supabase } from '../services/supabase'
import { useToast } from '../components/Toast'
import { normalizeLegacyWork } from '../services/project/adapters'
import { PROJECT_SCHEMA_VERSION } from '../services/project/projectModel'
import {
  listWorks,
  saveWorkRecord,
  deleteWorkRecord,
  clearWorks,
  migrateLegacyWorks,
  estimateBytes,
  listVersions,
  appendVersion,
  clearVersions,
  estimateVersionBytes,
} from '../services/project/worksStore'
import { MAX_VERSIONS_PER_WORK, shouldRecordVersion } from '../services/project/workVersions'

/**
 * 保存状态机(规格 03 §7)。
 *
 *   idle    — 没有待保存的改动
 *   dirty   — 画布改过了,还没保存
 *   saving  — 保存请求进行中
 *   saved   — 最近一次保存成功
 *   failed  — 最近一次保存失败(必须让用户看见,不能静默吞掉)
 *
 * 只描述「本地作品」这一条链路;云端/本地两种存储共用同一套状态。
 */
export const SAVE_STATES = Object.freeze({
  IDLE: 'idle',
  DIRTY: 'dirty',
  SAVING: 'saving',
  SAVED: 'saved',
  FAILED: 'failed',
})

// 云端作品计数镜像:登录时更新,登出后「我的作品」空态可提示"作品在云端,登录查看"
const MIRROR_KEY = 'cloud-works-mirror'
/** 本地作品接近配额时的提示阈值(4MB) */
const WARN_BYTES = 4 * 1024 * 1024

function readMirror() {
  try {
    const m = JSON.parse(localStorage.getItem(MIRROR_KEY) || 'null')
    return m && typeof m.count === 'number' ? m : { count: 0 }
  } catch { return { count: 0 } }
}

// 云端行 <-> UI work 字段映射(snake_case <-> camelCase)。
// 读入走 normalizeLegacyWork:旧行可能 grid_size 与 canvas_data 形状不一致,
// 以数据实际形状为准,避免载入后错位/裁切。
const rowToWork = (row) => normalizeLegacyWork({
  id: row.id,
  name: row.name,
  canvasData: row.canvas_data,
  gridSize: row.grid_size,
  gridWidth: row.grid_width,
  gridHeight: row.grid_height,
  paletteId: row.palette_id,
  savedAt: row.saved_at,
  sourceTemplateId: row.source_template_id ?? null,
  // 来源类别(迁移 0024):旧行没有该列 → null,由适配层按 legacy-work 处理
  sourceKind: row.source_kind ?? null,
})
const workToRow = (w, { includeMetadata = true } = {}) => {
  const row = {
    name: w.name,
    canvas_data: w.canvasData,
    grid_size: w.gridSize,
    grid_width: w.gridWidth ?? null,
    grid_height: w.gridHeight ?? null,
    palette_id: w.paletteId || 'perler',
    saved_at: w.savedAt,
  }
  // 图库复制溯源(migration 0023):内置模板 id 是数字、云端是 uuid,统一存文本。
  // 不设外键 —— 源模板删除后个人副本必须继续存在。
  // 仅在存在来源时发送该列:普通保存不依赖 0023 是否已执行。
  if (w.sourceTemplateId !== null && w.sourceTemplateId !== undefined) {
    row.source_template_id = String(w.sourceTemplateId)
  }
  if (!includeMetadata) return row
  // 来源类别(migration 0024):同样只在有值时发送。
  // 值已由适配层过滤为白名单,这里不再重复校验。
  if (w.sourceKind) {
    row.source_kind = w.sourceKind
  }
  // 项目模型版本:每行都写,用于将来判断某行是哪个版本写出来的(升级/迁移依据)。
  row.schema_version = PROJECT_SCHEMA_VERSION
  return row
}

/**
 * 判断错误是否「目标列不存在」(迁移 0024 尚未执行)。
 *
 * 0024 只是元数据列,缺列不应让用户连作品都保存不了 —— 这种情况下退化为
 * 不写元数据再试一次,数据本体(canvas_data/尺寸/色卡)照常落库。
 * PostgREST 报 PGRST204(列不存在)/ 42703(undefined_column),文本里带列名。
 */
const isMissingMetadataColumn = (error) => {
  if (!error) return false
  const code = String(error.code || '')
  const text = `${error.message || ''} ${error.details || ''}`
  if (code !== 'PGRST204' && code !== '42703') return false
  return /source_kind|schema_version|visibility/.test(text)
}
// 登录迁移去重键:与 0017_works.sql 的唯一索引 (user_id, saved_at, name) 对应
const dedupKey = (w) => `${w.savedAt}|${w.name}`

/**
 * 作品持久化:本地(localStorage)与云端(Supabase works 表)双模式。
 * - 登录(云端已配置)时:云端为唯一数据源;登录瞬间把本机作品一次性
 *   upsert 进云端(幂等去重),成功后清空本机,并返回迁移数量 syncCount。
 * - 登出 / 未登录 / 云端未配置时:回到本机模式(原有行为)。
 * - cloudMirrorCount:最近一次登录态下的云端作品数(登出后空态提示用)。
 */
export function useSavedWorks(user) {
  const toast = useToast()
  const [works, setWorks] = useState([])
  const [worksLoading, setWorksLoading] = useState(true)
  // 云端读取失败:保留既有「回退本机作品」行为,同时把这个事实暴露给 UI。
  // 个人中心需要区分「云端失败、当前显示本机」与「确实一件作品都没有」——
  // 没有这个状态,两种情形在页面上长得一模一样。
  const [worksError, setWorksError] = useState(null)
  // 手动重试信号:云端读取失败后,个人中心提供「重试」。
  // 递增它即可让下面的登录态 effect 重跑,不必把加载逻辑抽成独立函数
  // (抽出去会与首屏本地加载的时序纠缠)。
  const [reloadToken, setReloadToken] = useState(0)
  const [syncCount, setSyncCount] = useState(null)
  const [cloudMirrorCount, setCloudMirrorCount] = useState(() => readMirror().count)
  const [saveState, setSaveState] = useState(SAVE_STATES.IDLE)
  const worksRef = useRef(works)
  useEffect(() => { worksRef.current = works }, [works])

  const isCloud = useCallback(() => !!user && !!supabase, [user])

  // 本地作品首次加载(IndexedDB 主存;首次运行把 localStorage 旧数据搬过来)。
  // 这是**唯一**的本地加载入口 —— 登录态 effect 的 else 分支不再重复读,
  // 否则两个 effect 并发时,先跑完的那个会用空列表覆盖另一个的结果。
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await migrateLegacyWorks()
        const items = await listWorks()
        if (!cancelled) setWorks(items.map(normalizeLegacyWork))
      } catch {
        // 仓储层自身已做降级,走到这里说明是意料之外的异常:
        // 保持空列表而不是让整个页面崩掉
        if (!cancelled) setWorks([])
      } finally {
        if (!cancelled) setWorksLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // 云端模式下作品变化时同步镜像计数(登出后「我的作品」空态提示依赖它)
  useEffect(() => {
    if (isCloud()) {
      localStorage.setItem(MIRROR_KEY, JSON.stringify({ count: works.length }))
      setCloudMirrorCount(works.length)
    }
  }, [works, isCloud])

  // 登录态切换:cloud <-> local。登录时加载云端作品 + 一次性迁移本机作品。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 登录态切换只按 user?.id 触发,避免 profile 更新导致重复拉取
  useEffect(() => {
    let cancelled = false
    const cloud = !!user && !!supabase
    if (cloud) {
      setWorksLoading(true)
      setWorksError(null)
      ;(async () => {
        try {
          const { data, error } = await supabase
            .from('works')
            .select('*')
            .eq('user_id', user.id)
            .order('saved_at', { ascending: false })
          if (error) throw error
          if (cancelled) return
          const cloudWorks = (data || []).map(rowToWork)

          // 本机作品一次性合并进云端:savedAt+name 去重,upsert 幂等
          const local = await listWorks()
          const existing = new Set(cloudWorks.map(dedupKey))
          const seen = new Set()
          const toPush = local.filter((w) => {
            const k = dedupKey(w)
            if (existing.has(k) || seen.has(k)) return false
            seen.add(k)
            return true
          })
          let migrated = 0
          if (toPush.length > 0) {
            const pushRows = (rows) => supabase
              .from('works')
              .upsert(rows.map((w) => ({ ...w, user_id: user.id })), {
                onConflict: 'user_id,saved_at,name',
              })
              .select()
            let { data: pushed, error: insErr } = await pushRows(toPush.map((w) => workToRow(w)))
            // 迁移 0024 未执行:去掉元数据列重试,作品本体照常迁移
            if (insErr && isMissingMetadataColumn(insErr)) {
              ;({ data: pushed, error: insErr } = await pushRows(
                toPush.map((w) => workToRow(w, { includeMetadata: false }))
              ))
            }
            if (insErr) throw insErr
            migrated = (pushed || []).length
            cloudWorks.push(...(pushed || []).map(rowToWork))
            cloudWorks.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
          }
          if (cancelled) return
          // 迁移成功后清空本机(作品已在云端)。
          // 本地作品现在可能在 IndexedDB,统一走仓储层清理,不要只删 localStorage 键。
          await clearWorks()
          setWorks(cloudWorks)
          if (migrated > 0) setSyncCount(migrated)
        } catch (e) {
          // 云端拉取/迁移失败:回退到本机作品,保证「我的作品」不空、不丢数据
          console.error('云端作品加载失败,回退到本机作品:', e)
          if (!cancelled) {
            setWorks((await listWorks()).map(normalizeLegacyWork))
            setWorksError({ code: 'loadFailed', detail: e?.message || String(e) })
          }
        } finally {
          if (!cancelled) setWorksLoading(false)
        }
      })()
    } else {
      // 登出 / 未登录:本机作品已由首次加载 effect 读好。
      // 这里只把 loading 收掉,不再重复读库 —— 重复读会在两个 effect
      // 并发时互相覆盖。
      setWorksLoading(false)
      setWorksError(null)
    }
    return () => { cancelled = true }
    // 依赖 user?.id:昵称/头像等资料刷新(refreshProfile 生成新对象)不触发重拉
    // reloadToken:仅由 reloadWorks() 递增,用于失败后手动重试
  }, [user?.id, reloadToken])

  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  // 保存:云端直接落库;本机写 IndexedDB(不可用时降级 localStorage)。
  // 落库前统一走 normalizeLegacyWork:尺寸以 canvasData 实际形状为准,
  // 不再采信调用方传入的 gridSize/gridWidth/gridHeight(历史上两者会不一致)。
  //
  // 并发保护:保存请求可能重叠(用户连点两次、或自动保存与手动保存撞车)。
  // 用单调递增的请求序号 + 只让最新一次写回 state,避免较早的响应后到
  // 把新列表覆盖成旧列表。落库本身按 id 覆盖,不会产生重复行。
  /**
   * 把一次保存记进版本时间线。
   *
   * 「什么算一个版本」的判定在 workVersions.shouldRecordVersion:内容与上一版
   * 完全一致时不记 —— 连点两次保存不该在时间线里留两条一模一样的条目。
   *
   * 失败一律吞掉:版本是增强功能,不能因为它让保存看起来失败。
   * IndexedDB 不可用时 listVersions/appendVersion 都静默返回空/false。
   */
  const recordVersion = useCallback(async (work) => {
    if (!work || work.id == null) return
    try {
      const existing = await listVersions(work.id, { limit: 1 })
      if (!shouldRecordVersion(existing[0] || null, work)) return
      await appendVersion({
        workId: work.id,
        name: work.name || '',
        canvasData: work.canvasData,
        gridSize: work.gridSize,
        gridWidth: work.gridWidth ?? null,
        gridHeight: work.gridHeight ?? null,
        paletteId: work.paletteId || 'perler',
        savedAt: work.savedAt || new Date().toISOString(),
      }, { keep: MAX_VERSIONS_PER_WORK })
    } catch {
      // 版本记录失败不影响保存结果
    }
  }, [])

  const saveSeqRef = useRef(0)
  const saveWork = useCallback(async (work) => {
    const normalized = normalizeLegacyWork(work)
    const seq = ++saveSeqRef.current
    setSaveState(SAVE_STATES.SAVING)
    if (isCloud()) {
      try {
        const insert = (includeMetadata) => supabase
          .from('works')
          .insert({ ...workToRow(normalized, { includeMetadata }), user_id: user.id })
          .select()
          .single()
        let { data, error } = await insert(true)
        // 迁移 0024 未执行:退化为不写元数据重试,作品本体不能因此存不下来
        if (error && isMissingMetadataColumn(error)) {
          ;({ data, error } = await insert(false))
        }
        if (error) throw error
        if (seq === saveSeqRef.current) {
          setWorks((prev) => [rowToWork(data), ...prev])
          setSaveState(SAVE_STATES.SAVED)
        }
        return true
      } catch (e) {
        console.error('云端保存失败:', e)
        if (seq === saveSeqRef.current) setSaveState(SAVE_STATES.FAILED)
        toast(i18n.t('errors.saveFailed'), 'error')
        return false
      }
    }
    const updated = [...worksRef.current, normalized]
    // 配额提示只在接近上限时出现;IndexedDB 的实际配额远大于此,
    // 但仍按同一阈值提醒,避免用户攒到无法导出时才被发现
    const bytes = estimateBytes(updated)
    if (bytes > WARN_BYTES) {
      const kb = Math.round(bytes / 1024)
      if (!window.confirm(`本地作品已占用约 ${kb}KB，建议先删除部分旧作品。是否继续保存？`)) {
        setSaveState(SAVE_STATES.DIRTY)
        return false
      }
    }

    const result = await saveWorkRecord(normalized)
    if (!result.ok) {
      if (seq === saveSeqRef.current) setSaveState(SAVE_STATES.FAILED)
      toast(i18n.t('errors.storageFull'), 'error')
      return false
    }
    // 版本时间线只在本地模式下记录(云端只留里程碑版本,由后续云端方案处理)。
    // 记录失败不影响保存本身 —— 作品已经安全落库,历史是增强功能,不能反过来
    // 让用户看到「保存失败」。
    await recordVersion(normalized)
    if (seq === saveSeqRef.current) {
      setWorks(updated)
      setSaveState(SAVE_STATES.SAVED)
    }
    return true
  }, [isCloud, user, toast, recordVersion])

  /**
   * 画布发生变化时调用:把状态标记为 dirty。
   * 由 App 在 canvasData 变化后调用 —— 保存状态只有画布层知道,
   * 不该让存储层去猜。
   */
  const markDirty = useCallback(() => {
    setSaveState((prev) => (
      // 保存进行中不改状态:请求还没回来,此时标 dirty 会让「保存中」闪回「未保存」
      prev === SAVE_STATES.SAVING ? prev : SAVE_STATES.DIRTY
    ))
  }, [])

  // 删除:云端删行;本机删仓储记录
  const deleteWork = useCallback(async (work) => {    if (isCloud()) {
      try {
        const { error } = await supabase.from('works').delete().eq('id', work.id)
        if (error) throw error
        setWorks((prev) => prev.filter((w) => w.id !== work.id))
      } catch (e) {
        console.error('云端删除失败:', e)
        toast(i18n.t('errors.deleteFailed'), 'error')
      }
      return
    }
    const ok = await deleteWorkRecord(work.id)
    if (!ok) {
      toast(i18n.t('errors.deleteFailed'), 'error')
      return
    }
    // 作品删了,它的版本必须一起删 —— 否则历史条目会变成永久占空间的孤儿,
    // 而且没有任何入口能再看到或清理它们。
    await clearVersions(work.id)
    setWorks((prev) => prev.filter((w) => w.id !== work.id))
  }, [isCloud, toast])

  // 同步 toast 已展示后调用,重置迁移计数
  const ackSync = useCallback(() => setSyncCount(null), [])

  /**
   * 更新已有作品(用于「导出后扣减库存」这类原地改写)。
   *
   * 与 saveWork 的区别:saveWork 只插入新行;这里按 id 覆盖同一件作品,
   * 保留 id / savedAt / 名称,只替换 canvasData。云端按 id 更新,
   * 本机按 id put(IndexedDB 主键即 id)。
   *
   * @returns {Promise<boolean>}
   */
  const updateWork = useCallback(async (work) => {
    const normalized = normalizeLegacyWork(work)
    if (!normalized || normalized.id == null) return false
    setSaveState(SAVE_STATES.SAVING)
    if (isCloud()) {
      try {
        const { data, error } = await supabase
          .from('works')
          .update({
            canvas_data: normalized.canvasData,
            grid_size: normalized.gridSize,
            grid_width: normalized.gridWidth ?? null,
            grid_height: normalized.gridHeight ?? null,
            palette_id: normalized.paletteId || 'perler',
            updated_at: new Date().toISOString(),
          })
          .eq('id', normalized.id)
          .select()
          .single()
        if (error) throw error
        setWorks((prev) => prev.map((w) => (w.id === normalized.id ? rowToWork(data) : w)))
        setSaveState(SAVE_STATES.SAVED)
        return true
      } catch (e) {
        console.error('云端更新作品失败:', e)
        setSaveState(SAVE_STATES.FAILED)
        toast(i18n.t('errors.saveFailed'), 'error')
        return false
      }
    }
    const result = await saveWorkRecord(normalized)
    if (!result.ok) {
      setSaveState(SAVE_STATES.FAILED)
      toast(i18n.t('errors.storageFull'), 'error')
      return false
    }
    setWorks((prev) => prev.map((w) => (w.id === normalized.id ? normalized : w)))
    setSaveState(SAVE_STATES.SAVED)
    return true
  }, [isCloud, toast])

  /**
   * 读取一件作品的版本时间线(新的在前),并附带占用估算。
   *
   * 只读本地 IndexedDB:云端版本策略未定(「只保留里程碑版本」需要先定义
   * 里程碑),在定清楚之前不做云端版本,避免产生两套不一致的语义。
   *
   * @returns {Promise<{ versions: Array, bytes: number }>}
   */
  const loadVersions = useCallback(async (workId) => {
    const versions = await listVersions(workId)
    return { versions, bytes: estimateVersionBytes(versions) }
  }, [])

  /**
   * 回滚到某个历史版本。
   *
   * 回滚本身也是一次显式保存 —— 它写回作品本体,并**追加一条新版本**记录
   * 回滚后的内容。验收要求「回滚本身也产生一条历史(可再撤销)」:如果不追加,
   * 用户回滚错了就再也回不去,而且时间线里「当前」与作品本体也会对不上。
   *
   * @param {Object} work - 当前作品(提供 id 等身份字段)
   * @param {Object} version - 要回滚到的版本
   * @returns {Promise<Object|null>} 回滚后的作品;失败返回 null
   */
  const rollbackToVersion = useCallback(async (work, version) => {
    if (!work || work.id == null || !version || !Array.isArray(version.canvasData)) return null
    const restored = normalizeLegacyWork({
      ...work,
      canvasData: version.canvasData,
      gridSize: version.gridSize,
      gridWidth: version.gridWidth ?? null,
      gridHeight: version.gridHeight ?? null,
      paletteId: version.paletteId || work.paletteId || 'perler',
      // savedAt 用当前时间:回滚产生的是「现在」的一条新记录,不是穿越回过去。
      // 保留旧 savedAt 会让作品列表按时间排序时把它排到很后面,看起来像丢了。
      savedAt: new Date().toISOString(),
    })
    const ok = await updateWork(restored)
    if (!ok) return null
    // 追加回滚后的内容作为新版本,时间线才完整可逆
    await recordVersion(restored)
    return restored
  }, [updateWork, recordVersion])

  return {
    works,
    worksLoading,
    worksError,
    reload,
    syncCount,
    cloudMirrorCount,
    saveState,
    markDirty,
    saveWork,
    updateWork,
    deleteWork,
    ackSync,
    loadVersions,
    rollbackToVersion,
  }
}
