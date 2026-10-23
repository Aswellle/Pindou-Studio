import { describe, it, expect } from 'vitest'
import {
  OG_CARD_WIDTH,
  OG_CARD_HEIGHT,
  OG_CARD_MAX_COLORS,
  brandLabel,
  ogCardPath,
  patternContentHash,
  fitPatternBox,
  pickSwatches,
  defaultMeasure,
  wrapLines,
  planPatternCard,
} from './ogCard'

/**
 * 分享卡片的布局规划。
 *
 * 绘制本身依赖原生 canvas,跑不进 jsdom,但**算错的代价在绘制之前就已经确定**:
 * 图案缩出边界、标题溢出右栏、色卡压到页脚。这些几何决策全在 planPatternCard
 * 里,所以测试集中在这一层。
 *
 * 字体度量注入成确定性的假函数:真实 measureText 的返回值随字体版本浮动,
 * 拿它做断言会让测试在换字体时无端变红。假度量按「全角 1em、其余 0.5em」
 * 估算,足以覆盖折行与截断逻辑。
 */

/** 确定性假度量:每个字符 0.5em,够用来验证宽度约束是否生效 */
const halfEm = (text, { fontSize }) => [...String(text)].length * fontSize * 0.5

/** 全角度量:每个字符 1em */
const fullEm = (text, { fontSize }) => [...String(text)].length * fontSize

function duck(overrides = {}) {
  return {
    id: 'tpl-1',
    name: 'Duck',
    nameZh: '小鸭',
    paletteId: 'perler',
    pattern: [['#FFD700', '#FFD700'], ['#000000', null]],
    ...overrides,
  }
}

describe('brandLabel', () => {
  it('已知品牌返回展示名', () => {
    expect(brandLabel('coco')).toBe('COCO')
    expect(brandLabel('mard291')).toBe('MARD 291')
    expect(brandLabel('artkal')).toBe('Artkal')
  })

  it('未知或缺失的品牌退回 perler(与模板默认值一致)', () => {
    expect(brandLabel(undefined)).toBe('Perler')
    expect(brandLabel('nope')).toBe('Perler')
  })
})

describe('patternContentHash', () => {
  it('相同内容哈希稳定', () => {
    expect(patternContentHash(duck())).toBe(patternContentHash(duck()))
  })

  it('名称变化会改变哈希(卡片 URL 随之变化,社交平台才会重抓)', () => {
    expect(patternContentHash(duck())).not.toBe(patternContentHash(duck({ nameZh: '小鸭2' })))
  })

  it('图案单格变化会改变哈希', () => {
    const a = duck()
    const b = duck()
    b.pattern[0][0] = '#000001'
    expect(patternContentHash(a)).not.toBe(patternContentHash(b))
  })

  it('调色板变化会改变哈希(色卡标签画在卡片上)', () => {
    expect(patternContentHash(duck())).not.toBe(patternContentHash(duck({ paletteId: 'coco' })))
  })

  it('分段哈希:[ab,c] 与 [a,bc] 不碰撞', () => {
    const a = duck({ pattern: [['ab', 'c']] })
    const b = duck({ pattern: [['a', 'bc']] })
    expect(patternContentHash(a)).not.toBe(patternContentHash(b))
  })

  it('null 与字符串 "null" 不碰撞', () => {
    const a = duck({ pattern: [[null, '#FFF']] })
    const b = duck({ pattern: [['null', '#FFF']] })
    expect(patternContentHash(a)).not.toBe(patternContentHash(b))
  })

  it('哈希是定长的短字符串,可直接进文件名', () => {
    const h = patternContentHash(duck())
    expect(h).toMatch(/^[0-9a-z]{7}$/)
  })
})

describe('ogCardPath', () => {
  it('路径含 id 与哈希,便于内容变化后换 URL', () => {
    expect(ogCardPath('abc', 'h123456')).toBe('/og/pattern/abc-h123456.png')
  })

  it('id 里的特殊字符被编码(不破坏路径结构)', () => {
    expect(ogCardPath('a/b', 'h')).toBe('/og/pattern/a%2Fb-h.png')
  })
})

describe('fitPatternBox', () => {
  const box = { x: 48, y: 48, w: 534, h: 534 }

  it('正方形图案铺满短边并居中', () => {
    const fit = fitPatternBox(48, 48, box)
    expect(fit.cell).toBe(11) // floor(534/48)
    expect(fit.gridW).toBe(528)
    expect(fit.gridH).toBe(528)
    // 居中:两侧各留 3px
    expect(fit.gridX).toBe(48 + 3)
    expect(fit.gridY).toBe(48 + 3)
  })

  it('长条图案按长边缩放,另一维居中', () => {
    // 200 宽 20 高:宽度是限制项
    const fit = fitPatternBox(20, 200, box)
    expect(fit.cell).toBe(2) // floor(534/200)
    expect(fit.gridW).toBe(400)
    expect(fit.gridH).toBe(40)
    expect(fit.gridX).toBe(48 + Math.round((534 - 400) / 2))
    expect(fit.gridY).toBe(48 + Math.round((534 - 40) / 2))
  })

  it('格子至少 1px,极端长宽比不会缩成 0', () => {
    const fit = fitPatternBox(1, 5000, box)
    expect(fit.cell).toBe(1)
  })

  it('图案不超出给定区域', () => {
    for (const [rows, cols] of [[1, 1], [7, 93], [200, 200], [3, 199]]) {
      const fit = fitPatternBox(rows, cols, box)
      expect(fit.gridW).toBeLessThanOrEqual(box.w)
      expect(fit.gridH).toBeLessThanOrEqual(box.h)
      expect(fit.gridX).toBeGreaterThanOrEqual(box.x)
      expect(fit.gridY).toBeGreaterThanOrEqual(box.y)
    }
  })

  it('空图案不崩溃,返回 0 尺寸', () => {
    expect(fitPatternBox(0, 0, box)).toMatchObject({ cell: 0, gridW: 0, gridH: 0 })
  })
})

describe('pickSwatches', () => {
  it('不超过上限时全部展示', () => {
    const stats = { list: [{ hex: '#a', count: 3 }, { hex: '#b', count: 2 }] }
    const r = pickSwatches(stats, 12)
    expect(r.shown).toHaveLength(2)
    expect(r.omitted).toBe(0)
  })

  it('超过上限时截断并报告省略数量', () => {
    const list = Array.from({ length: 25 }, (_, i) => ({ hex: `#${i}`, count: 25 - i }))
    const r = pickSwatches({ list }, 12)
    expect(r.shown).toHaveLength(12)
    expect(r.omitted).toBe(13)
    // 保留的是颗数最多的前 12 种(调用方已按降序传入)
    expect(r.shown[0].count).toBe(25)
  })

  it('缺失 stats 时返回空,不崩溃', () => {
    expect(pickSwatches(null, 12)).toEqual({ shown: [], omitted: 0 })
    expect(pickSwatches({}, 12)).toEqual({ shown: [], omitted: 0 })
  })
})

describe('wrapLines', () => {
  it('放得下时不折行', () => {
    expect(wrapLines('小鸭', { maxWidth: 500, fontSize: 50, measure: fullEm })).toEqual(['小鸭'])
  })

  it('放不下时按宽度折行', () => {
    // 每字 50px,宽度 150 → 每行 3 字
    const lines = wrapLines('一二三四五六七', { maxWidth: 150, fontSize: 50, measure: fullEm, maxLines: 3 })
    expect(lines[0]).toBe('一二三')
    expect(lines[1]).toBe('四五六')
  })

  it('超过 maxLines 时最后一行加省略号,且不超宽', () => {
    const lines = wrapLines('一二三四五六七八九十', {
      maxWidth: 150, fontSize: 50, measure: fullEm, maxLines: 2,
    })
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
    for (const line of lines) {
      expect(fullEm(line, { fontSize: 50 })).toBeLessThanOrEqual(150)
    }
  })

  it('单个字符就超宽时也吞掉它,不会死循环', () => {
    // 每字 50px 而宽度只有 10px:每行只能放一个字符
    const lines = wrapLines('一二三', { maxWidth: 10, fontSize: 50, measure: fullEm, maxLines: 3 })
    expect(lines).toEqual(['一', '二', '三'])
  })

  it('空白压缩后为空时返回空数组', () => {
    expect(wrapLines('   ', { maxWidth: 100, fontSize: 20, measure: fullEm })).toEqual([])
    expect(wrapLines(null, { maxWidth: 100, fontSize: 20, measure: fullEm })).toEqual([])
  })

  it('中英混排按真实宽度折行(中文占两倍)', () => {
    // "小鸭Duck" = 2 全角 + 4 半角。用 halfEm 时每字符等宽,
    // 用 defaultMeasure 时中文更宽 —— 两种度量下都必须不超宽
    const measure = defaultMeasure
    const lines = wrapLines('小鸭DuckDuckDuck', {
      maxWidth: 120, fontSize: 40, measure, maxLines: 3,
    })
    for (const line of lines) {
      expect(measure(line, { fontSize: 40 })).toBeLessThanOrEqual(120)
    }
  })
})

describe('planPatternCard', () => {
  it('产出 1200×630 的规划(与 index.html 的 og:image 声明一致)', () => {
    const plan = planPatternCard(duck(), { measure: halfEm })
    expect(plan.width).toBe(OG_CARD_WIDTH)
    expect(plan.height).toBe(OG_CARD_HEIGHT)
    expect([plan.width, plan.height]).toEqual([1200, 630])
  })

  it('标题、尺寸、豆数、用色数都进了规划', () => {
    const plan = planPatternCard(duck(), { measure: halfEm })
    expect(plan.title.lines).toEqual(['小鸭'])
    expect(plan.meta.text).toBe('2 × 2')
    expect(plan.stats.text).toBe('3 颗豆子 · 2 种颜色')
    expect(plan.swatchLabel.text).toBe('色卡 · Perler')
  })

  it('所有元素落在画布内(不会画出边界)', () => {
    const plan = planPatternCard(duck(), { measure: halfEm })
    const pv = plan.preview
    expect(pv.x).toBeGreaterThanOrEqual(0)
    expect(pv.y).toBeGreaterThanOrEqual(0)
    expect(pv.x + pv.w).toBeLessThanOrEqual(plan.width)
    expect(pv.y + pv.h).toBeLessThanOrEqual(plan.height)
    expect(pv.gridX + pv.gridW).toBeLessThanOrEqual(pv.x + pv.w)
    expect(pv.gridY + pv.gridH).toBeLessThanOrEqual(pv.y + pv.h)

    for (const sw of plan.swatches) {
      expect(sw.x + sw.size).toBeLessThanOrEqual(plan.width)
      expect(sw.y + sw.size).toBeLessThanOrEqual(plan.height)
    }
  })

  it('右栏元素不压到左侧预览图', () => {
    const plan = planPatternCard(duck(), { measure: halfEm })
    const previewRight = plan.preview.x + plan.preview.w
    expect(plan.title.x).toBeGreaterThan(previewRight)
    expect(plan.meta.x).toBeGreaterThan(previewRight)
    expect(plan.stats.x).toBeGreaterThan(previewRight)
  })

  it('页脚在右栏底部右对齐(左侧整条是预览图,放不下)', () => {
    const plan = planPatternCard(duck(), { measure: halfEm })
    const previewRight = plan.preview.x + plan.preview.w
    expect(plan.footer.x).toBeGreaterThan(previewRight)
    expect(plan.footer.align).toBe('right')
    // 贴近底边但不越界
    expect(plan.footer.y).toBeLessThanOrEqual(plan.height)
    expect(plan.footer.y).toBeGreaterThan(plan.height - 80)
  })

  it('色卡最多 12 种,超出部分标注「另有 N 种颜色」', () => {
    const pattern = Array.from({ length: 20 }, (_, i) => [`#00000${i.toString(16)}`])
    const plan = planPatternCard(duck({ pattern }), { measure: halfEm })
    expect(plan.swatches).toHaveLength(OG_CARD_MAX_COLORS)
    expect(plan.overflow).not.toBeNull()
    expect(plan.overflow.text).toBe(`另有 ${20 - OG_CARD_MAX_COLORS} 种颜色`)
  })

  it('颜色数不超上限时没有「另有」标注', () => {
    const plan = planPatternCard(duck(), { measure: halfEm })
    expect(plan.overflow).toBeNull()
  })

  it('200×200 大图与 1×1 小图都能规划(边界尺寸)', () => {
    const big = Array.from({ length: 200 }, () => Array(200).fill('#FFD700'))
    const bigPlan = planPatternCard(duck({ pattern: big }), { measure: halfEm })
    expect(bigPlan.preview.cell).toBe(2)
    expect(bigPlan.stats.text).toBe('40000 颗豆子 · 1 种颜色')

    const tinyPlan = planPatternCard(duck({ pattern: [['#FFD700']] }), { measure: halfEm })
    expect(tinyPlan.preview.cell).toBe(534)
    expect(tinyPlan.stats.text).toBe('1 颗豆子 · 1 种颜色')
  })

  it('矩形图案保留真实宽高比(不被强制拉成正方形)', () => {
    const pattern = Array.from({ length: 10 }, () => Array(40).fill('#FFD700'))
    const plan = planPatternCard(duck({ pattern }), { measure: halfEm })
    expect(plan.preview.gridW).toBeGreaterThan(plan.preview.gridH)
    expect(plan.meta.text).toBe('40 × 10')
  })

  it('长标题折行后不溢出右栏宽度', () => {
    const plan = planPatternCard(duck({ nameZh: '一'.repeat(30) }), { measure: fullEm })
    expect(plan.title.lines.length).toBeLessThanOrEqual(2)
    for (const line of plan.title.lines) {
      expect(fullEm(line, { fontSize: plan.title.fontSize })).toBeLessThanOrEqual(522)
    }
  })

  it('无名称 / 空图案 / 全空图案时返回 null(不产出空白卡片)', () => {
    expect(planPatternCard(null, { measure: halfEm })).toBeNull()
    expect(planPatternCard(duck({ name: '', nameZh: '' }), { measure: halfEm })).toBeNull()
    expect(planPatternCard(duck({ pattern: [] }), { measure: halfEm })).toBeNull()
    expect(planPatternCard(duck({ pattern: undefined }), { measure: halfEm })).toBeNull()
    expect(planPatternCard(duck({ pattern: [[null, null]] }), { measure: halfEm })).toBeNull()
  })

  it('优先用 nameZh,缺失时退回 name', () => {
    const plan = planPatternCard(duck({ nameZh: '' }), { measure: halfEm })
    expect(plan.title.lines).toEqual(['Duck'])
  })

  it('格子足够大时带缝与圆角,极小的格子改实心(避免糊成一片)', () => {
    const big = planPatternCard(duck({ pattern: [['#FFF']] }), { measure: halfEm })
    expect(big.preview.inset).toBeGreaterThan(0)
    expect(big.preview.radius).toBeGreaterThan(0)

    const small = planPatternCard(
      duck({ pattern: Array.from({ length: 200 }, () => Array(200).fill('#FFF')) }),
      { measure: halfEm },
    )
    expect(small.preview.inset).toBe(0)
  })
})
