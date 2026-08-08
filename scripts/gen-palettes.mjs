/**
 * 从 HansBug/pindou-color-data 生成项目格式的 MARD/COCO 色卡数据(一次性工具)。
 * 数据源:D:/Chrome_Downloads/AI_Coding/8.Pindou/pindou-color-data(已克隆)
 * 源格式:{ code, hex, rgb: [r,g,b], group, source }(无色名,名称即色号)
 * 输出:src/data/palettes/mard.js(MARD 221 + MARD 291)、coco.js(COCO 291)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = 'D:/Chrome_Downloads/AI_Coding/8.Pindou/pindou-color-data'
const OUT = path.join(__dirname, '..', 'src', 'data', 'palettes')

function load(srcId) {
  return JSON.parse(fs.readFileSync(path.join(SRC, srcId, 'colors.json'), 'utf8'))
}

/**
 * 生成单个 palette 的 JS 源码块(含唯一变量名的 colors 数组 + export)
 */
function genPaletteBlock(srcId, varName, paletteId, name, nameZh, origin, beadSize, beadSizeLabel, website) {
  const data = load(srcId)
  const lines = data.colors.map(c => {
    const id = c.code
    const hex = c.hex.toUpperCase()
    // 校验 hex 与 rgb 一致
    const r = c.rgb[0], g = c.rgb[1], b = c.rgb[2]
    const hexR = parseInt(hex.slice(1, 3), 16)
    const hexG = parseInt(hex.slice(3, 5), 16)
    const hexB = parseInt(hex.slice(5, 7), 16)
    if (hexR !== r || hexG !== g || hexB !== b) {
      console.warn(`  ⚠ ${id}: hex ${hex} 与 rgb [${r},${g},${b}] 不一致`)
    }
    return `    { id: '${id}', name: '${id}', nameZh: '${id}', hex: '${hex}', rgb: { r: ${r}, g: ${g}, b: ${b} }, category: '${c.group}' },`
  })
  return `// ${nameZh} — 数据源:HansBug/pindou-color-data(${srcId})
// 官方色号/色值(hex/rgb 已清洗核对),名称即色号(公开数据无色名)

const ${varName}Colors = [
${lines.join('\n')}
]

export const ${varName} = {
  id: '${paletteId}',
  name: '${name}',
  nameZh: '${nameZh}',
  origin: '${origin}',
  beadSize: ${beadSize},
  beadSizeLabel: '${beadSizeLabel}',
  colorCount: ${data.count},
  website: '${website}',
  colors: ${varName}Colors,
}
`
}

fs.mkdirSync(OUT, { recursive: true })

// MARD 221(标准,默认)
const mard = genPaletteBlock(
  'mard-221-github', 'MARD_PALETTE', 'mard', 'MARD', 'MARD 拼豆',
  '中国', 5, '中颗粒 (5mm)', 'https://github.com/HansBug/pindou-color-data'
)
// MARD 291(完整)
const mard291 = genPaletteBlock(
  'mard-291-github', 'MARD291_PALETTE', 'mard291', 'MARD 291', 'MARD 291 拼豆',
  '中国', 5, '中颗粒 (5mm)', 'https://github.com/HansBug/pindou-color-data'
)
// COCO 291
const coco = genPaletteBlock(
  'coco-291', 'COCO_PALETTE', 'coco', 'COCO', 'COCO 拼豆',
  '中国', 2.6, '小颗粒 (2.6mm)', 'https://github.com/HansBug/pindou-color-data'
)

fs.writeFileSync(path.join(OUT, 'mard.js'), mard + '\n' + mard291)
fs.writeFileSync(path.join(OUT, 'coco.js'), coco)
console.log('已生成:')
console.log('  src/data/palettes/mard.js (MARD 221 + MARD 291)')
console.log('  src/data/palettes/coco.js (COCO 291)')
