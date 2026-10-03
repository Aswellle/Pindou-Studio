import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import ImageQuantizer from './ImageQuantizer'

// Return the raw key (ignore the Chinese fallback literal) so assertions
// target the translation key itself, independent of any locale's wording.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

afterEach(cleanup)

function renderQuantizer() {
  return render(<ImageQuantizer onApply={() => {}} onClose={() => {}} />)
}

// Builds a File whose PNG IHDR reports the given pixel dimensions, independent
// of its on-disk byte size, so tests can target the pre-decode header check
// (and, separately, the byte-size gate) without needing a real multi-GB image.
function pngFile(width, height, { byteSize } = {}) {
  const buf = new ArrayBuffer(33)
  const view = new DataView(buf)
  ;[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].forEach((b, i) => view.setUint8(i, b))
  view.setUint32(8, 13, false)
  ;[0x49, 0x48, 0x44, 0x52].forEach((b, i) => view.setUint8(12 + i, b))
  view.setUint32(16, width, false)
  view.setUint32(20, height, false)
  const bytes = new Uint8Array(buf)
  const parts = byteSize && byteSize > bytes.length ? [bytes, new Uint8Array(byteSize - bytes.length)] : [bytes]
  return new File(parts, 'test.png', { type: 'image/png' })
}

describe('ImageQuantizer upload validation', () => {
  it('rejects a non-image file picked via the file input', async () => {
    const { container } = renderQuantizer()
    const input = container.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [new File(['hello'], 'test.txt', { type: 'text/plain' })] } })

    await waitFor(() => expect(container.querySelector('.error-section')).toBeTruthy())
    expect(container.querySelector('.error-text').textContent).toBe('quantizer.errorUnsupportedType')
    expect(container.querySelector('.preview-image')).toBeNull()
  })

  it('rejects a file over the 25MB size cap picked via the file input', async () => {
    const { container } = renderQuantizer()
    const input = container.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [pngFile(10, 10, { byteSize: 26 * 1024 * 1024 })] } })

    await waitFor(() => expect(container.querySelector('.error-section')).toBeTruthy())
    expect(container.querySelector('.error-text').textContent).toBe('quantizer.errorFileTooLarge')
    expect(container.querySelector('.preview-image')).toBeNull()
  })

  it('rejects a small-byte PNG with an excessive pixel count, dropped onto the upload zone', async () => {
    const { container } = renderQuantizer()
    const zone = container.querySelector('.upload-zone')
    // A 20000x20000 PNG header in a few dozen bytes on disk — this is exactly
    // the "small bytes, huge decoded pixels" case byte-size gating cannot catch.
    fireEvent.drop(zone, { dataTransfer: { files: [pngFile(20000, 20000)] } } )

    await waitFor(() => expect(container.querySelector('.error-section')).toBeTruthy())
    expect(container.querySelector('.error-text').textContent).toBe('quantizer.errorDimensionsTooLarge')
    expect(container.querySelector('.preview-image')).toBeNull()
  })

  it('accepts a normal small PNG via the file input with no error shown', async () => {
    const { container } = renderQuantizer()
    const input = container.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [pngFile(800, 600)] } })

    await waitFor(() => expect(container.querySelector('.preview-image')).toBeTruthy())
    expect(container.querySelector('.error-section')).toBeNull()
  })

  it('rejects the same oversized-dimension PNG consistently through drag-and-drop and the file input', async () => {
    for (const trigger of ['input', 'drop']) {
      const { container, unmount } = renderQuantizer()
      const file = pngFile(20000, 20000)
      if (trigger === 'input') {
        fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } })
      } else {
        fireEvent.drop(container.querySelector('.upload-zone'), { dataTransfer: { files: [file] } })
      }
      await waitFor(() => expect(container.querySelector('.error-section')).toBeTruthy())
      expect(container.querySelector('.error-text').textContent).toBe('quantizer.errorDimensionsTooLarge')
      unmount()
    }
  })
})
