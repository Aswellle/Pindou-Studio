import zh from './pet.zh'
import en from './pet.en'
import ja from './pet.ja'
import ko from './pet.ko'

/**
 * 拼豆爱宠「豆豆」语料选取 — 按当前语言前缀返回对应语料。
 * 仿 tutorials 的 getTutorials(lang) 模式,音译回退 zh-CN。
 * @param {string} lang i18n 语言标签,如 'zh-CN' / 'en-US'
 */
const CORPUS = { zh, en, ja, ko }

export function getPetCorpus(lang = 'zh-CN') {
  const base = (lang || '').toLowerCase()
  if (base.startsWith('en')) return en
  if (base.startsWith('ja')) return ja
  if (base.startsWith('ko')) return ko
  return zh // 默认简体中文
}

export const PICK = (list) => list[Math.floor(Math.random() * list.length)]
