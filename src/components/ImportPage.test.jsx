import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ImportPage from './ImportPage'
import i18n from '../i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
  // jsdom 无 canvas:缩略图直绘不崩即可
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillStyle: '', fillRect: () => {}, clearRect: () => {},
      setTransform: () => {}, save: () => {}, restore: () => {},
    }
  }
})

afterEach(() => cleanup())

const SIZE = 9
const rectCells = () => Array.from({ length: 10 }, () => Array.from({ length: 12 }, () => null))

function projectJson(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    name: '导入测试图',
    grid: { width: 12, height: 10, cells: rectCells() },
    palette: { paletteId: 'mard' },
    ...overrides,
  })
}

/** 构造 File 并触发 change(FileReader 在 jsdom 中可用) */
function selectFile(container, text, name = 'test.pindou.json', type = 'application/json') {
  const file = new File([text], name, { type })
  const input = container.querySelector('.import-file-input')
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

const setup = (props = {}) => render(
  <MemoryRouter initialEntries={['/import']}>
    <ImportPage onLoadProject={vi.fn()} onSaveProject={vi.fn().mockResolvedValue(true)} {...props} />
  </MemoryRouter>
)

describe('ImportPage · 合法文件', () => {
  it('选中合法项目文件后展示预览元信息', async () => {
    const { container } = setup()
    selectFile(container, projectJson())

    await waitFor(() => expect(screen.getByText('校验通过')).toBeTruthy())
    expect(screen.getByText('导入测试图')).toBeTruthy()
    expect(screen.getByText('12 × 10')).toBeTruthy()
    expect(screen.getByText('mard')).toBeTruthy()
  })

  it('点击「保存为我的作品」把 work 交给 onSaveProject(尺寸由数据推导)', async () => {
    const onSaveProject = vi.fn().mockResolvedValue(true)
    const { container } = setup({ onSaveProject })
    selectFile(container, projectJson())

    await waitFor(() => expect(screen.getByText('保存为我的作品')).toBeTruthy())
    fireEvent.click(screen.getByText('保存为我的作品'))

    await waitFor(() => expect(onSaveProject).toHaveBeenCalledTimes(1))
    const work = onSaveProject.mock.calls[0][0]
    expect(work.gridWidth).toBe(12)
    expect(work.gridHeight).toBe(10)
    expect(work.gridSize).toBe(12)
    expect(work.paletteId).toBe('mard')
    expect(work.name).toBe('导入测试图')
  })

  it('点击「载入画布编辑」把项目交给 onLoadProject,不调用保存', async () => {
    const onLoadProject = vi.fn()
    const onSaveProject = vi.fn()
    const { container } = setup({ onLoadProject, onSaveProject })
    selectFile(container, projectJson())

    await waitFor(() => expect(screen.getByText('载入画布编辑')).toBeTruthy())
    fireEvent.click(screen.getByText('载入画布编辑'))

    expect(onLoadProject).toHaveBeenCalledTimes(1)
    expect(onLoadProject.mock.calls[0][0].grid.width).toBe(12)
    expect(onSaveProject).not.toHaveBeenCalled()
  })

  it('数组文件提供多项目选择器', async () => {
    const { container } = setup()
    selectFile(container, JSON.stringify([
      { schemaVersion: 1, name: 'A', grid: { width: 9, height: 9, cells: Array.from({ length: 9 }, () => Array(9).fill(null)) } },
      { schemaVersion: 1, name: 'B', grid: { width: 12, height: 10, cells: rectCells() } },
    ]))

    await waitFor(() => expect(container.querySelector('.import-picker')).toBeTruthy())
    const picker = container.querySelector('.import-picker')
    expect(picker.options).toHaveLength(2)
    fireEvent.change(picker, { target: { value: '1' } })
    expect(screen.getByText('12 × 10')).toBeTruthy()
  })
})

describe('ImportPage · 非法文件', () => {
  it('非 JSON 显示分类错误且不出现预览/保存按钮', async () => {
    const { container } = setup()
    selectFile(container, '{not json')

    await waitFor(() => expect(screen.getByText('导入失败')).toBeTruthy())
    expect(screen.getByText(/不是合法的 JSON/)).toBeTruthy()
    expect(screen.queryByText('保存为我的作品')).toBeNull()
    expect(container.querySelector('.import-preview')).toBeNull()
  })

  it('未知版本给出可识别错误', async () => {
    const { container } = setup()
    selectFile(container, projectJson({ schemaVersion: 99 }))

    await waitFor(() => expect(screen.getByText('导入失败')).toBeTruthy())
    expect(screen.getByText(/不支持的项目版本/)).toBeTruthy()
  })

  it('非法颜色给出可识别错误', async () => {
    const { container } = setup()
    const cells = rectCells()
    cells[0][0] = 'red'
    selectFile(container, JSON.stringify({
      schemaVersion: 1, name: 'x', grid: { width: 12, height: 10, cells },
    }))

    await waitFor(() => expect(screen.getByText('导入失败')).toBeTruthy())
    expect(screen.getByText(/非法颜色值/)).toBeTruthy()
  })

  it('非 JSON 扩展名在读取前被拒', async () => {
    const { container } = setup()
    // 文件名与 MIME 都不是 JSON,checkImportFile 应在读取内容前拒绝
    selectFile(container, projectJson(), 'photo.png', 'image/png')

    await waitFor(() => expect(screen.getByText('导入失败')).toBeTruthy())
    expect(screen.getByText(/请选择 \.json 文件/)).toBeTruthy()
  })

  it('重新选择会清空上一次的错误与预览', async () => {
    const { container } = setup()
    selectFile(container, '{not json')
    await waitFor(() => expect(screen.getByText('导入失败')).toBeTruthy())

    selectFile(container, projectJson())
    await waitFor(() => expect(screen.getByText('校验通过')).toBeTruthy())
    expect(screen.queryByText('导入失败')).toBeNull()
  })
})

describe('ImportPage · 保存失败不误报成功', () => {
  it('onSaveProject 返回 false 时保留预览,不清空', async () => {
    const onSaveProject = vi.fn().mockResolvedValue(false)
    const { container } = setup({ onSaveProject })
    selectFile(container, projectJson())

    await waitFor(() => expect(screen.getByText('保存为我的作品')).toBeTruthy())
    fireEvent.click(screen.getByText('保存为我的作品'))

    await waitFor(() => expect(onSaveProject).toHaveBeenCalledTimes(1))
    // 仍停留在预览态,用户可重试
    expect(screen.getByText('校验通过')).toBeTruthy()
  })
})
