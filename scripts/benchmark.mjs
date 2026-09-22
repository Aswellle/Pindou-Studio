/**
 * Benchmark — Pindou Studio 性能基准
 *
 * 运行方式: node scripts/benchmark.mjs
 *
 * 记录 DPI/物理尺寸基准（内联计算，不依赖 Worker 环境）
 */

// 内联 createDPICanvas 核心逻辑（避免导入 BeadPatternExporter.js 的 i18n 依赖）
function createDPICanvas(logicalW, logicalH, dpi = 300) {
  const MAX_AREA = 268_000_000
  const BEAD_SIZE_MM = 2.6
  const targetScale = dpi / 72
  let scale = Math.max(1, Math.round(targetScale))

  while (scale >= 1) {
    const w = logicalW * scale
    const h = logicalH * scale
    if (w * h <= MAX_AREA) return { scale, dpi: Math.round(scale * 72) }
    scale = scale >= 3 ? 2 : 1
  }
  return { scale: 1, dpi: 72 }
}

function calculatePhysicalSize(gridW, gridH, beadSizeMm = 2.6) {
  return {
    widthMm: Math.round(gridW * beadSizeMm * 10) / 10,
    heightMm: Math.round(gridH * beadSizeMm * 10) / 10,
    widthInch: Math.round((gridW * beadSizeMm / 25.4) * 100) / 100,
    heightInch: Math.round((gridH * beadSizeMm / 25.4) * 100) / 100,
  }
}

console.log('=== Pindou Studio Performance Benchmark ===')

const grids = [29, 57, 87, 114, 140, 170, 200]
console.log('\n--- DPI & Physical Size ---')
for (const size of grids) {
  const cellSize = 28
  for (const dpi of [144, 300, 600]) {
    const { scale, dpi: actualDpi } = createDPICanvas(size * cellSize, size * cellSize, dpi)
    const phys = calculatePhysicalSize(size, size)
    console.log(`  ${size}×${size} @ ${dpi}DPI → scale=${scale} (${actualDpi}DPI), phys=${phys.widthMm}×${phys.heightMm}mm`)
  }
}

console.log('\n--- Memory Estimation (Canvas RGBA) ---')
for (const size of grids) {
  for (const scale of [1, 2, 3]) {
    const w = size * 28 * scale
    const mb = (w * w * 4 / 1024 / 1024).toFixed(1)
    const over = w * w > 268_000_000 ? ' ⚠超限' : ''
    console.log(`  ${size}×${size} scale=${scale} → ${mb} MB${over}`)
  }
}

console.log('\n=== Complete ===')
