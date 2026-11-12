/**
 * 图库搜索框(图库 / 分类 / 主题 / 合集共用)。
 *
 * 为什么不能直接把 <input value={searchTerm} onChange={setSearchTerm}> 交给 URL:
 *   searchTerm 来自 URLSearchParams,每次击键都会触发一次路由写入 + 重渲染。
 *   移动端中文/日文/韩文输入法在**组合输入期间**(拼音还没上屏)会持续触发
 *   change,父级重渲染把 value 改回上一次 URL 里的值,输入法缓冲被打断 ——
 *   表现就是「多打出字母、出现错字」。
 *
 * 做法:
 *   - 输入框自己持有草稿(draft),击键先改草稿,不等 URL;
 *   - 组合输入(compositionstart→end)期间绝不提交,上屏后一次性提交;
 *   - URL 的外部变化(chip 清除、前进后退)才回填草稿 —— 用 committedRef
 *     区分「自己刚提交的回声」与「外部变化」,避免把用户正在输入的内容覆盖掉。
 */

import { useEffect, useRef, useState } from 'react'

export default function GallerySearchInput({ value, onCommit, placeholder, ariaLabel }) {
  const [draft, setDraft] = useState(value)
  const composingRef = useRef(false)
  // 最近一次「已经写到 URL」的值:value 与它不同,说明变化来自外部
  const committedRef = useRef(value)

  useEffect(() => {
    if (composingRef.current) return
    if (value === committedRef.current) return
    committedRef.current = value
    setDraft(value)
  }, [value])

  const commit = (next) => {
    if (next === committedRef.current) return
    committedRef.current = next
    onCommit(next)
  }

  return (
    <input
      type="search"
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        const next = e.target.value
        setDraft(next)
        // 组合输入期间只更新草稿,不写 URL(写 URL 会重渲染并打断输入法)
        if (!composingRef.current) commit(next)
      }}
      onCompositionStart={() => {
        composingRef.current = true
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false
        const next = e.currentTarget.value
        setDraft(next)
        commit(next)
      }}
      onBlur={() => {
        // 少数输入法/浏览器结束组合后不再触发 change;失焦即视为本次输入结束,
        // 把草稿补写一次(组合状态一并复位)
        composingRef.current = false
        if (draft !== committedRef.current) commit(draft)
      }}
    />
  )
}
