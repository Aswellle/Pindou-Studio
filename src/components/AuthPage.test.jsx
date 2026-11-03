import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AuthPage from './AuthPage'
import i18n from '../i18n'

/**
 * 登录页的守卫回跳契约:
 *   - 来自 /profile 等守卫入口时说明原因;
 *   - 登录成功后回到 next,而不是一律回首页;
 *   - 非法 next(开放重定向)退回首页。
 */

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

afterEach(() => {
  cleanup()
})

const noop = () => {}

function renderAuth(entry, onLogin = vi.fn().mockResolvedValue()) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/login"
          element={
            <AuthPage
              onLogin={onLogin}
              onRegister={noop}
              loginByUsername={vi.fn()}
              registerUsername={vi.fn()}
              forgotPasswordCustom={vi.fn()}
              resetPassword={vi.fn()}
              onSendOtp={vi.fn()}
              onVerifyOtp={vi.fn()}
              onVerifyForgotOtp={vi.fn()}
              onSetPassword={vi.fn()}
              usernameExists={vi.fn()}
              onUpdateProfile={vi.fn()}
            />
          }
        />
        <Route path="/profile" element={<div>PROFILE_PAGE</div>} />
        <Route path="/" element={<div>HOME_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  )
  return onLogin
}

function fillAndSubmitLogin() {
  const form = document.querySelector('.auth-form')
  const inputs = form.querySelectorAll('input')
  fireEvent.change(inputs[0], { target: { value: 'user@example.com' } })
  fireEvent.change(inputs[1], { target: { value: 'TestPass123!' } })
  fireEvent.submit(form)
}

describe('AuthPage · 守卫回跳', () => {
  it('展示守卫原因,登录后回到原页面', async () => {
    const onLogin = renderAuth({
      pathname: '/login',
      state: { next: '/profile', reason: 'profile' },
    })
    expect(screen.getByText('登录后查看个人中心')).toBeTruthy()

    fillAndSubmitLogin()
    await waitFor(() => expect(screen.getByText('PROFILE_PAGE')).toBeTruthy())
    expect(onLogin).toHaveBeenCalledWith('user@example.com', 'TestPass123!')
  })

  it('支持 ?next= 查询参数回跳', async () => {
    renderAuth({ pathname: '/login', search: '?next=%2Fprofile' })
    fillAndSubmitLogin()
    await waitFor(() => expect(screen.getByText('PROFILE_PAGE')).toBeTruthy())
  })

  it('非法 next(开放重定向)退回首页', async () => {
    renderAuth({
      pathname: '/login',
      state: { next: 'https://evil.example.com', reason: 'ironing' },
    })
    expect(screen.getByText('高级熨烫效果需要登录')).toBeTruthy()
    fillAndSubmitLogin()
    await waitFor(() => expect(screen.getByText('HOME_PAGE')).toBeTruthy())
  })

  it('无守卫来源时不显示提示条', () => {
    renderAuth({ pathname: '/login' })
    expect(document.querySelector('.auth-gate-notice')).toBeNull()
  })
})
