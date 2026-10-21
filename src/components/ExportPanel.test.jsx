import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ExportPanel from './ExportPanel'
import i18n from '../i18n'

/**
 * 超采样降级的可控注入点。
 *
 * 为什么必须用 vi.mock 而不是 vi.spyOn:
 * ESM 的命名导入在模块链接时绑定到本地绑定,同模块内部调用(如 BeadPatternExporter
 * 的 exportAsPNG 调自己的 createScaledCanvas)不经过模块命名空间对象,spyOn 拦不住。
 * 面积预算降级又依赖真实画布尺寸,jsdom 下永远走不到 —— 只能整体替换渲染器,
 * 让它在转交真实实现之前先以「被预算降级」的形态回报 onScale。
 */
const rasterControl = vi.hoisted(() => ({ forcedScale: null }))
vi.mock('../services/export/RasterRenderer', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    renderPatternDocumentToPNG: (doc, options = {}) => {
      if (rasterControl.forcedScale == null) return actual.renderPatternDocumentToPNG(doc, options)
      // 强制降级:只回报我们指定的倍率,丢弃真实渲染器的 onScale(否则会被覆盖回未降级)
      const { onScale, ...rest } = options
      onScale?.(rasterControl.forcedScale, 3)
      return actual.renderPatternDocumentToPNG(doc, rest)
    },
  }
})

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
  rasterControl.forcedScale = null
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

describe('导出成功回调(库存扣减的触发点)', () => {
  it('导出成功后才回调 onExportComplete,且只回调一次', async () => {
    const onExportComplete = vi.fn()
    render(
      <ExportPanel
        canvasData={CANVAS_DATA}
        gridSize={2}
        gridWidth={2}
        gridHeight={2}
        designName="测试图纸"
        paletteId="perler"
        deductInventory
        onToggleDeductInventory={() => {}}
        onExportComplete={onExportComplete}
        onClose={() => {}}
      />
    )
    requestQuickExport('PNG 图片')
    await waitFor(() => expect(onExportComplete).toHaveBeenCalledTimes(1))
    // 再等一拍,确认没有重复触发(确认框关闭/状态更新不会再回调)
    await new Promise((r) => setTimeout(r, 20))
    expect(onExportComplete).toHaveBeenCalledTimes(1)
  })

  it('取消确认框不触发回调(没导出就不记账)', async () => {
    const onExportComplete = vi.fn()
    render(
      <ExportPanel
        canvasData={CANVAS_DATA}
        gridSize={2}
        gridWidth={2}
        gridHeight={2}
        designName="测试图纸"
        paletteId="perler"
        deductInventory
        onExportComplete={onExportComplete}
        onClose={() => {}}
      />
    )
    fireEvent.click(screen.getByText('PNG 图片'))
    fireEvent.click(document.querySelector('.export-confirm-overlay'))
    await new Promise((r) => setTimeout(r, 20))
    expect(onExportComplete).not.toHaveBeenCalled()
  })

  it('空画布被拦截,不触发回调', async () => {
    const onExportComplete = vi.fn()
    render(
      <ExportPanel
        canvasData={[[null, null], [null, null]]}
        gridSize={2}
        gridWidth={2}
        gridHeight={2}
        designName="空图纸"
        paletteId="perler"
        deductInventory
        onExportComplete={onExportComplete}
        onClose={() => {}}
      />
    )
    fireEvent.click(screen.getByText('PNG 图片'))
    // 空画布走「empty」确认框,没有导出动作
    await new Promise((r) => setTimeout(r, 20))
    expect(onExportComplete).not.toHaveBeenCalled()
  })

  it('「导出后扣减库存」开关默认关闭,可切换', () => {
    const onToggle = vi.fn()
    render(
      <ExportPanel
        canvasData={CANVAS_DATA}
        gridSize={2}
        gridWidth={2}
        gridHeight={2}
        designName="测试图纸"
        paletteId="perler"
        deductInventory={false}
        onToggleDeductInventory={onToggle}
        onClose={() => {}}
      />
    )
    const toggle = screen.getByLabelText(/导出成功后扣减库存/)
    expect(toggle.checked).toBe(false)
    fireEvent.click(toggle)
    expect(onToggle).toHaveBeenCalledWith(true)
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

describe('物理尺寸按品牌珠径计算(规格 09 §5)', () => {
  // 29×29 Perler(5mm/颗)= 145mm;此前固定按 2.6mm 算成 75.4mm
  const renderWithPalette = (paletteId) => render(
    <ExportPanel
      canvasData={CANVAS_DATA}
      gridSize={29}
      gridWidth={29}
      gridHeight={29}
      designName="物理尺寸测试"
      paletteId={paletteId}
      onClose={() => {}}
    />
  )

  // 注意:传了 onClose 的实例是移动端 modal,会 portal 到 document.body,
  // 不在 render() 返回的 container 里 —— 断言必须查 document.body。
  it('Perler(5mm)显示 145mm,而不是按 2.6mm 算的 75.4mm', () => {
    renderWithPalette('perler')
    const text = document.body.textContent
    expect(text).toContain('145×145mm')
    expect(text).not.toContain('75.4×75.4mm')
  })

  it('Artkal(2.6mm)显示 75.4mm', () => {
    renderWithPalette('artkal')
    expect(document.body.textContent).toContain('75.4×75.4mm')
  })

  it('文案里标明所用珠径,避免用户误判', () => {
    renderWithPalette('perler')
    expect(document.body.textContent).toContain('5mm/')
  })
})

describe('导出质量预设(规格 09 §2)', () => {
  it('渲染三个预设:屏幕分享 / 高分辨率 / 打印', () => {
    setup()
    expect(screen.getByText('屏幕分享')).toBeTruthy()
    expect(screen.getByText('高分辨率')).toBeTruthy()
    expect(screen.getByText('打印 / 高 DPI')).toBeTruthy()
  })

  it('默认选屏幕分享', () => {
    setup()
    const selects = [...document.body.querySelectorAll('.style-select')]
    expect(selects[selects.length - 1].value).toBe('screen')
  })

  it('切换预设会改变 select 值(状态生效)', () => {
    setup()
    const selects = [...document.body.querySelectorAll('.style-select')]
    const qualitySelect = selects[selects.length - 1]
    fireEvent.change(qualitySelect, { target: { value: 'print' } })
    expect(qualitySelect.value).toBe('print')
  })
})

describe('超采样降级反馈(规格 09 §4.3)', () => {
  it('未降级时不显示降级提示', async () => {
    setup()
    requestQuickExport('PNG 图片')
    await waitFor(() => expect(mock.createObjectURL).toHaveBeenCalled())
    expect(document.body.textContent).not.toMatch(/已从 ×3 降级/)
  })

  it('降级时显示「实际 ×N(已从 ×3 降级)」而不是只给分辨率', async () => {
    rasterControl.forcedScale = 1 // 等价于移动端大网格被面积预算降到 1×
    setup()
    requestQuickExport('PNG 图片')
    await waitFor(() => expect(mock.createObjectURL).toHaveBeenCalled())
    expect(document.body.textContent).toMatch(/已从 ×3 降级/)
    expect(document.body.textContent).toMatch(/实际 ×1/)
  })

  it('降到 ×2 时同样报告,文案带上真实倍率', async () => {
    rasterControl.forcedScale = 2
    setup()
    requestQuickExport('PNG 图片')
    await waitFor(() => expect(mock.createObjectURL).toHaveBeenCalled())
    expect(document.body.textContent).toMatch(/实际 ×2/)
  })
})
