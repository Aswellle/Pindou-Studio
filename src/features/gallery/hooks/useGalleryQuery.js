/**
 * useGalleryQuery — Gallery V2 URL 状态管理
 *
 * 将搜索词、分类、难度等筛选状态同步到 URLSearchParams，
 * 支持刷新恢复、浏览器前进后退、分享链接。
 *
 * URL 格式: /gallery?q=xxx&cat=animal&diff=easy
 *
 * 主题页/合集页复用同一套筛选:它们也读取 q/cat/diff,
 * 只是作用在各自范围内的模板列表上。
 */

import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * 「用色数」筛选档位(上限,单位:色)。
 *
 * 图库、主题页、合集页共用同一组档位:三处的语义都是「最多用 N 色」,
 * 档位不一致会让同一个链接在不同页面筛出不同结果,用户无法预期。
 */
export const COLOR_COUNT_TIERS = Object.freeze([4, 8, 12, 16, 24, 32])

/**
 * 难度白名单。URL 里的非法值必须归一化为 all(04 §2),
 * 否则筛选面板没有对应项、chips 会直接显示 i18n key。
 */
export const GALLERY_DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard'])

/**
 * 视图页签(全部 / 收藏 / 我的作品)。
 *
 * 收藏与我的作品已移到个人中心(/profile),图库不再有视图页签。
 * 这里保留该常量只为一件事:老链接里的 ?view= 参数必须被识别并丢弃,
 * 不能让它继续留在地址栏里,也不能让非法值把页面顶成空白。
 */
export const LEGACY_VIEW_PARAM = 'view'

/**
 * 一级 feed(精选 / 热门 / 最新)。
 *
 * 只由 Gallery 首页消费:主题页/合集页复用本 hook 读取筛选参数,
 * 但完全忽略 feed 字段 —— 它们的模板范围是各自的关联列表,没有 feed 语义。
 * 新参数用 feed 而不复用已废弃的 view,避免新旧语义互相污染。
 */
export const GALLERY_FEEDS = Object.freeze(['featured', 'popular', 'latest'])
export const DEFAULT_GALLERY_FEED = 'featured'

/** 非法/缺失 feed 归一化为默认值(纯函数,便于单测) */
export function normalizeGalleryFeed(value) {
  return GALLERY_FEEDS.includes(value) ? value : DEFAULT_GALLERY_FEED
}

/**
 * @returns {{ searchTerm, category, difficulty, feed, setSearchTerm, setCategory, setDifficulty, setFeed, … }}
 */
export function useGalleryQuery() {
  const [searchParams, setSearchParams] = useSearchParams()

  const searchTerm = searchParams.get('q') || ''
  const category = searchParams.get('cat') || 'all'
  const rawDifficulty = searchParams.get('diff') || 'all'
  const difficulty = GALLERY_DIFFICULTIES.includes(rawDifficulty) ? rawDifficulty : 'all'
  // 用色数量上限:空 = 不限。只接受受支持的档位,非法值当不限处理。
  const rawColors = searchParams.get('colors') || ''
  const maxColors = COLOR_COUNT_TIERS.includes(Number(rawColors)) ? Number(rawColors) : null
  // 老链接的 ?view=works / ?view=favorites:收藏与作品已搬到个人中心,
  // 这里只读取出来用于「静默清掉」,不再参与任何筛选。
  const legacyView = searchParams.get(LEGACY_VIEW_PARAM) || ''
  // 一级 feed:非法值(含 ?feed=)归一化为 featured,不写回 URL(与 cat/diff 同策略)
  const feed = normalizeGalleryFeed(searchParams.get('feed'))
  // 显式的「全部图纸」浏览态(02 §7):精选 feed 下有策展内容时也能浏览资源全集。
  // 它是 feed 之外的浏览状态,由侧栏进入,切换 feed 时自动退出。
  const browse = searchParams.get('browse') === '1'

  /**
   * 构造写入后的参数。所有 setter 共用这一处 —— 同一 tick 内连续调用多个
   * 单项 setter 时,后一次会以旧参数为基底覆盖前一次(04 §2.2 明确禁止),
   * 需要同时改多项时必须走 `setFilters` 或 `clearFiltersAndGoToFeed`。
   */
  const buildParams = (patch = {}) => {
    const params = new URLSearchParams(searchParams)
    if ('q' in patch) {
      if (patch.q) params.set('q', patch.q)
      else params.delete('q')
    }
    if ('cat' in patch) {
      if (patch.cat && patch.cat !== 'all') params.set('cat', patch.cat)
      else params.delete('cat')
    }
    if ('diff' in patch) {
      if (patch.diff && patch.diff !== 'all') params.set('diff', patch.diff)
      else params.delete('diff')
    }
    if ('colors' in patch) {
      const n = Number(patch.colors)
      if (patch.colors && COLOR_COUNT_TIERS.includes(n)) params.set('colors', String(n))
      else params.delete('colors')
    }
    if ('feed' in patch) {
      const next = normalizeGalleryFeed(patch.feed)
      if (next !== DEFAULT_GALLERY_FEED) params.set('feed', next)
      else params.delete('feed')
    }
    if ('browse' in patch) {
      if (patch.browse) params.set('browse', '1')
      else params.delete('browse')
    }
    return params
  }

  /** 参数没有实际变化时不写历史(避免点击当前 feed 产生重复记录) */
  const writeParams = (params, options) => {
    if (params.toString() === searchParams.toString()) return
    setSearchParams(params, options)
  }

  const setSearchTerm = value => writeParams(buildParams({ q: value }), { replace: true })

  const setCategory = value => writeParams(buildParams({ cat: value }), { replace: true })

  const setDifficulty = value => writeParams(buildParams({ diff: value }), { replace: true })

  const setMaxColors = value => writeParams(buildParams({ colors: value }), { replace: true })

  /**
   * 切换一级 feed。
   * 用 push 写入历史:浏览器后退可以回到上一个 feed(筛选与搜索都保留在
   * 同一条 URL 里,后退不会丢条件)。默认 feed 不写入参数,保持地址栏干净。
   */
  const setFeed = value => {
    // 切 feed 即退出「全部图纸」浏览态
    writeParams(buildParams({ feed: value, browse: false }))
  }

  /**
   * 清掉老链接里的 ?view= 参数。
   * 收藏与我的作品已搬到个人中心,旧链接不应再带着这个键;
   * 用 replace 写入,不在浏览历史里留下一条无意义的记录。
   */
  const clearLegacyView = useCallback(() => {
    const params = new URLSearchParams(searchParams)
    params.delete(LEGACY_VIEW_PARAM)
    setSearchParams(params, { replace: true })
  }, [searchParams, setSearchParams])

  /**
   * 一次写入多个筛选值(feed 不在此列:切 feed 走 setFeed)。
   * 连续调用单个 setter 时,每个 setter 都从「当前渲染的 searchParams」构造,
   * 同一 tick 内后一次会覆盖前一次(例如重置三个筛选只剩最后一个生效)。
   * 需要同时改多项时用这个。
   */
  const setFilters = (patch = {}) => writeParams(buildParams(patch), { replace: true })

  /**
   * 一次写入「清空全部筛选 + 目标 feed」。
   * 侧栏「发现 / 精选主题 / 精选合集」都要求回到无筛选的精选视图;
   * 分开调用 clearAllFilters() 与 setFeed() 时两次都基于旧参数,
   * 第二次会把筛选原样写回(见 04 §2.2)。
   */
  const clearFiltersAndGoToFeed = value => {
    writeParams(buildParams({ q: '', cat: 'all', diff: 'all', colors: '', feed: value, browse: false }))
  }

  /**
   * 侧栏「全部图纸」:清空筛选并进入显式浏览态(02 §7)。
   * feed 保持 featured,但面板渲染全量网格而不是策展区块;tab 切换会退出该状态。
   */
  const browseAll = () => {
    writeParams(buildParams({ q: '', cat: 'all', diff: 'all', colors: '', feed: 'featured', browse: true }))
  }

  return {
    searchTerm,
    category,
    difficulty,
    maxColors,
    feed,
    browse,
    legacyView,
    setSearchTerm,
    setCategory,
    setDifficulty,
    setMaxColors,
    setFeed,
    browseAll,
    clearFiltersAndGoToFeed,
    clearLegacyView,
    setFilters,
  }
}
