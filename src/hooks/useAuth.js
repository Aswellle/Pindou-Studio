import { useState, useEffect } from 'react'
import i18n from '../i18n/index.js'

const STORAGE_KEY = 'bead_studio_auth'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 从 localStorage 恢复登录状态
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        setUser(JSON.parse(saved))
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    setLoading(false)
  }, [])

  const login = (email, password) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // 简单验证演示
        if (!email || !email.includes('@')) {
          reject(new Error(i18n.t('errors.invalidEmail')))
          return
        }
        if (password.length < 6) {
          reject(new Error(i18n.t('errors.passwordTooShort')))
          return
        }

        const userData = {
          id: Date.now(),
          email,
          name: email.split('@')[0],
          createdAt: new Date().toISOString()
        }
        setUser(userData)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userData))
        resolve(userData)
      }, 500)
    })
  }

  const register = (email, password, confirmPassword) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (!email || !email.includes('@')) {
          reject(new Error(i18n.t('errors.invalidEmail')))
          return
        }
        if (password.length < 6) {
          reject(new Error(i18n.t('errors.passwordTooShort')))
          return
        }
        if (password !== confirmPassword) {
          reject(new Error(i18n.t('errors.passwordMismatch')))
          return
        }

        const userData = {
          id: Date.now(),
          email,
          name: email.split('@')[0],
          createdAt: new Date().toISOString()
        }
        setUser(userData)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userData))
        resolve(userData)
      }, 500)
    })
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return { user, loading, login, register, logout }
}
