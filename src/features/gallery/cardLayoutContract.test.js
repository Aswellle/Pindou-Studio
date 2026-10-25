import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 图库卡片版式契约。
 *
 * 背景:模板图案的宽高比跨度极大(11×37 的「感叹号」是 0.30,48×27 的「帽子」是 1.78)。
 * 只要预览区的高度还跟着图案比例走,CSS Grid 的行高就会被该行最高的一张卡撑开,
 * 同排邻卡一起变形 —— 实测一行被撑到 1044px(正常 405px)。
 *
 * 这类问题 jsdom 测不出来(没有布局引擎),只能靠源码断言锁住。
 */

const SRC = join(process.cwd(), 'src')
const GALLERY_CSS = readFileSync(join(SRC, 'features', 'gallery', 'gallery.css'), 'utf8')
const THUMB_JSX = readFileSync(join(SRC, 'components', 'ThumbnailCanvas.jsx'), 'utf8')

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

/** 同一选择器出现多次时(媒体查询覆盖)取全部块 */
function allRuleBodies(css, selector) {
  const out = []
  let from = 0
  for (;;) {
    const idx = css.indexOf(selector, from)
    if (idx === -1) break
    const open = css.indexOf('{', idx)
    if (open === -1) break
    let depth = 0
    let end = -1
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') {
        depth--
        if (depth === 0) { end = i; break }
      }
    }
    if (end === -1) break
    out.push(css.slice(open + 1, end))
    from = end + 1
  }
  return out
}

describe('图库卡片版式契约', () => {
  it('预览区是固定 1:1,高度不随图案宽高比变化', () => {
    const thumb = ruleBody(GALLERY_CSS, '.template-thumbnail {')
    expect(thumb).toContain('aspect-ratio: 1 / 1')
    expect(thumb).toContain('flex: 0 0 auto')
    // 去掉注释后不能有 min-height / 裸 height 声明(那会让框跟着内容长)
    const decls = thumb.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(decls).not.toMatch(/(^|\s|\{)height:/)
    expect(decls).not.toContain('min-height')
  })

  it('画布用定尺寸盒子 + contain,不按位图原始比例参与布局', () => {
    const canvas = ruleBody(GALLERY_CSS, '.template-thumbnail canvas')
    expect(canvas).toContain('position: absolute')
    expect(canvas).toContain('object-fit: contain')
    // 百分比高度在 aspect-ratio 父级下会退回 auto → 图案撑破预览框
    expect(canvas).not.toMatch(/height:\s*100%/)
    expect(canvas).toMatch(/width:\s*calc\(100% - \d+px\)/)
    expect(canvas).toMatch(/height:\s*calc\(100% - \d+px\)/)
  })

  it('网格列用 minmax(0, 1fr),避免内容 min-content 撑宽列', () => {
    const grid = ruleBody(GALLERY_CSS, '.templates-grid {')
    expect(grid).toContain('minmax(0, 1fr)')
  })

  it('卡片是三段式纵向布局,页脚贴底', () => {
    const card = ruleBody(GALLERY_CSS, '.template-card {')
    expect(card).toContain('display: flex')
    expect(card).toContain('flex-direction: column')
    expect(card).toContain('height: 100%')

    const info = ruleBody(GALLERY_CSS, '.template-info {')
    expect(info).toContain('flex: 1 1 auto')
  })

  it('名称单行省略,不换行撑高卡片', () => {
    const name = ruleBody(GALLERY_CSS, '.template-name {')
    expect(name).toContain('white-space: nowrap')
    expect(name).toContain('text-overflow: ellipsis')
  })

  it('徽章行不换行(换行会让同排卡片高度不一致)', () => {
    // .template-meta 在移动端媒体查询里也有一条覆盖规则,这里要的是基础规则
    const blocks = allRuleBodies(GALLERY_CSS, '.template-meta {')
    const base = blocks.find((b) => b.includes('display: flex'))
    expect(base).toBeTruthy()
    expect(base).toContain('flex-wrap: nowrap')
  })
  it('色点行不换行,溢出裁切', () => {
    const colors = ruleBody(GALLERY_CSS, '.template-colors {')
    expect(colors).toContain('flex-wrap: nowrap')
    expect(colors).toContain('overflow: hidden')
  })
})

describe('ThumbnailCanvas 渲染契约', () => {
  it('位图按显示尺寸 × dpr 重建(避免非整数缩放产生网格摩尔纹)', () => {
    expect(THUMB_JSX).toContain('devicePixelRatio')
    expect(THUMB_JSX).toContain('getBoundingClientRect')
    // 位图尺寸必须写回 canvas.width/height,否则会退回固定 8px/格
    expect(THUMB_JSX).toMatch(/canvas\.width\s*=\s*bitmapW/)
    expect(THUMB_JSX).toMatch(/canvas\.height\s*=\s*bitmapH/)
  })

  it('显示尺寸变化时重绘(ResizeObserver)', () => {
    expect(THUMB_JSX).toContain('ResizeObserver')
  })

  it('列数取最大行长,参差 pattern 不丢右侧格子', () => {
    expect(THUMB_JSX).toMatch(/derived\.width\s*\|\|/)
  })

  it('画布盒子比例由逻辑网格决定,不由位图决定', () => {
    // canvas 是替换元素,固有尺寸就是位图的 width/height 属性。只约束一维
    // (max-width/max-height)时,浏览器会拿位图比例算出另一维;而 effect 又按
    // 量到的盒子设位图 —— 两者互相喂养,一次被压扁就再也回不来(竖长图案在
    // 方形预览区里只剩一条细缝)。style 上的 aspect-ratio 让逻辑网格单方面
    // 决定盒子形状,位图只是往里填像素。
    expect(THUMB_JSX).toMatch(/aspectRatio/)
    expect(THUMB_JSX).toMatch(/`\$\{width\}\s*\/\s*\$\{height\}`/)
  })

  it('画布不铺不透明底色,容器底色才是纸', () => {
    // 曾经这里 fillRect 刷满白色,非正方形图案四周就多出一圈白边,
    // 在米色的预览区里看着像图片没对齐。
    // 断言前先剥掉注释 —— 组件头注释里就写着这条历史,不能当成代码命中。
    const code = THUMB_JSX.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/fillStyle\s*=\s*['"]#fff/i)
    expect(code).toMatch(/clearRect/)
  })
})
