import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import i18n from '../i18n'
import ToastProvider from './Toast'
import ContactPage from './ContactPage'

/**
 * 联系我们页(由模态框改造为路由页)。
 *
 * 改造动机是 iOS Safari 的键盘问题:浮层是 fixed + 布局视口坐标,键盘只收缩
 * visual viewport,于是浮层被顶走、露白;而浮层里同时摆着邮箱与消息两个编辑框,
 * 键盘弹起后可用高度骤减。这里钉住改造后的三条行为承诺:
 *   1. 页面正常挂载(不是浮层),不含任何 overlay 类名;
 *   2. 默认只有**一个**编辑控件 —— 邮箱折叠成按钮,点开才出现输入框;
 *   3. 返回按钮回到上一页,深链直达时兜底到图库(入口所在页)。
 *
 * 键盘几何本身测不了(jsdom 没有布局引擎),由 contactPageContract.test.js
 * 用源码断言锁住「不得使用 position: fixed」。
 */

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

afterEach(cleanup)

// supabase 在无环境变量时为 null,loadThread 会直接返回 —— 不产生任何网络请求
vi.mock('../services/supabase', () => ({
  supabase: null,
  toStorageUrl: () => null,
}))

function renderPage({ user = null, entries = ['/contact'], index = 0 } = {}) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={entries} initialIndex={index}>
        <Routes>
          <Route path="/contact" element={<ContactPage user={user} />} />
          <Route path="/gallery" element={<div>gallery-marker</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

describe('ContactPage · 版面', () => {
  it('以普通页面渲染,不挂任何浮层类名', () => {
    const { container } = renderPage()
    const root = container.querySelector('.contact-page')
    expect(root).toBeTruthy()
    // 浮层类名会触发 index.css 的 fixed 定位与键盘补偿 —— 正是本次要摆脱的机制
    expect(container.querySelector('[class*="overlay"]')).toBeNull()
  })

  it('顶栏只有返回与标题,不出现站点导航', () => {
    const { container } = renderPage()
    expect(container.querySelector('.header')).toBeNull()
    expect(container.querySelector('.mobile-toolbar')).toBeNull()
    expect(screen.getByRole('button', { name: '返回' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '联系我们' })).toBeTruthy()
  })

  it('会话区与输入区是分开的两段(输入区不随会话滚动)', () => {
    const { container } = renderPage()
    // 结构约束:.contact-thread 是唯一滚动容器,.contact-composer 是钉底的尾部
    expect(container.querySelector('.contact-thread')).toBeTruthy()
    expect(container.querySelector('.contact-composer')).toBeTruthy()
    // 输入区必须与会话区平级,不能嵌在滚动容器里 —— 否则输入框会跟着滚走
    expect(container.querySelector('.contact-thread .contact-composer')).toBeNull()
  })
})

describe('ContactPage · 减少同时出现的编辑框', () => {
  it('默认只渲染消息输入框,邮箱折叠成按钮', () => {
    const { container } = renderPage()
    const inputs = container.querySelectorAll('input')
    expect(inputs).toHaveLength(1)
    expect(inputs[0].className).toBe('contact-msg-input')
    // 折叠态是一个按钮,不是输入框
    expect(container.querySelector('.contact-email-toggle')).toBeTruthy()
    expect(container.querySelector('.contact-email-input')).toBeNull()
  })

  it('点击按钮才展开邮箱输入框', () => {
    const { container } = renderPage()
    fireEvent.click(container.querySelector('.contact-email-toggle'))
    expect(container.querySelector('.contact-email-input')).toBeTruthy()
    expect(container.querySelectorAll('input')).toHaveLength(2)
  })

  it('确认后收起,并显示已填邮箱', () => {
    const { container } = renderPage()
    fireEvent.click(container.querySelector('.contact-email-toggle'))
    const emailInput = container.querySelector('.contact-email-input')
    fireEvent.change(emailInput, { target: { value: 'me@example.com' } })
    fireEvent.click(container.querySelector('.contact-email-done'))

    expect(container.querySelector('.contact-email-input')).toBeNull()
    const toggle = container.querySelector('.contact-email-toggle')
    expect(toggle.className).toContain('filled')
    expect(toggle.textContent).toContain('me@example.com')
  })

  it('空消息不发送(不产生请求,只提示)', () => {
    const { container } = renderPage()
    fireEvent.click(container.querySelector('.contact-send-btn'))
    // supabase 为 null 时即便消息非空也走 sendFailed;空消息应停在更早的门槛
    expect(screen.getByText('消息为空,不能发送')).toBeTruthy()
  })
})

describe('ContactPage · 身份提示', () => {
  it('未登录显示访客文案', () => {
    renderPage({ user: null })
    expect(screen.getByText(/访客身份/)).toBeTruthy()
  })

  it('已登录显示站内用户文案', () => {
    renderPage({ user: { id: 'u1', email: 'a@b.com', nickname: '小明' } })
    expect(screen.getByText(/站内用户身份/)).toBeTruthy()
  })
})

describe('ContactPage · 返回', () => {
  it('从图库进入时返回到图库', () => {
    renderPage({ entries: ['/gallery', '/contact'], index: 1 })
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(screen.getByText('gallery-marker')).toBeTruthy()
  })

  it('深链直达(无历史)时兜底到图库', () => {
    // MemoryRouter 首条 location 的 key 为 'default',与浏览器直接打开 URL 同构
    renderPage({ entries: ['/contact'] })
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(screen.getByText('gallery-marker')).toBeTruthy()
  })

  it('Escape 键同样返回', () => {
    renderPage({ entries: ['/gallery', '/contact'], index: 1 })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByText('gallery-marker')).toBeTruthy()
  })
})
