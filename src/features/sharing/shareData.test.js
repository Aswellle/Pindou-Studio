import { describe, it, expect } from 'vitest'
import {
  normalizeShareText,
  sanitizeShareInput,
  validateSharePattern,
  shareStats,
  rowToShare,
  rowToShareSummary,
} from './shareData'

function makePattern(width, height) {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ((x + y) % 2 === 0 ? '#FF0000' : null))
  )
}

describe('normalizeShareText', () => {
  it('压缩空白、去除控制字符', () => {
    expect(normalizeShareText('  小鸭   图纸  ', 80)).toBe('小鸭 图纸')
    expect(normalizeShareText('a\u0000b\u001Fc', 80)).toBe('a b c')
  })

  it('按字符数截断', () => {
    expect(normalizeShareText('ab'.repeat(50), 80)).toHaveLength(80)
  })

  it('非字符串返回空串', () => {
    expect(normalizeShareText(null, 10)).toBe('')
    expect(normalizeShareText(123, 10)).toBe('')
  })
})

describe('sanitizeShareInput', () => {
  it('标题为空且无回退时报 titleRequired', () => {
    const r = sanitizeShareInput({ title: '   ', description: 'd', authorLabel: 'a' })
    expect(r.error).toBe('titleRequired')
    expect(r.title).toBe('')
  })

  it('标题为空时回退到作品名', () => {
    const r = sanitizeShareInput({ title: '', fallbackTitle: '我的作品' })
    expect(r.error).toBeNull()
    expect(r.title).toBe('我的作品')
  })

  it('各字段分别按上限截断', () => {
    const r = sanitizeShareInput({
      title: 't'.repeat(100),
      description: 'd'.repeat(200),
      authorLabel: 'a'.repeat(60),
    })
    expect(r.title).toHaveLength(80)
    expect(r.description).toHaveLength(160)
    expect(r.authorLabel).toHaveLength(40)
  })
})

describe('validateSharePattern', () => {
  it('合法 9×9 通过并推导宽高', () => {
    const r = validateSharePattern(makePattern(9, 9))
    expect(r.ok).toBe(true)
    expect(r.width).toBe(9)
    expect(r.height).toBe(9)
  })

  it('过小 / 过大拒绝;200×200 恰好等于格数上限,允许', () => {
    expect(validateSharePattern(makePattern(8, 8)).error).toBe('dimensionOutOfRange')
    expect(validateSharePattern(makePattern(201, 201)).error).toBe('dimensionOutOfRange')
    expect(validateSharePattern(makePattern(200, 200)).ok).toBe(true)
  })

  it('不等长行拒绝', () => {
    const p = makePattern(9, 9)
    p[0] = p[0].slice(0, 5)
    expect(validateSharePattern(p).error).toBe('raggedRows')
  })

  it('非 hex / 非 null 单元格拒绝', () => {
    const p = makePattern(9, 9)
    p[0][0] = 'red'
    expect(validateSharePattern(p).error).toBe('invalidColor')
  })

  it('非数组或空数组拒绝', () => {
    expect(validateSharePattern(null).ok).toBe(false)
    expect(validateSharePattern([]).ok).toBe(false)
    expect(validateSharePattern([[1, 2, 3]]).ok).toBe(false)
  })
})

describe('shareStats', () => {
  it('按 hex 计数、颗数降序、同数按 hex 升序', () => {
    const pattern = [
      ['#FF0000', '#FF0000', '#00FF00', null],
      ['#00FF00', '#00FF00', '#0000FF', null],
    ]
    const s = shareStats(pattern)
    expect(s.beads).toBe(6)
    expect(s.colorCount).toBe(3)
    expect(s.colors[0]).toEqual({ hex: '#00FF00', count: 3 })
    expect(s.colors[1].hex).toBe('#FF0000')
    expect(s.colors[2].hex).toBe('#0000FF')
  })

  it('非字符串单元格跳过', () => {
    const s = shareStats([['#FF0000', 42, undefined]])
    expect(s.beads).toBe(1)
  })
})

describe('rowToShare', () => {
  it('映射白名单字段,丢弃未知字段', () => {
    const share = rowToShare({
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: '小鸭',
      description: '',
      author_label: '拼豆创作者',
      grid_width: 9,
      grid_height: 9,
      canvas_data: makePattern(9, 9),
      palette_id: 'perler',
      preview_image_path: '550e8400-e29b-41d4-a716-446655440000/r1.png',
      status: 'published',
      owner_id: 'secret-owner', // 白名单之外:必须被丢弃
    })
    expect(share.title).toBe('小鸭')
    expect(share.gridWidth).toBe(9)
    expect(share.ownerId).toBeUndefined()
    expect(share.canvasData).toHaveLength(9)
  })

  it('canvas_data 不是数组时返回 null', () => {
    expect(rowToShare({ id: 'x', canvas_data: 'nope' })).toBeNull()
    expect(rowToShare(null)).toBeNull()
  })
})

describe('rowToShareSummary', () => {
  it('映射 share_id 与元信息,不携带矩阵', () => {
    const s = rowToShareSummary({
      share_id: '550e8400-e29b-41d4-a716-446655440000',
      source_work_id: 'work-1',
      title: '小鸭',
      author_label: '拼豆创作者',
      grid_width: 9,
      grid_height: 9,
      status: 'published',
      created_at: '2026-01-01T00:00:00Z',
    })
    expect(s.id).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(s.sourceWorkId).toBe('work-1')
    expect(s.canvasData).toBeUndefined()
    expect(s.createdAt).toBe('2026-01-01T00:00:00Z')
  })

  it('非对象返回 null', () => {
    expect(rowToShareSummary(null)).toBeNull()
  })
})
