import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Send } from 'lucide-react'
import { supabase } from '../services/supabase'
import { useToast } from './Toast'

// Cloudflare Turnstile 站点密钥(Vercel 环境变量 / 本地 .env.local)
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''

// 站点 LOGO(与 Header/AuthPage 一致的 4×4 拼豆色板),作为官方头像
const LOGO_SVG = (
  <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
    <rect width="8" height="8" x="0" y="0" fill="#E53935"/><rect width="8" height="8" x="8" y="0" fill="#FDD835"/>
    <rect width="8" height="8" x="16" y="0" fill="#32CD32"/><rect width="8" height="8" x="24" y="0" fill="#1976D2"/>
    <rect width="8" height="8" x="0" y="8" fill="#F06292"/><rect width="8" height="8" x="8" y="8" fill="#BA68C8"/>
    <rect width="8" height="8" x="16" y="8" fill="#00BCD4"/><rect width="8" height="8" x="24" y="8" fill="#FF9800"/>
    <rect width="8" height="8" x="0" y="16" fill="#FFFFFF" stroke="#E0E0E0"/><rect width="8" height="8" x="8" y="16" fill="#9E9E9E"/>
    <rect width="8" height="8" x="16" y="16" fill="#000000"/><rect width="8" height="8" x="24" y="16" fill="#795548"/>
    <rect width="8" height="8" x="0" y="24" fill="#8D6E63"/><rect width="8" height="8" x="8" y="24" fill="#A1887F"/>
    <rect width="8" height="8" x="16" y="24" fill="#BDBDBD"/><rect width="8" height="8" x="24" y="24" fill="#6D4C41"/>
  </svg>
)

/**
 * 「联系我们」弹层:仿 IM 聊天界面。
 * - 顶部聊天区:默认一条官方欢迎消息(头像=站点 LOGO),用户消息右侧气泡
 * - 聊天区下方:访客身份提示(回复显示在此窗口,留邮箱可收到邮件回复)
 * - 选填邮箱输入框 + Cloudflare Turnstile 人机验证 + 消息输入与发送
 * - 发送条件:人机验证通过 且 消息非空;消息为空提示「消息为空」;未验证提示先完成验证
 * - 消息经 Edge Function contact-us(service 端再次校验 Turnstile)入库 contact_messages
 */

const turnstileState = { scriptLoading: false }

export default function ContactUsModal({ onClose }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [userMessages, setUserMessages] = useState([])
  const [email, setEmail] = useState('')
  const [text, setText] = useState('')
  const [token, setToken] = useState(null)
  // idle | verified | expired | error;captchaRequired=false(本地未配置 key)时跳过验证
  const [capStatus, setCapStatus] = useState('idle')
  const [sending, setSending] = useState(false)
  const turnstileRef = useRef(null)
  const widgetIdRef = useRef(null)
  const chatRef = useRef(null)
  const captchaRequired = !!TURNSTILE_SITE_KEY

  // 挂载时加载 Turnstile 脚本并渲染 widget
  useEffect(() => {
    if (!captchaRequired || !turnstileRef.current) return undefined
    const render = () => {
      if (!window.turnstile || !turnstileRef.current) return
      try {
        widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          callback: (tk) => { setToken(tk); setCapStatus('verified') },
          'expired-callback': () => { setToken(null); setCapStatus('expired') },
          'error-callback': () => { setToken(null); setCapStatus('error') },
        })
      } catch (e) {
        console.warn('[contact-us] Turnstile 渲染失败:', e)
        setCapStatus('error')
      }
    }
    if (window.turnstile) {
      render()
    } else if (!turnstileState.scriptLoading) {
      turnstileState.scriptLoading = true
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.onload = render
      s.onerror = () => { setCapStatus('error'); turnstileState.scriptLoading = false }
      document.head.appendChild(s)
    }
    return () => {
      try { if (widgetIdRef.current != null && window.turnstile) window.turnstile.remove(widgetIdRef.current) } catch (e) { /* 忽略 */ }
    }
  }, [captchaRequired])

  // 新消息后聊天区滚到底部
  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [userMessages])

  const resetCaptcha = useCallback(() => {
    setToken(null)
    setCapStatus('idle')
    try { if (widgetIdRef.current != null && window.turnstile) window.turnstile.reset(widgetIdRef.current) } catch (e) { /* 忽略 */ }
  }, [])

  const handleSend = async () => {
    if (sending) return
    const msg = text.trim()
    // 消息为空:即使已完成人机验证也提示不能发送
    if (!msg) {
      toast(t('contact.emptyMsg'), 'error')
      return
    }
    if (captchaRequired && !token) {
      toast(t('contact.captchaFirst'), 'error')
      return
    }
    if (!supabase) {
      toast(t('contact.sendFailed'), 'error')
      return
    }
    setSending(true)
    try {
      const { error } = await supabase.functions.invoke('contact-us', {
        body: { message: msg, email: email.trim() || null, token },
      })
      if (error) throw error
      setUserMessages(prev => [...prev, msg])
      setText('')
      toast(t('contact.sent'), 'success')
      resetCaptcha()
      if (!email.trim()) {
        // 选填邮箱为空:提示收不到邮件回复(消息仍会被管理员看到)
        toast(t('contact.emailMissingWarn'), 'info', 6500)
      }
    } catch (e) {
      const em = String(e?.message || '').toLowerCase()
      toast(em.includes('captcha') ? t('contact.captchaFailed') : t('contact.sendFailed'), 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="contact-overlay" onClick={onClose}>
      <div className="contact-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label={t('contact.title')}>
        <div className="contact-header">
          <h2 className="contact-title">{t('contact.title')}</h2>
          <button className="contact-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>

        {/* 聊天区:官方初始消息 + 用户已发送消息 */}
        <div className="contact-chat" ref={chatRef}>
          <div className="contact-msg official">
            <div className="contact-avatar">{LOGO_SVG}</div>
            <div className="contact-bubble">{t('contact.intro')}</div>
          </div>
          {userMessages.map((m, i) => (
            <div className="contact-msg user" key={i}>
              <div className="contact-bubble user">{m}</div>
            </div>
          ))}
        </div>

        <p className="contact-visitor-hint">{t('contact.visitorHint')}</p>

        <input
          className="contact-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={t('contact.emailPlaceholder')}
          maxLength={120}
        />

        <div className="contact-captcha">
          {captchaRequired ? (
            <div ref={turnstileRef} className="turnstile-box" />
          ) : (
            <span className="contact-captcha-off">{t('contact.captchaOff')}</span>
          )}
        </div>

        <div className="contact-input-row">
          <input
            className="contact-msg-input"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t('contact.messagePlaceholder')}
            maxLength={500}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          />
          <button
            className="contact-send-btn"
            onClick={handleSend}
            disabled={sending}
            aria-label={t('contact.send')}
            title={t('contact.send')}
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      <style>{`
        .contact-overlay {
          position: fixed;
          inset: 0;
          background: rgba(43, 36, 32, 0.5);
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          box-sizing: border-box;
        }
        .contact-modal {
          width: 100%;
          max-width: 420px;
          max-height: calc(100vh - 24px);
          overflow-y: auto;
          background: var(--bg-primary);
          border: 2px solid var(--contact-ink);
          border-radius: 18px;
          box-shadow: 0 18px 48px rgba(43, 36, 32, 0.35);
          --contact-ink: #3a2f26;
        }
        .contact-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 13px 16px;
          border-bottom: 2px solid var(--contact-ink);
        }
        .contact-title {
          margin: 0;
          font-size: var(--text-lg);
          font-weight: var(--font-weight-semibold);
          color: var(--text-primary);
        }
        .contact-close {
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--contact-ink);
          border-radius: 8px;
          background: var(--bg-primary);
          color: var(--text-primary);
          cursor: pointer;
          box-shadow: 0 2px 0 var(--contact-ink);
          transition: transform 0.1s;
        }
        .contact-close:active { transform: translateY(1px); box-shadow: 0 1px 0 var(--contact-ink); }
        .contact-close:hover { color: var(--accent); border-color: var(--accent); box-shadow: 0 2px 0 var(--accent); }
        .contact-chat {
          max-height: 260px;
          overflow-y: auto;
          padding: 14px 16px 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          background: var(--bg-primary);
        }
        .contact-msg {
          display: flex;
          align-items: flex-end;
          gap: 8px;
        }
        .contact-msg.user { justify-content: flex-end; }
        .contact-avatar { flex-shrink: 0; border-radius: 8px; overflow: hidden; }
        .contact-bubble {
          max-width: 78%;
          padding: 10px 12px;
          border: 2px solid var(--contact-ink);
          border-radius: 12px;
          background: #fff;
          color: var(--text-primary);
          font-size: var(--text-sm);
          line-height: 1.7;
          word-break: break-word;
          white-space: pre-wrap;
        }
        .contact-bubble.user {
          background: var(--accent-soft);
          border-color: var(--accent);
        }
        .contact-visitor-hint {
          margin: 0 16px 10px;
          font-size: var(--text-xs);
          color: var(--text-muted);
          line-height: 1.5;
        }
        .contact-email {
          display: block;
          width: calc(100% - 32px);
          margin: 0 16px 12px;
          padding: 10px 12px;
          border: 2px solid var(--contact-ink);
          border-radius: 10px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: var(--text-sm);
          box-sizing: border-box;
          outline: none;
        }
        .contact-email:focus { border-color: var(--accent); }
        .contact-email::placeholder { color: var(--text-muted); }
        .contact-captcha {
          margin: 0 16px 12px;
          min-height: 68px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .turnstile-box { min-height: 65px; }
        .contact-captcha-off {
          font-size: var(--text-xs);
          color: var(--text-muted);
        }
        .contact-input-row {
          display: flex;
          gap: 8px;
          margin: 0 16px 16px;
        }
        .contact-msg-input {
          flex: 1;
          min-width: 0;
          padding: 10px 12px;
          border: 2px solid var(--contact-ink);
          border-radius: 10px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: var(--text-sm);
          outline: none;
        }
        .contact-msg-input:focus { border-color: var(--accent); }
        .contact-msg-input::placeholder { color: var(--text-muted); }
        .contact-send-btn {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--contact-ink);
          border-radius: 10px;
          background: var(--accent);
          color: #fff;
          cursor: pointer;
          box-shadow: 0 3px 0 var(--contact-ink);
          transition: transform 0.1s, opacity 0.15s;
        }
        .contact-send-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--contact-ink); }
        .contact-send-btn:disabled { opacity: 0.55; cursor: default; }
      `}</style>
    </div>
  )
}
