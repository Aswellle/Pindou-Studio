/**
 * useTutorials — 教程数据按语言加载
 *
 * 教程数据与语言包同为按需 chunk:返回 null 表示当前语言数据尚未就绪
 * (组件渲染 loading 态);切语言时异步换装,已加载过的语言走同步缓存不闪加载中。
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loadTutorials, peekTutorials } from '../data/tutorials'

export default function useTutorials() {
  const { i18n } = useTranslation()
  const lang = i18n.language
  const [sections, setSections] = useState(() => peekTutorials(lang) || null)

  useEffect(() => {
    const cached = peekTutorials(lang)
    if (cached) {
      setSections(cached)
      return
    }
    let alive = true
    setSections(null)
    loadTutorials(lang)
      .then(data => { if (alive) setSections(data) })
      .catch(err => console.warn('教程数据加载失败:', err)) // 保持 null → loading 态
    return () => { alive = false }
  }, [lang])

  return sections
}
