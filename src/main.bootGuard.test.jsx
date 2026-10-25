import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 首帧守卫契约(防白屏闪烁回归)。
 *
 * 预渲染页(/gallery、/tutorials 及所有内容快照页)在构建期把静态正文塞进
 * #root,同时给 <html> 加 .js-booting 把它 visibility:hidden —— 否则用户会先
 * 看到一屏纯文字,再被应用替换。
 *
 * 这里锁两件事:
 *   1. 构建脚本确实注入了「同步加类」的脚本与隐藏样式(抓取端不加类,读得到正文);
 *   2. 摘类的时机是「应用提交 DOM 之后」,不是 render() 之前 —— 后者会让浏览器
 *      在标记已摘、应用未上屏的间隙画出一帧纯文字白底。
 */

const ROOT = join(process.cwd())
const PRERENDER = readFileSync(join(ROOT, 'scripts', 'generate-prerender-html.js'), 'utf8')
const OG_SNAPSHOT = readFileSync(join(ROOT, 'src', 'features', 'gallery', 'ogSnapshot.js'), 'utf8')
const MAIN = readFileSync(join(ROOT, 'src', 'main.jsx'), 'utf8')

describe('预渲染守卫 · 构建侧', () => {
  it('两个注入点都写入同步脚本与隐藏样式', () => {
    const bootScript = '<script>document.documentElement.classList.add("js-booting")</script>'
    const bootStyle = '<style>html.js-booting #seo-static{visibility:hidden}</style>'
    for (const src of [PRERENDER, OG_SNAPSHOT]) {
      expect(src).toContain(bootScript)
      expect(src).toContain(bootStyle)
    }
  })

  it('隐藏只作用于 .js-booting 下的静态正文,不影响应用本身', () => {
    // 选择器一旦写成 #seo-static 而非 html.js-booting #seo-static,
    // 不执行 JS 的抓取端也会被隐藏 —— 预渲染就白做了
    expect(PRERENDER).toContain('html.js-booting #seo-static')
    expect(OG_SNAPSHOT).toContain('html.js-booting #seo-static')
  })
})

describe('预渲染守卫 · 运行时摘除时机', () => {
  it('main.jsx 在 render() 之前不再同步摘除标记', () => {
    // 旧实现是 document.documentElement.classList.remove('js-booting') 直接写在
    // createRoot().render() 前面 —— createRoot 的首次渲染是异步调度的,浏览器
    // 完全可能在两者之间画一帧。这条断言把这个写法钉死。
    const renderIdx = MAIN.indexOf('ReactDOM.createRoot(')
    const removeIdx = MAIN.indexOf("classList.remove('js-booting')")
    expect(renderIdx).toBeGreaterThan(-1)
    expect(removeIdx).toBeGreaterThan(-1)
    // 摘除必须发生在组件内部(useLayoutEffect),不能是顶层同步语句
    expect(MAIN).toContain('useLayoutEffect')
    const beforeRender = MAIN.slice(0, renderIdx)
    expect(beforeRender).not.toContain("classList.remove('js-booting')")
  })

  it('useLayoutEffect 在 DOM 提交后、绘制前摘除标记', () => {
    // 用一个与 BootGuard 同构的组件验证时机:effect 执行时子节点已在文档里。
    // 这正是「应用已上屏」与「标记已摘」同一帧的充要条件。
    document.documentElement.classList.add('js-booting')

    function Guard({ children }) {
      useLayoutEffect(() => {
        // 此刻子节点必须已挂载 —— 否则摘了标记就会露出静态正文
        expect(document.body.contains(document.querySelector('.app-probe'))).toBe(true)
        document.documentElement.classList.remove('js-booting')
      }, [])
      return children
    }

    render(
      <Guard>
        <div className="app-probe">app</div>
      </Guard>
    )

    expect(document.documentElement.classList.contains('js-booting')).toBe(false)
    expect(document.querySelector('.app-probe')).toBeTruthy()
  })
})

beforeEach(() => {
  document.documentElement.classList.remove('js-booting')
})

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('js-booting')
})
