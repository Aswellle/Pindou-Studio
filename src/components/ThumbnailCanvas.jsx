import { useEffect, useRef } from 'react'
import { patternDimensions } from '../data/templates'

const CELL_SIZE = 8

/**
 * 模板图案缩略图 — 按格子绘制 pattern(hex 或 null)。
 *
 * 尺寸规则:
 *   - 传 `gridWidth`/`gridHeight` 时按真实宽高渲染(矩形模板不再被塞进正方形);
 *   - 只传 `size` 时退回旧的 size×size 方形画布,矩形图案居中显示(向后兼容)。
 *
 * 画布 CSS 宽度由父容器决定(卡片预览 width:100%),这里只保证内部宽高比正确。
 */
export default function ThumbnailCanvas({ pattern, size, gridWidth, gridHeight }) {
  const canvasRef = useRef(null)

  const derived = patternDimensions(pattern)
  const width = Number(gridWidth) || derived.width || size || 0
  const height = Number(gridHeight) || derived.height || size || 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !pattern) return

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width * CELL_SIZE, height * CELL_SIZE)

    if (!Array.isArray(pattern) || !Array.isArray(pattern[0])) return // 损坏模板数据兜底,不拖垮页面
    const rows = pattern.length
    const cols = pattern[0]?.length || 0
    // 画布宽高与 pattern 一致时偏移为 0;仅当调用方显式给了更大的方形 size 才居中
    const offsetX = Math.floor((width - cols) / 2)
    const offsetY = Math.floor((height - rows) / 2)

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = pattern[y]?.[x]
        if (cell) {
          ctx.fillStyle = cell
          ctx.fillRect((x + offsetX) * CELL_SIZE, (y + offsetY) * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1)
        }
      }
    }
  }, [pattern, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width * CELL_SIZE}
      height={height * CELL_SIZE}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
