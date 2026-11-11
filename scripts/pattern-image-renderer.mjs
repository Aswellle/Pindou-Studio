/**
 * 图纸预览图绘制(构建期,依赖 @napi-rs/canvas)。
 *
 * 输出与运行时 <canvas> 缩略图同一构图:内容包围盒取景、整数格宽、
 * 珠子之间留缝、近白珠子补淡描边 —— 用户点开详情页看到的就是这张图。
 * 布局与尺寸由 src/features/gallery/patternImage.js 的纯函数算好,
 * 这里只按坐标落笔。
 *
 * 与 og-card-renderer 的区别:分享卡片是 1200×630 的带字卡片,只适合社交平台;
 * 这里输出透明的纯图案,适合页面内展示与图片搜索。
 *
 * 依赖原生 canvas:装不上时返回 null,调用方降级为「不生成预览图」。
 */

import { loadCanvasLib } from './og-card-renderer.mjs'
import { patternImageMetrics } from '../src/features/gallery/patternImage.js'
import { isNearWhite } from '../src/utils/patternGeometry.js'

/**
 * 画一张图纸预览图。
 *
 * @param {object} template 云端模板行(需含 pattern)
 * @returns {Promise<{png:Buffer,width:number,height:number}|null>}
 *   canvas 不可用或图案为空时返回 null
 */
export async function renderPatternPreview(template) {
  const metrics = patternImageMetrics(template?.pattern)
  if (!metrics) return null

  const lib = await loadCanvasLib()
  if (!lib?.createCanvas) return null

  const { cell, width, height, box } = metrics
  const canvas = lib.createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // 透明底:页面容器的「纸」色透出来,与 canvas 缩略图一致。
  // 珠子之间的缝按比例给,与 ThumbnailCanvas 的 gap = 12% 同口径;
  // 格子太小时不留缝,否则 1px 的缝会把整格吃掉。
  const gap = cell >= 8 ? Math.max(1, Math.round(cell * 0.12)) : 0
  const side = cell - gap
  const ringW = cell >= 8 ? Math.max(1, Math.round(cell * 0.06)) : 0

  for (let y = 0; y < box.height; y++) {
    const row = template.pattern[box.y0 + y]
    if (!Array.isArray(row)) continue
    for (let x = 0; x < box.width; x++) {
      const color = row[box.x0 + x]
      if (!color) continue
      const px = x * cell + Math.floor(gap / 2)
      const py = y * cell + Math.floor(gap / 2)
      ctx.fillStyle = color
      ctx.fillRect(px, py, side, side)
      // 近白珠子在透明/白底上会「隐身」,补一圈淡描边(与缩略图一致)
      if (ringW > 0 && isNearWhite(color)) {
        ctx.strokeStyle = 'rgba(43, 36, 32, 0.28)'
        ctx.lineWidth = ringW
        const inset = ringW / 2
        ctx.strokeRect(px + inset, py + inset, Math.max(1, side - ringW), Math.max(1, side - ringW))
      }
    }
  }

  return { png: await canvas.encode('png'), width, height }
}
