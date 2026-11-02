import { describe, it, expect } from 'vitest'
import {
  IRONING_EFFECT_PRESETS,
  IRONING_TEXTURE_TYPES,
  DEFAULT_IRONING_PRESET_ID,
  getIroningEffectPreset,
  validateIroningPreset,
} from './ironingEffectPresets'

/**
 * 材质预设契约测试(07 文档 §2):
 * 六个 ID 唯一齐全、纹理类型合法、参数范围合法、未知 ID 确定性回退、
 * 常量不可被调用方改写、六种材质的底色/纹理两两可辨。
 */

describe('ironingEffectPresets · 预设契约', () => {
  it('六个 ID 唯一且齐全(无孔烫/麻布烫/毛巾烫/澡巾烫/细闪烫/粗闪烫)', () => {
    expect(IRONING_EFFECT_PRESETS.map((p) => p.id)).toEqual([
      'no-hole',
      'linen',
      'towel',
      'bath-mesh',
      'fine-glitter',
      'coarse-glitter',
    ])
  })

  it('每个 textureType 都是白名单内的合法值且与 ID 对应', () => {
    const byType = Object.fromEntries(IRONING_EFFECT_PRESETS.map((p) => [p.id, p.textureType]))
    expect(byType).toEqual({
      'no-hole': 'micro-grid',
      linen: 'woven-crosshatch',
      towel: 'terry-loop',
      'bath-mesh': 'bath-mesh',
      'fine-glitter': 'fine-sparkle',
      'coarse-glitter': 'coarse-sparkle',
    })
    for (const type of Object.values(byType)) {
      expect(IRONING_TEXTURE_TYPES).toContain(type)
    }
  })

  it('全部预设通过参数范围校验(0–1 强度、正尺度、sparkle 区间)', () => {
    for (const preset of IRONING_EFFECT_PRESETS) {
      expect(validateIroningPreset(preset)).toEqual([])
    }
  })

  it('闪粉参数只对闪粉材质生效(织物材质保持 0)', () => {
    for (const preset of IRONING_EFFECT_PRESETS) {
      const isSparkle = preset.textureType.endsWith('sparkle')
      expect(preset.sparkleDensity > 0).toBe(isSparkle)
      expect(preset.sparkleSize[1] > 0).toBe(isSparkle)
      expect(preset.sparkleColors.length > 0).toBe(isSparkle)
    }
    // 细闪 vs 粗闪:密度与颗粒尺度必须有明确差异
    const fine = getIroningEffectPreset('fine-glitter')
    const coarse = getIroningEffectPreset('coarse-glitter')
    expect(fine.sparkleDensity).toBeGreaterThan(coarse.sparkleDensity)
    expect(coarse.sparkleSize[1]).toBeGreaterThan(fine.sparkleSize[1])
  })

  it('未知 ID 确定性回退 linen,不抛错', () => {
    expect(getIroningEffectPreset('does-not-exist').id).toBe(DEFAULT_IRONING_PRESET_ID)
    expect(getIroningEffectPreset('').id).toBe('linen')
    expect(getIroningEffectPreset(null).id).toBe('linen')
    expect(getIroningEffectPreset(undefined).id).toBe('linen')
    expect(getIroningEffectPreset('linen').id).toBe('linen')
  })

  it('返回冻结常量:调用方无法改写共享内部对象', () => {
    const preset = getIroningEffectPreset('towel')
    expect(Object.isFrozen(preset)).toBe(true)
    expect(Object.isFrozen(preset.sparkleSize)).toBe(true)
    // 严格模式下改写冻结对象抛 TypeError(模块默认严格);至少值不得变
    expect(() => {
      'use strict'
      preset.roughness = 0.01
    }).toThrow()
    expect(getIroningEffectPreset('towel').roughness).not.toBe(0.01)
  })

  it('六种材质的底色与纹理类型两两可辨(不允许只换背景色充数)', () => {
    const bases = new Set(IRONING_EFFECT_PRESETS.map((p) => p.fabricBase))
    expect(bases.size).toBe(6)
    const types = new Set(IRONING_EFFECT_PRESETS.map((p) => p.textureType))
    expect(types.size).toBe(6)
    // 粗糙度跨度明显:毛巾/澡巾远高于无孔烫/细闪
    const rough = Object.fromEntries(IRONING_EFFECT_PRESETS.map((p) => [p.id, p.roughness]))
    expect(rough.towel).toBeGreaterThan(rough['no-hole'] * 3)
    expect(rough['bath-mesh']).toBeGreaterThan(rough.linen)
  })

  it('validateIroningPreset 能抓出越界参数', () => {
    const bad = { ...getIroningEffectPreset('linen'), textureOpacity: 1.5, textureScale: -3 }
    const errors = validateIroningPreset(bad)
    expect(errors.some((e) => e.includes('textureOpacity'))).toBe(true)
    expect(errors.some((e) => e.includes('textureScale'))).toBe(true)
    expect(validateIroningPreset(null).length).toBeGreaterThan(0)
  })
})
