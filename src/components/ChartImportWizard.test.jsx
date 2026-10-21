import { describe, it, expect, beforeAll, afterEach, beforeEach, vi } from 'vitest'
import { render, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'

/**
 * 覆盖「人工修正可恢复」这条规格 03 §8 的要求:
 *   - 重新选择同一张图片时,上次的列数/行数/色卡/逐格修正要原样回来;
 *   - 参数与修正变化后要写回会话存储;
 *   - 保存作品成功后要清掉会话(避免下次莫名带回旧修正)。
 *
 * useChartImport 会真的解码图片与跑检测,jsdom 里没有 Image/canvas 解码能力,
 * 因此这里把它替换成受控桩,只验证 ChartImportWizard 的恢复与持久化逻辑。
 */

const mocks = vi.hoisted(() => {
  const state = {
    image: { imageData: { data: new Uint8ClampedArray(4), width: 1, height: 1 }, width: 100, height: 80 },
    detection: { ok: true, status: 'auto', cols: 10, rows: 8, bounds: { x0: 0, y0: 0, x1: 100, y1: 80 } },
    fileError: '',
    busy: false,
    sessionId: 'img-fp-1',
    restored: null,
    // 原图 Blob:hook 在 loadFile 成功后提供,写回会话时必须带上
    imageBlob: { size: 1024, slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) },
    loadFile: vi.fn(),
    applyManualBounds: vi.fn(),
    reset: vi.fn(),
    build: vi.fn(),
  }
  return { state }
})

vi.mock('../hooks/useChartImport', () => ({
  useChartImport: () => mocks.state,
}))

vi.mock('../services/project/chartImportStore', () => ({
  saveSession: vi.fn().mockResolvedValue(true),
  deleteSession: vi.fn().mockResolvedValue(true),
}))

const { default: ChartImportWizard } = await import('./ChartImportWizard')
const { saveSession, deleteSession } = await import('../services/project/chartImportStore')

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
  HTMLCanvasElement.prototype.getContext = () => ({
      fillStyle: '', strokeStyle: '', lineWidth: 1, imageSmoothingEnabled: true,
      fillRect: () => {}, clearRect: () => {}, strokeRect: () => {},
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
      putImageData: () => {}, drawImage: () => {}, setLineDash: () => {},
      setTransform: () => {}, save: () => {}, restore: () => {},
    })
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.restored = null
  mocks.state.sessionId = 'img-fp-1'
  mocks.state.build.mockReturnValue({
    ok: true,
    project: {
      grid: { width: 10, height: 8, cells: Array.from({ length: 8 }, () => Array(10).fill(null)) },
      palette: { paletteId: 'mard' },
      source: { kind: 'chart-import' },
      name: '测试图纸',
    },
    stats: { colorCount: 0, beadCount: 0, blankCount: 80, uncertainCount: 0 },
  })
})

afterEach(() => cleanup())

const renderWizard = (props = {}) => render(
  <MemoryRouter initialEntries={['/import']}>
    <ChartImportWizard
      onLoadProject={vi.fn()}
      onSaveProject={vi.fn().mockResolvedValue(true)}
      {...props}
    />
  </MemoryRouter>,
)

describe('ChartImportWizard · 人工修正恢复', () => {
  it('无历史会话时不显示恢复提示', () => {
    const { container } = renderWizard()
    expect(container.querySelector('.chart-banner.ok')?.textContent || '').not.toContain('恢复')
  })

  it('有历史会话时恢复列数/行数/色卡,并提示恢复了多少处修正', async () => {
    mocks.state.restored = {
      cols: 17,
      rows: 7,
      paletteId: 'perler',
      removeBackground: false,
      bounds: { x0: 5, y0: 6, x1: 205, y1: 90 },
      overrides: { '1,2': '#E53935', '3,4': null, '5,6': '#FFFFFF' },
    }

    const { container } = renderWizard()

    await waitFor(() => {
      const colsInput = container.querySelectorAll('.chart-field input[type="number"]')[0]
      expect(colsInput.value).toBe('17')
    })
    const rowsInput = container.querySelectorAll('.chart-field input[type="number"]')[1]
    expect(rowsInput.value).toBe('7')
    expect(container.querySelector('.chart-field select').value).toBe('perler')
    expect(container.querySelector('.chart-check input[type="checkbox"]').checked).toBe(false)

    // 提示里应带上恢复的修正条数
    const banner = [...container.querySelectorAll('.chart-banner.ok')]
      .map((el) => el.textContent)
      .join(' ')
    expect(banner).toContain('3')
  })

  it('恢复的修正会进入 build 参数', async () => {
    mocks.state.restored = {
      cols: 10, rows: 8, paletteId: 'mard', removeBackground: true,
      bounds: null,
      overrides: { '2,3': '#123456' },
    }
    renderWizard()
    await waitFor(() => {
      const calls = mocks.state.build.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const last = calls[calls.length - 1][0]
      expect(last.overrides).toEqual({ '2,3': '#123456' })
    })
  })

  it('改参数后会把会话写回存储(防抖)', async () => {
    const { container } = renderWizard()
    const colsInput = container.querySelectorAll('.chart-field input[type="number"]')[0]

    vi.useFakeTimers()
    try {
      fireEvent.change(colsInput, { target: { value: '12' } })
      expect(saveSession).not.toHaveBeenCalled()
      await act(async () => { vi.advanceTimersByTime(700) })
      expect(saveSession).toHaveBeenCalled()
      const arg = saveSession.mock.calls[saveSession.mock.calls.length - 1][0]
      expect(arg.id).toBe('img-fp-1')
      expect(arg.state.cols).toBe(12)
    } finally {
      vi.useRealTimers()
    }
  })

  it('保存作品成功后清掉会话,避免下次带回旧修正', async () => {
    const onSaveProject = vi.fn().mockResolvedValue(true)
    const { container } = renderWizard({ onSaveProject })

    const saveBtn = [...container.querySelectorAll('.chart-btn.primary')][0]
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(onSaveProject).toHaveBeenCalled()
      expect(deleteSession).toHaveBeenCalledWith('img-fp-1')
    })
  })

  it('保存失败时保留会话(修正还能继续)', async () => {
    const onSaveProject = vi.fn().mockResolvedValue(false)
    const { container } = renderWizard({ onSaveProject })

    fireEvent.click([...container.querySelectorAll('.chart-btn.primary')][0])

    await waitFor(() => expect(onSaveProject).toHaveBeenCalled())
    expect(deleteSession).not.toHaveBeenCalled()
  })

  it('防抖窗口内卸载时补写一次,避免关页面丢掉最后一处修正', async () => {
    const { container, unmount } = renderWizard()
    const colsInput = container.querySelectorAll('.chart-field input[type="number"]')[0]

    vi.useFakeTimers()
    try {
      fireEvent.change(colsInput, { target: { value: '14' } })
      // 还没到 600ms 就卸载
      expect(saveSession).not.toHaveBeenCalled()
      unmount()
      expect(saveSession).toHaveBeenCalledTimes(1)
      expect(saveSession.mock.calls[0][0].state.cols).toBe(14)
    } finally {
      vi.useRealTimers()
    }
  })
})
