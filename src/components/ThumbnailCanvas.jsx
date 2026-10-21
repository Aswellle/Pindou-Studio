import { useEffect, useRef } from 'react'
import { patternDimensions } from '../data/templates'

// 逻辑格子尺寸:仅用于「未挂载/无布局」时的位图兜底(如 SSR、jsdom)。
// 真实显示时按 CSS 盒尺寸重算,不再依赖这个常量。
const CELL_SIZE = 8

/**
 * 模板图案缩略图 — 按格子绘制 pattern(hex 或 null)。
 *
 * 尺寸规则:
 *   - 传 `gridWidth`/`gridHeight` 时按真实宽高渲染(矩形模板不再被塞进正方形);
 *   - 只传 `size` 时退回旧的 size×size 方形画布,矩形图案居中显示(向后兼容)。
 *
 * 位图分辨率跟随显示尺寸与 devicePixelRatio:
 *   此前位图固定按 8px/格生成(29×29 → 232px),再由 CSS 放大到卡片宽度(245px),
 *   缩放比 1.056 不是整数。格子之间本来留了 1px 间隙,非整数缩放会让间隙
 *   在设备像素上忽宽忽窄,整张图出现白色摩尔纹(实测截图可见)。
 *   现在按「显示尺寸 × dpr」重建位图,位图与设备像素 1:1,间隙均匀、图案清晰。
 */
export default function ThumbnailCanvas({ pattern, size, gridWidth, gridHeight }) {
  const canvasRef = useRef(null)

  const derived = patternDimensions(pattern)
  const width = Number(gridWidth) || derived.width || size || 0
  const height = Number(gridHeight) || derived.height || size || 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !pattern || !width || !height) return

    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      // 没有布局信息(jsdom / 隐藏容器)时退回逻辑尺寸,保证至少画出内容
      const boxW = rect.width > 0 ? rect.width : width * CELL_SIZE
      const boxH = rect.height > 0 ? rect.height : height * CELL_SIZE

      const bitmapW = Math.max(1, Math.round(boxW * dpr))
      const bitmapH = Math.max(1, Math.round(boxH * dpr))
      if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
        canvas.width = bitmapW
        canvas.height = bitmapH
      }

      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, bitmapW, bitmapH)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, bitmapW, bitmapH)

      if (!Array.isArray(pattern) || !Array.isArray(pattern[0])) return // 损坏模板数据兜底,不拖垮页面

      const rows = pattern.length
      // 列数取「最大行长」而不是首行长度:pattern 可能是参差的(某几行更长),
      // 按首行算会把右侧的格子整片漏画。
      const cols = derived.width || pattern[0]?.length || 0

      // 逻辑网格(含居中留白)等比铺进位图,与 object-fit: contain 同一语义
      const scale = Math.min(bitmapW / width, bitmapH / height)
      const originX = (bitmapW - width * scale) / 2
      const originY = (bitmapH - height * scale) / 2
      // 仅当调用方显式给了更大的方形 size 才居中
      const offsetX = Math.floor((width - cols) / 2)
      const offsetY = Math.floor((height - rows) / 2)

      const cellPx = scale
      // 珠子之间的间隙:按比例给,避免放大后细线消失、缩小后糊成一片
      const gap = Math.max(1, cellPx * 0.12)

      for (let y = 0; y < rows; y++) {
        const row = pattern[y]
        if (!Array.isArray(row)) continue
        for (let x = 0; x < row.length; x++) {
          const cell = row[x]
          if (!cell) continue
          ctx.fillStyle = cell
          ctx.fillRect(
            originX + (x + offsetX) * cellPx,
            originY + (y + offsetY) * cellPx,
            Math.max(1, cellPx - gap),
            Math.max(1, cellPx - gap),
          )
        }
      }
    }

    draw()

    // 卡片宽度随窗口/列数变化,重绘一次保证位图始终与显示尺寸 1:1
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [pattern, width, height, derived.width])

  return (
    <canvas
      ref={canvasRef}
      // 位图尺寸由 effect 按显示尺寸设置;这里的初始值只用于首帧占位
      width={width * CELL_SIZE}
      height={height * CELL_SIZE}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
