/**
 * 生成 8 个云端模板库预设模板 JSON(统一拼豆模板协议)。
 * 图案为原创像素画,程序化绘制(圆/椭圆/矩形组合,29×29 标准 pegboard)。
 * 输出到 verify-output/templates/*.json,可在后台 AdminPanel JSON 导入。
 *
 * 协议:
 * { name, nameZh, category: animal|food|icon|holiday, difficulty: easy|medium|hard,
 *   pattern: [[null|'#RRGGBB', ...], ...] }   // colors/size 自动派生,不必提供
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'verify-output', 'templates')

const SIZE = 29

// ── 像素绘制库 ──────────────────────────────────────────────
const blank = () => Array.from({ length: SIZE }, () => Array(SIZE).fill('.'))
function fillCircle(g, cx, cy, r, ch) {
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.5) g[y][x] = ch
}
function fillEllipse(g, cx, cy, rx, ry, ch) {
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) g[y][x] = ch
}
function fillRect(g, x0, y0, x1, y1, ch) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (y >= 0 && y < SIZE && x >= 0 && x < SIZE) g[y][x] = ch
}

function toTemplate({ name, nameZh, category, difficulty, palette, grid }) {
  const pattern = grid.map(row => row.map(ch => (ch === '.' ? null : palette[ch])))
  // 校验:每格必须是合法 hex 或 null
  for (const row of pattern)
    for (const cell of row)
      if (cell !== null && !/^#[0-9A-F]{6}$/.test(cell))
        throw new Error(`${name}: 非法颜色 ${cell}`)
  return { name, nameZh, category, difficulty, pattern }
}

const templates = []

// ── 1. 柴犬 Shiba ───────────────────────────────────────────
{
  const g = blank()
  fillEllipse(g, 14, 17, 13, 11, 'O')          // 头(橙)
  fillCircle(g, 5, 6, 5, 'D')                  // 左耳(深棕)
  fillCircle(g, 23, 6, 5, 'D')                 // 右耳
  fillCircle(g, 5, 7, 3, 'O')                  // 左耳内
  fillCircle(g, 23, 7, 3, 'O')                 // 右耳内
  fillEllipse(g, 14, 19, 9, 8, 'W')            // 白口鼻罩(覆盖眼区)
  fillCircle(g, 10, 15, 2, 'B')                // 左眼
  fillCircle(g, 18, 15, 2, 'B')                // 右眼
  fillCircle(g, 14, 20, 2, 'B')                // 鼻
  fillRect(g, 14, 21, 14, 23, 'B')             // 嘴线
  fillCircle(g, 13, 24, 1, 'B')                // 嘴角
  fillCircle(g, 15, 24, 1, 'B')
  templates.push(toTemplate({
    name: 'Shiba', nameZh: '柴犬', category: 'animal', difficulty: 'medium',
    palette: { D: '#8B5A2B', O: '#C8833B', W: '#FDF6EC', B: '#2B2B2B' },
    grid: g,
  }))
}

// ── 2. 柯基 Corgi ───────────────────────────────────────────
{
  const g = blank()
  fillEllipse(g, 14, 18, 12, 10, 'O')          // 头(橙)
  fillRect(g, 12, 4, 16, 13, 'W')              // 额头白条(柯基标志)
  fillCircle(g, 4, 8, 5, 'O')                  // 左大耳
  fillCircle(g, 24, 8, 5, 'O')                 // 右大耳
  fillCircle(g, 4, 9, 3, 'D')                  // 耳内深
  fillCircle(g, 24, 9, 3, 'D')
  fillCircle(g, 10, 16, 2, 'B')                // 左眼
  fillCircle(g, 18, 16, 2, 'B')                // 右眼
  fillEllipse(g, 14, 22, 7, 5, 'W')            // 口鼻白
  fillCircle(g, 14, 21, 2, 'B')                // 鼻
  fillRect(g, 14, 22, 14, 24, 'B')             // 嘴线
  fillCircle(g, 13, 24, 1, 'B')
  fillCircle(g, 15, 24, 1, 'B')
  templates.push(toTemplate({
    name: 'Corgi', nameZh: '柯基', category: 'animal', difficulty: 'medium',
    palette: { O: '#E8A13C', D: '#C87D2B', W: '#FDF6EC', B: '#2B2B2B' },
    grid: g,
  }))
}

// ── 3. 企鹅 Penguin ─────────────────────────────────────────
{
  const g = blank()
  fillEllipse(g, 14, 19, 11, 13, 'N')          // 背(蓝灰)
  fillEllipse(g, 14, 22, 7, 8, 'W')            // 腹(白)
  fillCircle(g, 10, 12, 2.5, 'W')              // 左眼白
  fillCircle(g, 18, 12, 2.5, 'W')              // 右眼白
  fillCircle(g, 10, 12, 1.3, 'B')              // 左瞳孔
  fillCircle(g, 18, 12, 1.3, 'B')
  fillRect(g, 12, 16, 16, 18, 'O')             // 嘴(橙)
  fillRect(g, 6, 19, 22, 20, 'R')              // 围巾
  fillRect(g, 12, 20, 16, 23, 'R')             // 围巾垂下
  fillCircle(g, 12, 24, 1, 'R')                // 围巾穗
  fillCircle(g, 14, 24, 1, 'R')
  fillCircle(g, 16, 24, 1, 'R')
  templates.push(toTemplate({
    name: 'Penguin', nameZh: '企鹅', category: 'animal', difficulty: 'medium',
    palette: { N: '#4A6FA5', W: '#FDF6EC', B: '#2B2B2B', O: '#F9A825', R: '#E57373' },
    grid: g,
  }))
}

// ── 4. 独角兽 Unicorn ───────────────────────────────────────
{
  const g = blank()
  for (let i = 0; i < 7; i++)                  // 角(黄,自下而上收窄)
    fillRect(g, 14 - Math.floor(i / 2), 1 + i, 14 + Math.floor(i / 2), 1 + i, 'Y')
  fillRect(g, 3, 6, 4, 18, 'M')                // 鬃毛(紫)
  fillRect(g, 5, 8, 6, 18, 'P')                // 鬃毛(粉)
  fillRect(g, 7, 10, 8, 18, 'C')               // 鬃毛(青)
  fillEllipse(g, 14, 20, 10, 9, 'W')           // 脸(白)
  fillCircle(g, 11, 18, 2, 'B')                // 左眼
  fillCircle(g, 17, 18, 2, 'B')                // 右眼
  fillCircle(g, 14, 23, 1.5, 'P')              // 鼻(粉)
  templates.push(toTemplate({
    name: 'Unicorn', nameZh: '独角兽', category: 'animal', difficulty: 'medium',
    palette: { Y: '#FFD54F', W: '#FDF6EC', M: '#B39DDB', P: '#F4A7B9', C: '#4FC3F7', B: '#2B2B2B' },
    grid: g,
  }))
}

// ── 5. 桃子猫 Peach Cat ─────────────────────────────────────
{
  const g = blank()
  fillRect(g, 14, 0, 14, 3, 'G')               // 梗
  fillCircle(g, 14, 3, 3, 'G')                 // 叶
  fillCircle(g, 7, 7, 5, 'P')                  // 左耳(粉)
  fillCircle(g, 21, 7, 5, 'P')                 // 右耳
  fillCircle(g, 7, 8, 3, 'D')                  // 左耳内(深粉)
  fillCircle(g, 21, 8, 3, 'D')                 // 右耳内
  fillCircle(g, 14, 16, 11, 'P')               // 头(大圆)
  fillRect(g, 9, 14, 12, 15, 'B')              // 左眯眯眼
  fillRect(g, 17, 14, 20, 15, 'B')             // 右眯眯眼
  fillCircle(g, 6, 19, 2, 'D')                 // 左腮红
  fillCircle(g, 22, 19, 2, 'D')                // 右腮红
  fillCircle(g, 14, 20, 1.5, 'B')              // 嘴
  templates.push(toTemplate({
    name: 'Peach Cat', nameZh: '桃子猫', category: 'animal', difficulty: 'medium',
    palette: { P: '#F8BBD0', D: '#E57373', B: '#2B2B2B', G: '#81C784' },
    grid: g,
  }))
}

// ── 6. 小幽灵 Ghost ─────────────────────────────────────────
{
  const g = blank()
  fillCircle(g, 14, 9, 9, 'W')                 // 头顶圆
  fillRect(g, 5, 9, 23, 24, 'W')               // 身体
  fillCircle(g, 9, 25, 4, 'W')                 // 底部波浪
  fillCircle(g, 14, 25, 4, 'W')
  fillCircle(g, 19, 25, 4, 'W')
  fillCircle(g, 10, 14, 2.5, 'B')              // 左眼
  fillCircle(g, 18, 14, 2.5, 'B')              // 右眼
  fillCircle(g, 6, 18, 2, 'P')                 // 左腮红
  fillCircle(g, 22, 18, 2, 'P')                // 右腮红
  templates.push(toTemplate({
    name: 'Ghost', nameZh: '小幽灵', category: 'holiday', difficulty: 'medium',
    palette: { W: '#E8EAF6', B: '#2B2B2B', P: '#F4A7B9' },
    grid: g,
  }))
}

// ── 7. 寿司 Sushi ───────────────────────────────────────────
{
  const g = blank()
  fillRect(g, 4, 10, 24, 14, 'R')              // 鲑鱼(红)
  fillRect(g, 4, 14, 24, 22, 'W')              // 饭(白)
  fillRect(g, 4, 22, 24, 23, 'B')              // 海苔(黑)
  fillCircle(g, 8, 12, 1, 'O')                 // 鱼子(橙)
  fillCircle(g, 12, 12, 1, 'O')
  fillCircle(g, 16, 12, 1, 'O')
  fillCircle(g, 20, 12, 1, 'O')
  fillCircle(g, 10, 13, 1, 'O')
  fillCircle(g, 18, 13, 1, 'O')
  templates.push(toTemplate({
    name: 'Sushi', nameZh: '寿司', category: 'food', difficulty: 'medium',
    palette: { R: '#E57373', W: '#FDF6EC', B: '#2B2B2B', O: '#F9A825' },
    grid: g,
  }))
}

// ── 8. 彩虹云 Rainbow Cloud ──────────────────────────────────
{
  const g = blank()
  fillCircle(g, 9, 10, 5, 'W')                 // 云(白圆组合)
  fillCircle(g, 14, 8, 6, 'W')
  fillCircle(g, 19, 10, 5, 'W')
  fillRect(g, 4, 10, 24, 15, 'W')
  fillRect(g, 3, 16, 25, 17, 'R')              // 彩虹(6 色横条)
  fillRect(g, 4, 18, 24, 19, 'O')
  fillRect(g, 5, 20, 23, 21, 'Y')
  fillRect(g, 6, 22, 22, 23, 'G')
  fillRect(g, 7, 24, 21, 25, 'C')
  fillRect(g, 8, 26, 20, 27, 'M')
  templates.push(toTemplate({
    name: 'Rainbow Cloud', nameZh: '彩虹云', category: 'icon', difficulty: 'medium',
    palette: { W: '#FDF6EC', R: '#E57373', O: '#F9A825', Y: '#FFD54F', G: '#81C784', C: '#4FC3F7', M: '#B39DDB' },
    grid: g,
  }))
}

// ── 输出 ────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true })
for (const t of templates) {
  const file = path.join(OUT_DIR, `${t.nameZh}.json`)
  fs.writeFileSync(file, JSON.stringify(t, null, 2))
  const colors = new Set(t.pattern.flat().filter(Boolean))
  console.log(`✓ ${t.nameZh} (${t.name}): ${t.pattern.length}×${t.pattern[0].length}, ${t.difficulty}, ${colors.size} 色`)
}
console.log(`\n已输出 ${templates.length} 个模板到 ${OUT_DIR}`)
