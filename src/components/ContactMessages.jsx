import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { User } from 'lucide-react'
import { supabase } from '../services/supabase'
import LoadingScreen from './LoadingScreen'
import { useToast } from './Toast'

// 官方回复头像 = 站点 LOGO(4×4 拼豆色板,与前端弹层一致)
const LOGO_SVG = (
  <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
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
          <div className="cm-list">
            {messages.map(m => (
              <div key={m.id} className={`cm-item ${m.author === 'admin' ? 'admin' : ''}`}>
                {/* 头像:官方回复=站点 LOGO,用户=默认人形 */}
                <div className={`cm-avatar ${m.author === 'admin' ? 'admin' : ''}`}>
                  {m.author === 'admin' ? LOGO_SVG : <User size={14} />}
                </div>
                <div className="cm-body">
                  <div className="cm-head">
                    <span className={`cm-author ${m.author === 'admin' ? 'admin' : ''}`}>
                      {m.author === 'admin' ? t('admin.contact.authorAdmin') : t('admin.contact.authorUser')}
                    </span>
                    <span className="cm-email">{m.email || t('admin.contact.noEmail')}</span>
                    <span className="cm-time">{renderDate(m.created_at)}</span>
                  </div>
                  <div className={`cm-bubble ${m.author === 'admin' ? 'admin' : ''}`}>{m.message}</div>

                  {/* 每条留言都可回复:挂到同一线程,访客重开弹层即见。
                      迁移 0014 前的历史留言无 participant_id,无法挂线程,不显示回复入口 */}
                  {m.participant_id && (replyState[m.id]?.open ? (
                    <div className="cm-reply-box">
                      <textarea
                        className="admin-input cm-reply-input"
                        value={replyState[m.id].text}
                        onChange={e => setReply(m.id, { text: e.target.value })}
                        placeholder={t('admin.contact.replyPlaceholder')}
                        rows={2}
                        maxLength={2000}
                      />
                      <div className="cm-reply-actions">
                        <button className="admin-btn secondary small" disabled={replyState[m.id]?.busy} onClick={() => setReply(m.id, { open: false, text: '' })}>
                          {t('common.cancel')}
                        </button>
                        <button className="admin-btn primary small" disabled={replyState[m.id]?.busy} onClick={() => sendReply(m)}>
                          {replyState[m.id]?.busy ? t('auth.processing') : t('admin.contact.replyBtn')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="admin-btn secondary small cm-reply-toggle" onClick={() => setReply(m.id, { open: true })}>
                      {t('admin.contact.replyBtn')}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .cm-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 6px;
        }
        .cm-item {
          display: flex;
          gap: 12px;
          padding: 12px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 14px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .cm-item:hover { border-color: var(--accent); box-shadow: 0 2px 8px rgba(43, 36, 32, 0.08); }
        .cm-item.admin { border-left: 3px solid var(--secondary-accent); }
        .cm-avatar {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-soft);
          color: var(--accent);
          overflow: hidden;
        }
        .cm-avatar.admin { background: rgba(74, 155, 142, 0.14); color: var(--secondary-accent); }
        .cm-body { flex: 1; min-width: 0; }
        .cm-head {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 6px;
          flex-wrap: wrap;
        }
        .cm-author {
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
        .cm-author.admin { background: rgba(74, 155, 142, 0.12); color: var(--secondary-accent); }
        .cm-email {
          font-family: ui-monospace, monospace;
          font-size: 12px;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 260px;
        }
        .cm-time {
          font-size: 12px;
          color: var(--text-muted);
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
          margin-left: auto;
        }
        .cm-bubble {
          padding: 9px 12px;
          border-radius: 12px;
          background: #fff;
          border: 1.5px solid var(--border-color);
          font-size: var(--text-sm);
          color: var(--text-primary);
          line-height: 1.6;
          word-break: break-word;
          white-space: pre-wrap;
        }
        .cm-bubble.user { background: var(--accent-soft); border-color: rgba(232, 115, 74, 0.35); }
        .cm-bubble.admin { background: rgba(74, 155, 142, 0.08); border-color: rgba(74, 155, 142, 0.4); }
        .cm-reply-toggle { margin-top: 8px; }
        .cm-reply-box { margin-top: 8px; }
        .cm-reply-input { width: 100%; resize: vertical; box-sizing: border-box; }
        .cm-reply-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 6px;
        }
      `}</style>
    </div>
  )
}
