import { describe, it, expect } from 'vitest'
import { contentBox } from './ThumbnailCanvas'

/**
 * 缩略图内容包围盒。
 *
 * 模板数据常带不等的外边距(内置的熊 4 行顶边、独角兽 9 列左边…)。
 * 若按整张网格构图,每张缩略图的光学大小与位置都不同,整面墙没有统一规矩;
 * 按内容包围盒构图后,所有模板在自己的框里居中、尽量大。
 */
describe('contentBox — 缩略图内容包围盒', () => {
  it('裁掉四周全空的行与列', () => {
    const pattern = [
      [null, null, null, null],
      [null, '#111111', '#222222', null],
      [null, '#333333', null, null],
      [null, null, null, null],
    ]
    expect(contentBox(pattern)).toEqual({ x0: 1, y0: 1, width: 2, height: 2 })
  })

  it('参差行按实际内容取范围', () => {
    const pattern = [[null], [null, null, '#111111'], [null, '#222222']]
    expect(contentBox(pattern)).toEqual({ x0: 1, y0: 1, width: 2, height: 2 })
  })

  it('内容贴边时不裁切', () => {
    const pattern = [
      ['#111111', null],
      [null, null],
    ]
    expect(contentBox(pattern)).toEqual({ x0: 0, y0: 0, width: 1, height: 1 })
  })

  it('全空或损坏数据返回 null(调用方退回整张网格)', () => {
    expect(contentBox([])).toBeNull()
    expect(contentBox(null)).toBeNull()
    expect(contentBox([[null, null], [null]])).toBeNull()
  })
})
