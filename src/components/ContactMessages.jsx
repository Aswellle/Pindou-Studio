import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../services/supabase'
import LoadingScreen from './LoadingScreen'
import { useToast } from './Toast'

/**
 * 联系消息面板(管理员):来自图库「联系我们」的线程式留言。
 * - 每条留言标注作者:用户消息 / 官方回复(author='user'|'admin')
 * - 任一留言可点「回复」补一条官方回复(author='admin',挂在同一 participant 线程下),
 *   访客重新打开联系弹层即可看到
 * 数据经 RPC admin_list_contact_messages(security definer + is_admin)读取,
 * 仅展示邮箱(选填)/ 内容 / 作者 / 时间,无敏感字段。
 */
export default function ContactMessages() {
  const { t } = useTranslation()
  const toast = useToast()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 每行的回复编辑态:{ [rowId]: { open: bool, text: string, busy: bool } }
  const [replyState, setReplyState] = useState({})

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    const { data, error: err } = await supabase.rpc('admin_list_contact_messages', { p_limit: 50 })
    if (err) setError(err.message || String(err))
    else setMessages(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const setReply = (id, patch) => {
    setReplyState(prev => ({
      ...prev,
      [id]: { open: false, text: '', busy: false, ...prev[id], ...patch },
    }))
  }

  const sendReply = async (row) => {
    const st = replyState[row.id]
    const msg = (st?.text || '').trim()
    if (!msg) { toast(t('admin.contact.replyEmpty'), 'error'); return }
    if (st?.busy) return
    setReply(row.id, { busy: true })
    try {
      const { error: err } = await supabase.rpc('admin_reply_contact', {
        p_participant_id: row.participant_id,
        p_message: msg,
      })
      if (err) throw err
      toast(t('admin.contact.replySent'), 'success')
      setReply(row.id, { open: false, text: '' })
      await load()
    } catch (e) {
      toast(e?.message || t('admin.users.opFailed'), 'error')
    } finally {
      setReply(row.id, { busy: false })
    }
  }

  const renderDate = (ts) => new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })

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
              <div key={m.id} className={`contact-msg-row ${m.author === 'admin' ? 'admin' : ''}`}>
                <div className="contact-msg-meta">
                  <span className={`contact-msg-author ${m.author === 'admin' ? 'admin' : ''}`}>
                    {m.author === 'admin' ? t('admin.contact.authorAdmin') : t('admin.contact.authorUser')}
                  </span>
                  <span className="contact-msg-email">{m.email || t('admin.contact.noEmail')}</span>
                  <span className="contact-msg-date">{renderDate(m.created_at)}</span>
                </div>
                <p className="contact-msg-text">{m.message}</p>

                {/* 每条留言都可回复:挂到同一线程,访客重开弹层即见 */}
                {replyState[m.id]?.open ? (
                  <div className="contact-reply-box">
                    <textarea
                      className="admin-input contact-reply-input"
                      value={replyState[m.id].text}
                      onChange={e => setReply(m.id, { text: e.target.value })}
                      placeholder={t('admin.contact.replyPlaceholder')}
                      rows={2}
                      maxLength={2000}
                    />
                    <div className="contact-reply-actions">
                      <button className="admin-btn secondary small" disabled={replyState[m.id]?.busy} onClick={() => setReply(m.id, { open: false, text: '' })}>
                        {t('common.cancel')}
                      </button>
                      <button className="admin-btn primary small" disabled={replyState[m.id]?.busy} onClick={() => sendReply(m)}>
                        {replyState[m.id]?.busy ? t('auth.processing') : t('admin.contact.replyBtn')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="admin-btn secondary small contact-reply-toggle" onClick={() => setReply(m.id, { open: true })}>
                    {t('admin.contact.replyBtn')}
                  </button>
                )}
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
        .contact-msg-row.admin { border-left: 3px solid var(--secondary-accent); }
        .contact-msg-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 6px;
          flex-wrap: wrap;
        }
        .contact-msg-author {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 600;
          padding: 2px 10px;
          border-radius: 999px;
          background: var(--accent-soft);
          color: var(--accent);
          white-space: nowrap;
        }
        .contact-msg-author.admin { background: rgba(74, 155, 142, 0.12); color: var(--secondary-accent); }
        .contact-msg-email {
          font-family: ui-monospace, monospace;
          font-size: 12px;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 260px;
        }
        .contact-msg-date {
          font-size: 12px;
          color: var(--text-muted);
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
          margin-left: auto;
        }
        .contact-msg-text {
          margin: 0 0 8px;
          font-size: var(--text-sm);
          color: var(--text-primary);
          line-height: 1.6;
          word-break: break-word;
          white-space: pre-wrap;
        }
        .contact-reply-toggle { margin-top: 2px; }
        .contact-reply-box { margin-top: 8px; }
        .contact-reply-input { width: 100%; resize: vertical; box-sizing: border-box; }
        .contact-reply-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 6px;
        }
      `}</style>
    </div>
  )
}
