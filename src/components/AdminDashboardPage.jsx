/**
 * AdminDashboardPage — /admin/dashboard 管理后台首页
 *
 * 从 AdminPanel 的 stats-overview tab 迁移而来。
 * 保留原 AdminPanel Tab 路径不变。
 */

import { useTranslation } from 'react-i18next'

export default function AdminDashboardPage({ cloudStore }) {
  const { t } = useTranslation()

  const templateCount = cloudStore?.templates?.length || 0
  const categoryCount = cloudStore?.categories?.length || 0

  return (
    <div className="admin-dashboard">
      <h2>{t('admin.dashboard', '管理概览')}</h2>
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <span className="admin-stat-value">{templateCount}</span>
          <span className="admin-stat-label">{t('admin.templates', '模板')}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-value">{categoryCount}</span>
          <span className="admin-stat-label">{t('admin.categories', '分类')}</span>
        </div>
      </div>
    </div>
  )
}
