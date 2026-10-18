import { describe, it, expect } from 'vitest'
import {
  legacyWorkToProject,
  projectToLegacyWork,
  canvasToLegacyWork,
  normalizeLegacyWork,
  templateToProject,
  projectToTemplatePayload,
  projectToPatternDocument,
  parseProject,
} from './adapters'
import { validateProject, createProject, MIN_GRID_DIMENSION, PROJECT_ERROR_CODES } from './projectModel'
import { TEMPLATES } from '../../data/templates'

const size = MIN_GRID_DIMENSION
const blank = () => Array.from({ length: size }, () => Array.from({ length: size }, () => null))

function legacyWork(overrides = {}) {
  const canvasData = blank()
  canvasData[0][0] = '#E53935'
  canvasData[1][1] = '#F2F2F2'
  return {
    id: 1700000000000,
    name: '旧作品',
    canvasData,
    gridSize: size,
    gridWidth: null,
    gridHeight: null,
    paletteId: 'hama',
    savedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('adapters · legacyWorkToProject', () => {
  it('映射方形旧作品,保留 id/名称/色卡/时间', () => {
    const p = legacyWorkToProject(legacyWork())
    expect(p.schemaVersion).toBe(1)
    expect(p.id).toBe('1700000000000')
    expect(p.name).toBe('旧作品')
    expect(p.palette.paletteId).toBe('hama')
    expect(p.grid.width).toBe(size)
    expect(p.grid.height).toBe(size)
    expect(p.grid.cells[0][0]).toBe('#E53935')
    expect(p.createdAt).toBe('2026-10-01T00:00:00.000Z')
    expect(p.source.kind).toBe('legacy-work')
  })

  it('矩形旧作品按 gridWidth/gridHeight 还原', () => {
    const p = legacyWorkToProject(legacyWork({
      canvasData: Array.from({ length: 10 }, () => Array.from({ length: 12 }, () => null)),
      gridSize: 12,
      gridWidth: 12,
      gridHeight: 10,
    }))
    expect(p.grid.width).toBe(12)
    expect(p.grid.height).toBe(10)
  })

  it('非法输入返回 null', () => {
    expect(legacyWorkToProject(null)).toBeNull()
    expect(legacyWorkToProject({ name: 'x' })).toBeNull()
  })

  it('不修改入参 canvasData', () => {
    const work = legacyWork()
    const snapshot = JSON.stringify(work.canvasData)
    const p = legacyWorkToProject(work)
    p.grid.cells[0][0] = '#FFFFFF'
    expect(JSON.stringify(work.canvasData)).toBe(snapshot)
  })
})

describe('adapters · projectToLegacyWork', () => {
  it('方形项目输出 gridWidth/gridHeight = null', () => {
    const p = legacyWorkToProject(legacyWork())
    const work = projectToLegacyWork(p)
    expect(work.gridSize).toBe(size)
    expect(work.gridWidth).toBeNull()
    expect(work.gridHeight).toBeNull()
    expect(work.paletteId).toBe('hama')
    expect(work.savedAt).toBe('2026-10-01T00:00:00.000Z')
  })

  it('矩形项目输出真实宽高', () => {
    const p = createProject({
      cells: Array.from({ length: 10 }, () => Array.from({ length: 12 }, () => null)),
      paletteId: 'mard',
    })
    const work = projectToLegacyWork(p)
    expect(work.gridSize).toBe(12)
    expect(work.gridWidth).toBe(12)
    expect(work.gridHeight).toBe(10)
  })

  it('round-trip:旧作品 → 项目 → 旧作品,核心字段一致', () => {
    const original = legacyWork()
    const back = projectToLegacyWork(legacyWorkToProject(original))
    expect(back.canvasData).toEqual(original.canvasData)
    expect(back.gridSize).toBe(original.gridSize)
    expect(back.gridWidth).toBe(original.gridWidth)
    expect(back.gridHeight).toBe(original.gridHeight)
    expect(back.paletteId).toBe(original.paletteId)
    expect(back.name).toBe(original.name)
    expect(back.savedAt).toBe(original.savedAt)
  })

  it('round-trip:矩形旧作品核心字段一致', () => {
    const original = legacyWork({
      canvasData: Array.from({ length: 10 }, () => Array.from({ length: 12 }, () => null)),
      gridSize: 12, gridWidth: 12, gridHeight: 10,
    })
    const back = projectToLegacyWork(legacyWorkToProject(original))
    expect(back.gridSize).toBe(12)
    expect(back.gridWidth).toBe(12)
    expect(back.gridHeight).toBe(10)
    expect(back.canvasData).toEqual(original.canvasData)
  })

  it('非法项目返回 null', () => {
    expect(projectToLegacyWork(null)).toBeNull()
    expect(projectToLegacyWork({ grid: {} })).toBeNull()
  })
})

describe('adapters · canvasToLegacyWork(M3 保存路径)', () => {
  it('方形画布输出 gridWidth/gridHeight = null,gridSize = 边长', () => {
    const canvasData = blank()
    const work = canvasToLegacyWork({ canvasData, name: '方', paletteId: 'mard' })
    expect(work.gridSize).toBe(size)
    expect(work.gridWidth).toBeNull()
    expect(work.gridHeight).toBeNull()
    expect(work.paletteId).toBe('mard')
    expect(work.name).toBe('方')
  })

  it('矩形画布输出真实宽高(不采信调用方传入的尺寸)', () => {
    const canvasData = Array.from({ length: 10 }, () => Array.from({ length: 12 }, () => '#E53935'))
    const work = canvasToLegacyWork({ canvasData, name: '宽图' })
    expect(work.gridSize).toBe(12)
    expect(work.gridWidth).toBe(12)
    expect(work.gridHeight).toBe(10)
  })

  it('保留调用方 id 的原始类型(数字 id 不被转成字符串)', () => {
    const work = canvasToLegacyWork({ canvasData: blank(), id: 1700000000000 })
    expect(work.id).toBe(1700000000000)
    expect(typeof work.id).toBe('number')
  })

  it('不修改入参 canvasData', () => {
    const canvasData = blank()
    canvasData[0][0] = '#E53935'
    const snapshot = JSON.stringify(canvasData)
    const work = canvasToLegacyWork({ canvasData })
    work.canvasData[0][0] = '#FFFFFF'
    expect(JSON.stringify(canvasData)).toBe(snapshot)
  })

  it('空画布返回 null(不产生 0×0 作品)', () => {
    expect(canvasToLegacyWork({ canvasData: [] })).toBeNull()
    expect(canvasToLegacyWork({ canvasData: null })).toBeNull()
    expect(canvasToLegacyWork()).toBeNull()
  })
})

describe('adapters · normalizeLegacyWork(M3 存储收口)', () => {
  it('以 canvasData 实际形状修正不一致的声明尺寸', () => {
    // 历史 bug:声明 29×29,实际存的是 12×10
    const canvasData = Array.from({ length: 10 }, () => Array.from({ length: 12 }, () => null))
    const work = normalizeLegacyWork({ id: 'w1', name: '错位', canvasData, gridSize: 29, gridWidth: null, gridHeight: null })
    expect(work.gridWidth).toBe(12)
    expect(work.gridHeight).toBe(10)
    expect(work.gridSize).toBe(12)
  })

  it('方形数据把 gridWidth/gridHeight 归为 null', () => {
    const canvasData = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null))
    const work = normalizeLegacyWork({ id: 'w2', canvasData, gridSize: 9, gridWidth: 9, gridHeight: 9 })
    expect(work.gridWidth).toBeNull()
    expect(work.gridHeight).toBeNull()
  })

  it('不等长行补齐为 null,保证矩阵矩形', () => {
    const work = normalizeLegacyWork({
      id: 'w3',
      canvasData: [['#FF0000', '#FF0000', '#FF0000'], ['#00FF00']],
      gridSize: 3,
    })
    expect(work.canvasData[1]).toEqual(['#00FF00', null, null])
    expect(work.gridWidth).toBe(3)
    expect(work.gridHeight).toBe(2)
  })

  it('保留未知字段、品牌色号与 id 原样(不因归一丢数据)', () => {
    const work = normalizeLegacyWork({
      id: 'w4',
      name: '老作品',
      canvasData: [['P18', null], [null, '#F2F2F2']],
      gridSize: 2,
      paletteId: 'perler',
      savedAt: '2026-01-01T00:00:00.000Z',
      customField: 'keep-me',
    })
    expect(work.id).toBe('w4')
    expect(work.name).toBe('老作品')
    expect(work.paletteId).toBe('perler')
    expect(work.savedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(work.customField).toBe('keep-me')
    // 品牌色号保留原值,交给画布/缩略图解析
    expect(work.canvasData[0][0]).toBe('P18')
  })

  it('非作品输入原样返回,不抛异常', () => {
    expect(normalizeLegacyWork(null)).toBeNull()
    expect(normalizeLegacyWork('nope')).toBe('nope')
    const empty = { id: 'w5', canvasData: [] }
    expect(normalizeLegacyWork(empty)).toBe(empty)
  })

  it('归一后再次归一幂等', () => {
    const once = normalizeLegacyWork({
      id: 'w6',
      canvasData: [['#FF0000', '#FF0000'], ['#FF0000']],
      gridSize: 2,
    })
    expect(normalizeLegacyWork(once)).toEqual(once)
  })
})

describe('adapters · templateToProject', () => {
  it('内置模板复制为新 id 的 gallery-copy 项目', () => {
    const tpl = TEMPLATES[0]
    const a = templateToProject(tpl)
    const b = templateToProject(tpl)
    expect(a.id).not.toBe(b.id)
    expect(a.source.kind).toBe('gallery-copy')
    expect(a.source.sourceTemplateId).toBe(String(tpl.id))
    expect(a.grid.width).toBe(tpl.size)
    expect(a.grid.height).toBe(tpl.size)
    expect(a.grid.cells).toEqual(tpl.pattern)
  })

  it('矩形模板保留真实宽高(不受 size 单值影响)', () => {
    const tpl = {
      id: 'c-1',
      name: 'Duck',
      nameZh: '小鸭',
      pattern: [
        [null, '#FFD700', '#FFD700'],
        ['#FFD700', null, '#FFD700'],
      ],
      paletteId: 'perler',
    }
    const p = templateToProject(tpl)
    expect(p.grid.width).toBe(3)
    expect(p.grid.height).toBe(2)
    expect(p.name).toBe('小鸭')
  })

  it('不修改模板 pattern', () => {
    const tpl = TEMPLATES[0]
    const snapshot = JSON.stringify(tpl.pattern)
    const p = templateToProject(tpl)
    p.grid.cells[0][0] = '#FFFFFF'
    expect(JSON.stringify(tpl.pattern)).toBe(snapshot)
  })

  it('非法输入返回 null', () => {
    expect(templateToProject(null)).toBeNull()
    expect(templateToProject({ name: 'x' })).toBeNull()
  })
})

describe('adapters · projectToTemplatePayload', () => {
  it('输出统一模板协议字段,不含项目身份', () => {
    const p = templateToProject(TEMPLATES[0])
    const payload = projectToTemplatePayload(p, { category: 'animal', difficulty: 'medium', nameZh: '小熊' })
    expect(payload).toEqual({
      name: p.name,
      nameZh: '小熊',
      category: 'animal',
      difficulty: 'medium',
      paletteId: 'perler',
      pattern: p.grid.cells,
    })
    expect(payload.id).toBeUndefined()
    expect(payload.source).toBeUndefined()
  })

  it('缺少 category 返回 null(发布必须显式分类)', () => {
    const p = templateToProject(TEMPLATES[0])
    expect(projectToTemplatePayload(p, {})).toBeNull()
  })
})

describe('adapters · projectToPatternDocument', () => {
  it('矩形项目进入 PatternDocument 后宽高正确', () => {
    const p = createProject({
      cells: Array.from({ length: 10 }, () => Array.from({ length: 12 }, () => '#E53935')),
      paletteId: 'perler',
    })
    const doc = projectToPatternDocument(p)
    expect(doc.version).toBe(2)
    expect(doc.grid.width).toBe(12)
    expect(doc.grid.height).toBe(10)
    expect(doc.metadata.paletteId).toBe('perler')
    expect(doc.style.beadStyle).toBe('professional')
  })

  it('可覆盖图纸名与风格', () => {
    const p = templateToProject(TEMPLATES[0])
    const doc = projectToPatternDocument(p, { designName: '导出名', beadStyle: 'realistic' })
    expect(doc.metadata.name).toBe('导出名')
    expect(doc.style.beadStyle).toBe('realistic')
    expect(doc.style.showCodes).toBe(false)
  })

  it('非法项目返回 null', () => {
    expect(projectToPatternDocument(null)).toBeNull()
  })
})

describe('adapters · parseProject', () => {
  it('合法项目 JSON 往返后矩阵与尺寸不变', () => {
    const p = templateToProject(TEMPLATES[0])
    const roundTrip = parseProject(JSON.parse(JSON.stringify(p)))
    expect(roundTrip.ok).toBe(true)
    expect(roundTrip.project.grid.cells).toEqual(p.grid.cells)
    expect(roundTrip.project.grid.width).toBe(p.grid.width)
    expect(roundTrip.project.palette.paletteId).toBe(p.palette.paletteId)
  })

  it('未知版本返回可识别错误码', () => {
    const res = parseProject({ schemaVersion: 9 })
    expect(res.ok).toBe(false)
    expect(res.errors.some(e => e.code === PROJECT_ERROR_CODES.UNSUPPORTED_VERSION)).toBe(true)
  })

  it('损坏 JSON 结构不抛异常', () => {
    expect(() => parseProject({ grid: { width: 'x', height: 2, cells: 'nope' } })).not.toThrow()
    expect(parseProject({ grid: { width: 'x', height: 2, cells: 'nope' } }).ok).toBe(false)
  })

  it('allowLegacyShape 可读旧作品结构', () => {
    const res = parseProject(legacyWork(), { allowLegacyShape: true })
    expect(res.ok).toBe(true)
    expect(res.project.grid.cells[0][0]).toBe('#E53935')
  })

  it('归一化输出通过 validateProject', () => {
    const res = parseProject(templateToProject(TEMPLATES[0]))
    expect(validateProject(res.project).ok).toBe(true)
  })
})
