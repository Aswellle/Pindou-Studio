import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import i18n from '../../i18n'

/**
 * 量化结果区的「进入编辑器」入口契约。
 *
 * useImageQuantizer 以固定 result 桩替换(不跑 worker):点击「进入编辑器」
 * 必须把与「应用到画布」同款的载荷交给 onEnterEditor,且**不触发** onClose ——
 * 转换页要保持结果,让编辑器返回后可以直接调参重新生成。
 */

const { useImageQuantizer } = vi.hoisted(() => ({ useImageQuantizer: { current: null } }))

vi.mock('../../hooks/useImageQuantizer', () => ({
  useImageQuantizer: () => useImageQuantizer.current,
}))

// 结果预览/放大画布在 jsdom 里跑不了 2d:桩掉 getContext
function installMock2d() {
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    fillRect: () => {}, clearRect: () => {}, drawImage: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    arc: () => {}, fill: () => {}, save: () => {}, restore: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    setTransform: () => {}, scale: () => {}, translate: () => {},
  }
  const orig = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = () => ctx
  return () => { HTMLCanvasElement.prototype.getContext = orig }
}

const RESULT = {
  canvasData: [[null, '#FFFFFF'], ['#FFFFFF', null]],
  colorStats: { P1: 2 },
  width: 2,
  height: 2,
  detectedType: 'logo',
  requestedMode: 'auto',
  effectiveMaxColors: 12,
  effectiveDithering: 'none',
  qualityMode: 'fine',
}

const ImageQuantizer = (await import('./ImageQuantizer')).default

function renderQuantizer() {
  const onApply = vi.fn()
  const onEnterEditor = vi.fn()
  const onClose = vi.fn()
  useImageQuantizer.current = {
    isProcessing: false,
    progress: 0,
    result: RESULT,
    error: null,
    quantize: vi.fn(),
    reset: vi.fn(),
  }
  render(<ImageQuantizer onApply={onApply} onEnterEditor={onEnterEditor} onClose={onClose} />)
  return { onApply, onEnterEditor, onClose }
}

beforeAll(async () => { await i18n.changeLanguage('zh-CN') })
afterEach(() => {
  cleanup()
  useImageQuantizer.current = null
})

describe('ImageQuantizer · 进入编辑器入口', () => {
  it('结果区同时提供「进入编辑器」与「应用到画布」两个入口', () => {
    const restore = installMock2d()
    try {
      renderQuantizer()
      expect(screen.getByRole('button', { name: '进入编辑器' })).toBeTruthy()
      expect(screen.getByRole('button', { name: '应用到画布' })).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('点击「进入编辑器」交给 onEnterEditor(与 apply 同款载荷),不触发 onClose', () => {
    const restore = installMock2d()
    try {
      const { onEnterEditor, onApply, onClose } = renderQuantizer()
      fireEvent.click(screen.getByRole('button', { name: '进入编辑器' }))

      expect(onEnterEditor).toHaveBeenCalledTimes(1)
      const [data, options] = onEnterEditor.mock.calls[0][0] ? onEnterEditor.mock.calls[0] : []
      expect(data).toBe(RESULT.canvasData)
      expect(options).toMatchObject({
        palette: expect.any(String),
        gridSize: 2,
        gridWidth: 2,
        gridHeight: 2,
        colorStats: { P1: 2 },
      })
      expect(onApply).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('「应用到画布」仍走 onApply + onClose(旧路径不受影响)', () => {
    const restore = installMock2d()
    try {
      const { onApply, onEnterEditor, onClose } = renderQuantizer()
      fireEvent.click(screen.getByRole('button', { name: '应用到画布' }))

      expect(onApply).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(onEnterEditor).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })
})
