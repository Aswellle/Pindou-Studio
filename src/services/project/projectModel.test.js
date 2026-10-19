import { describe, it, expect } from 'vitest'
import {
  PROJECT_SCHEMA_VERSION,
  MIN_GRID_DIMENSION,
  MAX_GRID_DIMENSION,
  PROJECT_ERROR_CODES,
  createProject,
  createProjectId,
  deriveGridDimensions,
  validateProject,
  normalizeProject,
  computeProjectStats,
} from './projectModel'

const cells2x3 = () => [
  ['#E53935', null, '#F2F2F2'],
  [null, '#000000', '#F2F2F2'],
]

// 合法的最小项目(尺寸满足 9 的下限)
function validProject(overrides = {}) {
  const size = MIN_GRID_DIMENSION
  const cells = Array.from({ length: size }, () => Array.from({ length: size }, () => null))
  cells[0][0] = '#E53935'
  return {
    ...createProject({ cells, name: '测试项目', paletteId: 'perler' }),
    ...overrides,
  }
}

describe('projectModel · 常量与 id', () => {
  it('schemaVersion 为 1,尺寸边界与 UI 一致', () => {
    expect(PROJECT_SCHEMA_VERSION).toBe(1)
    expect(MIN_GRID_DIMENSION).toBe(9)
    expect(MAX_GRID_DIMENSION).toBe(200)
  })

  it('createProjectId 生成非空且互不相同的 id', () => {
    const a = createProjectId()
    const b = createProjectId()
    expect(typeof a).toBe('string')
    expect(a.length).toBeGreaterThan(0)
    expect(a).not.toBe(b)
  })
})

describe('projectModel · deriveGridDimensions', () => {
  it('方形/矩形/空输入', () => {
    expect(deriveGridDimensions([['#000000', null], [null, null]])).toEqual({ width: 2, height: 2 })
    expect(deriveGridDimensions(cells2x3())).toEqual({ width: 3, height: 2 })
    expect(deriveGridDimensions([])).toEqual({ width: 0, height: 0 })
    expect(deriveGridDimensions(null)).toEqual({ width: 0, height: 0 })
  })
})

describe('projectModel · createProject', () => {
  it('从 cells 推导宽高并补齐可选字段默认值', () => {
    const p = createProject({ cells: cells2x3(), name: '小鸭' })
    expect(p.schemaVersion).toBe(1)
    expect(p.grid).toEqual({ width: 3, height: 2, cells: cells2x3() })
    expect(p.palette.paletteId).toBe('perler')
    expect(p.source.kind).toBe('blank')
    expect(p.privacy.visibility).toBe('private')
    expect(p.revision).toEqual({ parentRevisionId: null, note: null })
    expect(p.settings).toEqual({ showGrid: true, showCoordinates: true })
    expect(typeof p.id).toBe('string')
    expect(p.createdAt).toBe(p.updatedAt)
  })

  it('深拷贝 cells,不共享引用', () => {
    const src = cells2x3()
    const p = createProject({ cells: src })
    src[0][0] = '#FFFFFF'
    expect(p.grid.cells[0][0]).toBe('#E53935')
  })

  it('name 超长时截断到 120', () => {
    const p = createProject({ cells: cells2x3(), name: 'x'.repeat(200) })
    expect(p.name).toHaveLength(120)
  })
})

describe('projectModel · validateProject', () => {
  it('合法项目通过', () => {
    const res = validateProject(validProject())
    expect(res).toEqual({ ok: true, errors: [] })
  })

  it('非对象输入', () => {
    for (const bad of [null, undefined, 42, 'x', []]) {
      expect(validateProject(bad).errors[0].code).toBe(PROJECT_ERROR_CODES.NOT_OBJECT)
    }
  })

  it('未知 schemaVersion 被拒绝', () => {
    const res = validateProject({ ...validProject(), schemaVersion: 2 })
    expect(res.ok).toBe(false)
    expect(res.errors[0]).toEqual({ code: PROJECT_ERROR_CODES.UNSUPPORTED_VERSION, detail: '2' })
  })

  it('缺少 grid / cells 非数组', () => {
    expect(validateProject({ schemaVersion: 1 }).errors[0].code).toBe(PROJECT_ERROR_CODES.MISSING_GRID)
    const noCells = validProject()
    delete noCells.grid.cells
    expect(validateProject(noCells).errors[0].code).toBe(PROJECT_ERROR_CODES.CELLS_NOT_ARRAY)
  })

  it('尺寸非法:非整数、过小、过大', () => {
    const p1 = validProject()
    p1.grid.width = 0
    expect(validateProject(p1).errors.some(e => e.code === PROJECT_ERROR_CODES.INVALID_DIMENSION)).toBe(true)

    const p2 = validProject()
    p2.grid.width = MIN_GRID_DIMENSION - 1
    expect(validateProject(p2).errors.some(e => e.code === PROJECT_ERROR_CODES.DIMENSION_TOO_SMALL)).toBe(true)

    const p3 = validProject()
    p3.grid.width = MAX_GRID_DIMENSION + 1
    expect(validateProject(p3).errors.some(e => e.code === PROJECT_ERROR_CODES.DIMENSION_TOO_LARGE)).toBe(true)
  })

  it('行数/行长度不一致被拒绝', () => {
    const p = validProject()
    p.grid.cells.pop()
    expect(validateProject(p).errors.some(e => e.code === PROJECT_ERROR_CODES.ROW_COUNT_MISMATCH)).toBe(true)

    const p2 = validProject()
    p2.grid.cells[0] = ['#000000']
    expect(validateProject(p2).errors.some(e => e.code === PROJECT_ERROR_CODES.ROW_LENGTH_MISMATCH)).toBe(true)
  })

  it('宽度越界但数据整齐时,不逐行重复报行长度错误', () => {
    // 声明 width=500、每行实际都是 9:唯一根因是宽度写错。
    // 逐行比对会产生 9 条同源噪音,把真正原因淹没。
    const p = validProject()
    p.grid.width = MAX_GRID_DIMENSION + 1
    const res = validateProject(p)
    expect(res.errors.some(e => e.code === PROJECT_ERROR_CODES.DIMENSION_TOO_LARGE)).toBe(true)
    expect(res.errors.filter(e => e.code === PROJECT_ERROR_CODES.ROW_LENGTH_MISMATCH)).toHaveLength(0)
  })

  it('宽度越界且数据确实参差时,仍报告行长度不一致', () => {
    // 声明 width=500、各行是 9/8:不齐是独立于尺寸的真实问题,不能一起吞掉
    const p = validProject()
    p.grid.width = MAX_GRID_DIMENSION + 1
    p.grid.cells[1] = p.grid.cells[1].slice(0, MIN_GRID_DIMENSION - 1)
    const res = validateProject(p)
    expect(res.errors.some(e => e.code === PROJECT_ERROR_CODES.DIMENSION_TOO_LARGE)).toBe(true)
    expect(res.errors.some(e => e.code === PROJECT_ERROR_CODES.ROW_LENGTH_MISMATCH)).toBe(true)
  })

  it('宽度不可用(非正整数)时不逐行报告行长度', () => {
    for (const bad of [0, -1, 1.5, '35', null]) {
      const p = validProject()
      p.grid.width = bad
      const res = validateProject(p)
      expect(res.errors.some(e => e.code === PROJECT_ERROR_CODES.INVALID_DIMENSION)).toBe(true)
      expect(res.errors.filter(e => e.code === PROJECT_ERROR_CODES.ROW_LENGTH_MISMATCH)).toHaveLength(0)
    }
  })

  it('非 hex / 品牌号被拒绝', () => {
    const p = validProject()
    p.grid.cells[0][0] = 'P18'
    const res = validateProject(p)
    expect(res.ok).toBe(false)
    expect(res.errors.some(e => e.code === PROJECT_ERROR_CODES.INVALID_COLOR)).toBe(true)

    const p2 = validProject()
    p2.grid.cells[0][0] = '#FFF'
    expect(validateProject(p2).errors.some(e => e.code === PROJECT_ERROR_CODES.INVALID_COLOR)).toBe(true)
  })

  it('非法 source.kind / visibility 被拒绝', () => {
    const p = validProject()
    p.source.kind = 'made-up'
    expect(validateProject(p).errors.some(e => e.code === PROJECT_ERROR_CODES.INVALID_SOURCE_KIND)).toBe(true)

    const p2 = validProject()
    p2.privacy.visibility = 'public'
    expect(validateProject(p2).errors.some(e => e.code === PROJECT_ERROR_CODES.INVALID_VISIBILITY)).toBe(true)
  })

  it('可放宽尺寸下限(用于旧数据/小图)', () => {
    const p = createProject({ cells: cells2x3() })
    expect(validateProject(p).ok).toBe(false)
    expect(validateProject(p, { minDimension: 1 }).ok).toBe(true)
  })

  it('requireSchemaVersion=false 允许旧结构', () => {
    const p = validProject()
    delete p.schemaVersion
    expect(validateProject(p).ok).toBe(false)
    expect(validateProject(p, { requireSchemaVersion: false }).ok).toBe(true)
  })
})

describe('projectModel · normalizeProject', () => {
  it('小写 hex 归一化为大写', () => {
    const p = validProject()
    p.grid.cells[0][0] = '#abcdef'
    const n = normalizeProject(p)
    expect(n.grid.cells[0][0]).toBe('#ABCDEF')
  })

  it('补齐缺失的可选字段', () => {
    const p = validProject()
    delete p.source
    delete p.privacy
    delete p.revision
    delete p.settings
    const n = normalizeProject(p)
    expect(n.source.kind).toBe('blank')
    expect(n.privacy.visibility).toBe('private')
    expect(n.revision.parentRevisionId).toBeNull()
    expect(n.settings.showGrid).toBe(true)
  })

  it('校验失败返回 null', () => {
    expect(normalizeProject({ schemaVersion: 99 })).toBeNull()
    expect(normalizeProject(null)).toBeNull()
  })

  it('不修改入参', () => {
    const p = validProject()
    p.grid.cells[0][0] = '#abcdef'
    const snapshot = JSON.stringify(p)
    normalizeProject(p)
    expect(JSON.stringify(p)).toBe(snapshot)
  })
})

describe('projectModel · computeProjectStats', () => {
  it('按数量降序统计,忽略空格', () => {
    const p = createProject({ cells: cells2x3() })
    const stats = computeProjectStats(p)
    expect(stats.totalBeads).toBe(4)
    expect(stats.colorCount).toBe(3)
    expect(stats.colors[0]).toEqual({ hex: '#F2F2F2', count: 2 })
    expect(stats.colors.map(c => c.hex)).toEqual(['#F2F2F2', '#000000', '#E53935'])
  })

  it('空项目返回零值', () => {
    expect(computeProjectStats(null)).toEqual({ colors: [], totalBeads: 0, colorCount: 0 })
  })
})
