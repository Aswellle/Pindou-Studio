/**
 * ContactPage — /contact 联系我们
 *
 * 为什么是**路由页**而不是模态框:
 *   模态框在 iOS Safari 上有两个叠加的顽疾 —— 浮层里同时摆着邮箱框与消息框
 *   两个编辑控件,键盘弹起后可用高度骤减,用户既看不清聊天内容也填不完表单。
 *   改成独立页面后版面可以专心服务这一件事:整页只有会话 + 一个输入框。
 *
 * 版面三段式(全部在正常文档流里,没有 position: fixed 的子元素):
 *   1. 顶栏 —— 返回 + 标题 + 说明,不出现站点导航(本页属独立页);
 *   2. 会话区 —— flex: 1 + 内部滚动,键盘弹起时收缩到剩余空间;
 *   3. 输入区 —— flex: 0 0 auto,钉在页面底部。用 flex 而不是 fixed:
 *      本页的定位框已经是 fixed 且恰好等于可见区域,尾部 flex 项天然就是
 *      「屏幕底部」,再套一层 fixed 只会重新引入布局视口坐标问题。
 *
 * 页面根节点本身是 fixed + inset:0(见 contactPage.css):iOS 键盘弹起时
 * Safari 会滚动文档 / 平移视觉视口,普通流与 absolute 的整页会跟着被推上去,
 * 中间露出 body 底色 —— 那片「大片空白」就是这么来的。fixed 不受两者影响。
 *
 * 邮箱默认折叠成一个按钮:本页默认只有**一个**编辑控件(消息输入),点开才多一个。
 * 这是「减少同时出现的编辑框」的直接落地。
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Send, User } from 'lucide-react'
import { supabase, toStorageUrl } from '../services/supabase'
import { useToast } from './Toast'
import './contactPage.css'

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
 * 线程身份:登录用户用 user.id;访客用 localStorage 持久 UUID。
 * 持久化的意义是「关掉页面再回来还能看到自己的历史与管理员回复」——
 * 访客没有账号可查,这个 UUID 就是他的线程凭证。
 */
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

// Turnstile 脚本只加载一次(全站共享;组件卸载后重新进入不重复注入)
const turnstileState = { scriptLoading: false }

export default function ContactPage({ user }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()

  const participantId = useMemo(() => (user?.id ? user.id : getAnonParticipant()), [user?.id])
  const [thread, setThread] = useState([])
  const [threadLoading, setThreadLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [emailOpen, setEmailOpen] = useState(false)
  const [text, setText] = useState('')
  const [token, setToken] = useState(null)
  // 本次会话是否已通过一次人机验证(通过后不再要求重复验证,服务端会话级信任)
  const [everVerified, setEverVerified] = useState(false)
  const [sending, setSending] = useState(false)
  const [captchaLoading, setCaptchaLoading] = useState(true)
  const turnstileRef = useRef(null)
  const widgetIdRef = useRef(null)
  const chatRef = useRef(null)
  const captchaRequired = !!TURNSTILE_SITE_KEY

  // 返回上一页;深链接直达(无浏览历史)时兜底回图库 —— 入口在那里
  const handleBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/gallery')
  }, [navigate])

  // 拉取线程 + 每 5s 轮询(管理员回复到达后自动出现;不依赖 Realtime/RLS 配置)
  const loadThread = useCallback(async () => {
    if (!supabase) return
    try {
      const { data, error } = await supabase.rpc('get_contact_thread', {
        p_participant_id: participantId,
        p_limit: 60,
      })
      if (!error) setThread((data || []).map(threadToMsg))
    } catch { /* 静默:线程加载失败不阻塞输入发送 */ }
  }, [participantId])

  useEffect(() => {
    loadThread().finally(() => setThreadLoading(false))
    const timer = setInterval(loadThread, 5000)
    return () => clearInterval(timer)
  }, [loadThread])

  // Escape 返回:页面上没有遮罩可关,但桌面端用户仍会下意识按它
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleBack])

  // 挂载时加载 Turnstile 脚本并渲染 widget
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在挂载时初始化一次 Turnstile;t/toast 仅用于错误提示
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
            setCaptchaLoading(false)
            setEverVerified(prev => {
              if (!prev) toast(t('contact.captchaOk'), 'success')
              return true
            })
          },
          'expired-callback': () => { setToken(null) },
          'error-callback': () => { setToken(null) },
        })
        // render 后轮询 iframe 注入:组件真正渲染完成 → 结束加载态
        const iv = setInterval(() => {
          if (turnstileRef.current?.querySelector('iframe')) {
            clearInterval(iv)
            setCaptchaLoading(false)
          }
        }, 120)
        // 兜底:最长 6s 后无论是否检测到 iframe 都强制结束加载态,绝不残留
        setTimeout(() => { clearInterval(iv); setCaptchaLoading(false) }, 6000)
      } catch {
        console.warn('[contact] Turnstile 渲染失败')
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
      try { if (widgetIdRef.current != null && window.turnstile) window.turnstile.remove(widgetIdRef.current) } catch { /* 忽略 */ }
    }
  }, [captchaRequired])

  // 新消息后会话区滚到底部
  // biome-ignore lint/correctness/useExhaustiveDependencies: thread/text 只作「有新内容」的触发信号
  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread, text])

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
      if (data && data.ok === false) {
        if (data.reason === 'rate_limited') { toast(t('contact.rateLimited'), 'error'); return }
        if (data.reason === 'captcha_required' || data.reason === 'captcha_failed') {
          toast(t('contact.captchaFirst'), 'error')
          // 需要重新验证:重置组件以获取新 token
          setEverVerified(false); setToken(null)
          try { if (widgetIdRef.current != null && window.turnstile) window.turnstile.reset(widgetIdRef.current) } catch { /* 忽略 */ }
          return
        }
        toast(t('contact.sendFailed'), 'error'); return
      }
      setText('')
      toast(t('contact.sent'), 'success')
      // 发送成功后不再 reset:token 一次性已消费,会话级信任已由服务端记录,
      // 组件保持成功态,不打扰用户重复验证。
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

  // 登录用户头像:只渲染本站 avatars bucket 的 URL(与 Avatar 组件同一道校验 ——
  // avatarUrl 允许用户自行写入,不校验就能让全站 img 请求外部追踪地址)
  const selfAvatarUrl = toStorageUrl(user?.avatarUrl)
  const selfAvatar = selfAvatarUrl ? (
    <img className="contact-avatar-img" src={selfAvatarUrl} alt="" />
  ) : (
    <span className="contact-avatar-default"><User size={14} /></span>
  )

  const savedEmail = email.trim()

  return (
    /* 页面根节点就是定位框:fixed + inset:0 盖满布局视口,内容再用内边距
       框进视觉视口(见 contactPage.css 顶部注释)。不需要定位宿主 ——
       fixed 的包含块是初始包含块,祖先的 position 不影响它。 */
    <div className="contact-page">
      <div className="contact-page-inner">
        <header className="contact-page-bar">
          <button
            type="button"
            className="contact-back"
            onClick={handleBack}
            aria-label={t('common.back')}
            title={t('common.back')}
          >
            <ArrowLeft size={16} />
          </button>
          <div className="contact-page-title">
            <h1>{t('contact.title')}</h1>
            <p>{user ? t('contact.userHint') : t('contact.visitorHint')}</p>
          </div>
        </header>

        {/* 会话区:本页唯一的滚动容器。键盘弹起时整页随 --vh 收缩,
            这里自动让出空间,不产生任何浮层式位移。 */}
        <div className="contact-thread" ref={chatRef}>
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

        {/* 输入区:flex 尾部的固定段。不用 position: fixed —— 那正是键盘弹起
            时把内容顶走、露出白板的写法。 */}
        <footer className="contact-composer">
          {/* 邮箱默认折叠:本页默认只留一个编辑控件,键盘弹起后纵向空间全部
              留给会话区与消息框 */}
          {emailOpen ? (
            <div className="contact-email-row">
              <input
                className="contact-email-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('contact.emailPlaceholder')}
                maxLength={120}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setEmailOpen(false) } }}
              />
              <button
                type="button"
                className="contact-email-done"
                onClick={() => setEmailOpen(false)}
              >
                {t('common.confirm')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`contact-email-toggle${savedEmail ? ' filled' : ''}`}
              onClick={() => setEmailOpen(true)}
            >
              {savedEmail ? t('contact.emailSet', { email: savedEmail }) : t('contact.emailToggle')}
            </button>
          )}

          <div className="contact-captcha">
            {captchaRequired ? (
              <div className="turnstile-wrap">
                <div ref={turnstileRef} className="turnstile-host" />
                {/* 加载过渡:脚本/iframe 就绪前显示渐进加载态,避免空白 */}
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
              type="button"
              className="contact-send-btn"
              onClick={handleSend}
              disabled={sending}
              aria-label={t('contact.send')}
              title={t('contact.send')}
            >
              <Send size={18} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
