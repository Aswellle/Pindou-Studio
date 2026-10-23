/**
 * 画布交互性能基准(A12)
 *
 * 运行:node scripts/benchmark-interaction.mjs
 *
 * 为什么需要这个脚本:FUTURE_BACKLOG 的 A12 记录了「拖动 200×200 时的提交耗时」
 * 与「框选跟随帧率」没有数据 —— 既有 `benchmark.mjs` 只算 DPI 与 canvas 内存估算,
 * 不测任何一次真实交互。没有数字时,「200×200 会不会卡」只能靠猜。
 *
 * 测三件事:
 *   1. commitStroke 的提交成本 —— 一次手势结束时 pushHistory 要做一次
 *      JSON.stringify(整个矩阵),这是交互里唯一随网格面积线性增长的步骤;
 *   2. drawMarquee 的单帧成本 —— 它每帧都画,必须与网格大小无关(只画一个矩形);
 *   3. 选区批量命令(fill / mirror / rotate / move)在 200×200 上的耗时。
 *
 * 纯 Node 跑,不需要浏览器:被测的都是纯函数(selectionUtils / marquee / historyUtils),
 * 不碰 DOM。drawMarquee 用一个空实现的 2d context 代替 —— 测的是 JS 侧开销,
 * 不是 GPU 光栅化时间。
 */

import { fillSelection, mirrorSelection, rotateSelection, moveSelection, copySelection } from '../src/utils/selectionUtils.js'
import { drawMarquee } from '../src/utils/marquee.js'
import { pushHistory, undoHistory } from '../src/utils/historyUtils.js'

const GRIDS = [29, 57, 114, 200]
const ITERATIONS = { 29: 2000, 57: 1000, 114: 400, 200: 150 }
const WARMUP = 20

/** 造一块 n×n 网格,约 60% 的格子有颜色(接近真实图纸密度) */
function makeGrid(n) {
  const palette = ['#E53935', '#43A047', '#1E88E5', '#FDD835', '#8E24AA', null]
  const data = Array.from({ length: n }, () => Array(n))
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      data[y][x] = palette[(x * 7 + y * 13) % palette.length]
    }
  }
  return data
}

/** 一个什么都不做的 2d context:drawMarquee 只调这些方法 */
function stubCtx() {
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineDashOffset: 0,
    save() {}, restore() {}, beginPath() {}, closePath() {},
    fillRect() {}, strokeRect() {}, rect() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, setLineDash() {},
  }
}

/**
 * 跑 iterations 次,返回每次调用的中位耗时(ms)。
 *
 * 用中位数而不是平均值:第一次调用含 JIT 预热,平均值会被单次尖峰拉高,
 * 而我们要回答的是「稳态下每帧多贵」。
 */
function measure(fn, iterations) {
  for (let i = 0; i < WARMUP; i++) fn()
  const samples = new Array(iterations)
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint()
    fn()
    samples[i] = Number(process.hrtime.bigint() - t0) / 1e6
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

const fmt = (ms) => ms >= 1 ? `${ms.toFixed(2)} ms` : `${(ms * 1000).toFixed(0)} µs`

/**
 * 自检:确认被测函数真的干了活。
 *
 * 基准脚本最大的失败模式是「测了个空」—— 函数因参数不合法提前返回,
 * 得到漂亮但毫无意义的数字(move 全选时被钳成 0 偏移,一度只跑出 1µs)。
 * 这里先断言每个被测调用确实产生了变化,再开始计时。
 */
function assertWorkload() {
  const probe = makeGrid(20)
  const all = { x: 0, y: 0, w: 20, h: 20 }
  const checks = [
    ['fill', fillSelection(probe, all, '#123456', { includeEmpty: true }).changed > 0],
    ['mirrorH', mirrorSelection(probe, all, 'horizontal').changed > 0],
    ['rotateCw', rotateSelection(probe, all, 'cw').changed > 0],
    ['move', moveSelection(probe, { x: 0, y: 0, w: 15, h: 15 }, 2, 2).changed > 0],
    ['copy', copySelection(probe, all).block !== null],
    ['pushHistory', pushHistory([], -1, probe).history.length === 1],
    ['undoHistory', undoHistory([JSON.stringify(probe), JSON.stringify(probe)], 1) !== null],
  ]
  const dead = checks.filter(([, ok]) => !ok).map(([name]) => name)
  if (dead.length) {
    console.error(`\n❌ 基准自检失败,以下被测调用没有产生实际工作量:${dead.join(', ')}`)
    console.error('   数字将不可信。检查函数签名或参数是否变化。\n')
    process.exitCode = 1
    return false
  }
  return true
}

if (!assertWorkload()) process.exit(1)

console.log('=== 画布交互性能基准 ===')
console.log(`Node ${process.version} · 每项取中位数 · 预热 ${WARMUP} 次\n`)

// ── 1. 提交成本(一次手势 = 一次 pushHistory 快照)──────────────
console.log('--- 1. commitStroke:一次手势提交(含 JSON 快照)---')
const commitResults = []
for (const n of GRIDS) {
  const grid = makeGrid(n)
  let history = []
  let index = -1
  const ms = measure(() => {
    const r = pushHistory(history, index, grid)
    history = r.history
    index = r.historyIndex
    // 模拟历史满 50 条后的稳态:每次提交都要 shift 一次
    if (history.length >= 50) { history = history.slice(1); index-- }
  }, ITERATIONS[n])
  const bytes = JSON.stringify(grid).length
  commitResults.push({ n, ms })
  console.log(`  ${String(n).padStart(3)}×${String(n).padEnd(3)} → ${fmt(ms).padStart(9)}  (快照 ${(bytes / 1024).toFixed(0)} KB)`)
}

// ── 2. 选框绘制单帧成本 ──────────────────────────────────────
console.log('\n--- 2. drawMarquee:选框单帧绘制(应与网格大小无关)---')
const ctx = stubCtx()
const marqueeResults = []
for (const n of GRIDS) {
  // 选区取整块的 1/3,靠近真实使用
  const rect = { x: Math.floor(n / 3), y: Math.floor(n / 3), w: Math.floor(n / 3), h: Math.floor(n / 3) }
  const ms = measure(() => {
    drawMarquee(ctx, rect, { cellSize: 16, scale: 1, dashOffset: 0, handles: false, resizeHandles: true, snapEdges: { x: true, y: false } })
  }, ITERATIONS[n])
  marqueeResults.push({ n, ms })
  console.log(`  ${String(n).padStart(3)}×${String(n).padEnd(3)} → ${fmt(ms).padStart(9)}`)
}
const marqueeSpread = Math.max(...marqueeResults.map(r => r.ms)) - Math.min(...marqueeResults.map(r => r.ms))
console.log(`  网格 29 → 200 的差异:${fmt(marqueeSpread)}`)

// ── 3. 选区批量命令 ─────────────────────────────────────────
console.log('\n--- 3. 选区批量命令(200×200)---')
const big = makeGrid(200)
// 全选用于 fill/mirror/rotate/copy;move 必须留出偏移空间,
// 全选时 clampMove 会把偏移钳成 0 → 函数提前返回,测不到真实成本。
const full = { x: 0, y: 0, w: 200, h: 200 }
const inner = { x: 0, y: 0, w: 180, h: 180 }
const commands = [
  ['fill', () => fillSelection(big, full, '#123456', { includeEmpty: true })],
  ['mirrorH', () => mirrorSelection(big, full, 'horizontal')],
  ['rotateCw', () => rotateSelection(big, full, 'cw')],
  ['move 180²', () => moveSelection(big, inner, 5, 5)],
  ['copy 全选', () => copySelection(big, full)],
]
for (const [name, fn] of commands) {
  const ms = measure(fn, 100)
  console.log(`  ${name.padEnd(9)} → ${fmt(ms).padStart(9)}`)
}

// ── 4. 撤销/重做(JSON.parse 回放)────────────────────────────
console.log('\n--- 4. undo / redo:一次快照回放 ---')
for (const n of GRIDS) {
  const grid = makeGrid(n)
  const history = [JSON.stringify(grid)]
  const ms = measure(() => undoHistory([...history, JSON.stringify(grid)], 1), ITERATIONS[n])
  console.log(`  ${String(n).padStart(3)}×${String(n).padEnd(3)} → ${fmt(ms).padStart(9)}`)
}

// ── 结论 ────────────────────────────────────────────────────
console.log('\n=== 判定 ===')
const worstCommit = commitResults.find(r => r.n === 200)
// 16.7ms = 60fps 一帧的预算。提交发生在松手瞬间,不在拖动过程中,
// 因此只要它低于一帧预算,用户就不会感知到卡顿。
console.log(`200×200 提交耗时 ${fmt(worstCommit.ms)} → ${worstCommit.ms < 16.7 ? '✅ 低于一帧预算(16.7ms)' : '⚠ 超过一帧预算'}`)
console.log(`选框绘制跨网格差异 ${fmt(marqueeSpread)} → ${marqueeSpread < 0.5 ? '✅ 与网格大小无关' : '⚠ 随网格增长'}`)
console.log('\n注:以上为 Node 下的 JS 侧开销。浏览器里 canvas 光栅化另有时序成本,')
console.log('    但 drawMarquee 只画一个矩形,与网格面积无关;提交成本才是唯一随尺寸线性增长的项。')
