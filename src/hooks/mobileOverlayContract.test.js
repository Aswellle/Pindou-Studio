import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * 移动端浮层契约(规格 08 §3 / §5)。
 *
 * iOS Safari 键盘只收缩 visual viewport,布局视口不变,所以全屏浮层必须同时满足:
 *   1. 定位/高度/滚动/居中由 index.css 的共享组统一提供(禁止组件自建 top/height);
 *   2. 在 useKeyboardSafe 的 OVERLAY_SELECTOR 里 —— 否则浮层内输入框会被当成
 *      「页面内输入框」而触发主动滚动,把浮层顶出视口(白板元凶);
 *   3. 手机端淡出底部固定工具栏,否则工具栏压住浮层底部按钮。
 *
 * 这三处此前靠人工同步,新增浮层漏掉任何一处都会在真机上复现白屏/按钮不可点,
 * 而 jsdom 测不出来。这里用源码断言把它们绑在一起。
 */

const SRC = join(process.cwd(), 'src')
const INDEX_CSS = readFileSync(join(SRC, 'index.css'), 'utf8')
const KEYBOARD_SAFE = readFileSync(join(SRC, 'hooks', 'useKeyboardSafe.js'), 'utf8')

// 透明点击遮罩:只拦截点击、不承载内容,不适用浮层契约
const CLICK_CATCHERS = new Set(['export-menu-overlay', 'brand-menu-overlay'])

// 自带完整浮层基础的类:其他浮层可以叠加它们获得同一套契约
const SHARED_BASES = new Set(['modal-overlay', 'contact-overlay', 'admin-modal-overlay',
  'users-confirm-overlay', 'profile-confirm-overlay', 'load-confirm-overlay',
  'my-beads-modal-overlay', 'quantizer-zoom'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.jsx$/.test(name) && !/\.test\.jsx$/.test(name)) out.push(full)
  }
  return out
}

/** cls -> 同一元素上的其他类名 */
function collectOverlayClasses() {
  const found = new Map()
  for (const file of walk(SRC)) {
    const code = readFileSync(file, 'utf8')
    for (const m of code.matchAll(/className="([^"]*)"/g)) {
      const classes = m[1].split(/\s+/).filter(Boolean)
      for (const cls of classes) {
        if (!cls.endsWith('overlay') && cls !== 'quantizer-zoom') continue
        if (CLICK_CATCHERS.has(cls)) continue
        if (!found.has(cls)) found.set(cls, new Set())
        for (const other of classes) if (other !== cls) found.get(cls).add(other)
      }
    }
  }
  return found
}

/** 取 index.css 中以 selector 开头的选择器组的声明体(选择器组可跨多行) */
function cssBlockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = INDEX_CSS.match(new RegExp(`(?:^|\\n)${escaped}[,\\s]`))
  if (!m) return ''
  const brace = INDEX_CSS.indexOf('{', m.index)
  if (brace === -1) return ''
  return INDEX_CSS.slice(brace + 1, INDEX_CSS.indexOf('}', brace))
}

/** 在所有规则里找出「选择器含 selector 且声明含 property」的那一条的声明体 */
function ruleWith(selector, property) {
  const ruleRe = /(?:^|\n)([^{}\n][^{}]*)\{([^}]*)\}/g
  for (const m of INDEX_CSS.matchAll(ruleRe)) {
    if (m[1].includes(selector) && m[2].includes(property)) return m[2]
  }
  return ''
}

const overlayMap = collectOverlayClasses()
const overlays = [...overlayMap.keys()].sort()

/** 该类自身或同元素上的共享基类 —— 契约的实际承担者 */
const contractOwner = (cls) => {
  if (SHARED_BASES.has(cls)) return cls
  for (const other of overlayMap.get(cls)) if (SHARED_BASES.has(other)) return other
  return cls
}

// ── 浮层可访问性契约(规格 08 §5)───────────────────────────
// 承载内容的浮层容器(遮罩本身不需要 dialog 语义)
const DIALOG_CONTAINERS = new Set([
  'export-modal-content', 'contact-modal', 'admin-modal', 'admin-gate-confirm',
  'users-confirm', 'modal-content', 'load-confirm-modal', 'my-beads-modal',
  'save-dialog', 'export-confirm-dialog', 'brand-switch-dialog', 'replace-dialog',
  'quantizer-zoom',
])

/**
 * 扫描所有 JSX,找出声明了浮层容器类名却没有 dialog 语义的元素。
 *
 * 类名取值有两种写法,都必须认:
 *   className="admin-modal wide"
 *   className={`admin-modal${wide ? ' wide' : ''}`}   ← AdminPanel 用的这种
 * 所以不按空白切分,而是按类名字符集 [A-Za-z0-9_-] 提取 token ——
 * 这样模板字符串里的插值表达式不会干扰,`my-beads-modal-actions`
 * 也不会被误切成 `my-beads-modal`。
 */
function scanDialogContainers() {
  const found = []
  for (const file of walk(SRC)) {
    const code = readFileSync(file, 'utf8')
    for (const line of code.split(/\r?\n/)) {
      const m = line.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/)
      if (!m) continue
      const raw = m[1] ?? m[2]
      const tokens = raw.match(/[A-Za-z][A-Za-z0-9_-]*/g) || []
      if (!tokens.some((tk) => DIALOG_CONTAINERS.has(tk))) continue
      const hasDialog = /[Dd]ialogProps\}/.test(line) || /role="(?:dialog|alertdialog)"/.test(line)
      found.push({ file: relative(SRC, file), line: line.trim().slice(0, 90), hasDialog })
    }
  }
  return found
}

describe('移动端全屏浮层契约', () => {
  it('至少收集到已知的浮层类(防止正则失配导致空跑通过)', () => {
    expect(overlays).toEqual(expect.arrayContaining([
      'modal-overlay',
      'contact-overlay',
      'admin-modal-overlay',
      'users-confirm-overlay',
      'profile-confirm-overlay',
      'load-confirm-overlay',
      'my-beads-modal-overlay',
      'quantizer-zoom',
    ]))
  })

  it.each(overlays)('%s 已在 useKeyboardSafe 的 OVERLAY_SELECTOR 中', (cls) => {
    expect(KEYBOARD_SAFE).toContain(`'.${contractOwner(cls)}'`)
  })

  it.each(overlays)('%s 已加入 index.css 共享浮层组', (cls) => {
    const owner = contractOwner(cls)
    if (owner === 'modal-overlay') {
      expect(cssBlockFor('.modal-overlay')).toContain('inset: 0')
      return
    }
    const sharedStart = INDEX_CSS.indexOf('.contact-overlay,\n.admin-modal-overlay,')
    expect(sharedStart).toBeGreaterThan(-1)
    const sharedEnd = INDEX_CSS.indexOf('}', sharedStart)
    expect(INDEX_CSS.slice(sharedStart, sharedEnd)).toContain(`.${owner}`)
  })

  it.each(overlays)('%s 打开时淡出移动端底部工具栏', (cls) => {
    expect(INDEX_CSS).toContain(`body:has(.${contractOwner(cls)}) .mobile-toolbar`)
  })

  it('共享浮层组用 inset:0 盖满布局视口,并同时让出顶部偏移与键盘高度', () => {
    const block = cssBlockFor('.contact-overlay')
    expect(block).toContain('inset: 0')
    expect(block).toContain('var(--visible-vh-top')
    expect(block).toContain('var(--keyboard-height')
  })

  it('.modal-overlay 同样让出顶部偏移与键盘高度', () => {
    const block = cssBlockFor('.modal-overlay')
    expect(block).toContain('var(--visible-vh-top')
    expect(block).toContain('var(--keyboard-height')
  })

  it('居中组子元素有高度上限与滚动兜底,不会在低高度视口被裁顶', () => {
    // overlay 自身 overflow:hidden,居中子元素若没有 max-height,横屏/键盘弹起后
    // 上下同时溢出 → 顶部被裁且滚不到。
    const confirmBlock = ruleWith('.users-confirm-overlay > *', 'max-height')
    expect(confirmBlock, '确认框类缺少居中子元素兜底').toBeTruthy()
    expect(confirmBlock).toContain('max-height: 100%')
    expect(confirmBlock).toContain('overflow-y: auto')
    // 选择器组必须覆盖三类确认框
    expect(INDEX_CSS).toMatch(/\.profile-confirm-overlay > \*/)
    expect(INDEX_CSS).toMatch(/\.load-confirm-overlay > \*/)
    // 行高锁定:auto 行会让子元素的 max-height:100% 解析到「长高后的行」而失效
    expect(ruleWith('.admin-modal-overlay', 'grid-template-rows')).toContain('minmax(0, 1fr)')
    expect(ruleWith('.modal-overlay', 'grid-template-rows')).toContain('minmax(0, 1fr)')
    expect(ruleWith('.modal-overlay > *', 'max-height')).toContain('max-height: 100%')
  })

  it('居中浮层内层容器不得用 overflow:hidden 覆盖滚动兜底', () => {
    // index.css 给居中子元素加了 max-height:100% + overflow-y:auto,组件若再写
    // overflow:hidden 会把它覆盖掉 —— 低高度视口下按钮被裁且滚不到。
    // 允许 `overflow: hidden auto`(横向裁圆角、纵向可滚)。
    const cssFiles = []
    const collect = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) collect(full)
        else if (name.endsWith('.css')) cssFiles.push(full)
      }
    }
    collect(SRC)
    const offenders = []
    for (const file of cssFiles) {
      const code = readFileSync(file, 'utf8')
      // 只查「浮层/弹层」相关规则块里的 overflow: hidden(单独出现)
      for (const m of code.matchAll(/\.([a-z-]*(?:overlay|modal|confirm)[a-z-]*)\s*(?:>\s*\*)?\s*\{([^}]*)\}/gi)) {
        const body = m[2]
        if (/overflow\s*:\s*hidden\s*;/.test(body) && !/overflow\s*:\s*hidden\s+auto/.test(body)) {
          // overlay 自身隐藏滚动是刻意的(见 index.css 注释);只约束内层 modal 容器
          if (/^\.[a-z-]*-overlay$/.test(`.${m[1]}`)) continue
          offenders.push(`${relative(SRC, file)} → .${m[1]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('组件不再自建浮层高度(top:var(--visible-vh-top))', () => {
    // myBeadsPage.css 曾用 top:var(--visible-vh-top)+height:var(--visible-vh) 自建浮层,
    // 与共享组的 inset:0 冲突;约定:组件只保留背景/层级/内边距。
    const offenders = []
    for (const file of walk(SRC)) {
      const code = readFileSync(file, 'utf8')
      if (/top:\s*var\(--visible-vh-top/.test(code)) offenders.push(relative(SRC, file))
    }
    expect(offenders).toEqual([])
  })

  it('每个浮层容器都挂了 useDialogA11y(role/aria-modal/Escape/焦点)', () => {
    // 规格 08 §5。此前只有三个组件手写 role="dialog",Escape 全站缺失。
    // 现在统一走 hook:承载内容的容器必须展开 *DialogProps 或显式写 role。
    const offenders = scanDialogContainers()
      .filter((hit) => !hit.hasDialog)
      .map((hit) => `${hit.file}: ${hit.line}`)
    expect(offenders).toEqual([])
  })

  it('扫描器确实覆盖到模板字符串写法的容器(防止契约测试空跑)', () => {
    // AdminPanel 的浮层写成 className={`admin-modal${wide ? ' wide' : ''}`},
    // 早期版本只匹配 className="..." 双引号形式,把整个文件漏掉却照样通过。
    // 这条自检保证扫描器永远至少命中它 —— 一旦正则退化,这里先红。
    const files = scanDialogContainers().map((hit) => hit.file)
    expect(files.some((f) => f.endsWith('AdminPanel.jsx'))).toBe(true)
  })
})
