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
    // 透视校正(默认未校正):未调用 applyPerspective 时这两个都是空,
    // 向导里那组按钮只在有 originalImage 时才可点
    originalImage: { imageData: { data: new Uint8ClampedArray(4), width: 1, height: 1 }, width: 100, height: 80 },
    quad: null,
    applyPerspective: vi.fn(),
    clearPerspective: vi.fn(),
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
      // 角点标记绘制:arc / fill / fillText 及文字对齐属性
      arc: () => {}, fill: () => {}, fillText: () => {},
      font: '', textAlign: '', textBaseline: '',
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

/** 给画布一个真实的 200×160 矩形,让 clientToCanvasPoint 能换算(jsdom 默认全 0) */
function mockCanvasRect(canvas) {
  canvas.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, width: 200, height: 160,
    right: 200, bottom: 160, toJSON: () => ({}),
  })
}

describe('ChartImportWizard · 透视校正', () => {
  beforeEach(() => {
    mocks.state.quad = null
    mocks.state.applyPerspective.mockReset().mockReturnValue(true)
    mocks.state.clearPerspective.mockReset().mockReturnValue(true)
  })

  it('未校正时显示「透视校正」按钮,点击进入角点模式', () => {
    const { container } = renderWizard()
    const btn = container.querySelector('.chart-perspective-btn')
    expect(btn.textContent).toContain('斜拍拉正')

    fireEvent.click(btn)
    expect(container.querySelector('.chart-perspective-hint').textContent).toContain('0/4')
    // 进入角点模式后按钮换成取消
    expect(container.querySelector('.chart-perspective-btn.ghost').textContent).toBe('取消')
  })

  it('点满四个角后调用 applyPerspective 并退出角点模式', () => {
    const { container } = renderWizard()
    fireEvent.click(container.querySelector('.chart-perspective-btn'))

    const canvas = container.querySelector('.chart-source-canvas')
    // jsdom 的 getBoundingClientRect 全为 0,换算函数会返回 null 并忽略点击。
    // 给画布一个真实矩形,让点击能换算成图像坐标。
    mockCanvasRect(canvas)
    for (let i = 0; i < 4; i++) {
      fireEvent.pointerDown(canvas, { clientX: 10 + i * 10, clientY: 10 + i * 10 })
    }

    expect(mocks.state.applyPerspective).toHaveBeenCalledTimes(1)
    expect(mocks.state.applyPerspective.mock.calls[0][0]).toHaveLength(4)
    // 已退出角点模式
    expect(container.querySelector('.chart-perspective-hint')).toBeNull()
  })

  it('角点模式下不进入拖拽(不会误改网格边界)', () => {
    const { container } = renderWizard()
    fireEvent.click(container.querySelector('.chart-perspective-btn'))

    const canvas = container.querySelector('.chart-source-canvas')
    mockCanvasRect(canvas)
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60 })
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 60 })

    expect(mocks.state.applyManualBounds).not.toHaveBeenCalled()
  })

  it('校正后显示已应用状态与取消按钮', () => {
    mocks.state.quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    const { container } = renderWizard()

    expect(container.querySelector('.chart-perspective-done').textContent).toContain('已按四个角拉正')
    const btn = container.querySelector('.chart-perspective-btn.ghost')
    expect(btn.textContent).toBe('取消拉正')

    fireEvent.click(btn)
    expect(mocks.state.clearPerspective).toHaveBeenCalledTimes(1)
  })

  it('取消角点模式不会调用 applyPerspective', () => {
    const { container } = renderWizard()
    fireEvent.click(container.querySelector('.chart-perspective-btn'))

    const canvas = container.querySelector('.chart-source-canvas')
    mockCanvasRect(canvas)
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 })
    // 只点了一个角就取消
    fireEvent.click(container.querySelector('.chart-perspective-btn.ghost'))

    expect(mocks.state.applyPerspective).not.toHaveBeenCalled()
    // 回到未校正状态
    expect(container.querySelector('.chart-perspective-btn').textContent).toContain('斜拍拉正')
  })

  it('校正失败时提示,不静默退出', () => {
    mocks.state.applyPerspective.mockReturnValue(false)
    const { container } = renderWizard()
    fireEvent.click(container.querySelector('.chart-perspective-btn'))

    const canvas = container.querySelector('.chart-source-canvas')
    mockCanvasRect(canvas)
    for (let i = 0; i < 4; i++) {
      fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 })
    }
    expect(mocks.state.applyPerspective).toHaveBeenCalledTimes(1)
    // 失败后**留在角点模式**并清空已选点,用户可以直接重选 ——
    // 退出模式会把刚点的四次全部作废,还得重新进一次
    const hint = container.querySelector('.chart-perspective-hint')
    expect(hint).not.toBeNull()
    expect(hint.textContent).toContain('0/4')
  })
})
