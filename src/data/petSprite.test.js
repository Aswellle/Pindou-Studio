import { describe, it, expect } from 'vitest'
import { poseGrid, GRID_W, GRID_H, C } from './petSprite'

describe('petSprite · 拼豆爱宠「豆豆」精灵', () => {
  const POSES = ['sleep', 'idle', 'walk', 'walk', 'shake', 'bark']

  it('各姿态均返回 GRID_H×GRID_W 的网格', () => {
    for (const pose of POSES) {
      const g = poseGrid(pose, 0)
      expect(Array.isArray(g)).toBe(true)
      expect(g).toHaveLength(GRID_H)
      g.forEach((row) => expect(row).toHaveLength(GRID_W))
    }
  })

  it('网格单元格只含 null 或合法 hex 颜色', () => {
    for (const pose of POSES) {
      const g = poseGrid(pose, 0)
      for (const row of g) {
        for (const cell of row) {
          expect(cell === null || /^#[0-9a-fA-F]{6}$/.test(cell)).toBe(true)
        }
      }
    }
  })

  it('每种姿态都实际绘制了豆子(非空网格)', () => {
    for (const pose of POSES) {
      const g = poseGrid(pose, 0)
      const nonEmpty = g.flat().filter(Boolean).length
      expect(nonEmpty).toBeGreaterThan(0)
    }
  })

  it('柯基配色应有橙色身体与深棕描边', () => {
    expect(C.body).toBe('#F0A93E')
    expect(C.outline).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('walk 两个帧腿部错位(网格内容不同)', () => {
    const a = poseGrid('walk', 0).flat()
    const b = poseGrid('walk', 1).flat()
    expect(a.some((c, i) => c !== b[i])).toBe(true)
  })
})
