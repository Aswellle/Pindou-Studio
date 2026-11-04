import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import IroningEffectSection from './IroningEffectSection'
import i18n from '../../i18n'
import { getPalette } from '../../data/palettes'

/**
 * IroningEffectSection / IroningStudioDialog 组件测试。
 *
 * 入口只负责打开工作室;预览生命周期全部在 IroningStudioDialog 内。
 * 渲染器整体 mock(jsdom 无 canvas);Object URL 与 AbortController
 * 用 spy 验证生命周期契约:替换撤销旧 URL、关闭/卸载撤销当前 URL、
 * 切换材质取消进行中的渲染。
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

function openStudio() {
  fireEvent.click(screen.getByRole('button', { name: /打开高级熨烫效果工作室/ }))
}

/** 点开入口,等待工作室挂载且首帧预览渲染完成 */
async function openStudioAndSettle() {
  openStudio()
  await waitFor(() => expect(renderIroningEffect).toHaveBeenCalled())
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

describe('IroningEffectSection · 入口', () => {
  it('入口带三张材质样张缩略,工作室未打开时不触发渲染', () => {
    setup()
    expect(screen.getByText('高级熨烫效果')).toBeTruthy()
    expect(document.querySelectorAll('.ironing-entry-thumbs img')).toHaveLength(3)
    expect(renderIroningEffect).not.toHaveBeenCalled()
    // 工作室的材质卡不可见
    expect(screen.queryByRole('button', { name: /麻布烫/ })).toBeNull()
  })

  it('locked 时点击入口交给父级引导,工作室不挂载', () => {
    const onRequireAuth = vi.fn()
    setup({ locked: true, onRequireAuth })
    fireEvent.click(screen.getByRole('button', { name: /高级熨烫效果需要登录/ }))
    expect(onRequireAuth).toHaveBeenCalledTimes(1)
    expect(renderIroningEffect).not.toHaveBeenCalled()
    expect(screen.queryByText('选择材质,实时预览图纸熨烫后的成品效果')).toBeNull()
  })

  it('isExporting 期间入口禁用', () => {
    setup({ isExporting: true })
    expect(screen.getByRole('button', { name: /打开高级熨烫效果工作室/ }).disabled).toBe(true)
  })
})

describe('IroningStudioDialog · 材质样张墙', () => {
  it('打开后出现六个材质卡(样张墙),默认选中麻布烫', async () => {
    setup()
    await openStudioAndSettle()
    const labels = ['无孔烫', '麻布烫', '毛巾烫', '澡巾烫', '细闪烫', '粗闪烫']
    const cards = labels.map(label => screen.getByRole('button', { name: new RegExp(label) }))
    expect(cards).toHaveLength(6)
    expect(cards.map(c => c.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
      'false',
    ])
    // 每张卡都带样张图(实拍样片裁剪版,是材质的第一印象)
    for (const card of cards) {
      expect(card.querySelector('img')).toBeTruthy()
    }
  })

  it('点击材质卡切换选中态并以新 presetId 重新渲染预览', async () => {
    setup()
    await openStudioAndSettle()
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
    await openStudioAndSettle()
    for (const call of renderIroningEffect.mock.calls) {
      expect(call[1].mode).toBe('preview')
    }
  })

  it('预览状态通过 aria-live 区域播报', async () => {
    setup()
    await openStudioAndSettle()
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.textContent).toContain('当前材质:麻布烫')
  })
})

describe('IroningStudioDialog · 预览状态', () => {
  it('历史作品的品牌色号先归一为 hex,不会被当作空格丢弃', async () => {
    const palette = getPalette('perler')
    const code = palette.colors[0].id
    const hex = palette.colors[0].hex
    setup({
      canvasData: [
        [code, null],
        [null, hex],
      ],
      gridSize: 2,
      gridWidth: 2,
      gridHeight: 2,
    })
    openStudio()
    await waitFor(() => expect(renderIroningEffect).toHaveBeenCalled())
    const doc = renderIroningEffect.mock.calls[0][0]
    expect(doc.grid.cells[0][0]).toBe(hex)
    expect(doc.grid.cells[1][0]).toBeNull()
  })

  it('整张图纸无内容时显示空态,不调用渲染器', () => {
    setup({
      canvasData: [
        [null, null],
        [null, null],
      ],
      gridSize: 2,
      gridWidth: 2,
      gridHeight: 2,
    })
    openStudio()
    expect(document.querySelector('.ironing-placeholder')?.textContent).toMatch(/暂无图案/)
    expect(renderIroningEffect).not.toHaveBeenCalled()
  })

  it('渲染失败显示错误态与重试按钮,点击重试重新渲染', async () => {
    renderIroningEffect.mockRejectedValueOnce(new Error('boom'))
    setup()
    openStudio()
    await waitFor(() =>
      expect(document.querySelector('.ironing-placeholder')?.textContent).toMatch(/预览生成失败/)
    )
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.getByRole('img', { name: /麻布烫/ })).toBeTruthy())
    expect(renderIroningEffect).toHaveBeenCalledTimes(2)
  })

  it('导出按钮把当前 presetId 交给父级确认流程,工作室保持打开', async () => {
    const props = setup()
    await openStudioAndSettle()
    fireEvent.click(screen.getByRole('button', { name: /粗闪烫/ }))
    fireEvent.click(screen.getByRole('button', { name: /导出熨烫效果/ }))
    expect(props.onRequestExport).toHaveBeenCalledWith('coarse-glitter')
    // 确认框(父级,1200)盖在工作室(1190)上;取消导出后用户回到工作室
    expect(screen.getByRole('button', { name: '粗闪烫' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('IroningStudioDialog · Object URL 生命周期', () => {
  it('切换材质时撤销旧 URL、挂载新 URL', async () => {
    setup()
    await openStudioAndSettle()
    const firstUrl = URL.createObjectURL.mock.results[0].value
    fireEvent.click(screen.getByRole('button', { name: /细闪烫/ }))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl)
  })

  it('关闭工作室时撤销预览 URL,blob 不常驻', async () => {
    setup()
    await openStudioAndSettle()
    const url = URL.createObjectURL.mock.results[0].value
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith(url))
    expect(screen.queryByRole('img')).toBeNull()
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
    openStudio()
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
    const url = URL.createObjectURL.mock.results[0].value
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
  })
})

describe('IroningStudioDialog · 防抖与取消', () => {
  it('快速切换材质只渲染最后一个(防抖)', async () => {
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
      fireEvent.click(screen.getByRole('button', { name: /打开高级熨烫效果工作室/ }))
      // 三次快速切换:每次切换都重置 250ms 计时
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

  it('旧材质晚返回的预览不会覆盖新材质的结果', async () => {
    const resolvers = []
    renderIroningEffect.mockImplementation(
      () =>
        new Promise(resolve => {
          resolvers.push(resolve)
        })
    )
    render(
      <IroningEffectSection
        canvasData={CANVAS_DATA}
        gridSize={3}
        gridWidth={3}
        gridHeight={3}
        designName="测试图纸"
      />
    )
    openStudio()
    await vi.waitFor(() => expect(renderIroningEffect).toHaveBeenCalledTimes(1), { timeout: 3000 })
    fireEvent.click(screen.getByRole('button', { name: /毛巾烫/ }))
    await vi.waitFor(() => expect(renderIroningEffect).toHaveBeenCalledTimes(2), { timeout: 3000 })

    const makeResult = seed => ({
      blob: new Blob([seed], { type: 'image/png' }),
      width: 1,
      height: 1,
      actualScale: 1,
      requestedScale: 1,
    })
    // 新材质先完成
    resolvers[1](makeResult('new'))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1))
    const newUrl = URL.createObjectURL.mock.results[0].value
    // 旧材质随后完成:其结果必须被丢弃并撤销 URL,不能覆盖当前预览
    resolvers[0](makeResult('old'))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2))
    const staleUrl = URL.createObjectURL.mock.results[1].value
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(staleUrl)
    expect(screen.getByRole('img').getAttribute('src')).toBe(newUrl)
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
    openStudio()
    await vi.waitFor(() => expect(renderIroningEffect).toHaveBeenCalled(), { timeout: 3000 })
    unmount()
    expect(capturedSignal?.aborted).toBe(true)
  })
})
