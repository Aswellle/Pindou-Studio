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
    // 高度契约在 #root:它是 fixed + inset:0 盖满布局视口,再用内边距把内容
    // 框进视觉视口(见 index.css 注释)。子壳只继承 100%,不再自己按 --vh 或
    // 视觉视口定高 —— 一旦公式分歧就会互相裁切。
    const app = ruleBody(INDEX_CSS, '.app {')
    expect(app).toContain('overflow: hidden')
    expect(app).toContain('height: 100%')
    expect(app).not.toMatch(/height:\s*calc\(var\(--vh/)

    // 断言前去掉注释:块内注释会引用旧写法作为说明,直接匹配会假通过。
    const rootRule = ruleBody(INDEX_CSS, '#root {').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rootRule).toMatch(/position:\s*fixed/)
    expect(rootRule).toMatch(/inset:\s*0/)
    expect(rootRule).toContain('var(--visible-vh-top')
    expect(rootRule).toContain('overflow: hidden')
    // 高度不再由 JS 变量驱动:那是 iOS 26「键盘收起后 visualViewport 不恢复」
    // 卡死闩锁的根源(Apple Forums 800125)
    expect(rootRule).not.toMatch(/height:\s*max\(/)
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

  it('移动端内层 profile-page 同样不再滚动(个人中心与内容页同一处境)', () => {
    const inner = ruleBody(INDEX_CSS, '.mobile-page-area > .profile-page {')
    expect(inner).toContain('overflow: visible')
    expect(inner).not.toContain('overflow-y: auto')
  })
})

describe('常驻 fixed chrome 跟随视觉视口', () => {
  it('顶栏 / 工具栏 / 色卡条各自让出视觉视口偏移与键盘高度', () => {
    // #root 的内边距只作用于文档流内的内容;fixed 元素的包含块是初始包含块,
    // 不理会 #root 的内边距。键盘弹起时布局视口底部在键盘后面、iOS 平移视觉
    // 视口时顶部又跑到可见区之上 —— 所以这三处必须各自跟随。
    // 补偿表达式集中在 index.css,组件 CSS 不再重抄(mobileOverlayContract 强制)。
    const header = ruleBody(INDEX_CSS, '.header {')
    expect(header).toMatch(/top:\s*var\(--visible-vh-top/)

    // 用 "\n.mobile-toolbar {" 精确定位:规则块本身前面还有
    // `body:has(.modal-overlay) .mobile-toolbar` 这种选择器,indexOf 会先命中它
    const toolbar = ruleBody(INDEX_CSS, '\n.mobile-toolbar {')
    expect(toolbar).toMatch(/bottom:\s*var\(--keyboard-height/)

    const palette = ruleBody(INDEX_CSS, '\n.mobile-color-palette {')
    expect(palette).toMatch(/bottom:\s*calc\(/)
    expect(palette).toContain('--keyboard-height')
  })

  it('组件 CSS 不重抄常驻 chrome 的键盘补偿', () => {
    const toolbarCss = readFileSync(join(SRC, 'components', 'Tools', 'MobileToolbar.css'), 'utf8')
    const paletteCss = readFileSync(join(SRC, 'components', 'ColorPalette', 'MobileColorPalette.css'), 'utf8')
    expect(toolbarCss.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/var\(--keyboard-height/)
    expect(paletteCss.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/var\(--keyboard-height/)
  })
})

describe('根层级高度契约(计划 §6.1)', () => {
  // body 是唯一同时声明 height 与 min-height 的层。min-height 在 CSS 中胜过
  // height,所以 body 的实际高度由 min-height 决定 —— 一旦它改用 vh/dvh,
  // body 就会比 iOS 可见区高,#root 的 overflow:hidden 开始裁切子壳。
  // svh 恒等于 URL 栏展开时的可见高度,是唯一安全的选择。
  it('body 的 min-height 只用 svh,不用 vh/dvh', () => {
    const idx = INDEX_CSS.indexOf('\nbody {')
    expect(idx).toBeGreaterThan(-1)
    const body = ruleBody(INDEX_CSS.slice(idx), 'body {')
    expect(body).toContain('min-height: 100svh')
    // 允许 `min-height: 100vh` 作为旧浏览器回退(在 svh 之前),但不得出现 dvh
    expect(body).not.toContain('100dvh')
    const vhLine = body.match(/min-height:\s*100vh;?/g) || []
    const svhLine = body.match(/min-height:\s*100svh;?/g) || []
    expect(vhLine.length).toBeLessThanOrEqual(1) // 至多一行回退
    expect(svhLine.length).toBe(1)
  })

  it('子壳只继承高度,不再叠加视口补偿', () => {
    // .mobile-layout 曾写 min-height: calc(--visible-vh-top + --visible-vh),
    // 被 #root 的 overflow:hidden 裁掉,等于从未生效,只是把父子矛盾藏进裁切。
    // 只检查声明(注释里会提到这两个变量,是说明而非用法)。
    const layout = ruleBody(INDEX_CSS, '.mobile-layout {').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(layout).toContain('height: 100%')
    expect(layout).not.toContain('--visible-vh-top')
    expect(layout).not.toContain('--visible-vh')
  })
})
