import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import './i18n'
import App from './App'

function installMock2dContext() {
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, closePath: () => {},
    moveTo: () => {}, lineTo: () => {}, stroke: () => {}, clearRect: () => {},
    fillText: () => {}, arc: () => {}, fill: () => {}, save: () => {}, restore: () => {},
    clip: () => {}, translate: () => {}, scale: () => {}, drawImage: () => {},
    setTransform: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  }
  const orig = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function () { return ctx }
  return () => { HTMLCanvasElement.prototype.getContext = orig }
}

beforeAll(() => { window.scrollTo = () => {} })

function installMockMatchMedia() {
  const orig = window.matchMedia
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })
  return () => { window.matchMedia = orig }
}

describe('App smoke test', () => {
  it('renders the full component tree without crashing', () => {
    const restore2d = installMock2dContext()
    const restoreMedia = installMockMatchMedia()
    try {
      const { container } = render(
        <MemoryRouter initialEntries={['/']}>
          <HelmetProvider>
            <App />
          </HelmetProvider>
        </MemoryRouter>
      )
      expect(container).toBeTruthy()
    } finally {
      restore2d()
      restoreMedia()
    }
  })
})
