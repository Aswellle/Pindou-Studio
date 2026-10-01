import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'

// 语言包按需加载:仅默认语言 zh-CN 内联打包(保证首屏永不闪烁缺翻译),
// 其余语言通过动态 import 独立成 chunk,选择该语言时才下载。
// scripts/check-i18n.js 直接读磁盘 JSON,与打包方式无关,四语言键位校验照常生效。
const lazyLangs = {
  'en-US': () => import('./locales/en-US.json'),
  'ja-JP': () => import('./locales/ja-JP.json'),
  'ko-KR': () => import('./locales/ko-KR.json'),
}

const loadedLangs = new Set(['zh-CN'])
const pendingLoads = new Map()

/**
 * 确保某语言包已注册到 i18next(幂等;并发调用共享同一 promise)。
 * 返回 promise;失败时 reject 由调用方决定兜底策略。
 */
export function ensureLanguage(lng) {
  if (loadedLangs.has(lng) || !lazyLangs[lng]) return Promise.resolve()
  if (!pendingLoads.has(lng)) {
    pendingLoads.set(
      lng,
      lazyLangs[lng]()
        .then(res => {
          i18n.addResourceBundle(lng, 'translation', res.default, true, true)
          loadedLangs.add(lng)
        })
        .catch(err => {
          pendingLoads.delete(lng) // 允许下次重试
          throw err
        })
    )
  }
  return pendingLoads.get(lng)
}

/**
 * 运行时切换语言(语言选择器统一入口):
 * 先按需加载语言包,成功后再 changeLanguage 触发全局重渲染;
 * 加载失败保持当前语言不变。
 */
export function switchLanguage(lng) {
  if (lng === i18n.language) return Promise.resolve()
  return ensureLanguage(lng).then(() => i18n.changeLanguage(lng))
}

export const LANGUAGES = [
  { code: 'zh-CN', name: '简体中文', nativeName: '简体中文', flag: '🇨🇳' },
  { code: 'en-US', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko-KR', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
]

export function getLanguageByCode(code) {
  return LANGUAGES.find(l => l.code === code) || LANGUAGES[0]
}

/**
 * 检测浏览器首选语言并映射到站点支持的四种语言
 * (zh-CN / en-US / ja-JP / ko-KR)。
 * 依次遍历 navigator.languages 首选列表:
 *  - 精确匹配(zh-CN / en-US / ja-JP / ko-KR)直接采用
 *  - 前缀匹配(zh/en/ja/ko 变体,如 zh-TW→zh-CN、en-GB→en-US)
 *  - 都不匹配 → 回退简体中文(zh-CN)
 */
export function detectBrowserLanguage() {
  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || navigator.userLanguage]

  for (const lang of candidates) {
    if (!lang) continue
    // 精确匹配
    if (LANGUAGES.some(l => l.code === lang)) {
      return lang
    }
    // 前缀匹配(zh / en / ja / ko)
    const langCode = lang.split('-')[0]
    const match = LANGUAGES.find(l => l.code.startsWith(langCode))
    if (match) return match.code
  }
  return 'zh-CN'
}

// Load saved language from localStorage
function loadSavedLanguage() {
  try {
    const settings = localStorage.getItem('bead_studio_settings')
    if (settings) {
      const { language } = JSON.parse(settings)
      if (language && LANGUAGES.some(l => l.code === language)) {
        return language
      }
    }
  } catch (e) {
    // ignore
  }
  return detectBrowserLanguage()
}

// URL 参数 ?lang= 优先(hreflang 语言页直达,SEO 标准行为;
// 无参数时回退到已保存语言 → 浏览器语言)
function urlLangParam() {
  try {
    const params = new URLSearchParams(window.location.search)
    const lang = params.get('lang')
    if (lang && LANGUAGES.some(l => l.code.toLowerCase() === lang.toLowerCase())) {
      return LANGUAGES.find(l => l.code.toLowerCase() === lang.toLowerCase()).code
    }
  } catch (e) {
    // ignore
  }
  return null
}

const initialLng = urlLangParam() || loadSavedLanguage()

i18n
  .use(initReactI18next)
  .init({
    // 仅内置默认语言;其余语言经 ensureLanguage 以 addResourceBundle 注册
    resources: { 'zh-CN': { translation: zhCN } },
    lng: initialLng,
    fallbackLng: 'zh-CN',
    // 允许 init 在语言包未齐时同步完成(缺失键暂时回退 zh-CN)
    partialBundledLanguages: true,
    interpolation: {
      escapeValue: false
    },
    react: {
      useSuspense: false
    }
  })

// Listen for language changes and save to settings
i18n.on('languageChanged', (lng) => {
  try {
    const settings = JSON.parse(localStorage.getItem('bead_studio_settings') || '{}')
    settings.language = lng
    localStorage.setItem('bead_studio_settings', JSON.stringify(settings))
  } catch (e) {
    // ignore
  }
  // 移除 URL 中的 ?lang= 残留(用户切换语言后,刷新不再被残留参数拉回参数语言)
  if (typeof window !== 'undefined' && window.location.search.includes('lang=')) {
    const url = new URL(window.location.href)
    url.searchParams.delete('lang')
    window.history.replaceState({}, '', url)
  }
})

/**
 * 首屏就绪信号:初始语言非 zh-CN 时,先加载对应语言包再挂载 React,
 * 避免非中文用户看到中文兜底文案闪烁;失败也不阻塞启动(回退 zh-CN)。
 */
export const i18nReady = (initialLng === 'zh-CN'
  ? Promise.resolve()
  : ensureLanguage(initialLng)
).catch(err => {
  console.warn(`[i18n] 初始语言包加载失败,回退 zh-CN: ${initialLng}`, err)
})

export default i18n
