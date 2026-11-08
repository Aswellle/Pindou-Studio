import { describe, it, expect } from 'vitest'
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  BRAND_NAME,
  BRAND_DOMAIN,
  contentBounds,
  fitPatternBox,
  topColors,
  wrapText,
  buildShareCardModel,
} from './shareCardModel'

const UUID = '550e8400-e29b-41d4-a716-446655440000'

function makePattern(width, height) {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ((x + y) % 2 === 0 ? '#FF0000' : null))
  )
}

describe('contentBounds', () => {
  it('裁掉四周全空行列', () => {
    const p = Array.from({ length: 12 }, () => Array(12).fill(null))
    p[4][5] = '#FF0000'
    p[6][8] = '#00FF00'
    expect(contentBounds(p)).toEqual({ x0: 5, y0: 4, width: 4, height: 3 })
  })

  it('全空 / 非数组返回 null', () => {
    expect(contentBounds([Array(9).fill(null)])).toBeNull()
    expect(contentBounds(null)).toBeNull()
  })
})

describe('fitPatternBox', () => {
  it('格子取整并居中', () => {
    const r = fitPatternBox(29, 29, { x: 10, y: 10, w: 500, h: 400 })
    expect(r.cell).toBe(13) // floor(min(500/29, 400/29))
    expect(r.gridW).toBe(377)
    expect(r.gridH).toBe(377)
    expect(r.x).toBe(10 + Math.round((500 - 377) / 2))
  })

  it('非法输入返回空结果', () => {
    const r = fitPatternBox(0, 9, { x: 0, y: 0, w: 100, h: 100 })
    expect(r.cell).toBe(0)
  })
})

describe('wrapText', () => {
  const measure = text => [...text].length * 10 // 每字符 10px

  it('按宽度折行', () => {
    expect(wrapText('abcdefghij', 50, measure)).toEqual(['abcde', 'fghij'])
  })

  it('超过行数截断加省略号', () => {
    const lines = wrapText('a'.repeat(30), 40, measure, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(40)
  })

  it('空文本返回空数组', () => {
    expect(wrapText('', 100, measure)).toEqual([])
    expect(wrapText(null, 100, measure)).toEqual([])
  })

  it('没有 measure 时整段返回', () => {
    expect(wrapText('文本', 10, undefined)).toEqual(['文本'])
  })
})

describe('topColors', () => {
  it('按颗数降序取前 N 色,超过上限记入 more', () => {
    const pattern = [
      ['#AA0000', '#AA0000', '#AA0000', '#00AA00', '#00AA00', '#0000AA'],
      ['#AA0000', '#00AA00', '#0000AA', '#FFEE00', '#FFEE00', '#FFEE00'],
    ]
    const { shown, more } = topColors(pattern, 2)
    expect(shown).toEqual([
      { hex: '#AA0000', count: 4 },
      { hex: '#00AA00', count: 3 },
    ])
    expect(more).toBe(2)
  })

  it('空图案返回空集', () => {
    expect(topColors([])).toEqual({ shown: [], more: 0 })
    expect(topColors(null)).toEqual({ shown: [], more: 0 })
  })
})

describe('buildShareCardModel', () => {
  const labels = {
    size: '尺寸 9 × 9',
    beads: '81 颗豆子',
    colors: '1 种颜色',
    scan: '扫码查看图纸',
    footer: '拼豆 Studio · tangnotes.site',
  }

  const build = (snapshot, overrides = {}) =>
    buildShareCardModel({
      snapshot: {
        title: '小鸭',
        authorLabel: '拼豆创作者',
        canvasData: makePattern(9, 9),
        gridWidth: 9,
        gridHeight: 9,
        ...snapshot,
      },
      shareUrl: `https://tangnotes.site/share/${UUID}`,
      labels: { ...labels, authorPrefix: '来自 ' },
      measure: text => [...text].length * 10,
      ...overrides,
    })

  it('产出 1200×630 模型,QR 编码传入的分享链接', () => {
    const m = build()
    expect(m.width).toBe(CARD_WIDTH)
    expect(m.height).toBe(CARD_HEIGHT)
    expect(m.qr.text).toBe(`https://tangnotes.site/share/${UUID}`)
    expect(m.title.lines).toEqual(['小鸭'])
    expect(m.pattern.width).toBe(9)
    expect(m.pattern.height).toBe(9)
    // 二维码白卡完整落在卡片内
    expect(m.qr.card.y + m.qr.card.h).toBeLessThanOrEqual(CARD_HEIGHT)
    expect(m.qr.card.x + m.qr.card.w).toBeLessThanOrEqual(CARD_WIDTH)
  })

  it('品牌条带 LOGO/站名/域名,右列底部为品牌行(预览区不再被页脚侵占)', () => {
    const m = build()
    expect(m.header.h).toBeGreaterThan(0)
    expect(m.header.brand.text).toBe(BRAND_NAME)
    expect(m.header.domain.text).toBe(BRAND_DOMAIN)
    expect(m.header.brand.y).toBeLessThan(m.header.h)
    // 站点 LOGO 是十六格色卡,占头部一半高
    expect(m.header.logo.size).toBe(44)
    expect(m.brandRow.y + 44).toBeLessThanOrEqual(CARD_HEIGHT)
    expect(m.brandRow.nameX).toBeGreaterThan(m.brandRow.logoX)
    expect(m.footer).toBeUndefined()
  })

  it('署名按「来自 xxx」句式拼接,空署名不落笔', () => {
    const m = build()
    expect(m.author.text).toBe('来自 拼豆创作者')
    const empty = build({ authorLabel: '' })
    expect(empty.author.text).toBe('')
  })

  it('三枚信息 chips 平分右列且互不重叠', () => {
    const m = build()
    expect(m.chips).toHaveLength(3)
    for (const chip of m.chips) {
      expect(chip.y + chip.h).toBeLessThanOrEqual(CARD_HEIGHT)
      expect(chip.x + chip.w).toBeLessThanOrEqual(CARD_WIDTH - 44)
    }
    for (let i = 1; i < m.chips.length; i++) {
      expect(m.chips[i].x).toBeGreaterThanOrEqual(m.chips[i - 1].x + m.chips[i - 1].w)
    }
  })

  it('用色珠条取图案前 N 色,余量记入 more', () => {
    const pattern = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, (_, x) => (x % 3 === 0 ? '#FF0000' : x % 3 === 1 ? '#00AA00' : '#0000AA'))
    )
    const m = build({ canvasData: pattern })
    expect(m.swatches.colors).toHaveLength(3)
    expect(m.swatches.more).toBe(0)
  })

  it('无内容快照不崩溃,格子为 0', () => {
    const m = build({ canvasData: [], gridWidth: 0, gridHeight: 0 }, { measure: undefined })
    expect(m.pattern.cell).toBe(0)
    expect(m.qr.text).toContain('/share/')
    expect(m.swatches.colors).toHaveLength(0)
  })
})
