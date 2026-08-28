import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../services/supabase'
import LoadingScreen from './LoadingScreen'

/**
 * 联系消息面板(管理员):来自图库「联系我们」弹层的留言。
 * 数据经 RPC admin_list_contact_messages(security definer + is_admin)读取,
 * 仅展示邮箱(选填)/ 留言内容 / 时间,无敏感字段。
 */
export default function ContactMessages() {
  const { t } = useTranslation()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!supabase) { if (mounted) setLoading(false); return }
      const { data, error: err } = await supabase.rpc('admin_list_contact_messages', { p_limit: 50 })
      if (!mounted) return
      if (err) setError(err.message || String(err))
      else setMessages(data || [])
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  return (
    <div>
      <div className="admin-card">
        <div className="admin-card-head">
          <h3>{t('admin.contact.title')}</h3>
        </div>
        <p className="admin-field-hint">{t('admin.contact.hint')}</p>

        {error && <div className="admin-result warn">{t('admin.users.loadFailed')}: {error}</div>}

        {loading ? (
          <LoadingScreen text={t('gallery.cloudLoading')} />
        ) : messages.length === 0 ? (
          <div className="admin-empty">{t('admin.contact.empty')}</div>
        ) : (
          <div className="contact-msg-list">
            {messages.map(m => (
              <div key={m.id} className="contact-msg-row">
                <div className="contact-msg-meta">
                  <span className="contact-msg-email">{m.email || t('admin.contact.noEmail')}</span>
                  <span className="contact-msg-date">
                    {new Date(m.created_at).toLocaleString(undefined, {
                      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="contact-msg-text">{m.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .contact-msg-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 6px;
        }
        .contact-msg-row {
          padding: 10px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
        }
        .contact-msg-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 6px;
        }
        .contact-msg-email {
          font-family: ui-monospace, monospace;
          font-size: 12px;
          color: var(--accent);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .contact-msg-date {
          font-size: 12px;
          color: var(--text-muted);
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
        }
        .contact-msg-text {
          margin: 0;
          font-size: var(--text-sm);
          color: var(--text-primary);
          line-height: 1.6;
          word-break: break-word;
          white-space: pre-wrap;
        }
      `}</style>
    </div>
  )
}
