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

describe('联系我们页 · 键盘补偿只在 #root 做一次', () => {
  it('#root 是盖满布局视口的固定壳,并用内边距让出键盘', () => {
    // 全站唯一的补偿点。视觉视口永远是布局视口的子集 —— 壳盖满布局视口,
    // 无论 iOS 怎么平移视觉视口 / 滚动文档,看到的都还是本页,
    // 「页面被抬升」与「底部大片空白」在几何上都不可能出现。
    const root = ruleBody(INDEX_CSS, '#root')
    expect(root).toMatch(/position:\s*fixed/)
    expect(root).toMatch(/inset:\s*0/)
    expect(declValue(root, 'padding-top')).toContain('--visible-vh-top')
    expect(declValue(root, 'padding-bottom')).toContain('--keyboard-height')
  })

  it('#root 的高度不再绑在键盘判定上', () => {
    // 旧写法 height: max(--vh*100, offsetTop+visible) 有两个致命前提:
    //   1. 依赖「键盘判定」—— iOS 26 键盘收起后 visualViewport 不恢复
    //      (Apple Forums 800125),闩锁永不释放,壳永久停在收缩高度 → 底部留白;
    //   2. 锚在布局视口顶部 —— iOS 平移视觉视口时顶栏跑到可见区之上 → 被抬升。
    // fixed + inset:0 把壳与判定完全解耦。
    // 注释里会引用旧写法作为说明,断言前先去掉
    const root = stripComments(ruleBody(INDEX_CSS, '#root'))
    expect(root).not.toMatch(/height:\s*calc\(var\(--vh/)
    expect(root).not.toMatch(/height:\s*max\(/)
  })

  it('页面自身不重复做键盘补偿', () => {
    // 页面是 #root 的普通 flex 子项,天然继承已经让出键盘的内容区高度。
    // 再补一次就是双重让出:内容被压掉两倍键盘高度,底部反而露白。
    expect(CSS_CODE).not.toMatch(/var\(--(?:keyboard-height|visible-vh-top)/)
    const page = ruleBody(CSS, '.contact-page')
    expect(page).not.toMatch(/position:\s*(?:fixed|absolute)/)
    // 不得自带高度(flex:1 + min-height:0 已足够让它吃满剩余空间)
    expect(page).not.toMatch(/(?:^|[;\s])height\s*:/)
  })

  it('不再用绝对定位 / 视觉视口矩形那一套', () => {
    // 上一版模型:absolute + top/height 绑 --raw-visual-*。已证伪(会被裁切),
    // 残留会让人误以为那套还在生效。
    expect(INDEX_CSS).not.toMatch(/--raw-visual/)
    expect(CSS_CODE).not.toMatch(/--raw-visual/)
    expect(KEYBOARD_SAFE).not.toContain('--raw-visual')
  })

  it('页面根节点不再需要定位宿主', () => {
    // 页面已是普通流 flex 子项,没有绝对定位,不需要 position: relative 参照系。
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
  it('根容器是 flex 纵向布局,并填满 #root 的内容区', () => {
    const root = ruleBody(CSS, '.contact-page')
    expect(root).toMatch(/display:\s*flex/)
    expect(root).toMatch(/flex-direction:\s*column/)
    // flex:1 + min-height:0 让它吃满 #root 已让出键盘后的剩余高度
    expect(root).toMatch(/flex:\s*1/)
    expect(root).toMatch(/min-height:\s*0/)
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
