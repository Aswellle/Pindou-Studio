import { describe, it, expect } from 'vitest'
import {
  buildCsvTemplate,
  parseCsv,
  parseColorsCsv,
  parseColorsJson,
  parseColorImport,
  CSV_COLUMNS,
  IMPORT_ERRORS,
  MAX_IMPORT_ROWS,
} from './colorImport'
import { PALETTE_ERRORS } from './personalPalette'

/**
 * 批量颜色导入(规格 05 §2 P1)。
 *
 * 关键约束:不允许「部分写入后无提示失败」—— 解析层返回完整草稿 + 错误行,
 * 由调用方在用户确认后一次性写入;有错误的行不会被静默跳过。
 */

describe('colorImport · CSV 模板', () => {
  it('带 BOM 与表头,Excel 打开不乱码', () => {
    const t = buildCsvTemplate()
    expect(t.charCodeAt(0)).toBe(0xFEFF)
    const rows = parseCsv(t)
    expect(rows[0]).toEqual(CSV_COLUMNS)
    expect(rows.length).toBe(4) // 表头 + 3 行示例
  })
})

describe('colorImport · CSV 解析', () => {
  it('引号内的逗号与换行不被拆开', () => {
    const rows = parseCsv('a,b\n"x,y","line1\nline2"')
    expect(rows).toEqual([['a', 'b'], ['x,y', 'line1\nline2']])
  })

  it('双引号转义 "" 还原为一个引号', () => {
    expect(parseCsv('a\n"he said ""hi"""')).toEqual([['a'], ['he said "hi"']])
  })

  it('CRLF 与 BOM 被正确处理', () => {
    const rows = parseCsv('﻿code,hex\r\nA1,#FFFFFF\r\n')
    expect(rows).toEqual([['code', 'hex'], ['A1', '#FFFFFF']])
  })

  it('尾部空行被丢弃', () => {
    expect(parseCsv('a,b\n1,2\n\n\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('colorImport · 颜色导入', () => {
  const existing = [{ id: 'x1', code: 'A1' }]

  it('合法 CSV 解析为草稿,保留行号供预览', () => {
    const csv = 'code,name,hex,notes,source\nB1,蓝,#0000FF,备注,measured\nC1,绿,#00FF00,,estimated'
    const res = parseColorsCsv(csv, { existingColors: existing })
    expect(res.ok).toBe(true)
    expect(res.drafts).toHaveLength(2)
    expect(res.drafts[0]).toMatchObject({ row: 2, code: 'B1', hex: '#0000FF', source: 'measured' })
    expect(res.drafts[1].source).toBe('estimated')
    expect(res.errors).toHaveLength(0)
  })

  it('缺 code/hex 表头 → 明确拒绝', () => {
    const res = parseColorsCsv('name,color\nx,#FFF')
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(IMPORT_ERRORS.MISSING_COLUMN)
  })

  it('空文件被拒绝', () => {
    expect(parseColorsCsv('').errors[0].code).toBe(IMPORT_ERRORS.EMPTY)
    // 只有表头、没有数据行 → EMPTY;只有一行数据、看不出表头 → NO_HEADER
    expect(parseColorsCsv('code,hex').errors[0].code).toBe(IMPORT_ERRORS.EMPTY)
    expect(parseColorsCsv('A1,#FFFFFF').errors[0].code).toBe(IMPORT_ERRORS.NO_HEADER)
  })

  it('坏行被逐行报告,好行仍然产出(供预览)', () => {
    const csv = 'code,hex\nB1,#0000FF\nB2,red\nB3,#00FF00'
    const res = parseColorsCsv(csv)
    expect(res.ok).toBe(true)
    expect(res.drafts.map((d) => d.code)).toEqual(['B1', 'B3'])
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]).toMatchObject({ row: 3, code: PALETTE_ERRORS.INVALID_HEX })
  })

  it('与已有色号重复被拒绝(大小写不敏感)', () => {
    const res = parseColorsCsv('code,hex\na1,#0000FF', { existingColors: existing })
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(PALETTE_ERRORS.DUPLICATE_CODE)
  })

  it('文件内自身重复色号也被拒绝', () => {
    const res = parseColorsCsv('code,hex\nB1,#0000FF\nb1,#00FF00')
    expect(res.drafts).toHaveLength(1)
    expect(res.errors[0].code).toBe(PALETTE_ERRORS.DUPLICATE_CODE)
  })

  it('超过行数上限被拒绝', () => {
    const header = 'code,hex\n'
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `X${i},#0000${String(i % 10)}0`).join('\n')
    const res = parseColorsCsv(header + rows)
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(IMPORT_ERRORS.TOO_MANY_ROWS)
  })

  it('JSON 数组与 { colors: [] } 两种形状都接受', () => {
    const a = parseColorsJson(JSON.stringify([{ code: 'B1', hex: '#0000FF' }]))
    expect(a.ok).toBe(true)
    expect(a.drafts).toHaveLength(1)

    const b = parseColorsJson(JSON.stringify({ colors: [{ code: 'B2', hex: '#00FF00' }] }))
    expect(b.ok).toBe(true)
    expect(b.drafts[0].code).toBe('B2')
  })

  it('非法 JSON / 错误形状被拒绝', () => {
    expect(parseColorsJson('{oops').errors[0].code).toBe(IMPORT_ERRORS.BAD_JSON)
    expect(parseColorsJson('{"colors":{}}').errors[0].code).toBe(IMPORT_ERRORS.BAD_SHAPE)
  })

  it('按扩展名/内容自动选择解析器', () => {
    expect(parseColorImport('[{"code":"B1","hex":"#0000FF"}]', { filename: 'x.txt' }).ok).toBe(true)
    expect(parseColorImport('code,hex\nB1,#0000FF', { filename: 'x.csv' }).ok).toBe(true)
    expect(parseColorImport('code,hex\nB1,#0000FF', { filename: 'x.json' }).errors[0].code)
      .toBe(IMPORT_ERRORS.BAD_JSON)
  })
})
