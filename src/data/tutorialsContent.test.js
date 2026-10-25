import { describe, it, expect } from 'vitest'
import { TUTORIALS_ZH } from './tutorials.zh'
import { TUTORIALS_EN } from './tutorials.en'
import { TUTORIALS_JA } from './tutorials.ja'
import { TUTORIALS_KO } from './tutorials.ko'

/**
 * 教程内容的**事实与本地化契约**。
 *
 * 教程讲的是有客观答案的手工工艺,写错了用户照着做会毁作品,所以这里
 * 把已核实过的关键事实锁住。数据来源:
 *   - 拼豆起源与年份:Wikipedia "Fuse beads"(Gunnar Knutsson,瑞典,
 *     1962 年申请专利;Hama 1971 年开始生产;Perler 1981 年创立)
 *   - 熨烫方法:Perler 官方 FAQ(中温、关闭蒸汽、边熨边看、正反两面)
 *   - 胶带法:Perler 官方 "The Tape Method for Fusing Large Projects"
 *     (美纹纸盖住珠面 → 连胶带揭起 → 放到熨衣板上熨,不是缠板边)
 *   - 底板结构:珠子是套在板子的**柱子**上,不是嵌进孔里
 *   - 珠子规格:Hama 官方 FAQ 分 mini 2.5mm / midi 5mm / maxi 10mm
 *
 * 这些断言只覆盖"说错了会误导操作"的事实,不锁具体措辞 —— 文案
 * 可以随时改,但事实和术语不能退回错误版本。
 */

const ALL = {
  'zh-CN': TUTORIALS_ZH,
  'en-US': TUTORIALS_EN,
  'ja-JP': TUTORIALS_JA,
  'ko-KR': TUTORIALS_KO,
}

/** 摊平成纯文本,便于做整篇关键词断言 */
function flatText(sections) {
  const parts = []
  for (const section of sections) {
    for (const tutorial of section.children) {
      for (const block of tutorial.blocks || []) {
        if (block.text) parts.push(block.text)
        if (block.title) parts.push(block.title)
        if (block.caption) parts.push(block.caption)
        if (block.items) parts.push(...block.items)
        if (block.headers) parts.push(...block.headers)
        if (block.rows) for (const row of block.rows) parts.push(...row)
      }
    }
  }
  return parts.join('\n')
}

describe('教程内容 · 四种语言结构一致', () => {
  const zhIds = TUTORIALS_ZH.map(s => s.id)
  const zhChildIds = TUTORIALS_ZH.flatMap(s => s.children.map(c => c.id))

  it('章节与文章 id 集合完全一致(切语言不会丢失导航项)', () => {
    for (const [lang, sections] of Object.entries(ALL)) {
      expect(sections.map(s => s.id), lang).toEqual(zhIds)
      expect(sections.flatMap(s => s.children.map(c => c.id)), lang).toEqual(zhChildIds)
    }
  })

  it('每种语言都有 6 章 18 篇', () => {
    for (const [lang, sections] of Object.entries(ALL)) {
      expect(sections, lang).toHaveLength(6)
      expect(sections.flatMap(s => s.children), lang).toHaveLength(18)
    }
  })

  it('每篇文章都有可渲染的 blocks', () => {
    for (const [lang, sections] of Object.entries(ALL)) {
      for (const tutorial of sections.flatMap(s => s.children)) {
        expect(Array.isArray(tutorial.blocks), `${lang}/${tutorial.id}`).toBe(true)
        expect(tutorial.blocks.length, `${lang}/${tutorial.id}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('教程内容 · 已核实的事实不再退回错误版本', () => {
  it('拼豆起源不再写成「起源于美国」', () => {
    const zh = flatText(TUTORIALS_ZH)
    expect(zh).not.toMatch(/起源于美国/)
    expect(zh).not.toMatch(/美国发源/)
    // 正确的说法:瑞典 + 1960 年代 + 养老院康复
    expect(zh).toMatch(/瑞典/)
    expect(zh).toMatch(/1960|六十年代|20 ?世纪 ?60/)
  })

  it('英文版不再写 "originated in the United States"', () => {
    const en = flatText(TUTORIALS_EN)
    expect(en).not.toMatch(/originated in the United States/i)
    expect(en).toMatch(/Sweden/)
  })

  it('日文版不再写「アメリカ発祥」', () => {
    expect(flatText(TUTORIALS_JA)).not.toMatch(/アメリカ発祥/)
  })

  it('韩文版不再写「미국에서 시작」', () => {
    expect(flatText(TUTORIALS_KO)).not.toMatch(/미국에서 시작/)
  })

  it('底板说明:珠子是套在柱子上,不是嵌进孔里', () => {
    const zh = flatText(TUTORIALS_ZH)
    expect(zh).not.toMatch(/嵌入一个孔位/)
    expect(zh).toMatch(/套在柱子上|套在底板/)
  })

  it('胶带法是「整片揭起去熨」,不是「缠住板子四边」', () => {
    const zh = flatText(TUTORIALS_ZH)
    expect(zh).not.toMatch(/缠绕 pegboard 四边/)
    expect(zh).not.toMatch(/缠绕 pegboard 四边/)
    expect(zh).toMatch(/揭下来|揭起|连胶带/)
    // 官方明确说胶带法不适合 2.6mm 迷你珠
    expect(zh).toMatch(/不适合.*迷你珠|迷你珠.*不适合/)
  })

  it('不再出现无法核实的品牌 Sillyette', () => {
    for (const [lang, sections] of Object.entries(ALL)) {
      expect(flatText(sections), lang).not.toMatch(/Sillyette/i)
    }
  })

  it('不再出现不存在的工具名 Webp-gif', () => {
    for (const [lang, sections] of Object.entries(ALL)) {
      expect(flatText(sections), lang).not.toMatch(/Webp-gif/i)
    }
  })

  it('不再把 57×57 / 87×87 当成单块底板规格', () => {
    for (const [lang, sections] of Object.entries(ALL)) {
      const text = flatText(sections)
      expect(text, lang).not.toMatch(/57×57/)
      expect(text, lang).not.toMatch(/87×87/)
      expect(text, lang).not.toMatch(/140×140/)
      expect(text, lang).not.toMatch(/100×100/)
    }
  })

  it('Artkal 产地不再写成「中国/荷兰」', () => {
    for (const [lang, sections] of Object.entries(ALL)) {
      expect(flatText(sections), lang).not.toMatch(/中国\/荷兰|China\/Netherlands/)
    }
  })
})

describe('教程内容 · 本地化', () => {
  // 只在简体中文使用、日文/韩文不会出现的字形
  const SIMPLIFIED_ONLY = /[这个么时颜烫胶颗们没说应该铁图纹发过样边实际东华产开关闭设备页选连续级质问务]/

  it('日文数据里没有简体中文串档', () => {
    const text = flatText(TUTORIALS_JA)
    expect(text).not.toMatch(SIMPLIFIED_ONLY)
  })

  it('韩文数据里没有简体中文串档', () => {
    const text = flatText(TUTORIALS_KO)
    expect(text).not.toMatch(SIMPLIFIED_ONLY)
  })

  it('日文用「プレート」而不是英文 Pegboard 作为正文术语', () => {
    const text = flatText(TUTORIALS_JA)
    expect(text).toMatch(/プレート/)
    // 只在词源说明里允许出现一次 pegboard
    const count = (text.match(/Pegboard|pegboard/g) || []).length
    expect(count).toBeLessThanOrEqual(1)
  })

  it('韩文用「플레이트」而不是英文 Pegboard 作为正文术语', () => {
    const text = flatText(TUTORIALS_KO)
    expect(text).toMatch(/플레이트/)
    const count = (text.match(/Pegboard|pegboard/g) || []).length
    expect(count).toBeLessThanOrEqual(1)
  })

  it('中文用「底板」而不是 Pegboard 作为正文术语', () => {
    const text = flatText(TUTORIALS_ZH)
    expect(text).toMatch(/底板/)
    const count = (text.match(/Pegboard|pegboard/g) || []).length
    expect(count).toBeLessThanOrEqual(1)
  })

  it('英文保留 pegboard 这个通用叫法', () => {
    expect(flatText(TUTORIALS_EN)).toMatch(/pegboard/i)
  })
})
