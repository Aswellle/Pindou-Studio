import { describe, it, expect } from 'vitest'
import {
  parseImportText,
  checkImportFile,
  projectToImportWork,
  IMPORT_ERROR_CODES,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ITEMS,
} from './importProject'
import { PROJECT_ERROR_CODES, validateProject } from './projectModel'

const SIZE = 9
const cells = () => Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null))

// 合法矩形样本:12×10(≥ 最小尺寸 9,且非方形,能验证宽高是否被正确保留)
const rectCells = () => Array.from({ length: 10 }, () => Array.from({ length: 12 }, () => null))

const projectFile = (overrides = {}) => ({
  schemaVersion: 1,
  name: '测试图纸',
  grid: { width: 12, height: 10, cells: rectCells() },
  palette: { paletteId: 'mard' },
  ...overrides,
})

describe('importProject · parseImportText 合法输入', () => {
  it('解析原生项目文件并归一化(大写 hex、补默认字段)', () => {
    const grid = rectCells()
    grid[0][0] = '#e53935'
    grid[9][11] = '#ffffff'
    const res = parseImportText(JSON.stringify(projectFile({
      grid: { width: 12, height: 10, cells: grid },
    })))
    expect(res.ok).toBe(true)
    expect(res.projects).toHaveLength(1)
    const p = res.projects[0]
    expect(p.grid.width).toBe(12)
    expect(p.grid.height).toBe(10)
    expect(p.grid.cells[0][0]).toBe('#E53935')
    expect(p.grid.cells[9][11]).toBe('#FFFFFF')
    expect(p.palette.paletteId).toBe('mard')
    expect(p.privacy.visibility).toBe('private')
    expect(p.source.kind).toBe('blank')
  })

  it('解析模板 JSON(旧协议)并转成项目', () => {
    const res = parseImportText(JSON.stringify({
      name: 'Duck',
      nameZh: '小鸭',
      category: 'animal',
      pattern: [['#FFD700', '#FFD700'], [null, '#FFD700']],
      paletteId: 'perler',
    }))
    expect(res.ok).toBe(true)
    const p = res.projects[0]
    expect(p.name).toBe('小鸭')
    // 模板协议不设最小尺寸门槛(既有模板可能很小),宽高按实际形状
    expect(p.grid.width).toBe(2)
    expect(p.grid.height).toBe(2)
    expect(p.source.kind).toBe('chart-import')
  })

  it('数组文件返回多个项目', () => {
    const res = parseImportText(JSON.stringify([projectFile({ name: 'A' }), projectFile({ name: 'B' })]))
    expect(res.ok).toBe(true)
    expect(res.projects.map(p => p.name)).toEqual(['A', 'B'])
  })

  it('输出通过 validateProject 校验', () => {
    const res = parseImportText(JSON.stringify(projectFile()))
    expect(validateProject(res.projects[0]).ok).toBe(true)
  })

  it('不修改输入对象(重新解析同一文本结果一致)', () => {
    const source = projectFile()
    source.grid.cells[0][0] = '#E53935'
    const text = JSON.stringify(source)
    const a = parseImportText(text)
    const b = parseImportText(text)
    expect(a.projects[0].grid.cells).toEqual(b.projects[0].grid.cells)
    expect(JSON.parse(text).grid.cells[0][0]).toBe('#E53935')
  })
})

describe('importProject · 拒绝非法输入(不产生半张图纸)', () => {
  const fail = (text, code) => {
    const res = parseImportText(text)
    expect(res.ok).toBe(false)
    expect(res.projects).toBeUndefined()
    expect(res.errors.some(e => e.code === code)).toBe(true)
  }

  it('空文本', () => fail('   ', IMPORT_ERROR_CODES.EMPTY))
  it('非 JSON', () => fail('{oops', IMPORT_ERROR_CODES.JSON_PARSE))
  it('无法识别的结构', () => fail(JSON.stringify({ hello: 'world' }), IMPORT_ERROR_CODES.UNRECOGNIZED))
  it('未知 schemaVersion', () => fail(JSON.stringify(projectFile({ schemaVersion: 9 })), PROJECT_ERROR_CODES.UNSUPPORTED_VERSION))
  it('非法颜色', () => fail(JSON.stringify(projectFile({
    grid: { width: 2, height: 1, cells: [['red', null]] },
  })), PROJECT_ERROR_CODES.INVALID_COLOR))
  it('行长度不一致', () => fail(JSON.stringify(projectFile({
    grid: { width: 3, height: 2, cells: [['#FFFFFF', null, null], ['#FFFFFF']] },
  })), PROJECT_ERROR_CODES.ROW_LENGTH_MISMATCH))
  it('行数与高度不一致', () => fail(JSON.stringify(projectFile({
    grid: { width: 2, height: 3, cells: [['#FFFFFF', null]] },
  })), PROJECT_ERROR_CODES.ROW_COUNT_MISMATCH))
  it('尺寸超上限', () => fail(JSON.stringify(projectFile({
    grid: { width: 201, height: 1, cells: [Array(201).fill(null)] },
  })), PROJECT_ERROR_CODES.DIMENSION_TOO_LARGE))
  it('尺寸低于下限', () => fail(JSON.stringify(projectFile({
    grid: { width: 2, height: 2, cells: [[null, null], [null, null]] },
  })), PROJECT_ERROR_CODES.DIMENSION_TOO_SMALL))
  it('网格缺失', () => fail(JSON.stringify({ schemaVersion: 1, name: 'x' }), PROJECT_ERROR_CODES.MISSING_GRID))
  it('模板 pattern 为空', () => fail(JSON.stringify({ name: 'x', category: 'icon', pattern: [] }), 'patternRequired'))

  it('数组内任一失败 → 整体失败,不返回部分结果', () => {
    const res = parseImportText(JSON.stringify([
      projectFile({ name: 'good' }),
      { schemaVersion: 9 },
    ]))
    expect(res.ok).toBe(false)
    expect(res.projects).toBeUndefined()
    expect(res.errors.some(e => e.index === 2)).toBe(true)
  })

  it('超过条目上限', () => {
    const many = Array.from({ length: MAX_IMPORT_ITEMS + 1 }, () => projectFile())
    fail(JSON.stringify(many), IMPORT_ERROR_CODES.TOO_MANY_ITEMS)
  })

  it('超过字节上限', () => {
    const huge = JSON.stringify(projectFile({ name: 'x'.repeat(MAX_IMPORT_BYTES) }))
    fail(huge, IMPORT_ERROR_CODES.FILE_TOO_LARGE)
  })

  it('上限能容纳最大的单张图纸(200×200 满格)', () => {
    // 守的是「上限别收得太紧」:最大的合法图纸必须能导进来。
    // 实测 200×200 满格约 0.38MB —— 旧上限 1MB 也容得下,所以这条不是
    // 5MB 的回归测试;若有人把上限压到 256KB 之类,这里才会红。
    const N = 200
    const full = Array.from({ length: N }, () => Array.from({ length: N }, () => '#FFFFFF'))
    const res = parseImportText(JSON.stringify(projectFile({
      name: '200x200',
      grid: { width: N, height: N, cells: full },
    })))
    expect(res.ok).toBe(true)
    expect(res.projects[0].grid.width).toBe(N)
    expect(res.projects[0].grid.height).toBe(N)
  })

  it('上限能容纳一批满格大图纸(数组文件)', () => {
    // 5MB 的实际收益在这里:数组文件每张 200×200 满格约 0.38MB,
    // 三张就超过旧的 1MB 上限 —— 这条在 1MB 下会红,是本次调整的回归测试。
    const N = 200
    const full = Array.from({ length: N }, () => Array.from({ length: N }, () => '#FFFFFF'))
    const batch = Array.from({ length: 3 }, (_, i) => projectFile({
      name: `200x200-${i}`,
      grid: { width: N, height: N, cells: full },
    }))
    const res = parseImportText(JSON.stringify(batch))
    expect(res.ok).toBe(true)
    expect(res.projects).toHaveLength(3)
  })

  it('默认不接受旧作品形状(避免误把作品备份当项目)', () => {
    const res = parseImportText(JSON.stringify({
      id: 1, name: 'w', canvasData: cells(), gridSize: SIZE, paletteId: 'perler',
    }))
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(IMPORT_ERROR_CODES.UNRECOGNIZED)
  })
})

describe('importProject · checkImportFile', () => {
  it('接受 .json 与 application/json', () => {
    expect(checkImportFile({ name: 'a.pindou.json', type: 'application/json', size: 10 })).toBeNull()
    expect(checkImportFile({ name: 'a.JSON', type: '', size: 10 })).toBeNull()
    expect(checkImportFile({ name: 'noext', type: 'application/json', size: 10 })).toBeNull()
  })

  it('拒绝非 JSON 与超大文件', () => {
    expect(checkImportFile({ name: 'a.png', type: 'image/png', size: 10 })).toBe(IMPORT_ERROR_CODES.NOT_JSON)
    expect(checkImportFile({ name: 'a.json', type: 'application/json', size: MAX_IMPORT_BYTES + 1 }))
      .toBe(IMPORT_ERROR_CODES.FILE_TOO_LARGE)
    expect(checkImportFile(null)).toBe(IMPORT_ERROR_CODES.UNRECOGNIZED)
  })
})

describe('importProject · projectToImportWork', () => {
  it('方形项目输出 gridWidth/gridHeight = null', () => {
    const res = parseImportText(JSON.stringify(projectFile({
      grid: { width: 9, height: 9, cells: cells() },
    })))
    const work = projectToImportWork(res.projects[0], { id: 42, savedAt: '2026-10-19T00:00:00.000Z' })
    expect(work.gridSize).toBe(9)
    expect(work.gridWidth).toBeNull()
    expect(work.gridHeight).toBeNull()
    expect(work.id).toBe(42)
    expect(work.savedAt).toBe('2026-10-19T00:00:00.000Z')
  })

  it('矩形项目保留真实宽高', () => {
    const res = parseImportText(JSON.stringify(projectFile()))
    const work = projectToImportWork(res.projects[0])
    expect(work.gridWidth).toBe(12)
    expect(work.gridHeight).toBe(10)
    expect(work.gridSize).toBe(12)
    expect(work.paletteId).toBe('mard')
  })

  it('非法项目返回 null', () => {
    expect(projectToImportWork(null)).toBeNull()
    expect(projectToImportWork({ grid: {} })).toBeNull()
  })
})
