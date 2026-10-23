import { useCallback, useEffect, useRef, useState } from 'react'
import { saveDraft, loadDraft, clearDraft } from '../services/project/worksStore'
import { loadAutoSaveEnabled, saveAutoSaveEnabled } from '../utils/editorPrefs'

/**
 * useAutoSave — 画布自动保存草稿(规格 03 §7 / 规格 04 §7)。
 *
 * 解决的是「画了一半关掉页面就没了」:此前只有显式保存,而显式保存
 * 要求用户先想好名字、再点确认 —— 创作过程中没人会这么做。
 *
 * 三条硬约束(来自规格 03 §7 与 M9.2 非目标):
 *   1. **不产生历史记录** —— 草稿是存储层的事,不碰 useHistory;
 *   2. **不触发云端写入** —— 草稿只进 IndexedDB。半成品同步到 `works` 表
 *      既污染作品库,也等于把未完成内容外传;
 *   3. **不打断创作** —— 失败静默(只把状态暴露给 UI),绝不弹框、不 toast。
 *      自动保存的价值是「悄悄兜底」,弹窗反而比不保存更烦人。
 *
 * 状态机(与显式保存的 SAVE_STATES 分开,两者语义不同):
 *   idle    — 没有待写内容(刚载入 / 刚清空)
 *   pending — 画布改过了,防抖计时中
 *   saving  — 正在写 IndexedDB
 *   saved   — 最近一次写入成功(带 savedAt 供 UI 显示「已自动保存 hh:mm」)
 *   failed  — 存储不可用/配额不足;不重试,下次改动会再试一次
 *   off     — 用户关闭了自动保存
 */

export const AUTOSAVE_STATES = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  SAVING: 'saving',
  SAVED: 'saved',
  FAILED: 'failed',
  OFF: 'off',
})

/** 防抖时长:2s。太短会在连续拖动时反复写盘,太长则「刚画完就关」仍会丢 */
export const AUTOSAVE_DELAY_MS = 2000

/**
 * @param {object} options
 * @param {Array<Array<string|null>>|null} options.canvasData - 当前画布
 * @param {object} [options.meta] - 随草稿一起存的上下文(尺寸/色卡/名称/来源)
 * @param {boolean} [options.enabled] - 自动保存总开关
 * @param {number} [options.delay] - 防抖毫秒数(测试可缩短)
 */
export default function useAutoSave({ canvasData, meta, enabled = true, delay = AUTOSAVE_DELAY_MS }) {
  const [state, setState] = useState(enabled ? AUTOSAVE_STATES.IDLE : AUTOSAVE_STATES.OFF)
  const [savedAt, setSavedAt] = useState(null)

  // 首次载入/换画布时不该把「刚打开的空白画布」当成一次改动写盘 ——
  // 否则用户每次打开首页都会覆盖掉真正的草稿。
  // 判定方式:记下第一次看到的矩阵引用,只有引用变了才算改动。
  const baselineRef = useRef(null)
  const metaRef = useRef(meta)
  const timerRef = useRef(null)
  const seqRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => { metaRef.current = meta }, [meta])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // 开关切换:关掉时立刻停掉计时器并把状态切到 off,不留下「pending」这种
  // 让人以为还会写盘的中间态。
  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      setState(AUTOSAVE_STATES.OFF)
    } else {
      setState((prev) => (prev === AUTOSAVE_STATES.OFF ? AUTOSAVE_STATES.IDLE : prev))
    }
  }, [enabled])

  // 画布引用变化 → 重置防抖计时。
  useEffect(() => {
    if (!enabled) return undefined
    if (!Array.isArray(canvasData)) return undefined

    // 第一次见到这个矩阵:记作基线,不写盘
    if (baselineRef.current === null) {
      baselineRef.current = canvasData
      return undefined
    }
    if (baselineRef.current === canvasData) return undefined
    baselineRef.current = canvasData

    setState(AUTOSAVE_STATES.PENDING)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      const seq = ++seqRef.current
      setState(AUTOSAVE_STATES.SAVING)
      const stamp = new Date().toISOString()
      // 不 await 在这个回调里做状态回写判断 —— 用序号防止较早的写入
      // 在较新的改动之后才落地,把 UI 状态改回「已保存」(内容其实已经旧了)。
      saveDraft({ canvasData, ...metaRef.current, savedAt: stamp }).then((res) => {
        if (!mountedRef.current || seq !== seqRef.current) return
        if (res.ok) {
          setSavedAt(stamp)
          setState(AUTOSAVE_STATES.SAVED)
        } else {
          setState(AUTOSAVE_STATES.FAILED)
        }
      })
    }, delay)

    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    }
  }, [canvasData, enabled, delay])

  /** 读取草稿(不自动应用 —— 由调用方决定是否弹「恢复」提示) */
  const readDraft = useCallback(() => loadDraft(), [])

  /** 显式保存成功后调用:草稿已完成使命,清掉以免下次误提示「恢复」 */
  const discardDraft = useCallback(async () => {
    seqRef.current += 1 // 让在途写入的结果不再改 UI 状态
    await clearDraft()
    setSavedAt(null)
    setState((prev) => (prev === AUTOSAVE_STATES.OFF ? prev : AUTOSAVE_STATES.IDLE))
  }, [])

  /**
   * 把基线重置到当前矩阵。
   *
   * 载入模板 / 恢复草稿 / 应用量化结果之后调用:这些操作**整体替换**了画布,
   * 不该被当成「用户画了一笔」而立刻再写一次草稿。
   */
  const resetBaseline = useCallback((data) => {
    baselineRef.current = data ?? null
    seqRef.current += 1
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setState((prev) => (prev === AUTOSAVE_STATES.OFF ? prev : AUTOSAVE_STATES.IDLE))
  }, [])

  return { state, savedAt, readDraft, discardDraft, resetBaseline }
}

/** 自动保存开关的持久化(与编辑器其他偏好共用 bead_studio_settings) */
export function useAutoSaveEnabled() {
  const [enabled, setEnabled] = useState(loadAutoSaveEnabled)
  const toggle = useCallback((value) => {
    const next = Boolean(value)
    setEnabled(next)
    saveAutoSaveEnabled(next)
  }, [])
  return [enabled, toggle]
}
