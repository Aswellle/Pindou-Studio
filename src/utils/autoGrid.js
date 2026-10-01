// 画布尺寸自动匹配 — 根据图片内容（颜色丰富度 + 边缘密度）推荐合适的拼豆网格尺寸，
// 用户上传图片后无需再自行挑选尺寸。纯函数，DOM 无关（图片解码在组件侧完成）。

// 固定采样步长：把任意分辨率缩到约 ≤4096 个采样点，保证分析耗时亚毫秒级
const SAMPLE_TARGET = 4096

// 4-bit/通道量化键（4096 桶）— 仅供内容分析，不影响量化管线
function colorKey(r, g, b) {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
}

// 图片内容特征：唯一色比例、边缘密度、平坦度、肤色占比
export function analyzeImageContent({ data, width, height }) {
  const total = width * height
  const stride = Math.max(1, Math.floor(Math.sqrt(total / SAMPLE_TARGET)))
  const buckets = new Map()
  let samples = 0
  let edgeCount = 0
  let edgeChecks = 0
  let skinCount = 0

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const o = (y * width + x) * 4
      if (data[o + 3] < 5) continue
      const r = data[o], g = data[o + 1], b = data[o + 2]
      samples += 1
      buckets.set(colorKey(r, g, b), (buckets.get(colorKey(r, g, b)) || 0) + 1)

      if (x + stride < width && y + stride < height) {
        const oR = (y * width + x + stride) * 4
        const oD = ((y + stride) * width + x) * 4
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        const lumR = 0.2126 * data[oR] + 0.7152 * data[oR + 1] + 0.0722 * data[oR + 2]
        const lumD = 0.2126 * data[oD] + 0.7152 * data[oD + 1] + 0.0722 * data[oD + 2]
        edgeChecks += 1
        if (Math.abs(lum - lumR) > 24 || Math.abs(lum - lumD) > 24) edgeCount += 1
      }

      // YCbCr 肤色判据:人像照片的网格太小会糊成噪点,需要更大的默认尺寸
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
      if (r > 95 && g > 40 && b > 20 && mx > mn && Math.abs(r - g) > 15
        && cb > 77 && cb < 127 && cr > 133 && cr < 173) {
        skinCount += 1
      }
    }
  }

  if (samples === 0) samples = 1
  const counts = [...buckets.values()].sort((a, b) => b - a)
  let flatTop = 0
  for (let i = 0; i < Math.min(8, counts.length); i += 1) flatTop += counts[i]

  return {
    samples,
    uniqueColors: buckets.size,
    uniqueRatio: buckets.size / samples,
    edgeDensity: edgeChecks > 0 ? edgeCount / edgeChecks : 0,
    flatness: flatTop / samples,
    skinRatio: skinCount / samples
  }
}

// 按内容推荐长边：细节越丰富 → 网格越大（57 标准 / 87 大 / 114 超大 / 140 专业）
// 并按源图分辨率封顶（每颗豆至少约 2 源像素），小图不会被推荐成超大网格。
// sourceWidth/sourceHeight：组件侧传入的原始图片尺寸（采样画布可能已缩放到 ≤96px，
// 封顶与宽高比必须用原始尺寸，否则大图会被缩略图尺寸错误压小）
export function recommendGridSize({ data, width, height, sourceWidth, sourceHeight }) {
  const stats = analyzeImageContent({ data, width, height })
  const detailScore = stats.edgeDensity * 2 + Math.min(1, stats.uniqueRatio / 0.08)

  let longSide
  if (detailScore < 0.9) longSide = 57
  else if (detailScore < 1.6) longSide = 87
  else if (detailScore < 2.4) longSide = 114
  else longSide = 140

  const detailLong = longSide
  // 人像照片:小网格会把五官糊成噪点,长边至少 87(源分辨率封顶仍然生效)
  const flooredLong = stats.skinRatio >= 0.08 ? Math.max(detailLong, 87) : detailLong

  const srcW = sourceWidth || width
  const srcH = sourceHeight || height
  const sourceLong = Math.max(srcW, srcH)
  longSide = Math.max(29, Math.min(flooredLong, Math.round(sourceLong / 2)))

  const aspect = srcW / srcH
  const gridWidth = aspect >= 1 ? longSide : Math.max(9, Math.round(longSide * aspect))
  const gridHeight = aspect >= 1 ? Math.max(9, Math.round(longSide / aspect)) : longSide

  return { gridWidth, gridHeight, detailScore }
}

// 网格尺寸 → 建议颜色数（与 worker suggestColorsForGrid 同表，文档 §二十七：
// 32→8-16、64→16-32、100→24-48、150→32-64）
export function suggestMaxColorsForGrid(w, h) {
  const long = Math.max(w, h)
  if (long <= 40) return 12
  if (long <= 70) return 24
  if (long <= 110) return 36
  if (long <= 150) return 48
  return 64
}
