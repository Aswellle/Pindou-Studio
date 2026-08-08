import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../services/supabase'
import LoadingScreen from './LoadingScreen'

/**
 * 用户管理面板(管理员只读仪表盘)
 * 合规:仅展示注册元数据(邮箱/昵称/角色/验证状态/注册时间),
 * 不包含密码等敏感字段,不收集行为数据;数据经云端 RPC
 * (security definer + is_admin 校验)获取,普通用户调用被拒。
 */
const PAGE_SIZE = 20

export default function UserManager() {
  const { t } = useTranslation()
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadStats = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('admin_user_stats')
    if (err) { setError(err.message || String(err)); return } // 此前吞错,统计卡静默显示 '—'
    setStats(data[0] || null)
  }, [])

  const loadUsers = useCallback(async () => {
    setLoading(true)
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
    setLoading(false)
  }, [search, page])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // 搜索防抖:输入过程中不每击键一次 RPC
  useEffect(() => {
    const timer = setTimeout(loadUsers, 300)
    return () => clearTimeout(timer)
  }, [loadUsers])

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
                  <th>{t('admin.users.registeredAt')}</th>
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
                    </td>
                    <td className="users-date">
                      {new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })}
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
        .users-role-badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
        }
        .users-role-badge.admin { background: var(--accent); color: white; }
        .users-role-badge.user { background: var(--bg-tertiary); color: var(--text-secondary); }
        .users-status {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
        }
        .users-status.ok { color: var(--success); }
        .users-status.warn { color: var(--warning); }
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
        @media (max-width: 640px) {
          .users-stats { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  )
}
