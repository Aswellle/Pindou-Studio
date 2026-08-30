import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Send, User } from 'lucide-react'
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
 * 「联系我们」线程式 IM 弹层。
 * - 官方欢迎消息(头像=站点 LOGO)+ 用户消息(头像=登录账号头像/访客默认头像)
 *   + 管理员回复(头像=LOGO,由后台「联系消息」回复后在此显示)
 * - 线程身份:登录用户用 user.id;访客用 localStorage 持久 UUID(重开弹层/刷新后仍能找回线程)
 * - 每 5s 轮询 get_contact_thread,管理员回复到达后自动出现在聊天区
 * - 选填邮箱 + Cloudflare Turnstile 人机验证 + 消息输入/发送
 * - iOS Safari 键盘弹起:overlay 高度跟随 visual viewport(--visible-vh),避免底部输入区被吞
 */

const turnstileState = { scriptLoading: false }

// 线程内新用户生成一个持久的匿名身份(UUID)
const getAnonParticipant = () => {
  try {
    let id = localStorage.getItem('contact-participant-id')
    if (!id) {
      id = crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem('contact-participant-id', id)
    }
    return id
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

const threadToMsg = (row) => ({ id: row.id, author: row.author, message: row.message })

export default function ContactUsModal({ onClose, user }) {
  const { t } = useTranslation()
  const toast = useToast()
  // 线程身份:登录用户用其 id;否则用持久化访客 id
  const participantId = useMemo(() => (user?.id ? user.id : getAnonParticipant()), [user?.id])
  const [thread, setThread] = useState([])
  const [threadLoading, setThreadLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [text, setText] = useState('')
  const [token, setToken] = useState(null)
  // 本次弹层会话是否已通过一次人机验证(通过后不再要求重复验证,服务端会话级信任)
  const [everVerified, setEverVerified] = useState(false)
  const [sending, setSending] = useState(false)
  const turnstileRef = useRef(null)
  const widgetIdRef = useRef(null)
  const chatRef = useRef(null)
  const captchaRequired = !!TURNSTILE_SITE_KEY

  // iOS Safari 键盘弹起时锁定背景滚动,避免 visual viewport 偏移把浮层推走
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // 拉取线程 + 每 5s 轮询(管理员回复即时可见;不依赖 Realtime/RLS 配置,稳)
  const loadThread = useCallback(async () => {
    if (!supabase) return
    try {
      const { data, error } = await supabase.rpc('get_contact_thread', {
        p_participant_id: participantId,
        p_limit: 60,
      })
      if (!error) setThread((data || []).map(threadToMsg))
    } catch (e) { /* 静默:线程加载失败不阻塞输入发送 */ }
  }, [participantId])

  useEffect(() => {
    loadThread().finally(() => setThreadLoading(false))
    const timer = setInterval(loadThread, 5000)
    return () => clearInterval(timer)
  }, [loadThread])

  // Turnstile 组件渲染进度:脚本加载 + iframe 注入前显示加载过渡,避免空白
  const [captchaLoading, setCaptchaLoading] = useState(true)

  // 挂载时加载 Turnstile 脚本并渲染 widget
  useEffect(() => {
    if (!captchaRequired || !turnstileRef.current) return undefined
    const render = () => {
      if (!window.turnstile || !turnstileRef.current) return
      try {
        widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          // 完整渲染 Cloudflare 组件本体(Managed 模式;低风险自动通过属平台行为)。
          // refresh-expired/retry = never:验证通过后不再静默自动刷新/重试,
          // 组件保持成功态,不打扰真实用户(会话级信任由服务端兜底)。
          'refresh-expired': 'never',
          'retry': 'never',
          callback: (tk) => {
            setToken(tk)
            // 验证通过即组件已完全渲染:强制结束加载过渡,避免动画残留遮挡
            setCaptchaLoading(false)
            // 首次通过才提示,避免重复 toast
            setEverVerified(prev => {
              if (!prev) toast(t('contact.captchaOk'), 'success')
              return true
            })
          },
          'expired-callback': () => { setToken(null) },
          'error-callback': () => { setToken(null) },
        })
        // render 后轮询 iframe 注入:组件真正渲染完成 → 结束加载态(正常场景提前隐藏)
        const iv = setInterval(() => {
          if (turnstileRef.current?.querySelector('iframe')) {
            clearInterval(iv)
            setCaptchaLoading(false)
          }
        }, 120)
        // 兜底:最长 6s 后无论是否检测到 iframe 都强制结束加载态,绝不残留
        setTimeout(() => { clearInterval(iv); setCaptchaLoading(false) }, 6000)
      } catch (e) {
        console.warn('[contact-us] Turnstile 渲染失败:', e)
        setCaptchaLoading(false)
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
      s.onerror = () => { turnstileState.scriptLoading = false; setCaptchaLoading(false) }
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
  }, [thread, text])

  // iOS 键盘弹起兜底:聚焦输入框时把输入区滚入可视区,
  // 配合 interactive-widget=resizes-content 彻底避免输入框被键盘盖住/白板。
  const focusInput = (e) => {
    try {
      e.target.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    } catch (err) { /* 忽略 */ }
  }

  const handleSend = async () => {
    if (sending) return
    const msg = text.trim()
    if (!msg) {
      toast(t('contact.emptyMsg'), 'error')
      return
    }
    // 会话内从未验证过 → 要求先完成人机验证;验证过一次后免验证(服务端会话级信任)
    if (captchaRequired && !everVerified && !token) {
      toast(t('contact.captchaFirst'), 'error')
      return
    }
    if (!supabase) {
      toast(t('contact.sendFailed'), 'error')
      return
    }
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('contact-us', {
        body: {
          participant_id: participantId,
          message: msg,
          email: email.trim() || null,
          token, // 可能为 null(已验证会话的后续消息);服务端凭信任窗口放行
        },
      })
      if (error) throw error
      // 函数以 200 返回 {ok:true};非 ok 分支通过 data.reason 区分
      if (data && data.ok === false) {
        if (data.reason === 'rate_limited') { toast(t('contact.rateLimited'), 'error'); return }
        if (data.reason === 'captcha_required' || data.reason === 'captcha_failed') {
          toast(t('contact.captchaFirst'), 'error')
          // 需要重新验证:重置组件以获取新 token
          setEverVerified(false); setToken(null)
          try { if (widgetIdRef.current != null && window.turnstile) window.turnstile.reset(widgetIdRef.current) } catch (e) { /* 忽略 */ }
          return
        }
        toast(t('contact.sendFailed'), 'error'); return
      }
      setText('')
      toast(t('contact.sent'), 'success')
      // 关键:发送成功后不再 reset 人机验证组件(token 一次性,已消费;
      // 会话级信任已由服务端记录),组件保持成功态,不再打扰用户重复验证。
      setToken(null)
      loadThread()
      if (!email.trim()) {
        toast(t('contact.emailMissingWarn'), 'info', 6500)
      }
    } catch (e) {
      const em = String(e?.message || '').toLowerCase()
      toast(em.includes('captcha') ? t('contact.captchaFailed') : t('contact.sendFailed'), 'error')
    } finally {
      setSending(false)
    }
  }

  // 登录用户的账号头像;其余用默认头像(lucide User)
  const selfAvatar = user?.avatarUrl ? (
    <img className="contact-avatar-img" src={user.avatarUrl} alt="" />
  ) : (
    <span className="contact-avatar-default"><User size={14} /></span>
  )

  return (
    <div className="contact-overlay" onClick={onClose}>
      <div className="contact-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label={t('contact.title')}>
        <div className="contact-header">
          <h2 className="contact-title">{t('contact.title')}</h2>
          <button className="contact-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>

        {/* 聊天区:官方欢迎消息 + 历史线程(用户消息/管理员回复)。
            区域为固定高度 + 底部渐隐:首条消息必然被截断,用户需滚动才能看完整,
            直观传递「这是可滚动的 IM 对话窗」 */}
        <div className="contact-chat-wrap">
          <div className="contact-chat" ref={chatRef}>
            <div className="contact-msg official">
              <div className="contact-avatar">{LOGO_SVG}</div>
              <div className="contact-bubble">{t('contact.intro')}</div>
            </div>
            {threadLoading ? null : thread.map(m => (
              m.author === 'admin' ? (
                <div className="contact-msg official" key={m.id}>
                  <div className="contact-avatar">{LOGO_SVG}</div>
                  <div className="contact-bubble admin-reply">{m.message}</div>
                </div>
              ) : (
                <div className="contact-msg user" key={m.id}>
                  <div className="contact-bubble user">{m.message}</div>
                  <div className="contact-avatar">{selfAvatar}</div>
                </div>
              )
            ))}
          </div>
          <div className="contact-chat-fade" aria-hidden="true" />
        </div>

        {/* 身份提示:按登录态区分 —— 仅未登录(游客)显示访客文案,登录用户显示站内用户文案 */}
        <p className="contact-visitor-hint">
          {user ? t('contact.userHint') : t('contact.visitorHint')}
        </p>

        <input
          className="contact-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onFocus={focusInput}
          placeholder={t('contact.emailPlaceholder')}
          maxLength={120}
        />

        <div className="contact-captcha">
          {captchaRequired ? (
            <div className="turnstile-wrap">
              {/* Cloudflare Turnstile 组件本体(Managed 模式属平台行为) */}
              <div ref={turnstileRef} className="turnstile-host" />
              {/* 加载过渡:组件脚本/iframe 就绪前显示渐进加载态,避免空白 */}
              {captchaLoading && (
                <div className="turnstile-loading" aria-hidden="true">
                  <span className="turnstile-spinner" />
                  <span className="turnstile-loading-text">{t('contact.captchaLoading')}</span>
                </div>
              )}
            </div>
          ) : (
            <span className="contact-captcha-off">{t('contact.captchaOff')}</span>
          )}
        </div>

        {/* 验证区与输入区之间的浅色分隔线,拉开层次 */}
        <div className="contact-separator" aria-hidden="true" />

        <div className="contact-input-row">
          <input
            className="contact-msg-input"
            value={text}
            onChange={e => setText(e.target.value)}
            onFocus={focusInput}
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
        /* iOS Safari 键盘弹起时 --visible-vh=可视高度(App.jsx 全局监听 visualViewport 更新),
           使浮层只覆盖键盘之上的可见区域,输入框不被键盘吞掉 */
        .contact-overlay {
          position: fixed;
          top: var(--visible-vh-top, 0px);
          left: 0;
          right: 0;
          height: var(--visible-vh, 100vh);
          background: rgba(43, 36, 32, 0.5);
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          /* 顶部少量留白,模态框略偏下;改用小数值避免 PC/矮视口下溢出 */
          padding: 4vh 12px 12px;
          box-sizing: border-box;
          /* 阻止触摸滚动穿透:在模态框上滑动不会带动下层图库滚动(仅聊天区放行) */
          overscroll-behavior: contain;
          touch-action: none;
        }
        .contact-modal {
          width: 100%;
          max-width: 420px;
          max-height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
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
        .contact-chat-wrap {
          position: relative;
          /* 聊天区在空间充足时 165px;视口受限时被 flex 压缩 → 模态框整体不溢出 */
          flex: 1 1 auto;
          min-height: 60px;
        }
        .contact-chat {
          /* 高度跟随 wrap(收缩时内部滚动),最多 165px 保持 IM 手感 */
          height: 100%;
          max-height: 165px;
          overflow-y: auto;
          padding: 14px 16px 10px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: var(--bg-primary);
          scroll-behavior: smooth;
          /* 仅聊天区放行纵向触摸滚动(overlay 为 touch-action:none 阻止穿透) */
          touch-action: pan-y;
        }
        .contact-chat-fade {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 22px;
          background: linear-gradient(to bottom, rgba(253, 251, 247, 0), rgba(253, 251, 247, 0.95));
          pointer-events: none;
        }
        .contact-msg {
          display: flex;
          align-items: flex-end;
          gap: 8px;
        }
        .contact-msg.user { justify-content: flex-end; }
        .contact-avatar {
          flex-shrink: 0;
          border-radius: 8px;
          overflow: hidden;
          width: 26px;
          height: 26px;
        }
        .contact-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 8px;
        }
        .contact-avatar-default {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
        }
        .contact-bubble {
          /* 所有消息气泡统一窄宽度(官方/回复/用户一致):自然加长区域,引导滚动 */
          max-width: 64%;
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
        .contact-bubble.admin-reply {
          border-color: var(--secondary-accent);
          background: rgba(74, 155, 142, 0.08);
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
          /* 次级输入:细浅描边,弱于消息输入框,形成层次 */
          border: 1.5px solid var(--border-color);
          border-radius: 10px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: var(--text-sm);
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.15s;
        }
        .contact-email:focus { border-color: var(--accent); }
        .contact-email::placeholder { color: var(--text-muted); }
        .contact-captcha {
          margin: 0 16px;
          display: flex;
          justify-content: center;
        }
        .turnstile-wrap {
          position: relative;
          width: 300px;
          max-width: 100%;
          height: 65px;
        }
        /* Cloudflare 组件本体(300×65) */
        .turnstile-host {
          width: 100%;
          height: 65px;
        }
        /* 加载过渡:组件就绪前覆盖的渐进加载态(淡入 + 旋转 + 呼吸),就绪后淡出 */
        .turnstile-loading {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: var(--bg-primary);
          border: 1.5px dashed var(--border-color);
          border-radius: 10px;
          animation: turnstile-loading-in 0.3s ease;
        }
        .turnstile-spinner {
          width: 18px;
          height: 18px;
          border: 2.5px solid var(--border-color);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: turnstile-spin 0.8s linear infinite;
        }
        .turnstile-loading-text {
          font-size: var(--text-xs);
          color: var(--text-muted);
          animation: turnstile-breathe 1.4s ease-in-out infinite;
        }
        @keyframes turnstile-spin { to { transform: rotate(360deg); } }
        @keyframes turnstile-loading-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes turnstile-breathe {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
        .contact-separator {
          height: 1px;
          background: var(--border-color);
          margin: 14px 16px 14px;
        }
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
