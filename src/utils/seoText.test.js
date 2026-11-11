import { describe, it, expect } from 'vitest'
import { plainText, clampSeoDescription } from './seoText'

describe('plainText', () => {
  it('压缩换行与连续空格', () => {
    expect(plainText('a   b\n c')).toBe('a b c')
  })

  it('全角空格归一为半角', () => {
    expect(plainText('拼豆　图纸')).toBe('拼豆 图纸')
  })

  it('空值安全', () => {
    expect(plainText(null)).toBe('')
    expect(plainText(undefined)).toBe('')
  })
})

describe('clampSeoDescription', () => {
  it('不超长时原样返回,不补省略号', () => {
    expect(clampSeoDescription('短描述。', 90)).toBe('短描述。')
  })

  it('超长时优先在句末标点收尾(不留半句)', () => {
    const text = '第一句话讲清楚这是什么产品。第二句话继续展开细节说明,还有很多内容没有写完就到了长度上限。'
    const out = clampSeoDescription(text, 30)
    expect(out).toBe('第一句话讲清楚这是什么产品。')
    expect(out.endsWith('…')).toBe(false)
  })

  it('句末标点太靠前时改为硬截断并补省略号', () => {
    const text = '短。后面是一段没有任何标点的长文本需要被截断处理掉才能符合描述长度上限要求'
    const out = clampSeoDescription(text, 30)
    expect(out.endsWith('…')).toBe(true)
    expect([...out].length).toBe(30)
  })

  it('完全没有标点且超长 → 硬截断', () => {
    const out = clampSeoDescription('拼'.repeat(120), 40)
    expect(out.endsWith('…')).toBe(true)
    expect([...out].length).toBe(40)
  })

  it('英文句末标点同样可作为收尾边界', () => {
    const text = 'Free bead pattern generator for everyone. It converts photos into charts and exports PNG.'
    const out = clampSeoDescription(text, 45)
    expect(out).toBe('Free bead pattern generator for everyone.')
  })

  it('max 非法时回退 90', () => {
    const out = clampSeoDescription('拼'.repeat(200), 0)
    expect([...out].length).toBe(90)
  })
})

describe('clampSeoDescription · 第一句超长', () => {
  it('上限内无标点时放宽到 1.5 倍取完整句,不硬切', () => {
    const sentence = `${'拼豆'.repeat(40)}。`
    const out = clampSeoDescription(`${sentence}后面继续写很多很多内容。`, 60)
    expect(out).toBe(sentence)
    expect(out.endsWith('…')).toBe(false)
  })
})
