import { describe, it, expect } from 'vitest'
import { rowToTemplate } from './useCloudTemplates'
import { pickLatest } from '../features/gallery/discovery'

/**
 * 云端模板行映射。
 *
 * 回归点:「最新图纸」区块依赖 `createdAt`,而 rowToTemplate 曾漏掉
 * `created_at` 的映射 —— 云端模板永远进不了该区块,线上看起来像「没有最新内容」。
 * 这里同时断言映射本身与它喂给 pickLatest 的结果,避免只测一半。
 */

const row = (over = {}) => ({
  id: 't1',
  name: 'T',
  name_zh: null,
  category: 'animal',
  difficulty: 'easy',
  size: 2,
  colors: [],
  pattern: [['#FF0000', null], [null, null]],
  source: 'custom',
  palette_id: 'perler',
  created_at: '2026-10-01T00:00:00Z',
  ...over,
})

describe('rowToTemplate', () => {
  it('把 created_at 映射为 createdAt(「最新」区块的数据前提)', () => {
    expect(rowToTemplate(row()).createdAt).toBe('2026-10-01T00:00:00Z')
  })

  it('缺失 created_at 时为 null,不伪造时间', () => {
    expect(rowToTemplate(row({ created_at: null })).createdAt).toBe(null)
  })

  it('映射后的行能被 pickLatest 选中,并按时间正确排序', () => {
    const older = rowToTemplate(row({ id: 'a', created_at: '2026-01-01T00:00:00Z' }))
    const newer = rowToTemplate(row({ id: 'b', created_at: '2026-10-01T00:00:00Z' }))
    expect(pickLatest([older, newer]).map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('矩形模板的宽高仍由 pattern 推导(不被本次改动影响)', () => {
    const t = rowToTemplate(row({ pattern: [['#FF0000', null, null]], size: 3 }))
    expect(t.gridWidth).toBe(3)
    expect(t.gridHeight).toBe(1)
  })
})
