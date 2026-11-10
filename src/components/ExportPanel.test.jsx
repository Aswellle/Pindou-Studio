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
const rasterControl = vi.hoisted(() => ({ forcedScale: null, hang: false }))
vi.mock('../services/export/RasterRenderer', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    renderPatternDocumentToPNG: (doc, options = {}) => {
      // hang:让 V2 PNG 导出停在「进行中」,用于验证导出期间仍可关闭面板
      if (rasterControl.hang) return new Promise(() => {})
      if (rasterControl.forcedScale == null) return actual.renderPatternDocumentToPNG(doc, options)
      // 强制降级:只回报我们指定的倍率,丢弃真实渲染器的 onScale(否则会被覆盖回未降级)
      const { onScale, ...rest } = options
      onScale?.(rasterControl.forcedScale, 3)
      return actual.renderPatternDocumentToPNG(doc, rest)
    },
  }
})

// 熨烫效果渲染器整体 mock:组件测试只验证接线(参数/下载/记账隔离),
// 像素行为由 IroningEffectRenderer 自身的单测与 verify-ironing.mjs 覆盖
vi.mock('../services/export/IroningEffectRenderer', () => ({
  renderIroningEffect: vi.fn(),
}))

import { renderIroningEffect } from '../services/export/IroningEffectRenderer'

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
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    scale: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    clearRect: () => {},
    fillText: () => {},
    arc: () => {},
    fill: () => {},
    save: () => {},
    restore: () => {},
    clip: () => {},
    translate: () => {},
    drawImage: () => {},
    setTransform: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  }
  const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx)
  const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(cb => {
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
    click: clickSpy,
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

function setup(overrides = {}) {
  return render(
    <ExportPanel
      canvasData={CANVAS_DATA}
      gridSize={2}
      gridWidth={2}
      gridHeight={2}
      designName="测试图纸"
      paletteId="perler"
      onClose={() => {}}
      {...overrides}
    />
  )
}

// 点击导出按钮;开启库存扣减时会先弹确认框,再点「确认导出」
function requestQuickExport(labelText) {
  fireEvent.click(screen.getByText(labelText))
  const confirmBtn = document.querySelector('.export-confirm-actions .btn-primary')
  if (confirmBtn) fireEvent.click(confirmBtn)
}

let mock
beforeEach(() => {
  mock = installExportMocks()
  renderIroningEffect.mockReset().mockResolvedValue({
    blob: new Blob(['png'], { type: 'image/png' }),
    width: 96,
    height: 84,
    actualScale: 6,
    requestedScale: 6,
  })
})
afterEach(() => {
  cleanup()
  mock.restore()
  rasterControl.forcedScale = null
  rasterControl.hang = false
  localStorage.clear()
})

describe('ExportPanel 导出路径回归(M0 / R1)', () => {
  it('主按钮走 RasterRenderer 并回报分辨率(旧双引擎开关已从 UI 移除)', async () => {
    setup()
    // 面板里不应再有任何引擎开关(开发用 Feature Flag 不再暴露给用户)
    expect(screen.queryByText(/完整版式图纸引擎/)).toBeNull()
    requestQuickExport('导出拼豆图纸 PNG')

    await waitFor(() => expect(mock.createObjectURL).toHaveBeenCalled())
    expect(screen.queryByText(/导出失败/)).toBeNull()
    // 真实分辨率回显:确认超采样倍率生效(而不是静默降级/未回传)
    expect(await screen.findByText(/导出分辨率: \d+×\d+/)).toBeTruthy()
  })

  it('SVG 导出走 VectorRenderer(renderPatternDocumentToSVG/svgStringToBlob)', () => {
    setup()
    requestQuickExport('拼豆图纸 SVG')

    expect(mock.createObjectURL).toHaveBeenCalledTimes(1)
    const blob = mock.createObjectURL.mock.calls[0][0]
    expect(blob.type).toContain('image/svg+xml')
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
    requestQuickExport('导出拼豆图纸 PNG')
    await waitFor(() => expect(onExportComplete).toHaveBeenCalledTimes(1))
    // 再等一拍,确认没有重复触发(确认框关闭/状态更新不会再回调)
    await new Promise(r => setTimeout(r, 20))
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
    fireEvent.click(screen.getByText('导出拼豆图纸 PNG'))
    // 确认框必须走明确的「取消」按钮;点遮罩不再关闭,避免误触中断导出流程
    fireEvent.click(document.querySelector('.export-confirm-actions .btn-ghost'))
    await new Promise(r => setTimeout(r, 20))
    expect(onExportComplete).not.toHaveBeenCalled()
  })

  it('空画布被拦截,不触发回调', async () => {
    const onExportComplete = vi.fn()
    render(
      <ExportPanel
        canvasData={[
          [null, null],
          [null, null],
        ]}
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
    fireEvent.click(screen.getByText('导出拼豆图纸 PNG'))
    // 空画布走「empty」确认框,没有导出动作
    await new Promise(r => setTimeout(r, 20))
    expect(onExportComplete).not.toHaveBeenCalled()
  })

  it('未开启库存扣减时直接导出,不弹确认框', async () => {
    setup()
    fireEvent.click(screen.getByText('导出拼豆图纸 PNG'))
    expect(document.querySelector('.export-confirm-actions')).toBeNull()
    await waitFor(() => expect(mock.createObjectURL).toHaveBeenCalled())
  })

  it('开启库存扣减后导出前弹出确认框', () => {
    setup({ deductInventory: true, onToggleDeductInventory: () => {} })
    fireEvent.click(screen.getByText('导出拼豆图纸 PNG'))
    expect(document.querySelector('.export-confirm-actions')).toBeTruthy()
    expect(mock.createObjectURL).not.toHaveBeenCalled()
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
        deductInventory
        onToggleDeductInventory={() => {}}
        onClose={onClose}
      />
    )

    // 点导出(扣减开启 → 弹确认框,不执行导出)
    fireEvent.click(screen.getByText('导出拼豆图纸 PNG'))
    expect(document.querySelector('.export-confirm-actions')).toBeTruthy()

    // 点「取消」= 放弃这次导出;遮罩不承担关闭职责
    fireEvent.click(document.querySelector('.export-confirm-actions .btn-ghost'))

    // 确认框消失,但导出面板仍在(确认框是外层遮罩的兄弟节点,
    // 明确取消不会把整个导出面板一起关掉)
    expect(document.querySelector('.export-confirm-actions')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('导出拼豆图纸 PNG')).toBeTruthy()
  })

  it('导出进行中 Escape 仍可关闭面板(与关闭按钮一致)', async () => {
    // 方案 A:Escape 不再被 isExporting 屏蔽。关闭按钮与 Escape 两条明确退出路径必须一致,
    // 否则键盘用户会卡在一个「按了没反应」的面板里。
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

    // 让导出停在「进行中」:jsdom 里真实导出瞬间完成,不挂起就测不到 isExporting
    rasterControl.hang = true
    // 导出开始后按钮文案会切成「生成中 x%」,先拿到按钮再点
    const primaryBtn = screen.getByText('导出拼豆图纸 PNG').closest('button')
    fireEvent.click(primaryBtn)
    // 按钮禁用 = isExporting 已为 true
    await waitFor(() => expect(primaryBtn.disabled).toBe(true))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('物理尺寸按品牌珠径计算(规格 09 §5)', () => {
  // 29×29 Perler(5mm/颗)= 145mm;此前固定按 2.6mm 算成 75.4mm
  const renderWithPalette = paletteId =>
    render(
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

describe('高级导出登录守卫', () => {
  const qualitySelect = () => {
    const selects = [...document.body.querySelectorAll('.style-select')]
    return selects[selects.length - 1]
  }

  function setupGuest(overrides = {}) {
    const onRequireAuth = vi.fn()
    setup({ authEnabled: true, isAuthenticated: false, onRequireAuth, ...overrides })
    return onRequireAuth
  }

  it('游客选择高分辨率:画质保持不变并弹出登录引导', () => {
    setupGuest()
    fireEvent.change(qualitySelect(), { target: { value: 'high' } })
    expect(qualitySelect().value).toBe('screen')
    expect(document.querySelector('.auth-prompt-panel')).toBeTruthy()
    expect(screen.getByText('高分辨率导出需要登录')).toBeTruthy()
    // 锁定的档位在选项里标注需登录,游客能理解为什么点不动
    expect(qualitySelect().textContent).toContain('需登录')
  })

  it('引导浮层点「免费注册」把原因与模式交给父级', () => {
    const onRequireAuth = setupGuest()
    fireEvent.change(qualitySelect(), { target: { value: 'print' } })
    fireEvent.click(screen.getByRole('button', { name: '免费注册' }))
    expect(onRequireAuth).toHaveBeenCalledWith('quality', 'register')
    expect(document.querySelector('.auth-prompt-panel')).toBeNull()
  })

  it('引导浮层点「已有账号」进入登录模式', () => {
    const onRequireAuth = setupGuest()
    fireEvent.change(qualitySelect(), { target: { value: 'high' } })
    fireEvent.click(screen.getByRole('button', { name: '已有账号，去登录' }))
    expect(onRequireAuth).toHaveBeenCalledWith('quality', 'login')
  })

  it('游客无法展开熨烫效果:点击入口打开引导,不调用渲染器', () => {
    setupGuest()
    expect(renderIroningEffect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /高级熨烫效果/ }))
    expect(renderIroningEffect).not.toHaveBeenCalled()
    expect(screen.getByText('高级熨烫效果需要登录')).toBeTruthy()
  })

  it('登录用户不受限制:高画质可选择、熨烫可展开', async () => {
    setup({ authEnabled: true, isAuthenticated: true })
    fireEvent.change(qualitySelect(), { target: { value: 'print' } })
    expect(qualitySelect().value).toBe('print')
    fireEvent.click(screen.getByRole('button', { name: /高级熨烫效果/ }))
    await waitFor(() => expect(renderIroningEffect).toHaveBeenCalled())
  })

  it('站点未启用账号系统时不做限制(避免无法注册的死胡同)', () => {
    setup({ authEnabled: false, isAuthenticated: false })
    fireEvent.change(qualitySelect(), { target: { value: 'high' } })
    expect(qualitySelect().value).toBe('high')
  })

  it('退出登录后已选的高画质被收回', () => {
    const baseProps = {
      canvasData: CANVAS_DATA,
      gridSize: 2,
      gridWidth: 2,
      gridHeight: 2,
      designName: '测试图纸',
      paletteId: 'perler',
      authEnabled: true,
      onClose: () => {},
    }
    const { rerender } = render(<ExportPanel {...baseProps} isAuthenticated />)
    fireEvent.change(qualitySelect(), { target: { value: 'print' } })
    expect(qualitySelect().value).toBe('print')
    rerender(<ExportPanel {...baseProps} isAuthenticated={false} />)
    expect(qualitySelect().value).toBe('screen')
  })
})

describe('超采样降级反馈(规格 09 §4.3)', () => {
  it('未降级时不显示降级提示', async () => {
    setup()
    requestQuickExport('导出拼豆图纸 PNG')
    await waitFor(() => expect(mock.createObjectURL).toHaveBeenCalled())
    expect(document.body.textContent).not.toMatch(/已从 ×3 降级/)
  })

  it('降级时显示「实际 ×N(已从 ×3 降级)」而不是只给分辨率', async () => {
    rasterControl.forcedScale = 1 // 等价于移动端大网格被面积预算降到 1×
    setup()
    requestQuickExport('导出拼豆图纸 PNG')
    await waitFor(() => expect(mock.createObjectURL).toHaveBeenCalled())
    expect(document.body.textContent).toMatch(/已从 ×3 降级/)
    expect(document.body.textContent).toMatch(/实际 ×1/)
  })

  it('降到 ×2 时同样报告,文案带上真实倍率', async () => {
    rasterControl.forcedScale = 2
    setup()
    requestQuickExport('导出拼豆图纸 PNG')
    await waitFor(() => expect(mock.createObjectURL).toHaveBeenCalled())
    expect(document.body.textContent).toMatch(/实际 ×2/)
  })
})

describe('高级熨烫效果接入', () => {
  // 展开高级熨烫效果区块(默认折叠),等待预览渲染请求发出
  async function expandIroningSection() {
    fireEvent.click(screen.getByRole('button', { name: /高级熨烫效果/ }))
    await waitFor(() => expect(renderIroningEffect).toHaveBeenCalled())
  }

  it('默认折叠;展开后出现六个材质选项且预览走 preview 模式', async () => {
    setup()
    expect(renderIroningEffect).not.toHaveBeenCalled()
    await expandIroningSection()
    expect(screen.getByRole('button', { name: '无孔烫' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: '麻布烫' }).getAttribute('aria-pressed')).toBe('true')
    for (const call of renderIroningEffect.mock.calls) {
      expect(call[1].mode).toBe('preview')
    }
  })

  it('熨烫效果导出:以 export 模式调用渲染器并触发下载(效果图无副作用,不弹确认)', async () => {
    setup()
    await expandIroningSection()
    fireEvent.click(screen.getByRole('button', { name: /导出熨烫效果 PNG/ }))

    await waitFor(() =>
      expect(renderIroningEffect).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ presetId: 'linen', mode: 'export', quality: 'screen' })
      )
    )
    await waitFor(() => expect(mock.click).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/导出失败/)).toBeNull()
  })

  it('熨烫效果导出从不触发库存记账回调(onExportComplete 不被调用)', async () => {
    const onExportComplete = vi.fn()
    setup({ onExportComplete })
    await expandIroningSection()
    fireEvent.click(screen.getByRole('button', { name: /导出熨烫效果 PNG/ }))
    await waitFor(() => expect(mock.click).toHaveBeenCalledTimes(1))
    // handler 已 resolve(notifyExported 的触发时机),但未 markExportOk → 不回调
    await waitFor(() =>
      expect(renderIroningEffect.mock.calls.some(([, opts]) => opts.mode === 'export')).toBe(true)
    )
    expect(onExportComplete).not.toHaveBeenCalled()
  })

  it('导出文件名为「作品名-高级熨烫效果-材质-宽x高.png」且净化非法字符', async () => {
    setup({ designName: '我的<图纸>:"A*?"' })
    const createSpy = vi.spyOn(document, 'createElement')
    try {
      await expandIroningSection()
      fireEvent.click(screen.getByRole('button', { name: /导出熨烫效果 PNG/ }))
      await waitFor(() => expect(mock.click).toHaveBeenCalledTimes(1))
      const anchors = createSpy.mock.results.map(r => r.value).filter(el => el instanceof HTMLAnchorElement)
      const ironingAnchor = anchors.find(el => el.download.includes('高级熨烫效果'))
      expect(ironingAnchor).toBeTruthy()
      expect(ironingAnchor.download).toBe('我的 图纸 A-高级熨烫效果-麻布烫-2x2.png')
    } finally {
      createSpy.mockRestore()
    }
  })

  it('熨烫导出回报分辨率与倍率降级提示', async () => {
    renderIroningEffect.mockImplementation(async (_doc, options) => {
      options.onResolution?.(1200, 960)
      options.onScale?.(2, 3)
      return {
        blob: new Blob(['png'], { type: 'image/png' }),
        width: 1200,
        height: 960,
        actualScale: 2,
        requestedScale: 3,
      }
    })
    setup()
    await expandIroningSection()
    fireEvent.click(screen.getByRole('button', { name: /导出熨烫效果 PNG/ }))
    await waitFor(() => expect(document.body.textContent).toContain('1200×960'))
    expect(document.body.textContent).toMatch(/已从 ×3 降级/)
  })

  it('切换材质后导出,文件名与渲染参数都跟随所选材质', async () => {
    setup()
    await expandIroningSection()
    fireEvent.click(screen.getByRole('button', { name: '粗闪烫' }))
    fireEvent.click(screen.getByRole('button', { name: /导出熨烫效果 PNG/ }))
    await waitFor(() =>
      expect(renderIroningEffect).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ presetId: 'coarse-glitter', mode: 'export' })
      )
    )
    expect(screen.getByRole('button', { name: '粗闪烫' }).getAttribute('aria-pressed')).toBe('true')
  })
})
