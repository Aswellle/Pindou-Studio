import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 联系我们页的版面契约。
 *
 * 这一页从模态框改成路由页,**唯一目的**就是摆脱 iOS Safari 的键盘问题。
 * 三轮迭代后锁定的模型(前两轮都错在这里,故把「为什么」写进断言旁边):
 *
 *   错误模型 1 · 普通流 + 高度跟 --vh
 *     iOS 键盘弹起时会滚动文档(html/body 的 overflow:hidden 拦不住),
 *     整页被推上去 → 顶栏挤出屏幕,底部露出 body 底色。
 *   错误模型 2 · absolute + top/height 绑视觉视口矩形
 *     absolute 会被祖先的 overflow:hidden 裁切(#root / .app 都是 hidden),
 *     超出部分直接消失,症状同上。
 *
 *   正确模型 · fixed + inset:0 盖满布局视口,再用内边距框进视觉视口
 *     视觉视口永远是布局视口的子集 → 框盖满布局视口时,无论怎么平移,
 *     看到的都还是本页,白板在几何上不可能出现。fixed 的包含块是初始包含块,
 *     既不随文档滚动,也不被祖先 overflow 裁切。
 *     这是全站浮层(index.css 的 .modal-overlay)早已验证过的同一条结论。
 *
 * jsdom 没有布局引擎,组件测试全绿也发现不了这类回归 —— 所以用源码断言钉住。
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

/** 取某条声明的值(按行切,避免正则被 max() 里的括号截断) */
function declValue(block, prop) {
  const line = block.split('\n').find((l) => new RegExp(`^\\s*${prop}\\s*:`).test(l))
  return line ? line.slice(line.indexOf(':') + 1).trim() : ''
}

const CSS_CODE = stripComments(CSS)
const JSX_CODE = stripComments(JSX)

describe('联系我们页 · 页面框盖满布局视口', () => {
  it('页面框用 fixed + inset:0 盖满整个布局视口', () => {
    // 这是本页最关键的一条。视觉视口永远是布局视口的子集 —— 框盖满布局视口,
    // 视觉视口无论怎么平移看到的都是本页,白板在几何上不可能出现。
    // 换成普通流:文档被 iOS 滚动时整页跟着上移,底部露白。
    // 换成 absolute:被 #root / .app 的 overflow:hidden 裁切,症状相同。
    // 定位写在 index.css 的「整页框」组里(补偿表达式全站只允许一处)。
    const page = ruleBody(INDEX_CSS, '.contact-page')
    expect(page).toMatch(/position:\s*fixed/)
    expect(page).toMatch(/inset:\s*0/)
  })

  it('不再用绝对定位 / 视觉视口矩形那一套', () => {
    // 上一版模型:absolute + top/height 绑 --raw-visual-*。已证伪(会被裁切),
    // 残留会让人误以为那套还在生效。
    const page = ruleBody(INDEX_CSS, '.contact-page')
    expect(page).not.toMatch(/position:\s*absolute/)
    expect(INDEX_CSS).not.toMatch(/--raw-visual/)
    expect(CSS_CODE).not.toMatch(/--raw-visual/)
    expect(KEYBOARD_SAFE).not.toContain('--raw-visual')
  })

  it('内容用内边距框进视觉视口(顶部偏移 + 键盘高度)', () => {
    // fixed 盖满布局视口只保证「看得到本页」,不保证输入区在键盘上方。
    // 真正把内容压进可见区的是这两个内边距:顶部让出 iOS 的自动平移,
    // 底部让出键盘高度,两者相减内容区恰好等于视觉视口。
    const page = ruleBody(INDEX_CSS, '.contact-page')
    expect(declValue(page, 'padding-top')).toContain('--visible-vh-top')
    expect(declValue(page, 'padding-bottom')).toContain('--keyboard-height')
  })

  it('页面自己的 CSS 不重抄补偿表达式', () => {
    // 全站只允许 index.css 写一次 —— 组件重抄会在共享组调整时静默失配
    // (mobileOverlayContract.test.js 会拦,这里再钉一次让意图就近可读)
    expect(CSS_CODE).not.toMatch(/var\(--(?:keyboard-height|visible-vh-top)/)
  })

  it('底部不再叠加 safe-area:输入区自己已经加过一次', () => {
    // 两处都加 → 键盘收起时底部凭空多出一条 34px 空白
    const page = ruleBody(INDEX_CSS, '.contact-page')
    expect(declValue(page, 'padding-bottom')).not.toContain('safe-area-inset-bottom')
    expect(ruleBody(CSS, '.contact-composer')).toMatch(/env\(safe-area-inset-bottom/)
  })

  it('页面根节点不再需要定位宿主', () => {
    // fixed 的包含块是初始包含块,祖先的 position 不影响它。
    // 保留 .contact-page-host 只会让人以为这里还有绝对定位需要参照系。
    expect(CSS).not.toMatch(/\.contact-page-host/)
    expect(JSX_CODE).not.toMatch(/contact-page-host/)
  })

  it('联系我们的浮层类已从全站基础设施中移除', () => {
    // 共享浮层组、键盘 hook 的 OVERLAY_SELECTOR、工具栏淡出规则 ——
    // 三处都清掉,否则会留下指向不存在浮层的死规则
    expect(INDEX_CSS).not.toContain('.contact-overlay')
    expect(KEYBOARD_SAFE).not.toContain('.contact-overlay')
  })
})

describe('联系我们页 · 三段式版面', () => {
  it('根容器是 flex 纵向布局', () => {
    const root = ruleBody(CSS, '.contact-page')
    expect(root).toMatch(/display:\s*flex/)
    expect(root).toMatch(/flex-direction:\s*column/)
    // 框的大小由 fixed + inset:0 决定(index.css);overflow:hidden 在那边,
    // 防止内容溢出框外
    expect(ruleBody(INDEX_CSS, '.contact-page')).toMatch(/overflow:\s*hidden/)
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
    // flex: 0 0 auto 是「钉底」的实现方式 —— 页面根节点已经是 fixed 且等于
    // 可见区域,尾部 flex 项天然就是屏幕底部,不需要再套一层 fixed
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
    // 底部留白正好露在键盘上方。本页必须直接挂在 .app 下。
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
