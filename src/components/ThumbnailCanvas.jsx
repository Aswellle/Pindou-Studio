import { useEffect, useMemo, useRef } from 'react'
import { patternDimensions } from '../data/templates'

// 逻辑格子尺寸:仅用于「未挂载/无布局」时的位图兜底(如 SSR、jsdom)。
// 真实显示时按 CSS 盒尺寸重算,不再依赖这个常量。
const CELL_SIZE = 8

// 近白判定阈值(0–255 亮度)。拼豆色卡里存在 #F8F8F8 / #FFFFFF 这类珠子,
// 它们画在白纸上与纸同色 —— 整块图案会「消失」,只剩零星深色格点。
const LIGHT_LUMA = 240

const lightCache = new Map()
function isNearWhite(hex) {
  if (typeof hex !== 'string') return false
  if (lightCache.has(hex)) return lightCache.get(hex)
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  let light = false
  if (match) {
    const n = Number.parseInt(match[1], 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    light = 0.299 * r + 0.587 * g + 0.114 * b >= LIGHT_LUMA
  }
  lightCache.set(hex, light)
  return light
}

/**
 * 图案内容包围盒 — 裁掉四周全空的行列。
 *
 * 模板数据常带不等的外边距(内置的熊 4 行顶边、独角兽 9 列左边…),
 * 直接按整张网格铺进缩略图,每张图的「光学大小」和位置都不一样:
 * 有的贴边、有的缩在角落,整面墙看起来就没有统一规矩。
 * 以内容为基准构图后,所有模板在各自的框里都居中、尽量大。
 */
export function contentBox(pattern) {
  if (!Array.isArray(pattern) || pattern.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < pattern.length; y++) {
    const row = pattern[y]
    if (!Array.isArray(row)) continue
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x0: minX, y0: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * 模板图案缩略图 — 按格子绘制 pattern(hex 或 null)。
 *
 * 尺寸规则:
 *   - 布局尺寸以 pattern 实际形状为准(数据形状是唯一真相),声明的
 *     gridWidth/gridHeight/size 只在 pattern 不可用时兜底;
 *   - 构图再按「内容包围盒」裁掉四周全空的行列,所有模板统一居中、尽量大。
 *
 * ── 画布盒子:一律用内容包围盒的宽高比,不用位图宽高比 ──────────────
 *
 * canvas 是替换元素,它的**固有尺寸就是 width/height 两个属性**(位图像素)。
 * 只要 CSS 没有把两个方向都钉死,浏览器就会拿位图比例去算盒子的另一维:
 *
 *   · 父级只约束了 max-width/max-height(模态框、收藏、详情页、管理后台)
 *     → 竖长图案的画布变成 88×296,横向只占预览区的 26%,两侧空出一大片;
 *   · 父级用 aspect-ratio + 百分比尺寸(卡片)时又会因「百分比高度依赖父级
 *     高度、父级高度又来自 aspect-ratio」退回 auto,同样按位图比例撑开。
 *
 * 更麻烦的是这两个方向会互相喂养:effect 按 getBoundingClientRect() 设位图,
 * 位图比例又决定下一次的盒子比例 —— 一旦某次量到的盒子被压扁,位图跟着变扁,
 * 之后就再也回不到正确比例,同一张卡在不同模板之间来回打开时形状还会漂移。
 *
 * 所以盒子比例必须由**逻辑内容**单方面决定(style 上的 aspect-ratio),
 * 位图只是往里填像素,不参与布局。这样任何容器约束下形状都稳定。
 *
 * ── 近白色珠子要能看见 ────────────────────────────────────────────
 *
 * 珠子之间留的是「纸」色间隙,所以白/近白珠子在白纸上等于消失
 * (内置独角兽 124 颗 #F8F8F8 曾整只「隐身」)。凡是近白色珠子都补一圈
 * 极淡描边,让格点仍然可读 —— 与具体配色无关,新上传的图纸同样成立。
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
  // 声明值只作兜底 —— 历史行或外部写入的声明值一旦与数据不符,
  // 按声明铺格子会把珠子错位、裁切。
  const width = derived.width || Number(gridWidth) || Number(size) || 0
  const height = derived.height || Number(gridHeight) || Number(size) || 0

  const content = useMemo(() => contentBox(pattern), [pattern])
  // 构图尺寸:有内容就按包围盒,内容全空才退回整张网格
  const gridW = content?.width || width
  const gridH = content?.height || height

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !pattern || !gridW || !gridH) return
    const x0 = content?.x0 ?? 0
    const y0 = content?.y0 ?? 0

    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      // 没有布局信息(jsdom / 隐藏容器)时退回逻辑尺寸,保证至少画出内容
      const boxW = rect.width > 0 ? rect.width : gridW * CELL_SIZE
      const boxH = rect.height > 0 ? rect.height : gridH * CELL_SIZE

      const bitmapW = Math.max(1, Math.round(boxW * dpr))
      const bitmapH = Math.max(1, Math.round(boxH * dpr))
      if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
        canvas.width = bitmapW
        canvas.height = bitmapH
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, bitmapW, bitmapH)
      // 不铺白底:缩略图容器的底色才是「纸」,画布只负责画珠子。
      // 透明底让容器的背景色透出来,图案边界即是画布边界。

      if (!Array.isArray(pattern) || !Array.isArray(pattern[0])) return // 损坏模板数据兜底,不拖垮页面

      // 按内容包围盒等比 contain 铺进位图并居中,与 object-fit: contain 同一语义。
      // 无论声明尺寸或空白边距写成什么,珠子都落在自己的格点上。
      const scale = Math.min(bitmapW / gridW, bitmapH / gridH)
      const originX = (bitmapW - gridW * scale) / 2
      const originY = (bitmapH - gridH * scale) / 2

      const cellPx = scale
      // 珠子之间的间隙:按比例给,避免放大后细线消失、缩小后糊成一片
      const gap = Math.max(1, cellPx * 0.12)
      // 近白珠子的描边宽度:随格子缩放,卡片与浮窗上都是发丝级的淡线
      const ringW = Math.max(1, cellPx * 0.06)

      for (let y = y0; y < y0 + gridH; y++) {
        const row = pattern[y]
        if (!Array.isArray(row)) continue
        for (let x = x0; x < x0 + gridW; x++) {
          const cell = row[x]
          if (!cell) continue
          const px = originX + (x - x0) * cellPx
          const py = originY + (y - y0) * cellPx
          const side = Math.max(1, cellPx - gap)
          ctx.fillStyle = cell
          ctx.fillRect(px, py, side, side)
          if (isNearWhite(cell)) {
            // 近白珠子在白纸上会「隐身」:补一圈淡描边,让格点仍可辨认
            ctx.strokeStyle = 'rgba(43, 36, 32, 0.28)'
            ctx.lineWidth = ringW
            const inset = ringW / 2
            ctx.strokeRect(px + inset, py + inset, Math.max(1, side - ringW), Math.max(1, side - ringW))
          }
        }
      }
    }

    draw()

    // 卡片宽度随窗口/列数变化,重绘一次保证位图始终与显示尺寸 1:1
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [pattern, gridW, gridH, content])

  // 盒子比例锁定为内容包围盒比例(见组件头注释)。width/height 由容器给,
  // aspect-ratio 只负责在容器只约束一维时算出另一维,两者不冲突。
  const aspectRatio = gridW && gridH ? `${gridW} / ${gridH}` : undefined

  return (
    <canvas
      ref={canvasRef}
      // 位图尺寸由 effect 按显示尺寸设置;这里的初始值只用于首帧占位
      width={gridW * CELL_SIZE}
      height={gridH * CELL_SIZE}
      style={{ imageRendering: 'pixelated', aspectRatio }}
    />
  )
}
