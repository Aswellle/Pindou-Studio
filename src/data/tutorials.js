// 教程内容数据 — 按语言动态加载
// 数据文件: tutorials.zh.js / tutorials.en.js / tutorials.ja.js / tutorials.ko.js
// 每种语言是独立 chunk:进入教程页时只下载当前语言(~31-43KB),
// 不再把四语言(~152KB)全部打进 Tutorials chunk。

const loaders = {
  'zh-CN': () => import('./tutorials.zh'),
  'en-US': () => import('./tutorials.en'),
  'ja-JP': () => import('./tutorials.ja'),
  'ko-KR': () => import('./tutorials.ko'),
}

// 各语言文件内的命名导出(数据文件保持原样,未加 default 导出)
const EXPORT_NAMES = {
  'zh-CN': 'TUTORIALS_ZH',
  'en-US': 'TUTORIALS_EN',
  'ja-JP': 'TUTORIALS_JA',
  'ko-KR': 'TUTORIALS_KO',
}

const loadedLangs = new Map()
const pendingLoads = new Map()

// 不支持的语言一律回退简体中文
export function resolveTutorialLang(lang) {
  return loaders[lang] ? lang : 'zh-CN'
}

/**
 * 加载某语言的教程 sections(幂等:并发共享同一 promise,结果常驻缓存)
 * 失败时清掉挂起记录,允许下次重试。
 */
export function loadTutorials(lang) {
  const langId = resolveTutorialLang(lang)
  if (loadedLangs.has(langId)) return Promise.resolve(loadedLangs.get(langId))
  if (!pendingLoads.has(langId)) {
    pendingLoads.set(
      langId,
      loaders[langId]()
        .then(mod => {
          const sections = mod[EXPORT_NAMES[langId]]
          if (!Array.isArray(sections)) throw new Error(`教程数据结构异常: ${langId}`)
          loadedLangs.set(langId, sections)
          return sections
        })
        .catch(err => {
          pendingLoads.delete(langId)
          throw err
        })
    )
  }
  return pendingLoads.get(langId)
}

/**
 * 同步读取已缓存的语言数据(未加载过返回 undefined)
 * 供 hook 初始化时跳过 loading 态,避免"已加载语言切换回来"时闪一下加载中。
 */
export function peekTutorials(lang) {
  return loadedLangs.get(resolveTutorialLang(lang))
}

/**
 * 将 sections 摊平成教程数组(附 sectionId/sectionTitle),
 * 用于进度追踪与上/下篇导航。纯函数:对已加载的 sections 同步调用;
 * 数据未就绪时传入 null/undefined 均安全返回空数组。
 */
export function flattenTutorials(sections) {
  const out = []
  ;(sections || []).forEach(section => {
    section.children.forEach(tutorial => {
      out.push({ ...tutorial, sectionId: section.id, sectionTitle: section.title })
    })
  })
  return out
}
