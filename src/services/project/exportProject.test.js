import { describe, it, expect, vi } from 'vitest'
import {
  projectToFileObject,
  projectToFileText,
  projectFileName,
  downloadProjectFile,
  PROJECT_FILE_EXTENSION,
} from './exportProject'
import { parseImportText } from './importProject'
import { createProject } from './projectModel'

const cells = () => Array.from({ length: 10 }, () => Array.from({ length: 12 }, () => null))

function sampleProject(overrides = {}) {
  const p = createProject({
    cells: cells(),
    name: '宽图',
    paletteId: 'mard',
    id: 'p-1',
    createdAt: '2026-10-01T00:00:00.000Z',
  })
  return { ...p, ...overrides }
}

describe('exportProject · projectToFileObject', () => {
  it('输出白名单字段,不含内部/敏感数据', () => {
    const obj = projectToFileObject(sampleProject())
    expect(Object.keys(obj).sort()).toEqual([
      'createdAt', 'grid', 'name', 'palette', 'privacy',
      'revision', 'schemaVersion', 'settings', 'source', 'updatedAt',
    ])
    // id 不写入文件(文件是内容,不是身份)
    expect(obj.id).toBeUndefined()
  })

  it('source.filename 被清空(不泄漏本机路径)', () => {
    const p = sampleProject()
    p.source = { ...p.source, filename: 'C:\\Users\\me\\secret.png', kind: 'photo-quantized' }
    const obj = projectToFileObject(p)
    expect(obj.source.filename).toBeNull()
    expect(obj.source.kind).toBe('photo-quantized')
  })

  it('visibility 强制为 private(即使内存对象被改过)', () => {
    const p = sampleProject()
    p.privacy = { visibility: 'public' }
    expect(projectToFileObject(p).privacy.visibility).toBe('private')
  })

  it('深拷贝 cells(改动导出对象不影响原项目)', () => {
    const p = sampleProject()
    p.grid.cells[0][0] = '#E53935'
    const obj = projectToFileObject(p)
    obj.grid.cells[0][0] = '#FFFFFF'
    expect(p.grid.cells[0][0]).toBe('#E53935')
  })

  it('非法项目返回 null', () => {
    expect(projectToFileObject(null)).toBeNull()
    expect(projectToFileObject({ grid: {} })).toBeNull()
    expect(projectToFileObject({ grid: { width: 1.5, height: 2, cells: [[]] } })).toBeNull()
  })
})

describe('exportProject · 往返(导出 → 导入)', () => {
  it('导出的文本可被 parseImportText 完整读回', () => {
    const p = sampleProject()
    p.grid.cells[0][0] = '#E53935'
    p.grid.cells[9][11] = '#FFFFFF'
    const text = projectToFileText(p)
    const res = parseImportText(text)
    expect(res.ok).toBe(true)
    const back = res.projects[0]
    expect(back.grid.width).toBe(12)
    expect(back.grid.height).toBe(10)
    expect(back.grid.cells).toEqual(p.grid.cells)
    expect(back.palette.paletteId).toBe('mard')
    expect(back.name).toBe('宽图')
  })

  it('往返后仍为 private 且不含 id', () => {
    const res = parseImportText(projectToFileText(sampleProject()))
    expect(res.projects[0].privacy.visibility).toBe('private')
  })
})

describe('exportProject · projectFileName', () => {
  it('包含名称、宽高与扩展名', () => {
    const name = projectFileName(sampleProject())
    expect(name.endsWith(PROJECT_FILE_EXTENSION)).toBe(true)
    expect(name).toContain('宽图')
    expect(name).toContain('12x10')
  })

  it('清理路径分隔符与 Windows 非法字符', () => {
    const p = sampleProject({ name: 'a/b\\c:d*e?f"g<h>i|j' })
    const name = projectFileName(p)
    expect(name).not.toMatch(/[\\/:*?"<>|]/)
  })

  it('空名回退到默认名', () => {
    const p = sampleProject({ name: '   ' })
    expect(projectFileName(p, 'pattern')).toContain('pattern')
  })
})

describe('exportProject · downloadProjectFile(注入依赖)', () => {
  it('创建 blob URL、触发下载并回收', () => {
    vi.useFakeTimers()
    const click = vi.fn()
    const link = { href: '', download: '', rel: '', click }
    const createObjectURL = vi.fn(() => 'blob:fake')
    const revokeObjectURL = vi.fn()
    const body = { appendChild: vi.fn(), removeChild: vi.fn() }

    const origBody = globalThis.document.body
    Object.defineProperty(globalThis.document, 'body', { value: body, configurable: true })

    try {
      downloadProjectFile('{}', 'a.pindou.json', {
        createObjectURL,
        revokeObjectURL,
        createElement: () => link,
      })
      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(link.href).toBe('blob:fake')
      expect(link.download).toBe('a.pindou.json')
      expect(click).toHaveBeenCalledTimes(1)
      expect(body.appendChild).toHaveBeenCalledWith(link)
      expect(body.removeChild).toHaveBeenCalledWith(link)

      expect(revokeObjectURL).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1000)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
    } finally {
      Object.defineProperty(globalThis.document, 'body', { value: origBody, configurable: true })
      vi.useRealTimers()
    }
  })
})
