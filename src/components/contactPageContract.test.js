import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 联系我们页的版面契约。
 *
 * 这一页从模态框改成路由页,**唯一目的**就是摆脱 iOS Safari 的键盘问题:
 * 浮层是 `position: fixed` + 布局视口坐标,而键盘只收缩 visual viewport,
 * 于是浮层被顶走、露出白板;浮层里再同时摆着邮箱框和消息框两个编辑控件,
 * 键盘弹起后可用高度骤减,既看不清会话也填不完表单。
 *
 * 改成页面后能成立的前提是:**高度链条全程跟随 --vh**。只要有人在
 * .contact-page 里写回 `position: fixed` 或 `100vh`,整页就不再随键盘收缩,
 * 症状会原样复现 —— 而 jsdom 没有布局引擎,组件测试全绿也发现不了。
 * 所以这些约束用源码断言钉住。
 */

const SRC = join(process.cwd(), 'src')
const CSS = readFileSync(join(SRC, 'components', 'contactPage.css'), 'utf8')
const JSX = readFileSync(join(SRC, 'components', 'ContactPage.jsx'), 'utf8')
const INDEX_CSS = readFileSync(join(SRC, 'index.css'), 'utf8')
const KEYBOARD_SAFE = readFileSync(join(SRC, 'hooks', 'useKeyboardSafe.js'), 'utf8')

/** 取某个选择器独占的规则块(按 { } 切分,组合选择器需精确匹配其中一项) */
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

/** 去掉 CSS 与 JS 注释 —— 注释里提到关键词不应算违规 */
const stripComments = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const CSS_CODE = stripComments(CSS)
const JSX_CODE = stripComments(JSX)

describe('联系我们页 · 页面框对齐视觉视口', () => {
  it('页面框高度绑定原始视觉视口,而不是键盘判定后的 --vh', () => {
    // 这是本页最关键的一条。--vh / --visible-vh 来自键盘**判定**,判定依赖
    // 「布局视口 − 视觉视口 ≥ 120px」。iOS 上存在布局视口也一起收缩的路径,
    // 差值掉到阈值以下就判成「没键盘」,变量归一化回布局视口高 → 页面按比
    // 可见区域更高的框排版 → 输入区跑到键盘后面,中间撑出大片空白。
    const page = ruleBody(CSS, '.contact-page')
    expect(page).toMatch(/height:\s*var\(--raw-visual-vh/)
    expect(page).toMatch(/top:\s*var\(--raw-visual-top/)
  })

  it('页面框用绝对定位对齐矩形,而不是 fixed', () => {
    // 绝对定位同样以布局视口为坐标系,但 top/height 由原始值给出 → 框恒等于
    // 可见区域;fixed 只会停在布局视口里,键盘一弹就被盖住/顶走。
    const page = ruleBody(CSS, '.contact-page')
    expect(page).toMatch(/position:\s*absolute/)
    expect(page).not.toMatch(/position:\s*fixed/)
  })

  it('高度不依赖浮层键盘补偿变量', () => {
    // --visible-vh / --keyboard-height 是给 fixed 浮层用的,且同样受判定阈值影响
    expect(CSS_CODE).not.toMatch(/--visible-vh|--keyboard-height/)
    expect(JSX_CODE).not.toMatch(/--visible-vh|--keyboard-height/)
  })

  it('定位宿主提供 relative 参照系', () => {
    // .app / .main-content / #root 都不是定位元素;缺这层会一路找到视口,
    // 坐标系变成视觉视口,top 被重复计算一次。
    const host = ruleBody(CSS, '.contact-page-host')
    expect(host).toMatch(/position:\s*relative/)
    expect(host).toMatch(/min-height:\s*0/)
    expect(JSX_CODE).toMatch(/className="contact-page-host"/)
  })

  it('联系我们的浮层类已从全站基础设施中移除', () => {
    // 共享浮层组、键盘 hook 的 OVERLAY_SELECTOR、工具栏淡出规则 ——
    // 三处都清掉,否则会留下指向不存在浮层的死规则
    expect(INDEX_CSS).not.toContain('.contact-overlay')
    expect(KEYBOARD_SAFE).not.toContain('.contact-overlay')
  })
})

describe('联系我们页 · 三段式版面', () => {
  it('根容器是 flex 纵向布局,并填满定位宿主', () => {
    const root = ruleBody(CSS, '.contact-page')
    expect(root).toMatch(/display:\s*flex/)
    expect(root).toMatch(/flex-direction:\s*column/)
    // 绝对定位 + top/height 已确定框大小,overflow:hidden 防止内容溢出框外
    expect(root).toMatch(/overflow:\s*hidden/)
  })

  it('内层是 flex 纵向且可收缩', () => {
    const inner = ruleBody(CSS, '.contact-page-inner')
    expect(inner).toMatch(/display:\s*flex/)
    expect(inner).toMatch(/flex-direction:\s*column/)
    // 缺 min-height: 0 时 flex 子项会被内容撑开,输入区被推出视口
    expect(inner).toMatch(/min-height:\s*0/)
  })

  it('会话区是唯一滚动容器', () => {
    const thread = ruleBody(CSS, '.contact-thread')
    expect(thread).toMatch(/flex:\s*1/)
    expect(thread).toMatch(/min-height:\s*0/)
    expect(thread).toMatch(/overflow-y:\s*auto/)
  })

  it('输入区不参与收缩,始终完整可见', () => {
    // flex: 0 0 auto 是「钉底」的实现方式 —— 不用 fixed 也能停在屏幕底部
    const composer = ruleBody(CSS, '.contact-composer')
    expect(composer).toMatch(/flex:\s*0\s+0\s+auto/)
    // 底部安全区:iPhone Home 指示条不应压住发送按钮
    expect(composer).toMatch(/env\(safe-area-inset-bottom/)
  })

  it('顶栏固定高度、不参与剩余空间分配', () => {
    const bar = ruleBody(CSS, '.contact-page-bar')
    expect(bar).toMatch(/flex:\s*0\s+0\s+auto/)
  })

  it('页面不再被块级滚动容器包裹', () => {
    // .mobile-page-area 是块级滚动容器,页面在其中只能拿到内容高度、填不满视口,
    // 底部留白正好露在键盘上方。本页必须直接挂在 flex 纵向的 .app 下。
    expect(CSS).not.toMatch(/\.mobile-page-area\s*>\s*\.contact-page/)
  })
})

describe('联系我们页 · 编辑控件数量', () => {
  it('邮箱默认折叠:渲染时只声明一个 input', () => {
    // 默认只留消息输入框 —— 键盘弹起后纵向空间全部留给会话区。
    // 邮箱输入框出现在 emailOpen 分支里,不是默认渲染的。
    const inputs = [...JSX.matchAll(/<input\b/g)]
    expect(inputs).toHaveLength(2) // 消息输入 + 展开后的邮箱输入
    expect(JSX).toMatch(/emailOpen \? \(/)
  })
})
