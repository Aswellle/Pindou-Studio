import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 头像视觉契约。
 *
 * 背景:`Avatar` 是共享组件,被 Header、个人中心身份摘要、头像编辑区三处复用。
 * 但它的样式一度只写在 `Header.jsx` 的 `<style>` 里 —— 而 `/profile` 是独立页,
 * App 不渲染 Header。结果在个人中心:
 *   · 有头像图 → `<img>` 没有任何 CSS,显示成**未裁切的方块**;
 *   · 无头像图 → 兜底 `<span>` 的 `display` 仍是 inline,宽高不生效,
 *     只剩一个裸字母浮在版面上。
 *
 * 这类问题 jsdom 测不出来(没有布局引擎,也不解析 CSS 导入),只能靠源码断言:
 *   1. 样式必须跟着组件走,而不是挂在某个页面上;
 *   2. 圆形裁切 + `object-fit: cover` 是社交平台通行标准,防止方图/竖图变形;
 *   3. 兜底 span 必须是 flex 容器,否则 width/height 被 inline 语义吃掉。
 */

const SRC = join(process.cwd(), 'src')
const COMPONENTS = join(SRC, 'components')

const AVATAR_JSX = readFileSync(join(COMPONENTS, 'Avatar.jsx'), 'utf8')
const AVATAR_CSS = readFileSync(join(COMPONENTS, 'Avatar.css'), 'utf8')
const HEADER_JSX = readFileSync(join(COMPONENTS, 'Header.jsx'), 'utf8')

/**
 * 取某个选择器**独占**的规则块。
 *
 * 不能用 `css.indexOf(selector)` —— `.avatar-img` 第一次出现是在组合选择器
 * `.avatar-img, .avatar-fallback { … }` 里,那样取到的是组合块,单独给
 * `.avatar-img` 的 object-fit 永远读不到,断言会假失败。
 * 这里按 `{` / `}` 切出每一条规则,再要求选择器列表里有一项完全等于目标。
 */
function ruleBody(css, selector) {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) {
        const sel = css.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, '').trim()
        const parts = sel.split(',').map((s) => s.trim())
        if (parts.includes(selector)) {
          let d = 0
          for (let j = i; j < css.length; j++) {
            if (css[j] === '{') d++
            else if (css[j] === '}') {
              d--
              if (d === 0) { out.push(css.slice(i + 1, j)); break }
            }
          }
        }
      }
      depth++
    } else if (css[i] === '}') {
      depth--
      if (depth === 0) start = i + 1
    }
  }
  return out.join('\n')
}

describe('头像样式归属', () => {
  it('Avatar 组件自己导入 Avatar.css', () => {
    // 缺这一行,任何不渲染 Header 的页面(个人中心、后台登录)都会丢样式
    expect(AVATAR_JSX).toMatch(/import\s+['"]\.\/Avatar\.css['"]/)
  })

  it('Header 不再重复定义头像的基础视觉', () => {
    // Header 里只允许出现悬停等导航栏专属效果。一旦重新写回 border-radius /
    // background,两处定义就会开始漂移 —— 而这正是本次问题的成因。
    expect(HEADER_JSX).not.toMatch(/\.avatar-img\s*\{[^}]*border-radius/)
    expect(HEADER_JSX).not.toMatch(/\.avatar-fallback\s*\{[^}]*background/)
  })
})

describe('头像视觉契约', () => {
  it('图片与兜底都是正圆', () => {
    // 社交平台标准:原图多为方形或竖构图,圆形是各平台通行的头像形态
    for (const sel of ['.avatar-img', '.avatar-fallback']) {
      expect(ruleBody(AVATAR_CSS, sel)).toMatch(/border-radius:\s*50%/)
    }
  })

  it('图片用 object-fit: cover 裁切,不拉伸变形', () => {
    // 换成 fill 会把 3:4 的竖图压扁成 1:1,换成 contain 会留白边
    expect(ruleBody(AVATAR_CSS, '.avatar-img')).toMatch(/object-fit:\s*cover/)
  })

  it('兜底首字母是 flex 容器,width/height 才生效', () => {
    // 这是个人中心「只剩一个裸字母」的直接原因:inline 元素不接受宽高
    const body = ruleBody(AVATAR_CSS, '.avatar-fallback')
    expect(body).toMatch(/display:\s*inline-flex/)
    expect(body).toMatch(/align-items:\s*center/)
    expect(body).toMatch(/justify-content:\s*center/)
  })

  it('图片与兜底的边框同宽,切换时圆盘直径不跳', () => {
    const imgBorder = ruleBody(AVATAR_CSS, '.avatar-img').match(/border:\s*([^;]+);/)
    const fbBorder = ruleBody(AVATAR_CSS, '.avatar-fallback').match(/border:\s*([^;]+);/)
    expect(imgBorder).toBeTruthy()
    expect(fbBorder).toBeTruthy()
    // 只比较宽度:颜色/样式可以不同,但宽度不同会让「上传前/上传后」的
    // 头像尺寸发生跳变
    expect(imgBorder[1].trim().split(/\s+/)[0]).toBe(fbBorder[1].trim().split(/\s+/)[0])
  })
})

describe('个人中心头像容器不与组件重复画环', () => {
  it('预览槽只给尺寸,不自带 border-radius + 背景 + 边框', () => {
    const css = readFileSync(join(COMPONENTS, 'profile', 'ProfilePage.css'), 'utf8')
    const body = ruleBody(css, '.pf-avatar-preview')
    expect(body).toMatch(/width:\s*104px/)
    // 圆环由 Avatar 自带;容器再画一圈会变成「环套环」,预览看着比实际厚一圈
    expect(body).not.toMatch(/border-radius/)
    expect(body).not.toMatch(/border:\s*1px/)
  })
})
