/**
 * WorkThumbnail — 我的作品卡片缩略图(自 V1 Gallery 抽出)
 *
 * canvasData 存 hex 字符串(历史遗留可能是品牌 ID),经调色板解析为 hex 直绘;
 * 规格从 gridWidth/gridHeight 读取(旧数据回退 gridSize)。
 */
import { getPalette } from '../../../data/palettes'

const CELL_SIZE = 8

const resolveToHex = (colorVal, palette) => {
  if (!colorVal) return null
  if (typeof colorVal === 'string' && colorVal.startsWith('#')) return colorVal
  const found = palette.colors.find(c => c.id === colorVal)
  return found ? found.hex : colorVal
}

export default function WorkThumbnail({ work }) {
  const w = work.gridWidth || work.gridSize
  const h = work.gridHeight || work.gridSize
  return (
    <canvas
      width={w * CELL_SIZE}
      height={h * CELL_SIZE}
      style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '160px' }}
      ref={(canvas) => {
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const palette = getPalette(work.paletteId || 'perler')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w * CELL_SIZE, h * CELL_SIZE)
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const hex = resolveToHex(work.canvasData[y]?.[x], palette)
            if (hex) {
              ctx.fillStyle = hex
              ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1)
            }
          }
        }
      }}
    />
  )
}
