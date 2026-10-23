import { describe, it, expect } from 'vitest'
import {
  summarizeWork,
  diffVersions,
  shouldRecordVersion,
  versionLabel,
  MAX_VERSIONS_PER_WORK,
} from './workVersions'

const R = '#E53935'
const G = '#43A047'

describe('summarizeWork', () => {
  it('统计珠子数与用色数,空格子不算珠子', () => {
    const data = [
      [R, R, null],
      [G, null, null],
    ]
    expect(summarizeWork(data)).toEqual({ beads: 3, colors: 2, width: 3, height: 2 })
  })

  it('空画布与非法入参都返回全零,不抛错', () => {
    expect(summarizeWork([[null, null]])).toEqual({ beads: 0, colors: 0, width: 2, height: 1 })
    expect(summarizeWork([])).toEqual({ beads: 0, colors: 0, width: 0, height: 0 })
    expect(summarizeWork(null)).toEqual({ beads: 0, colors: 0, width: 0, height: 0 })
    expect(summarizeWork('nope')).toEqual({ beads: 0, colors: 0, width: 0, height: 0 })
  })

  it('宽度取最长行(参差数据不越界)', () => {
    const data = [[R], [R, G, G]]
    expect(summarizeWork(data).width).toBe(3)
    expect(summarizeWork(data).height).toBe(2)
  })
})

describe('diffVersions', () => {
  // 入参是版本对象(带 canvasData),不是裸矩阵 —— 与 listVersions 的返回形状一致
  const v = (canvasData) => ({ canvasData })

  it('珠子数变化按 newer - older 计算(正负号保留方向)', () => {
    const older = v([[R, null]])
    const newer = v([[R, G]])
    const d = diffVersions(older, newer)
    expect(d.beads).toBe(1)
    expect(d.colors).toBe(1)
    expect(d.changedCells).toBe(1)
  })

  it('减少珠子时差值为负', () => {
    expect(diffVersions(v([[R, G]]), v([[R, null]])).beads).toBe(-1)
  })

  it('尺寸变化时按缺格计为改动', () => {
    const older = v([[R]])
    const newer = v([[R], [G]])
    const d = diffVersions(older, newer)
    expect(d.changedCells).toBe(1) // 新增的 [G] 那格
    expect(d.beads).toBe(1)
  })

  it('两版完全相同时 changedCells 为 0', () => {
    const a = [[R, G], [null, R]]
    expect(diffVersions(v(a), v(a.map((r) => [...r]))).changedCells).toBe(0)
  })

  it('null 与 undefined 视为同一格(不虚报改动)', () => {
    const older = v([[R, null]])
    const newer = v([[R, undefined]])
    expect(diffVersions(older, newer).changedCells).toBe(0)
  })

  it('任一版缺失时不计算逐格差异,只给珠子数差值', () => {
    const d = diffVersions(null, v([[R]]))
    expect(d.changedCells).toBe(0)
    expect(d.beads).toBe(1)
  })
})

describe('shouldRecordVersion', () => {
  it('首个版本一定记录', () => {
    expect(shouldRecordVersion(null, { canvasData: [[R]] })).toBe(true)
  })

  it('内容没变则不记录(连点两次保存不产生重复条目)', () => {
    const a = { canvasData: [[R, G]] }
    const b = { canvasData: [[R, G]] }
    expect(shouldRecordVersion(a, b)).toBe(false)
  })

  it('内容有变化则记录', () => {
    expect(shouldRecordVersion({ canvasData: [[R]] }, { canvasData: [[G]] })).toBe(true)
  })

  it('无画布内容不记录', () => {
    expect(shouldRecordVersion(null, {})).toBe(false)
    expect(shouldRecordVersion(null, null)).toBe(false)
    expect(shouldRecordVersion(null, { canvasData: null })).toBe(false)
  })
})

describe('versionLabel', () => {
  it('最新一条标为当前版本', () => {
    expect(versionLabel({}, 0, 3).key).toBe('versions.labelCurrent')
  })

  it('最早一条标为最早版本', () => {
    expect(versionLabel({}, 2, 3).key).toBe('versions.labelEarliest')
  })

  it('中间条目带序号', () => {
    expect(versionLabel({}, 1, 3)).toEqual({ key: 'versions.labelOlder', params: { n: 1 } })
  })

  it('只有一个版本时,它同时是当前也是最早 —— 优先显示「当前」', () => {
    expect(versionLabel({}, 0, 1).key).toBe('versions.labelCurrent')
  })
})

describe('MAX_VERSIONS_PER_WORK', () => {
  it('保留上限是个有限正整数(避免无界增长)', () => {
    expect(Number.isInteger(MAX_VERSIONS_PER_WORK)).toBe(true)
    expect(MAX_VERSIONS_PER_WORK).toBeGreaterThan(0)
    expect(MAX_VERSIONS_PER_WORK).toBeLessThanOrEqual(50)
  })
})
