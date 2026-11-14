import { useEffect, useRef } from 'react'

/**
 * EditorPreview — 二次确认框里的「处理前 → 处理后」效果预览。
 *
 * 只读渲染一份 canvasData:白底 + 逐格色块,整图缩到固定宽度。
 * 删除颜色/合并相近色/裁切/去噪在真正写入矩阵前,都先在这里给用户
 * 看一眼结果 —— 「可能无法复原的操作」不允许只靠一行文字告知。
 *
 * jsdom 没有 2d context(getContext 返回 null),静默跳过绘制;
 * 确认框的契约测试只断言预览节点存在,不校验像素。
 */
export default function EditorPreview({ data, width = 140, label }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !Array.isArray(data) || data.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rows = data.length
    const cols = Array.isArray(data[0]) ? data[0].length : 0
    if (!cols) return

    const cell = Math.max(1, Math.floor(width / cols))
    const w = cell * cols
    const h = cell * rows
    const dpr = 2
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < rows; y++) {
      const row = data[y]
      for (let x = 0; x < cols; x++) {
        const hex = row?.[x]
        if (!hex) continue
        ctx.fillStyle = hex
        ctx.fillRect(x * cell, y * cell, cell, cell)
      }
    }
  }, [data, width])

  return <canvas ref={ref} className="editor-preview-canvas" aria-label={label} />
}
