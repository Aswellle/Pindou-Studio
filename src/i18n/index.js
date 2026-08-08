import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'
import jaJP from './locales/ja-JP.json'
import koKR from './locales/ko-KR.json'

const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS },
  'ja-JP': { translation: jaJP },
  'ko-KR': { translation: koKR },
}

export const LANGUAGES = [
  { code: 'zh-CN', name: '简体中文', nativeName: '简体中文' },
  { code: 'en-US', name: 'English', nativeName: 'English' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko-KR', name: 'Korean', nativeName: '한국어' },
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

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: urlLangParam() || loadSavedLanguage(),
    fallbackLng: 'zh-CN',
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

export default i18n