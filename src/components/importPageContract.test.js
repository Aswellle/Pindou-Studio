import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 导入页版面契约。
 *
 * 两条都是 jsdom 测不出来的(没有布局),只能靠源码断言锁住:
 *
 * 1. 背景铺满。导入页是独立页(isStandalonePage),**不渲染顶栏**,
 *    但样式里曾按「视口高 − 60px」给页面定高,于是底部永远空出 60px,
 *    露出 app 壳的底色。图纸截图页内容最少,这条空白带最显眼。
 *    现在页面与个人中心同一套:flex:1 撑满父级剩余高度,背景自然到底。
 *
 * 2. 不再展示 JSON 示例代码。用户看不懂 schemaVersion / grid.cells 这类
 *    字段,示例代码只会让人以为要自己手写文件。
 */

const SRC = join(process.cwd(), 'src')
const PAGE_CSS = readFileSync(join(SRC, 'components', 'importPage.css'), 'utf8')
const PAGE_JSX = readFileSync(join(SRC, 'components', 'ImportPage.jsx'), 'utf8')

/** 提取某个选择器块的内容(从选择器到匹配的右花括号) */
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

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '')

describe('导入页 · 背景铺满', () => {
  const page = stripComments(ruleBody(PAGE_CSS, '\n.import-page {'))

  it('页面撑满父级剩余高度,不再按视口高减顶栏预留', () => {
    expect(page).toMatch(/flex:\s*1/)
    expect(page).toMatch(/min-height:\s*0/)
    // 旧写法:min-height: calc(var(--visible-vh, 100vh) - 60px)
    // 独立页没有顶栏,这 60px 就是底部那条空白带
    expect(page).not.toMatch(/--visible-vh/)
  })

  it('页面自带背景色与滚动容器', () => {
    expect(page).toMatch(/background:\s*var\(--bg-secondary\)/)
    expect(page).toMatch(/overflow-y:\s*auto/)
  })

  it('移动端外层滚动容器内按 100% 撑满,交出滚动权', () => {
    const mobile = stripComments(ruleBody(PAGE_CSS, '.mobile-page-area > .import-page'))
    expect(mobile).toMatch(/min-height:\s*100%/)
    expect(mobile).toMatch(/overflow:\s*visible/)
  })
})
