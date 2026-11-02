import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import IroningEffectSection from './IroningEffectSection'
import i18n from '../../i18n'

/**
 * IroningEffectSection 组件测试(07 文档 §5)。
 *
 * 渲染器整体 mock(预览生命周期不真画布);Object URL 与 AbortController
 * 用计数 spy 验证生命周期契约:替换撤销、卸载撤销、切换材质取消进行中渲染。
 */

vi.mock('../../services/export/IroningEffectRenderer', () => ({
  renderIroningEffect: vi.fn(),
}))

import { renderIroningEffect } from '../../services/export/IroningEffectRenderer'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

const CANVAS_DATA = [
  ['#E53935', null, '#1E88E5'],
  [null, '#F2F2F2', null],
  ['#00AA88', null, '#333333'],
]

function setup(overrides = {}) {
  const props = {
    canvasData: CANVAS_DATA,
    gridSize: 3,
    gridWidth: 3,
    gridHeight: 3,
    paletteId: 'perler',
    designName: '测试图纸',
    onRequestExport: vi.fn(),
    ...overrides,
  }
  render(<IroningEffectSection {...props} />)
  return props
}

async function expandAndSettle() {
  fireEvent.click(screen.getByRole('button', { name: /高级熨烫/ }))
  await waitFor(() => expect(renderIroningEffect).toHaveBeenCalled())
  // blob URL 就绪(防抖后渲染完成)
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
}

beforeEach(() => {
  renderIroningEffect.mockReset()
  renderIroningEffect.mockResolvedValue({
    blob: new Blob(['png'], { type: 'image/png' }),
    width: 96,
    height: 96,
    actualScale: 1,
    requestedScale: 1,
  })
  URL.createObjectURL = vi.fn(() => `blob:mock-${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  delete URL.createObjectURL
  delete URL.revokeObjectURL
})

describe('IroningEffectSection · 材质选择器', () => {
  it('折叠时只渲染标题,不触发任何预览渲染', () => {
    setup()
    expect(screen.getByText('高级熨烫效果')).toBeTruthy()
    expect(renderIroningEffect).not.toHaveBeenCalled()
    // 六个材质按钮都在折叠体里,不可见
    expect(screen.queryByRole('button', { name: /麻布烫/ })).toBeNull()
  })

  it('展开后渲染六个材质按钮,默认选中麻布烫(aria-pressed)', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /高级熨烫/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /麻布烫/ })).toBeTruthy())
    const buttons = ['无孔烫', '麻布烫', '毛巾烫', '澡巾烫', '细闪烫', '粗闪烫'].map(label =>
      screen.getByRole('button', { name: new RegExp(label) })
    )
    expect(buttons).toHaveLength(6)
    expect(buttons.map(b => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
      'false',
    ])
  })

  it('点击材质切换选中态并以新 presetId 重新渲染预览', async () => {
    setup()
    await expandAndSettle()
    expect(renderIroningEffect).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ presetId: 'linen', mode: 'preview' })
    )
    fireEvent.click(screen.getByRole('button', { name: /毛巾烫/ }))
    await waitFor(() =>
      expect(renderIroningEffect).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ presetId: 'towel', mode: 'preview' })
      )
    )
    expect(screen.getByRole('button', { name: /毛巾烫/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /麻布烫/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('渲染器永不收到 export 模式(预览专用)', async () => {
    setup()
    await expandAndSettle()
    for (const call of renderIroningEffect.mock.calls) {
      expect(call[1].mode).toBe('preview')
    }
  })
})

describe('IroningEffectSection · 预览状态', () => {
  it('整张图纸无内容时显示空态,不调用渲染器', () => {
    setup({
      canvasData: [
        [null, null],
        [null, null],
      ],
      gridSize: 2,
    })
    fireEvent.click(screen.getByRole('button', { name: /高级熨烫/ }))
    expect(screen.getByText(/暂无图案/)).toBeTruthy()
    expect(renderIroningEffect).not.toHaveBeenCalled()
  })

  it('渲染失败显示错误态与重试按钮,点击重试重新渲染', async () => {
    renderIroningEffect.mockRejectedValueOnce(new Error('boom'))
    setup()
    fireEvent.click(screen.getByRole('button', { name: /高级熨烫/ }))
    await waitFor(() => expect(screen.getByText(/预览生成失败/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.getByRole('img', { name: /麻布烫/ })).toBeTruthy())
    expect(renderIroningEffect).toHaveBeenCalledTimes(2)
  })

  it('导出按钮把当前 presetId 交给父级 onRequestExport', async () => {
    const props = setup()
    await expandAndSettle()
    fireEvent.click(screen.getByRole('button', { name: /粗闪烫/ }))
    fireEvent.click(screen.getByRole('button', { name: /导出熨烫效果/ }))
    expect(props.onRequestExport).toHaveBeenCalledWith('coarse-glitter')
  })

  it('isExporting 时材质与导出按钮禁用', () => {
    setup({ isExporting: true })
    fireEvent.click(screen.getByRole('button', { name: /高级熨烫/ }))
    for (const label of ['无孔烫', '麻布烫', '毛巾烫', '澡巾烫', '细闪烫', '粗闪烫']) {
      expect(screen.getByRole('button', { name: new RegExp(label) }).disabled).toBe(true)
    }
    expect(screen.getByRole('button', { name: /导出熨烫效果/ }).disabled).toBe(true)
  })
})

describe('IroningEffectSection · Object URL 生命周期', () => {
  it('切换材质时撤销旧 URL、挂载新 URL', async () => {
    setup()
    await expandAndSettle()
    const firstUrl = URL.createObjectURL.mock.results[0].value
    fireEvent.click(screen.getByRole('button', { name: /细闪烫/ }))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl)
  })

  it('卸载时撤销最后一个 URL', async () => {
    const { unmount } = render(
      <IroningEffectSection
        canvasData={CANVAS_DATA}
        gridSize={3}
        gridWidth={3}
        gridHeight={3}
        designName="测试图纸"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /高级熨烫/ }))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
    const url = URL.createObjectURL.mock.results[0].value
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
  })
})

describe('IroningEffectSection · 防抖与取消', () => {
  it('快速切换材质只渲染最后一个(防抖 + 取消旧任务)', async () => {
    vi.useFakeTimers()
    try {
      render(
        <IroningEffectSection
          canvasData={CANVAS_DATA}
          gridSize={3}
          gridWidth={3}
          gridHeight={3}
          designName="测试图纸"
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /高级熨烫/ }))
      // 三个材质快速切换:每次切换都重置 250ms 计时
      await vi.advanceTimersByTimeAsync(100)
      fireEvent.click(screen.getByRole('button', { name: /毛巾烫/ }))
      await vi.advanceTimersByTimeAsync(100)
      fireEvent.click(screen.getByRole('button', { name: /粗闪烫/ }))
      await vi.advanceTimersByTimeAsync(300)
      // 只发出一次渲染请求,且是最后选中的 coarse-glitter
      expect(renderIroningEffect).toHaveBeenCalledTimes(1)
      expect(renderIroningEffect).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ presetId: 'coarse-glitter' })
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('卸载取消进行中的渲染(signal.aborted)', async () => {
    let capturedSignal = null
    renderIroningEffect.mockImplementation((_doc, options) => {
      capturedSignal = options.signal
      return new Promise(() => {}) // 永不完成,模拟大图渲染中
    })
    const { unmount } = render(
      <IroningEffectSection
        canvasData={CANVAS_DATA}
        gridSize={3}
        gridWidth={3}
        gridHeight={3}
        designName="测试图纸"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /高级熨烫/ }))
    await vi.waitFor(() => expect(renderIroningEffect).toHaveBeenCalled(), { timeout: 3000 })
    unmount()
    expect(capturedSignal?.aborted).toBe(true)
  })
})
