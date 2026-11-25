import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import ContentSeo from './ContentSeo'

const robotsMeta = () => document.querySelector('meta[name="robots"]')?.getAttribute('content') || ''

afterEach(() => {
  cleanup()
  document.querySelectorAll('meta[name="robots"]').forEach(el => el.remove())
  window.history.replaceState({}, '', '/')
})

function renderSeo(props) {
  render(
    <HelmetProvider>
      <ContentSeo {...props} />
    </HelmetProvider>
  )
}

describe('ContentSeo · robots 策略', () => {
  it('普通内容页输出 index, follow', async () => {
    renderSeo({ title: '食物拼豆图纸模板' })
    await waitFor(() => expect(robotsMeta()).toContain('index, follow'))
  })

  it('带 ?lang= 的语言变体输出 noindex, follow(与服务端响应头一致)', async () => {
    window.history.replaceState({}, '', '/gallery/category/food?lang=ko')
    renderSeo({ title: '食物拼豆图纸模板' })
    await waitFor(() => expect(robotsMeta()).toBe('noindex, follow'))
  })

  it('确认不存在的内容页仍是 noindex, nofollow', async () => {
    window.history.replaceState({}, '', '/gallery/pattern/missing?lang=ko')
    renderSeo({ title: '不存在', noindex: true })
    await waitFor(() => expect(robotsMeta()).toBe('noindex, nofollow'))
  })
})
