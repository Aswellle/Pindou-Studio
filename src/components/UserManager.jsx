import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../services/supabase'
import LoadingScreen from './LoadingScreen'
import { useToast } from './Toast'
import { useAuth } from '../hooks/useAuth'

/**
 * 用户管理面板(管理员仪表盘)
 * 合规:仅展示注册元数据(邮箱/昵称/角色/验证状态/注册时间/注册方式/最近登录/封禁状态),
 * 不包含密码等敏感字段,不收集行为数据;数据经云端 RPC
 * (security definer + is_admin 校验)获取,普通用户调用被拒。
 * 新增:删除 / 锁定(封禁)/ 解锁违规用户(一致确认框;admin 账号豁免)。
 */
const PAGE_SIZE = 20

export default function UserManager() {
  const { t } = useTranslation()
  const toast = useToast()
  const { adminDeleteUser, adminLockUser, adminUnlockUser } = useAuth()
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 最近注册记录(入库:registration_notifications 表,经 RPC admin_list_registrations 读取)
  const [registrations, setRegistrations] = useState([])
  // 待确认的账号操作:{ type:'delete' | 'lock' | 'unlock', user }
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const loadStats = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('admin_user_stats')
    if (err) { setError(err.message || String(err)); return } // 此前吞错,统计卡静默显示 '—'
    setStats(data[0] || null)
  }, [])

  const loadUsers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    const { data, error: err } = await supabase.rpc('admin_list_users', {
      search: search.trim(),
      page,
      page_size: PAGE_SIZE,
    })
    if (err) {
      setError(err.message || String(err))
      setUsers([])
    } else {
      setUsers(data || [])
    }
    if (!silent) setLoading(false)
  }, [search, page])

  // 最近注册:读取 registration_notifications 表(仅管理员,security definer RPC)
  const loadRegistrations = useCallback(async () => {
    if (!supabase) return
    const { data, error: err } = await supabase.rpc('admin_list_registrations', { p_limit: 10 })
    if (!err) setRegistrations(data || [])
  }, [])

  // 执行 删除 / 锁定 / 解锁(需确认后)
  const doAction = async () => {
    if (!confirm || busy) return
    setBusy(true)
    try {
      if (confirm.type === 'delete') await adminDeleteUser(confirm.user.id)
      else if (confirm.type === 'lock') await adminLockUser(confirm.user.id)
      else await adminUnlockUser(confirm.user.id)
      toast(
        confirm.type === 'delete' ? t('admin.users.deleted')
          : confirm.type === 'lock' ? t('admin.users.locked')
          : t('admin.users.unlocked'),
        'success'
      )
      setConfirm(null)
      loadUsers()
    } catch (e) {
      toast(e?.message || t('admin.users.opFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    loadStats()
    loadRegistrations()
  }, [loadStats, loadRegistrations])

  // 搜索防抖:输入过程中不每击键一次 RPC
  useEffect(() => {
    const timer = setTimeout(loadUsers, 300)
    return () => clearTimeout(timer)
  }, [loadUsers])

  // 实时刷新:新用户注册(profiles 插入)或后台删除/锁定/解锁后,自动刷新统计与列表,
  // 无需手动刷新页面或切换 tab。静默刷新(不闪 loading)。
  useEffect(() => {
    let t
    const reload = () => { clearTimeout(t); t = setTimeout(() => { loadStats(); loadUsers(true); loadRegistrations() }, 400) }
    const ch = supabase
      .channel('users-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, reload)
      .subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(ch) }
  }, [loadStats, loadUsers, loadRegistrations])

  // 最近登录:近 1 分钟视为"在线中"(绿点标记),否则展示本地化日期时间
  const renderLastSignIn = (ts) => {
    if (!ts) return '—'
    const date = new Date(ts)
    if (Number.isNaN(date.getTime())) return '—'
    if (Date.now() - date.getTime() < 60_000) {
      return <span className="users-online">{t('admin.users.online')}</span>
    }
    return date.toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const statCards = stats ? [
    { label: t('admin.users.total'), value: stats.total, tone: 'accent' },
    { label: t('admin.users.verified'), value: stats.verified, tone: 'ok' },
    { label: t('admin.users.unverified'), value: stats.unverified, tone: 'warn' },
    { label: t('admin.users.admins'), value: stats.admins, tone: 'accent' },
    { label: t('admin.users.recent30'), value: stats.recent_30d, tone: 'ok' },
  ] : []

  return (
    <div>
      <div className="admin-card">
        <div className="admin-card-head">
          <h3>{t('admin.users.title')}</h3>
        </div>
        <p className="admin-field-hint">{t('admin.users.privacyNote')}</p>
        <div className="users-stats">
          {statCards.map(c => (
            <div key={c.label} className={`users-stat-card ${c.tone}`}>
              <span className="users-stat-value">{c.value ?? '—'}</span>
              <span className="users-stat-label">{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 最近注册记录(入库:registration_notifications 事件流,仅管理员可读)。
          置于用户表格上方,最新动态一目了然 */}
      <div className="admin-card">
        <div className="admin-card-head">
          <h3>{t('admin.registrations.title')}</h3>
        </div>
        {registrations.length === 0 ? (
          <div className="admin-empty">{t('admin.registrations.empty')}</div>
        ) : (
          <div className="reg-grid">
            {registrations.map(r => (
              <div key={r.id} className="reg-tile">
                <div className="reg-tile-avatar">
                  {(r.nickname || r.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="reg-tile-main">
                  <div className="reg-tile-name">{r.nickname || t('admin.registrations.noNickname')}</div>
                  <div className="reg-tile-email">{r.email}</div>
                  <div className="reg-tile-meta">
                    <span className={`users-reg-method ${r.method === 'username' ? 'custom' : 'email'}`}>
                      {r.method === 'username' ? t('admin.users.regCustom') : t('admin.users.regEmail')}
                    </span>
                    <span className="reg-tile-time">
                      {new Date(r.created_at).toLocaleString(undefined, {
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-card">
        <input
          className="admin-input admin-search"
          placeholder={t('admin.users.searchPlaceholder')}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
        />

        {error && <div className="admin-result warn">{t('admin.users.loadFailed')}: {error}</div>}

        {loading ? (
          <LoadingScreen text={t('gallery.cloudLoading')} />
        ) : users.length === 0 ? (
          <div className="admin-empty">{t('admin.users.empty')}</div>
        ) : (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>{t('admin.users.email')}</th>
                  <th>{t('admin.users.nickname')}</th>
                  <th>{t('admin.users.role')}</th>
                  <th>{t('admin.users.status')}</th>
                  <th>{t('admin.users.registerMethod')}</th>
                  <th>{t('admin.users.registeredAt')}</th>
                  <th>{t('admin.users.lastSignIn')}</th>
                  <th>{t('admin.users.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td className="users-email">{u.email}</td>
                    <td>{u.nickname || '—'}</td>
                    <td>
                      <span className={`users-role-badge ${u.role === 'admin' ? 'admin' : 'user'}`}>
                        {u.role === 'admin' ? t('admin.users.roleAdmin') : t('admin.users.roleUser')}
                      </span>
                    </td>
                    <td>
                      <span className={`users-status ${u.email_confirmed ? 'ok' : 'warn'}`}>
                        {u.email_confirmed ? t('admin.users.verifiedYes') : t('admin.users.verifiedNo')}
                      </span>
                      {u.banned && (
                        <span className="users-status warn users-banned" title={t('admin.users.bannedTitle')}>
                          {t('admin.users.bannedBadge')}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`users-reg-method ${u.is_custom ? 'custom' : 'email'}`}>
                        {u.is_custom ? t('admin.users.regCustom') : t('admin.users.regEmail')}
                      </span>
                    </td>
                    <td className="users-date">
                      {new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })}
                    </td>
                    <td className="users-date">{renderLastSignIn(u.last_sign_in_at)}</td>
                    <td>
                      {/* admin 拥有最高权限,不提供 删除/锁定 */}
                      {u.role !== 'admin' ? (
                        <div className="users-actions">
                          <button className="admin-btn secondary small" disabled={busy} onClick={() => setConfirm({ type: u.banned ? 'unlock' : 'lock', user: u })}>
                            {u.banned ? t('admin.users.unlock') : t('admin.users.lock')}
                          </button>
                          <button className="admin-btn danger small" disabled={busy} onClick={() => setConfirm({ type: 'delete', user: u })}>
                            {t('admin.users.delete')}
                          </button>
                        </div>
                      ) : (
                        <span className="users-admin-note">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="users-pagination">
          <button className="admin-btn secondary small" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            {t('admin.users.pagePrev')}
          </button>
          <span className="users-page-info">{t('admin.users.pageInfo', { page: page + 1 })}</span>
          <button className="admin-btn secondary small" disabled={users.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
            {t('admin.users.pageNext')}
          </button>
        </div>
      </div>

      {/* 删除 / 锁定 / 解锁 确认对话框 */}
      {confirm && (
        <div className="users-confirm-overlay" onClick={() => !busy && setConfirm(null)}>
          <div className="users-confirm" onClick={e => e.stopPropagation()}>
            <h3 className="users-confirm-title">
              {confirm.type === 'delete' ? t('admin.users.confirmDeleteTitle')
                : confirm.type === 'lock' ? t('admin.users.confirmLockTitle')
                : t('admin.users.confirmUnlockTitle')}
            </h3>
            <p className="users-confirm-body">
              {confirm.type === 'delete'
                ? t('admin.users.confirmDeleteBody', { name: confirm.user.nickname || confirm.user.email })
                : confirm.type === 'lock'
                  ? t('admin.users.confirmLockBody', { name: confirm.user.nickname || confirm.user.email })
                  : t('admin.users.confirmUnlockBody', { name: confirm.user.nickname || confirm.user.email })}
            </p>
            <div className="users-confirm-actions">
              <button className="admin-btn secondary" disabled={busy} onClick={() => setConfirm(null)}>{t('admin.cancel')}</button>
              <button className="admin-btn danger" disabled={busy} onClick={doAction}>
                {busy ? t('auth.processing') : t('admin.users.confirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .users-stats {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
          margin-top: 12px;
        }
        .users-stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 14px 8px;
          border-radius: 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
        }
        .users-stat-card.accent { border-color: var(--accent); background: var(--accent-soft); }
        .users-stat-card.ok { border-color: var(--secondary-accent); background: rgba(74, 155, 142, 0.08); }
        .users-stat-card.warn { border-color: var(--warning); background: var(--warning-bg); }
        .users-stat-value {
          font-size: var(--text-2xl);
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
        .users-stat-label {
          font-size: 11px;
          color: var(--text-secondary);
          text-align: center;
        }
        .users-table-wrap { overflow-x: auto; }
        .users-table {
          width: 100%;
          border-collapse: collapse;
          font-size: var(--text-sm);
        }
        .users-table th {
          text-align: left;
          padding: 10px 12px;
          color: var(--text-secondary);
          font-weight: 600;
          border-bottom: 2px solid var(--border-color);
          white-space: nowrap;
        }
        .users-table td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-color);
          color: var(--text-primary);
          vertical-align: middle;
        }
        .users-table tbody tr:hover { background: var(--bg-secondary); }
        .users-email { font-family: ui-monospace, monospace; font-size: 12px; }
        .users-date { color: var(--text-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
        .users-online {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: var(--success);
          font-weight: 600;
        }
        .users-online::before {
          content: '';
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.18);
          flex-shrink: 0;
        }
        .users-role-badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
        }
        .users-role-badge.admin { background: var(--accent); color: white; }
        .users-role-badge.user { background: var(--bg-tertiary); color: var(--text-secondary); }
        .users-reg-method {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 600;
          padding: 2px 10px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .users-reg-method.email { background: rgba(74, 155, 142, 0.12); color: var(--secondary-accent); }
        .users-reg-method.custom { background: var(--accent-soft); color: var(--accent); }
        .users-status {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
        }
        .users-status.ok { color: var(--success); }
        .users-status.warn { color: var(--warning); }
        .users-banned { margin-left: 6px; }
        .users-actions { display: flex; gap: 6px; }
        .users-admin-note { color: var(--text-muted); }
        .users-confirm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          box-sizing: border-box;
        }
        .users-confirm {
          background: var(--bg-primary);
          border-radius: 14px;
          padding: 22px 24px;
          max-width: 440px;
          width: 100%;
          box-shadow: 0 16px 48px rgba(43,36,32,0.22);
        }
        .users-confirm-title {
          font-size: var(--text-lg);
          font-weight: var(--font-weight-semibold);
          color: var(--text-primary);
          margin: 0 0 10px;
        }
        .users-confirm-body {
          font-size: var(--text-md);
          color: var(--text-secondary);
          line-height: 1.6;
          margin: 0 0 20px;
          word-break: break-word;
        }
        .users-confirm-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        .users-status::before {
          content: '';
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
          flex-shrink: 0;
        }
        .users-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 14px;
        }
        .users-page-info {
          font-size: var(--text-sm);
          color: var(--text-secondary);
          font-variant-numeric: tabular-nums;
        }
        .reg-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 10px;
          margin-top: 4px;
        }
        .reg-tile {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          transition: border-color 0.15s, transform 0.1s;
        }
        .reg-tile:hover { border-color: var(--accent); transform: translateY(-1px); }
        .reg-tile-avatar {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--accent-soft), var(--accent));
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          box-shadow: 0 2px 6px rgba(43, 36, 32, 0.15);
        }
        .reg-tile-main {
          min-width: 0;
          flex: 1;
        }
        .reg-tile-name {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .reg-tile-email {
          font-family: ui-monospace, monospace;
          font-size: 12px;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-top: 1px;
        }
        .reg-tile-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 5px;
        }
        .reg-tile-time {
          color: var(--text-muted);
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          font-size: 11px;
        }
        @media (max-width: 640px) {
          .users-stats { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  )
}
