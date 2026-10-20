import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 整页滚动契约。
 *
 * 背景:`.app` 固定 `height: 100vh` + `overflow: hidden`,所有「整页内容」
 * 必须自己带滚动容器,否则超出视口的部分会被直接裁掉 ——
 * 图纸详情页的颜色清单曾因此**完全不显示**(DOM 在、CSS 也对,就是被裁了)。
 *
 * 这类问题 jsdom 测不出来(没有布局),只能靠源码断言锁住。
 * 新增整页路由时,要么加进下面的滚动容器名单,要么套进 .mobile-page-area。
 */

const SRC = join(process.cwd(), 'src')
const INDEX_CSS = readFileSync(join(SRC, 'index.css'), 'utf8')
const GALLERY_CSS = readFileSync(join(SRC, 'features', 'gallery', 'gallery.css'), 'utf8')

/** 提取某个选择器块的内容(简单版:从选择器到匹配的右花括号) */
function ruleBody(css, selector) {
  const idx = css.indexOf(selector)
  if (idx === -1) return ''
  const open = css.indexOf('{', idx)
  if (open === -1) return ''
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  return ''
}

describe('整页滚动契约', () => {
  it('.app 固定视口高度并裁切溢出(所有整页内容必须自带滚动)', () => {
    const app = ruleBody(INDEX_CSS, '.app {')
    expect(app).toContain('overflow: hidden')
    expect(app).toMatch(/height:\s*calc\(var\(--vh/)
  })

  it('图库 / 教程 / 内容页共用同一条滚动规则', () => {
    // 三者写在同一个选择器组里,块内必须有 overflow-y: auto
    const rule = ruleBody(INDEX_CSS, '.gallery-page,')
    expect(rule).toContain('overflow-y: auto')
    expect(rule).toContain('min-height: 0')

    // 选择器组本身要同时列出三者
    const groupEnd = INDEX_CSS.indexOf('{', INDEX_CSS.indexOf('.gallery-page,'))
    const group = INDEX_CSS.slice(INDEX_CSS.indexOf('.gallery-page,'), groupEnd)
    expect(group).toContain('.gallery-page')
    expect(group).toContain('.tutorials-page')
    expect(group).toContain('.content-page')
  })

  it('内容页外壳不再自带 max-width(否则滚动条被挤到内容里)', () => {
    // 宽度限制必须放在内层,滚动容器本身要铺满
    const shell = ruleBody(GALLERY_CSS, '.content-page {')
    expect(shell).not.toContain('max-width')
    // 内层承担版心宽度
    const inner = ruleBody(GALLERY_CSS, '.content-page > *')
    expect(inner).toContain('max-width')
  })

  it('详情页版心比普通内容页更宽(PC 信息密度)', () => {
    const detail = ruleBody(GALLERY_CSS, '.content-page.detail-page > *')
    expect(detail).toMatch(/max-width:\s*14\d\dpx/)
  })

  it('颜色清单用网格铺开,不再靠内部滚动', () => {
    const grid = ruleBody(GALLERY_CSS, '.detail-color-grid {')
    expect(grid).toContain('display: grid')
    expect(grid).toContain('auto-fill')
    // 不能有 max-height / overflow:那会让清单看不全
    expect(grid).not.toContain('max-height')
    expect(grid).not.toContain('overflow')
  })
})

describe('移动端整页滚动', () => {
  it('.mobile-page-area 是滚动容器', () => {
    const area = ruleBody(INDEX_CSS, '.mobile-page-area {')
    expect(area).toContain('overflow-y: auto')
    expect(area).toContain('-webkit-overflow-scrolling: touch')
  })

  it('移动端内层 content-page 不再滚动(避免滚动套滚动)', () => {
    const inner = ruleBody(INDEX_CSS, '.mobile-page-area > .content-page {')
    expect(inner).toContain('overflow: visible')
    expect(inner).not.toContain('overflow-y: auto')
  })
})
