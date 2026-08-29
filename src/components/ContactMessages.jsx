import { useState, useEffect, useCallback, useMemo } from 'react'
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

// ── 游客昵称兜底(服务端 ensure_contact_nickname 分配失败时用;真正唯一性由服务端保证) ──
const ANON_ADJ = ['快乐', '元气', '机智', '暖暖', '闪光', '悠闲', '手作', '像素', '缤纷', '灵动', '俏皮', '温柔', '酷炫', '软萌', '清爽', '神秘', '好奇', '勇敢', '梦幻', '热情']
const ANON_NOUN = ['拼豆师', '小豆丁', '豆豆侠', '像素手', '手作者', '豆工', '拼客', '豆芽', '小匠人', '手绘师', '豆豆星', '拼织客', '色块君', '图纸师', '珠珠侠', '小贝珠', '胶珠手', '点点匠', '豆花糖', '方块客']
const hashStr = (s) => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}
const anonFallback = (pid) => {
  const h = hashStr(pid || '')
  const num = (h % 9000 + 1000).toString()
  return `${ANON_ADJ[h % ANON_ADJ.length]}的${ANON_NOUN[(h >>> 5) % ANON_NOUN.length]}${num}`
}

const PAGE_SIZE = 8 // 每次加载的对话卡片数
const MAX_LOAD = 200 // 拉取消息总数上限(服务端 p_limit 上限)

/**
 * 联系消息面板(管理员):按参与者(participant)聚合成「对话卡片」。
 * - 卡片网格:移动端 1 列、宽屏最多 2 列;每卡固定高度,内部 IM 消息流可滚动
 * - 初始最多 8 个对话,超过显示「加载更多」,每次再加载 8 个(按最后消息时间从晚到早)
 * - 卡片顶部:身份(注册用户=站内昵称+真实头像;游客=确定性生成昵称+默认头像)+
 *   创建时间(精确到分钟)+ 回复邮箱(未填显示文案)
 * - 卡片底部:该对话的回复输入框(回复挂在同一 participant 线程)
 * 数据经 RPC admin_list_contact_messages + profiles 查询(仅管理员,RLS 保证)。
 */
export default function ContactMessages() {
  const { t } = useTranslation()
  const toast = useToast()
  const [conversations, setConversations] = useState([])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 每卡回复编辑态:{ [participantId]: { text, busy } }
  const [replyState, setReplyState] = useState({})

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    const { data, error: err } = await supabase.rpc('admin_list_contact_messages', { p_limit: MAX_LOAD })
    if (err) { setError(err.message || String(err)); setLoading(false); return }
    const rows = data || []

    // 按 participant 分组,消息按时间正序,对话按最后消息时间倒序
    const map = new Map()
    for (const r of rows) {
      if (!r.participant_id) continue
      let c = map.get(r.participant_id)
      if (!c) {
        c = { participantId: r.participant_id, email: '', messages: [], firstAt: r.created_at, lastAt: r.created_at }
        map.set(r.participant_id, c)
      }
      c.messages.push({ id: r.id, author: r.author, message: r.message, createdAt: r.created_at })
      if (r.email) c.email = r.email
      if (r.created_at < c.firstAt) c.firstAt = r.created_at
      if (r.created_at > c.lastAt) c.lastAt = r.created_at
    }
    const convs = [...map.values()]
      .map(c => ({ ...c, messages: c.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) }))
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))

    // 批量查 profiles:命中的为注册用户(站内昵称/真实头像),未命中的为游客
    let profileById = {}
    try {
      const ids = convs.map(c => c.participantId)
      const { data: pdata } = await supabase.from('profiles').select('id,nickname,avatar_url').in('id', ids)
      for (const p of (pdata || [])) profileById[p.id] = p
    } catch (e) { /* 忽略:游客按默认处理 */ }

    // 游客昵称:调用服务端唯一分配 RPC(持久化 + 全局唯一检查,确保每个参与者独一无二)
    const nicknameById = {}
    await Promise.all(
      convs
        .filter(c => !profileById[c.participantId])
        .map(async (c) => {
          try {
            const { data } = await supabase.rpc('ensure_contact_nickname', { p_participant_id: c.participantId })
            if (data) nicknameById[c.participantId] = data
          } catch (e) { /* RPC 失败:渲染时用 anonFallback 兜底 */ }
        })
    )

    setConversations(convs.map(c => ({
      ...c,
      profile: profileById[c.participantId] || null,
      nickname: nicknameById[c.participantId] || null,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const sendReply = async (conv) => {
    const st = replyState[conv.participantId]
    const msg = (st?.text || '').trim()
    if (!msg) { toast(t('admin.contact.replyEmpty'), 'error'); return }
    if (st?.busy) return
    setReplyState(prev => ({ ...prev, [conv.participantId]: { ...prev[conv.participantId], text: msg, busy: true } }))
    try {
      const { error: err } = await supabase.rpc('admin_reply_contact', {
        p_participant_id: conv.participantId,
        p_message: msg,
      })
      if (err) throw err
      toast(t('admin.contact.replySent'), 'success')
      setReplyState(prev => ({ ...prev, [conv.participantId]: { text: '', busy: false } }))
      await load()
    } catch (e) {
      toast(e?.message || t('admin.users.opFailed'), 'error')
      setReplyState(prev => ({ ...prev, [conv.participantId]: { ...prev[conv.participantId], busy: false } }))
    }
  }

  const visible = useMemo(() => conversations.slice(0, visibleCount), [conversations, visibleCount])
  const hasMore = visibleCount < conversations.length

  const fmtMinute = (ts) => {
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    })
  }

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
        ) : conversations.length === 0 ? (
          <div className="admin-empty">{t('admin.contact.empty')}</div>
        ) : (
          <>
            <div className="cm-grid">
              {visible.map(c => {
                const isUser = !!c.profile
                // 游客昵称:服务端唯一分配(持久化);注册用户:站内昵称
                const name = isUser
                  ? (c.profile.nickname || c.profile.id?.slice(0, 8))
                  : (c.nickname || anonFallback(c.participantId))
                const avatar = isUser && c.profile.avatar_url ? c.profile.avatar_url : null
                return (
                  <div key={c.participantId} className="cm-card">
                    {/* 顶部身份区 */}
                    <div className="cm-card-head">
                      <div className="cm-card-avatar">
                        {avatar ? (
                          <img src={avatar} alt="" className="cm-card-avatar-img" />
                        ) : (
                          <span className="cm-card-avatar-default"><User size={14} /></span>
                        )}
                      </div>
                      <div className="cm-card-id">
                        <div className="cm-card-name">
                          {name}
                          {!isUser && <span className="cm-guest-badge">{t('admin.contact.guestBadge')}</span>}
                        </div>
                        <div className="cm-card-meta">
                          <span className="cm-card-time">{fmtMinute(c.firstAt)}</span>
                          <span className="cm-card-email">{c.email ? c.email : t('admin.contact.noEmail')}</span>
                        </div>
                      </div>
                    </div>

                    {/* IM 消息区(内部滚动) */}
                    <div className="cm-thread">
                      {c.messages.map(m => (
                        <div key={m.id} className={`cm-msg ${m.author === 'admin' ? 'admin' : 'user'}`}>
                          <div className="cm-msg-avatar">
                            {m.author === 'admin' ? LOGO_SVG : (avatar ? <img src={avatar} alt="" className="cm-avatar-img" /> : <User size={12} />)}
                          </div>
                          <div className={`cm-msg-bubble ${m.author === 'admin' ? 'admin' : 'user'}`}>{m.message}</div>
                        </div>
                      ))}
                    </div>

                    {/* 底部回复输入框 */}
                    <div className="cm-card-reply">
                      <input
                        className="cm-reply-input"
                        value={replyState[c.participantId]?.text || ''}
                        onChange={e => setReplyState(prev => ({ ...prev, [c.participantId]: { ...prev[c.participantId], text: e.target.value } }))}
                        placeholder={t('admin.contact.replyPlaceholder')}
                        maxLength={2000}
                        onKeyDown={e => { if (e.key === 'Enter') sendReply(c) }}
                      />
                      <button
                        className="cm-reply-send"
                        disabled={replyState[c.participantId]?.busy}
                        onClick={() => sendReply(c)}
                        aria-label={t('admin.contact.replyBtn')}
                        title={t('admin.contact.replyBtn')}
                      >
                        {replyState[c.participantId]?.busy ? '…' : t('admin.contact.replyBtn')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {hasMore && (
              <div className="cm-load-more">
                <button className="admin-btn secondary" onClick={() => setVisibleCount(n => n + PAGE_SIZE)}>
                  {t('admin.contact.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        .cm-grid {
          display: grid;
          gap: 14px;
          margin-top: 8px;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        }
        @media (min-width: 1000px) { .cm-grid { grid-template-columns: repeat(2, 1fr); } }
        .cm-card {
          display: flex;
          flex-direction: column;
          height: 340px;
          background: var(--bg-secondary);
          border: 2px solid var(--border-color);
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 3px 0 rgba(43, 36, 32, 0.08);
        }
        .cm-card-head {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-bottom: 2px solid var(--border-color);
          background: var(--bg-primary);
        }
        .cm-card-avatar {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          flex-shrink: 0;
          overflow: hidden;
        }
        .cm-card-avatar-img, .cm-avatar-img { width: 100%; height: 100%; object-fit: cover; }
        .cm-card-avatar-default {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
        }
        .cm-card-id { min-width: 0; flex: 1; }
        .cm-card-name {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .cm-guest-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 1px 6px;
          border-radius: 999px;
          background: var(--accent-soft);
          color: var(--accent);
          flex-shrink: 0;
        }
        .cm-card-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 2px;
          min-width: 0;
        }
        .cm-card-time {
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .cm-card-email {
          font-family: ui-monospace, monospace;
          font-size: 11px;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        /* IM 消息区 */
        .cm-thread {
          flex: 1;
          overflow-y: auto;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: var(--bg-primary);
        }
        .cm-msg {
          display: flex;
          align-items: flex-end;
          gap: 6px;
          max-width: 88%;
        }
        .cm-msg.user { align-self: flex-end; flex-direction: row-reverse; }
        .cm-msg-avatar {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          flex-shrink: 0;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }
        .cm-msg-bubble {
          padding: 7px 10px;
          border-radius: 10px;
          font-size: var(--text-sm);
          line-height: 1.55;
          word-break: break-word;
          white-space: pre-wrap;
          border: 1.5px solid var(--border-color);
          background: #fff;
          color: var(--text-primary);
        }
        .cm-msg-bubble.admin { background: rgba(74, 155, 142, 0.08); border-color: rgba(74, 155, 142, 0.4); }
        .cm-msg-bubble.user { background: var(--accent-soft); border-color: rgba(232, 115, 74, 0.35); }
        /* 底部回复 */
        .cm-card-reply {
          display: flex;
          gap: 6px;
          padding: 8px 12px;
          border-top: 2px solid var(--border-color);
          background: var(--bg-primary);
        }
        .cm-reply-input {
          flex: 1;
          min-width: 0;
          padding: 7px 10px;
          border: 1.5px solid var(--border-color);
          border-radius: 8px;
          font-size: var(--text-sm);
          background: var(--bg-secondary);
          color: var(--text-primary);
          outline: none;
        }
        .cm-reply-input:focus { border-color: var(--accent); background: var(--bg-primary); }
        .cm-reply-send {
          flex-shrink: 0;
          padding: 7px 14px;
          border: 1.5px solid var(--accent);
          border-radius: 8px;
          background: var(--accent);
          color: #fff;
          font-size: var(--text-sm);
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .cm-reply-send:hover { background: var(--accent-hover); }
        .cm-reply-send:disabled { opacity: 0.6; cursor: default; }
        .cm-load-more {
          display: flex;
          justify-content: center;
          margin-top: 16px;
        }
      `}</style>
    </div>
  )
}
