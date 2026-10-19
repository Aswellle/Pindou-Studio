/**
 * pointerMapping — canvas 显示坐标 → 位图坐标(纯函数)
 *
 * 为什么需要:结果预览与原图预览都用 `width:100%; max-height:420px; object-fit:contain`,
 * 非正方形图纸在元素框内会**居中留白**(竖版左右留白、横版上下留白)。若直接按元素矩形
 * 线性换算,点击会偏移若干格 —— 竖版 29×57 的图纸实测点同一位置会差 7 列,逐格修正会改错格。
 *
 * 这里显式复算 contain 的渲染几何,只把落在内容区内的点换算成位图坐标;
 * 落在留白里的点返回 null,由调用方忽略。
 */

/**
 * 计算 `object-fit: contain` 下内容在元素框内的实际渲染矩形。
 * @param {{left:number, top:number, width:number, height:number}} rect - 元素 getBoundingClientRect()
 * @param {number} contentWidth - 位图宽
 * @param {number} contentHeight - 位图高
 * @returns {{x:number, y:number, width:number, height:number}}
 */
export function containRect(rect, contentWidth, contentHeight) {
  if (!(contentWidth > 0) || !(contentHeight > 0)) {
    return { x: rect.left, y: rect.top, width: 0, height: 0 }
  }
  const scale = Math.min(rect.width / contentWidth, rect.height / contentHeight)
  const width = contentWidth * scale
  const height = contentHeight * scale
  return {
    x: rect.left + (rect.width - width) / 2,
    y: rect.top + (rect.height - height) / 2,
    width,
    height,
  }
}

/**
 * 客户端坐标 → 位图坐标。
 *
 * @param {number} clientX
 * @param {number} clientY
 * @param {{left:number, top:number, width:number, height:number}} rect
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {{clamp?: boolean}} [options] - clamp:把留白区/越界的点夹到最近的边缘,
 *   用于拖框这类「起点可以略超出图片」的交互;默认 false 时返回 null
 * @returns {{x:number, y:number}|null} 点在留白区或几何退化时返回 null(未开启 clamp)
 */
export function clientToCanvasPoint(clientX, clientY, rect, canvasWidth, canvasHeight, options = {}) {
  const box = containRect(rect, canvasWidth, canvasHeight)
  if (!(box.width > 0) || !(box.height > 0)) return null
  let x = ((clientX - box.x) / box.width) * canvasWidth
  let y = ((clientY - box.y) / box.height) * canvasHeight
  if (options.clamp) {
    x = x < 0 ? 0 : x > canvasWidth ? canvasWidth : x
    y = y < 0 ? 0 : y > canvasHeight ? canvasHeight : y
    return { x, y }
  }
  if (x < 0 || y < 0 || x > canvasWidth || y > canvasHeight) return null
  return { x, y }
}
