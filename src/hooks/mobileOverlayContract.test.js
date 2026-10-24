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
const CLICK_CATCHERS = new Set(['export-menu-overlay', 'brand-menu-overlay', 'selection-menu-overlay'])

// 自带完整浮层基础的类:其他浮层可以叠加它们获得同一套契约
const SHARED_BASES = new Set(['modal-overlay', 'admin-modal-overlay',
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

/**
 * 从一段 JSX 起始标签里取出 className 与 style 的原始文本。
 *
 * 不能用正则 `className=...[^>]*?style=` —— 本仓库每个浮层根元素都在 style
 * 之前挂着 `onClick={() => ...}`,箭头函数里的 '>' 会把匹配截断,导致
 * 全树 0 组命中、断言在空集上通过。这里按引号与花括号配对扫描,
 * 只在**标签层级**遇到 '>' 才结束。
 *
 * @returns {{className: string, style: string}|null}
 */
function parseJsxAttrs(tag) {
  const attrs = {}
  let i = tag.indexOf('<') + 1
  // 跳过标签名
  while (i < tag.length && /[A-Za-z0-9]/.test(tag[i])) i++

  const readValue = (j) => {
    // 跳过空白与 '='
    while (j < tag.length && /\s/.test(tag[j])) j++
    if (tag[j] !== '=') return { value: '', end: j }
    j++
    while (j < tag.length && /\s/.test(tag[j])) j++
    const quote = tag[j]
    if (quote === '"' || quote === "'") {
      const close = tag.indexOf(quote, j + 1)
      if (close === -1) return { value: tag.slice(j + 1), end: tag.length }
      return { value: tag.slice(j + 1, close), end: close + 1 }
    }
    if (quote === '{') {
      // 花括号配对,内部的字符串引号要一并跳过
      let depth = 0
      let k = j
      while (k < tag.length) {
        const ch = tag[k]
        if (ch === '"' || ch === "'" || ch === '`') {
          let close = k + 1
          while (close < tag.length && tag[close] !== ch) close++
          k = close + 1
          continue
        }
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) return { value: tag.slice(j + 1, k), end: k + 1 }
        }
        k++
      }
      return { value: tag.slice(j + 1), end: tag.length }
    }
    return { value: '', end: j }
  }

  while (i < tag.length) {
    while (i < tag.length && /\s/.test(tag[i])) i++
    if (tag[i] === '>' || tag[i] === '/' || i >= tag.length) break
    const nameStart = i
    while (i < tag.length && /[A-Za-z0-9_:.-]/.test(tag[i])) i++
    const name = tag.slice(nameStart, i)
    if (!name) { i++; continue }
    const { value, end } = readValue(i)
    i = end
    attrs[name] = value
  }

  if (!('className' in attrs) && !('style' in attrs)) return null
  return { className: attrs.className || '', style: attrs.style || '' }
}

/**
 * 切出源码里的 JSX 起始标签。
 *
 * 同样不能交给正则:`<[A-Za-z][^<>]*?>` 会在 onClick={() => ...} 的 '>'
 * 处提前收尾,把 style 截掉。这里逐字符走,维护花括号深度与字符串状态,
 * 只在**标签层级**的 '>' 结束。
 */
function findJsxTags(code) {
  const tags = []
  for (let i = 0; i < code.length; i++) {
    if (code[i] !== '<') continue
    const next = code[i + 1]
    if (!next || !/[A-Za-z]/.test(next)) continue

    let depth = 0
    let j = i + 1
    while (j < code.length) {
      const ch = code[j]
      if (ch === '"' || ch === "'" || ch === '`') {
        let close = j + 1
        while (close < code.length && code[close] !== ch) {
          if (code[close] === '\\') close++
          close++
        }
        j = close + 1
        continue
      }
      if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth === 0) break
      j++
    }
    tags.push(code.slice(i, j + 1))
    i = j
  }
  return tags
}

/**
 * 全树扫描:找出所有挂共享浮层类、且带 style 属性的 JSX 元素。
 * @param {string} [code] - 传入源码文本则只扫这一段(用于自检),省略则扫全树
 * @param {string} [file] - code 模式下的显示名
 * @returns {Array<{file: string, cls: string, style: string}>}
 */
function scanOverlayElements(code, file = '<sample>') {
  const scan = (text, name) => {
    const hits = []
    for (const tag of findJsxTags(text)) {
      const parsed = parseJsxAttrs(tag)
      if (!parsed) continue
      const tokens = parsed.className.match(/[A-Za-z][A-Za-z0-9_-]*/g) || []
      const shared = tokens.filter((tk) => SHARED_BASES.has(tk))
      if (shared.length === 0) continue
      if (!parsed.style) continue
      hits.push({ file: name, cls: shared.join(' '), style: parsed.style })
    }
    return hits
  }

  if (typeof code === 'string') return scan(code, file)
  const hits = []
  for (const f of walk(SRC)) hits.push(...scan(readFileSync(f, 'utf8'), relative(SRC, f)))
  return hits
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
  'export-modal-content', 'admin-modal', 'admin-gate-confirm',
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
    const sharedStart = INDEX_CSS.indexOf('.admin-modal-overlay,\n.users-confirm-overlay,')
    expect(sharedStart).toBeGreaterThan(-1)
    const sharedEnd = INDEX_CSS.indexOf('}', sharedStart)
    expect(INDEX_CSS.slice(sharedStart, sharedEnd)).toContain(`.${owner}`)
  })

  it.each(overlays)('%s 打开时淡出移动端底部工具栏', (cls) => {
    expect(INDEX_CSS).toContain(`body:has(.${contractOwner(cls)}) .mobile-toolbar`)
  })

  it('共享浮层组用 inset:0 盖满布局视口,并同时让出顶部偏移与键盘高度', () => {
    const block = cssBlockFor('.admin-modal-overlay')
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

  it('组件不再重抄共享浮层的键盘补偿表达式', () => {
    // 计划 §6.2:「禁止直接保留『共享 CSS 负责一半、组件内联 CSS 再定义 height/padding/
    // overflow』的隐式优先级。」共享组已经用 --overlay-pad 参数化了内边距基数,
    // 组件若要调整留白只应设 --overlay-pad,不得自己重写 max(..., var(--keyboard-height) ...)
    // 或 max(..., var(--visible-vh-top) ...) —— 那样共享组调整时组件会静默失配。
    // index.css 自身除外(它就是共享组的定义处)。
    const offenders = []
    const check = (file, code) => {
      const lines = code.split(/\r?\n/)
      lines.forEach((line, i) => {
        if (!/var\(--(?:keyboard-height|visible-vh-top)/.test(line)) return
        // 注释行不算
        const trimmed = line.trim()
        if (trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('//')) return
        // 只允许以 --overlay-pad 表达内边距(不直接引用补偿变量)
        offenders.push(`${relative(SRC, file)}:${i + 1} ${trimmed.slice(0, 70)}`)
      })
    }
    for (const file of walk(SRC)) check(file, readFileSync(file, 'utf8'))
    const collectCss = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) collectCss(full)
        else if (name.endsWith('.css') && full !== join(SRC, 'index.css')) {
          check(full, readFileSync(full, 'utf8'))
        }
      }
    }
    collectCss(SRC)
    expect(offenders).toEqual([])
  })

  it('组件 CSS 不得在共享浮层类上重写定位与内边距(不限于引用补偿变量的写法)', () => {
    // 上一条只拦「引用 --keyboard-height / --visible-vh-top」的行,但真正要防的回归
    // 写成 `padding: 16px` 就绕过去了 —— 同等特异性,且组件 <style> 后加载所以胜出。
    // 这里按「选择器主体是否就是共享浮层类」判断,拦下任意 padding / height /
    // top / bottom / inset 声明;留白只允许通过 --overlay-pad 参数化。
    const DECL_RE = /(?:^|[;{])\s*(padding|padding-(?:top|right|bottom|left)|height|min-height|max-height|top|bottom|inset|inset-(?:block|inline)(?:-(?:start|end))?)\s*:/gi

    const collectCss = (dir, out = []) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) collectCss(full, out)
        else if (name.endsWith('.css') && full !== join(SRC, 'index.css')) out.push(full)
      }
      return out
    }

    /** 取选择器每一段的主体(最后一个组合子之后的部分),判断是否为共享浮层类 */
    const subjects = (selector) => selector
      .split(',')
      .map((part) => part.trim().split(/\s+|>/).filter(Boolean).pop() || '')

    const isSharedSubject = (compound) => {
      const tokens = compound.match(/[A-Za-z][A-Za-z0-9_-]*/g) || []
      return tokens.some((tk) => SHARED_BASES.has(tk))
    }

    const offenders = []
    for (const file of collectCss(SRC)) {
      const code = readFileSync(file, 'utf8')
      for (const m of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim()
        if (!selector || selector.startsWith('@')) continue
        if (!subjects(selector).some(isSharedSubject)) continue
        const body = m[2].replace(/\/\*[\s\S]*?\*\//g, '')
        for (const d of body.matchAll(DECL_RE)) {
          offenders.push(`${relative(SRC, file)} → ${selector} 声明了 ${d[1]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('上述规则确实会拦截(自检:合成样式表必须被判违规)', () => {
    // 防止 DECL_RE / subjects() 退化后整条断言在空集上通过。
    const sample = [
      '.my-beads-modal-overlay { padding: 16px; }',
      '.quantizer-zoom { padding-bottom: 24px; }',
      '.load-confirm-overlay { height: 100vh; }',
      '.modal-overlay { top: 0; }',
    ].join('\n')

    const DECL_RE = /(?:^|[;{])\s*(padding|padding-(?:top|right|bottom|left)|height|min-height|max-height|top|bottom|inset|inset-(?:block|inline)(?:-(?:start|end))?)\s*:/gi
    const subjects = (selector) => selector
      .split(',')
      .map((part) => part.trim().split(/\s+|>/).filter(Boolean).pop() || '')
    const isSharedSubject = (compound) => {
      const tokens = compound.match(/[A-Za-z][A-Za-z0-9_-]*/g) || []
      return tokens.some((tk) => SHARED_BASES.has(tk))
    }

    let hits = 0
    for (const m of sample.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim()
      if (!subjects(selector).some(isSharedSubject)) continue
      hits += [...m[2].matchAll(DECL_RE)].length
    }
    expect(hits).toBe(4)

    // 反向:允许的写法不得被误判
    const allowed = '.my-beads-modal-overlay { z-index: 1200; background: #000; }'
    let falsePositive = 0
    for (const m of allowed.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!subjects(m[1].trim()).some(isSharedSubject)) continue
      falsePositive += [...m[2].matchAll(DECL_RE)].length
    }
    expect(falsePositive).toBe(0)
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

  it('浮层不得用内联 style 覆盖定位与高度(共享组是唯一来源)', () => {
    // 规格 §8.1 第 5 条:检查 top/height/padding-bottom 未被 inline style 意外覆盖。
    // 内联 style 的优先级高于任何选择器 —— 一旦浮层根元素上写了 height/top,
    // 共享组的 inset:0 + 100dvh 就静默失效,键盘补偿也跟着失效。
    //
    // 注意:全树当前**没有**任何带 style 的浮层元素,所以这条断言的强度完全取决于
    // 扫描器能否看见真实写法 —— 见下面那条自检用例。旧正则 [^>]*? 跨不过
    // onClick={() => ...} 里的 '>',全树 0 组命中,断言在空集上永远通过。
    const offenders = []
    for (const hit of scanOverlayElements()) {
      for (const prop of ['height', 'top', 'bottom', 'position', 'paddingBottom']) {
        if (new RegExp(`(^|[,{\\s])${prop}\\s*:`, 'i').test(hit.style)) {
          offenders.push(`${hit.file} → ${hit.cls}: ${prop}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('浮层根元素不得被 style 属性直接赋值(绕过 CSS 变量体系)', () => {
    // style={{ height: 'var(--visible-vh)' }} 这类写法虽然引用了正确变量,
    // 但把「谁负责高度」拆成两处。浮层高度只应由 index.css 共享组决定。
    const offenders = []
    for (const hit of scanOverlayElements()) {
      if (/--visible-vh|--keyboard-height|100dvh|100vh/.test(hit.style)) {
        offenders.push(`${hit.file} → ${hit.cls}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('扫描器能看见 onClick 箭头函数之后的 style(防止空集上通过)', () => {
    // 回归:旧正则 [^>]*? 无法跨越 onClick={() => ...} 里的 '>',
    // 真实写法(style 写在箭头函数之后)全被漏掉。
    // 这里注入一份与仓库真实写法同构的样本,断言扫描器按括号配对解析。
    // 模板字符串写法(AdminPanel / MyBeadsPage 的真实形态):用拼接构造,
    // 避免被 lint 当成「字符串里出现了意外的模板占位符」。
    const dollar = '$'
    const sample = [
      '<div className="modal-overlay" onClick={() => setOpen(false)} style={{ height: \'100dvh\' }}>',
      `<div className={\`my-beads-modal-overlay${dollar}{active ? ' on' : ''}\`} onClick={onCancel} style={{ top: 0 }}>`,
    ].join('\n')
    const hits = scanOverlayElements(sample)

    expect(hits).toHaveLength(2)
    expect(hits[0].cls).toBe('modal-overlay')
    expect(hits[0].style).toContain('100dvh')
    expect(hits[1].style).toContain('top')

    // 再验证断言本身会红:同样两条样本必须被判为违规
    const heightOffender = hits.filter((h) => /(^|[,{\s])height\s*:/i.test(h.style))
    const varOffender = hits.filter((h) => /100dvh|--visible-vh/.test(h.style))
    expect(heightOffender).toHaveLength(1)
    expect(varOffender).toHaveLength(1)
  })
})
