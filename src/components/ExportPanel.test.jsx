import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ExportPanel from './ExportPanel'
import i18n from '../i18n'

/**
 * ExportPanel 组件级回归测试。
 *
 * 背景(M0 / R1):ExportPanel 曾调用未 import 的 `resolveToHex`(旧导出路径)与
 * `renderPatternDocumentToSVG` / `svgStringToBlob`(V2 SVG 路径)。这两类错误只在
 * 实际点击导出时抛 ReferenceError,构建/类型检查都不会报(纯 JS + 运行时调用),
 * 因此必须由组件级测试覆盖 —— 分别覆盖「V2 开/关 × PNG/SVG」四条路径。
 *
 * 断言方式:导出成功 → URL.createObjectURL 被调用;失败 → 面板渲染错误文案。
 */

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

// jsdom 无 canvas 实现:提供可调用的 2D 上下文 + toBlob,并拦截 a.click()
function installExportMocks() {
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    scale: () => {}, fillRect: () => {}, strokeRect: () => {}, beginPath: () => {},
    closePath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    clearRect: () => {}, fillText: () => {}, arc: () => {}, fill: () => {},
    save: () => {}, restore: () => {}, clip: () => {}, translate: () => {},
    drawImage: () => {}, setTransform: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  }
  const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx)
  const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
    cb(new Blob(['png'], { type: 'image/png' }))
  })
  // jsdom 点击 <a download> 会尝试导航并打印 "Not implemented"
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

  const hadCreate = typeof URL.createObjectURL === 'function'
  const origCreate = URL.createObjectURL
  const origRevoke = URL.revokeObjectURL
  const createObjectURL = vi.fn(() => 'blob:mock-export')
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = vi.fn()

  return {
    createObjectURL,
    restore() {
      getContextSpy.mockRestore()
      toBlobSpy.mockRestore()
      clickSpy.mockRestore()
      if (hadCreate) URL.createObjectURL = origCreate
      else delete URL.createObjectURL
      if (typeof origRevoke === 'function') URL.revokeObjectURL = origRevoke
      else delete URL.revokeObjectURL
    },
  }
}

const CANVAS_DATA = [
  ['#E53935', null],
  [null, '#F2F2F2'],
]

function setup() {
  return render(
    <ExportPanel
      canvasData={CANVAS_DATA}
      gridSize={2}
      gridWidth={2}
      gridHeight={2}
      designName="测试图纸"
      paletteId="perler"
      onClose={() => {}}
    />
  )
}

// 点击快捷导出按钮 → 在确认框里点「确认导出」
function requestQuickExport(labelText) {
  fireEvent.click(screen.getByText(labelText))
  const confirmBtn = document.querySelector('.export-confirm-actions .btn-primary')
  expect(confirmBtn).toBeTruthy()
  fireEvent.click(confirmBtn)
}

let mock
beforeEach(() => { mock = installExportMocks() })
afterEach(() => {
  cleanup()
  mock.restore()
  localStorage.clear()
})

describe('ExportPanel 导出路径回归(M0 / R1)', () => {
  it('关闭 V2 后旧版 PNG 导出不再抛 ReferenceError(resolveToHex)', async () => {
    setup()
    fireEvent.click(screen.getByRole('checkbox')) // 关闭「完整版式图纸引擎」
    requestQuickExport('PNG 图片')

    await waitFor(() => expect(mock.createObjectURL).toHaveBeenCalled())
    // 若 resolveToHex 未定义,异常会被 catch 并渲染 exportFailed 文案
    expect(screen.queryByText(/导出失败/)).toBeNull()
  })

  it('关闭 V2 后旧版 SVG 导出不再抛 ReferenceError(resolveToHex)', () => {
    setup()
    fireEvent.click(screen.getByRole('checkbox'))
    requestQuickExport('SVG 矢量')

    expect(mock.createObjectURL).toHaveBeenCalledTimes(1)
    const blob = mock.createObjectURL.mock.calls[0][0]
    expect(blob.type).toContain('image/svg+xml')
  })

  it('V2 SVG 导出已正确引入 VectorRenderer(renderPatternDocumentToSVG/svgStringToBlob)', () => {
    setup()
    // 默认 V2 开启,无需切换
    requestQuickExport('SVG 矢量')

    expect(mock.createObjectURL).toHaveBeenCalledTimes(1)
    const blob = mock.createObjectURL.mock.calls[0][0]
    expect(blob.type).toContain('image/svg+xml')
  })

  it('V2 PNG 导出走 RasterRenderer 并回报分辨率', async () => {
    setup()
    requestQuickExport('PNG 图片')

    await waitFor(() => expect(mock.createObjectURL).toHaveBeenCalled())
    expect(screen.queryByText(/导出失败/)).toBeNull()
    // 真实分辨率回显:确认超采样倍率生效(而不是静默降级/未回传)
    expect(await screen.findByText(/导出分辨率: \d+×\d+/)).toBeTruthy()
  })
})

describe('导出确认框的关闭语义', () => {
  it('取消确认框只关确认框,不连带关闭导出面板', () => {
    const onClose = vi.fn()
    render(
      <ExportPanel
        canvasData={CANVAS_DATA}
        gridSize={2}
        gridWidth={2}
        gridHeight={2}
        designName="测试图纸"
        paletteId="perler"
        onClose={onClose}
      />
    )

    // 点快捷导出 → 弹出确认框(不执行导出)
    fireEvent.click(screen.getByText('PNG 图片'))
    expect(document.querySelector('.export-confirm-actions')).toBeTruthy()

    // 点确认框遮罩 = 取消这次导出
    fireEvent.click(document.querySelector('.export-confirm-overlay'))

    // 确认框消失,但导出面板仍在(此前确认框嵌在外层 overlay 内,
    // 这次点击会冒泡到外层 onClick,把整个导出面板一起关掉)
    expect(document.querySelector('.export-confirm-actions')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('PNG 图片')).toBeTruthy()
  })
})
