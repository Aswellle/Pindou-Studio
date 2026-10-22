import { describe, it, expect } from 'vitest'
import {
  builtinBeadSizes,
  brandOptions,
  beadSizeOptions,
  seriesOptions,
  thresholdPresetId,
  resolveThreshold,
  THRESHOLD_PRESETS,
} from './paletteOptions'
import { DEFAULT_CLOSE_THRESHOLD } from '../../services/beads/inventoryMatch'

/**
 * 预设选项(重构规格 §4.2 / §6.4)。预设必须从仓库数据派生,
 * 阈值 0 不能被当成空值退回默认。
 */

describe('builtinBeadSizes', () => {
  it('从内置色卡导出有效豆径并去重升序', () => {
    const sizes = builtinBeadSizes()
    expect(sizes.length).toBeGreaterThan(0)
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b))
    expect(new Set(sizes).size).toBe(sizes.length)
    // 仓库里 Perler/Hama/MARD 是 5mm,COCO/Artkal 是 2.6mm
    expect(sizes).toContain(5)
    expect(sizes).toContain(2.6)
  })
})

describe('brandOptions', () => {
  it('内置品牌 id 覆盖全部 6 个色卡', () => {
    expect(brandOptions().builtinIds).toHaveLength(6)
  })

  it('汇总个人色卡里出现过的自定义品牌名', () => {
    const opts = brandOptions([{ brandName: '我的牌子' }, { brandName: '' }, { brandName: '我的牌子' }])
    expect(opts.custom).toEqual(['我的牌子'])
  })
})

describe('beadSizeOptions', () => {
  it('包含内置值与个人色卡已用的值', () => {
    const sizes = beadSizeOptions([{ beadSizeMm: 3.2 }])
    expect(sizes).toContain(3.2)
    expect(sizes).toContain(5)
  })

  it('忽略无效值', () => {
    const base = beadSizeOptions()
    expect(beadSizeOptions([{ beadSizeMm: null }, { beadSizeMm: 'x' }, { beadSizeMm: -1 }])).toEqual(base)
  })
})

describe('seriesOptions', () => {
  it('只汇总已用过的系列,不声称官方系列', () => {
    expect(seriesOptions([{ seriesName: 'A 系列' }, { seriesName: '' }])).toEqual(['A 系列'])
  })
})

describe('thresholdPresetId', () => {
  it('识别三个预设', () => {
    expect(thresholdPresetId(3)).toBe('strict')
    expect(thresholdPresetId(6)).toBe('balanced')
    expect(thresholdPresetId(10)).toBe('loose')
  })

  it('非预设值为自定义', () => {
    expect(thresholdPresetId(0)).toBe('custom')
    expect(thresholdPresetId(7.5)).toBe('custom')
  })
})

describe('resolveThreshold', () => {
  it('0 是合法阈值,不能退回默认', () => {
    // 旧实现 `Number(v) || DEFAULT` 会把 0 变成 6,这里锁死该回归
    expect(resolveThreshold('0', DEFAULT_CLOSE_THRESHOLD)).toBe(0)
    expect(resolveThreshold(0, DEFAULT_CLOSE_THRESHOLD)).toBe(0)
  })

  it('空值才用默认', () => {
    expect(resolveThreshold('', DEFAULT_CLOSE_THRESHOLD)).toBe(DEFAULT_CLOSE_THRESHOLD)
    expect(resolveThreshold(null, DEFAULT_CLOSE_THRESHOLD)).toBe(DEFAULT_CLOSE_THRESHOLD)
  })

  it('非数字回退默认', () => {
    expect(resolveThreshold('abc', DEFAULT_CLOSE_THRESHOLD)).toBe(DEFAULT_CLOSE_THRESHOLD)
  })

  it('超出 0–30 时收敛到边界', () => {
    expect(resolveThreshold('99', DEFAULT_CLOSE_THRESHOLD)).toBe(30)
    expect(resolveThreshold('-5', DEFAULT_CLOSE_THRESHOLD)).toBe(0)
  })

  it('预设值与默认值一致', () => {
    const balanced = THRESHOLD_PRESETS.find((p) => p.id === 'balanced')
    expect(balanced.value).toBe(DEFAULT_CLOSE_THRESHOLD)
  })
})
