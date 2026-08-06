// 教程内容数据 — 四语言版本映射
// 数据文件: tutorials.zh.js / tutorials.en.js / tutorials.ja.js / tutorials.ko.js
import { TUTORIALS_ZH } from './tutorials.zh'
import { TUTORIALS_EN } from './tutorials.en'
import { TUTORIALS_JA } from './tutorials.ja'
import { TUTORIALS_KO } from './tutorials.ko'

export const TUTORIALS_BY_LANG = {
  'zh-CN': TUTORIALS_ZH,
  'en-US': TUTORIALS_EN,
  'ja-JP': TUTORIALS_JA,
  'ko-KR': TUTORIALS_KO,
}

// 按语言取教程数据(不支持的语言回退简体中文)
export function getTutorials(lang) {
  return TUTORIALS_BY_LANG[lang] || TUTORIALS_ZH
}

// 获取所有教程的平铺列表(用于进度追踪),按当前语言
export function getAllTutorials(lang) {
  const tutorials = []
  getTutorials(lang).forEach(section => {
    section.children.forEach(tutorial => {
      tutorials.push({
        ...tutorial,
        sectionId: section.id,
        sectionTitle: section.title
      })
    })
  })
  return tutorials
}

// 兼容旧调用(无语言参数时默认简体中文)
export const TUTORIALS = TUTORIALS_ZH
