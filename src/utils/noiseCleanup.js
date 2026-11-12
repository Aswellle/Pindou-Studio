/**
 * noiseCleanup — 编辑器手动去噪(纯函数)。
 *
 * 背景:量化管线的去噪(isolated/checkerboard/tiny-islands)只在图片转换时
 * 自动执行一次;用户在编辑器里逐格修改后,新的杂色豆没有再次清理的入口。
 * 这个纯函数把「清理」做成一次用户命令:同步计算、一次生效、不级联 ——
 * 每个格子的判定都用**原始矩阵**,不会出现「清掉 A 后 B 又变成孤立点被
 * 连锁清掉」的不可预期结果;想清两轮就按两次按钮(各有撤销)。
 *
 * 规则(与量化 worker 的孤立豆口径同族,但更保守):
 *   - 孤立点:八邻全空 → 清除。四邻空但对角有珠(对角线尾巴)**保留**,
 *     否则斜线的过渡像素会被误删;
 *   - 杂色点:四邻全有珠且无同色 → 改为邻居中的主色(平票取扫描序第一个)。
 *     四邻有空格的情况不动 —— 那多半是图案真实的边缘/镂空,不是噪点;
 *   - 范围:传入 selection 时只处理选区内(掩码按格判定,矩形取外接框),
 *     未选中时处理全图;点选/套索的异形选区天然支持。
 *
 * 返回与 selectionUtils/lassoCommands 同款约定:{ data, changed },
 * 没有任何变化时 data 为 null,调用方不压撤销栈;入参永不修改。
 */

function selectionMask(area, cols, rows) {
  if (!area) return null
  if (area.kind === 'lasso' && area.mask && area.cols === cols && area.rows === rows) {
    return area.mask
  }
  if (typeof area.x === 'number' && typeof area.w === 'number') {
    const mask = new Uint8Array(cols * rows)
    const x1 = Math.min(cols, area.x + area.w)
    const y1 = Math.min(rows, area.y + area.h)
    for (let y = Math.max(0, area.y); y < y1; y++) {
      for (let x = Math.max(0, area.x); x < x1; x++) {
        mask[y * cols + x] = 1
      }
    }
    return mask
  }
  return null
}

/**
 * 清理杂色豆。
 *
 * @param {Array<Array<string|null>>} data - 画布矩阵(#RRGGBB 或 null)
 * @param {{area?: object}} [opts] - area 传当前选区(null = 全图)
 * @returns {{data: Array<Array<string|null>>|null, changed: number}}
 */
export function removeNoiseBeads(data, { area = null } = {}) {
  if (!Array.isArray(data) || data.length === 0) return { data: null, changed: 0 }
  const rows = data.length
  const cols = Array.isArray(data[0]) ? data[0].length : 0
  if (!cols) return { data: null, changed: 0 }

  const mask = selectionMask(area, cols, rows)
  const at = (x, y) => (x >= 0 && x < cols && y >= 0 && y < rows ? data[y][x] : null)
  const inArea = (x, y) => (!mask || mask[y * cols + x] === 1)

  const next = data.map(row => [...row])
  let changed = 0

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cur = data[y][x]
      if (!cur || !inArea(x, y)) continue

      const n4 = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)]
      const n8 = [
        ...n4,
        at(x - 1, y - 1), at(x + 1, y - 1),
        at(x - 1, y + 1), at(x + 1, y + 1),
      ]
      const filled4 = n4.filter(Boolean)
      const filled8 = n8.filter(Boolean)

      // undefined = 「这格不动」;null = 清空;字符串 = 换成主色
      let replacement
      if (filled8.length === 0) {
        replacement = null
      } else if (filled4.length === 4 && !filled4.includes(cur)) {
        const counts = new Map()
        for (const c of filled4) counts.set(c, (counts.get(c) || 0) + 1)
        let best = null
        let bestN = 0
        for (const [color, n] of counts) {
          if (n > bestN) {
            best = color
            bestN = n
          }
        }
        replacement = best
      }

      if (replacement !== undefined && replacement !== cur) {
        next[y][x] = replacement
        changed++
      }
    }
  }

  return changed ? { data: next, changed } : { data: null, changed: 0 }
}
