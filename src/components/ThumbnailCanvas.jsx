import { useEffect, useRef } from 'react'

const CELL_SIZE = 8

/**
 * 模板图案缩略图 — 按格子绘制 pattern(hex 或 null)。
 * 图案居中于 size×size 画布(矩形图案也正确显示)。
 */
export default function ThumbnailCanvas({ pattern, size }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !pattern) return

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size * CELL_SIZE, size * CELL_SIZE)

    if (!Array.isArray(pattern) || !Array.isArray(pattern[0])) return // 损坏模板数据兜底,不拖垮页面
    const rows = pattern.length
    const cols = pattern[0]?.length || 0
    const offsetX = Math.floor((size - cols) / 2)
    const offsetY = Math.floor((size - rows) / 2)

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = pattern[y]?.[x]
        if (cell) {
          ctx.fillStyle = cell
          ctx.fillRect((x + offsetX) * CELL_SIZE, (y + offsetY) * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1)
        }
      }
    }
  }, [pattern, size])

  return (
    <canvas
      ref={canvasRef}
      width={size * CELL_SIZE}
      height={size * CELL_SIZE}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
