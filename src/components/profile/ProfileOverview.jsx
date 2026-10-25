/**
 * ProfileOverview — 个人中心「概览」分区。
 *
 * 只读 + 导航:身份摘要、四项资产统计、最近作品、快捷入口、存储边界说明。
 * 不复制图库或库存的 CRUD —— 那些留在 /gallery 与 /my/beads。
 *
 * 数据口径全部来自 profileSummary(纯函数),这里只负责呈现:
 *   · summary.xxxCount === null → 骨架,不是 0;
 *   · worksDegraded / beadsError → 明确的降级/错误说明,不是「暂无资产」。
 */

import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowRight, Cloud, HardDrive, RefreshCw, LayoutGrid, Palette, Heart } from 'lucide-react'
import { accountIdentity, displayNameOf } from '../../utils/normalizeAuthUser'
import { inventoryQuantityState } from './profileSummary'
import Avatar from '../Avatar'

/** 统计卡:数值为 null 时显示骨架条,避免「加载中」被读成 0 */
function StatCard({ label, value, hint, loading }) {
  return (
    <div className={`pf-stat${loading ? ' is-loading' : ''}`}>
      <span className="pf-stat-value">
        {loading || value === null ? <span className="pf-stat-skeleton" aria-hidden="true" /> : value}
      </span>
      <span className="pf-stat-label">{label}</span>
      {hint ? <span className="pf-stat-hint">{hint}</span> : null}
    </div>
  )
}

/** 日期只到「日」,不显示时分秒 —— 概览不需要精确到秒 */
function formatDate(value, lang) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return d.toLocaleDateString(lang, { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

export default function ProfileOverview({ user, summary, onRetryWorks, onRetryBeads, onGotoSection }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language

  const identity = accountIdentity(user)
  const isUsernameAccount = user.authType === 'username'

  const inventoryState = inventoryQuantityState(summary)

  // 库存数量的完整表述:条目数 + 已知总量 + 未知条目,三者口径不同不能合并成一句
  const inventoryHint = (() => {
    if (summary.inventoryEntriesCount === null) return ''
    if (inventoryState === 'empty') return ''
    const parts = [t('profile.center.knownQty', { n: summary.knownQuantityTotal ?? 0 })]
    if (summary.unknownQuantityEntriesCount > 0) {
      parts.push(t('profile.center.unknownQty', { n: summary.unknownQuantityEntriesCount }))
    }
    return parts.join(' · ')
  })()

  return (
    <div className="pf-section-stack">
      {/* ── 身份摘要 ─────────────────────────────────────────── */}
      <section className="pf-card pf-identity-summary">
        <div className="pf-identity-avatar">
          <Avatar user={user} size={72} />
        </div>
        <div className="pf-identity-text">
          <h2 className="pf-identity-name" title={displayNameOf(user)}>
            {displayNameOf(user)}
          </h2>
          <p className="pf-identity-account" title={identity}>
            {identity}
          </p>
          <div className="pf-identity-tags">
            <span className="pf-tag">
              {isUsernameAccount ? t('profile.accountUsername') : t('profile.accountEmail')}
            </span>
            {user.createdAt ? (
              <span className="pf-tag pf-tag-plain">
                {t('profile.center.joinedAt', { date: formatDate(user.createdAt, lang) })}
              </span>
            ) : null}
            {!isUsernameAccount && user.emailConfirmedAt ? (
              <span className="pf-tag pf-tag-ok">{t('profile.center.emailVerified')}</span>
            ) : null}
            {!isUsernameAccount && !user.emailConfirmedAt ? (
              <span className="pf-tag pf-tag-warn">{t('profile.center.emailUnverified')}</span>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── 资产统计 ─────────────────────────────────────────── */}
      <section className="pf-card">
        <div className="pf-card-head">
          <h3>{t('profile.center.assetsTitle')}</h3>
          {summary.worksDegraded ? (
            <button type="button" className="pf-link-btn" onClick={onRetryWorks}>
              <RefreshCw size={13} aria-hidden="true" />
              {t('profile.center.retry')}
            </button>
          ) : null}
          {summary.beadsError ? (
            <button type="button" className="pf-link-btn" onClick={onRetryBeads}>
              <RefreshCw size={13} aria-hidden="true" />
              {t('profile.center.retry')}
            </button>
          ) : null}
        </div>

        {summary.worksDegraded ? (
          <p className="pf-note pf-note-warn" role="status">
            {t('profile.center.worksDegraded')}
          </p>
        ) : null}
        {summary.beadsError ? (
          <p className="pf-note pf-note-error" role="status">
            {t('profile.center.beadsFailed')}
          </p>
        ) : null}

        <div className="pf-stats">
          <StatCard
            label={t('profile.center.statWorks')}
            value={summary.worksCount}
            loading={summary.worksLoading || summary.worksDegraded}
          />
          <StatCard
            label={t('profile.center.statPalettes')}
            value={summary.palettesCount}
            loading={summary.beadsLoading || !!summary.beadsError}
          />
          <StatCard
            label={t('profile.center.statColors')}
            value={summary.colorsCount}
            loading={summary.beadsLoading || !!summary.beadsError}
          />
          <StatCard
            label={t('profile.center.statInventory')}
            value={summary.inventoryEntriesCount}
            hint={inventoryHint}
            loading={summary.beadsLoading || !!summary.beadsError}
          />
        </div>

        {summary.pendingLocalCount > 0 ? (
          <div className="pf-pending-local" role="status">
            <span>{t('profile.center.pendingLocal', { n: summary.pendingLocalCount })}</span>
            <Link className="pf-link-btn" to="/my/beads">
              {t('profile.center.goImport')}
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        ) : null}

        <div className="pf-storage-row">
          <span className={`pf-storage ${summary.beadMode === 'cloud' ? 'cloud' : 'local'}`}>
            {summary.beadMode === 'cloud' ? (
              <Cloud size={13} aria-hidden="true" />
            ) : (
              <HardDrive size={13} aria-hidden="true" />
            )}
            {summary.beadMode === 'cloud' ? t('profile.center.beadsCloud') : t('profile.center.beadsLocal')}
          </span>
        </div>
      </section>

      {/* ── 最近作品 ─────────────────────────────────────────── */}
      <section className="pf-card">
        <div className="pf-card-head">
          <h3>{t('profile.center.recentWorks')}</h3>
        </div>
        {summary.worksLoading ? (
          <p className="pf-note">{t('common.loading')}</p>
        ) : summary.recentWorks.length === 0 ? (
          <p className="pf-note">{t('profile.center.noWorks')}</p>
        ) : (
          <ul className="pf-recent-list">
            {summary.recentWorks.map((work, index) => (
              <li key={work.id ?? index} className="pf-recent-item">
                <span className="pf-recent-name" title={work.name}>
                  {work.name || t('gallery.workName')}
                </span>
                {work.width && work.height ? (
                  <span className="pf-recent-meta">
                    {work.width} × {work.height}
                  </span>
                ) : null}
                {work.savedAt ? (
                  <span className="pf-recent-date">{formatDate(work.savedAt, lang)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 快捷入口 ─────────────────────────────────────────── */}
      <section className="pf-card">
        <div className="pf-card-head">
          <h3>{t('profile.center.shortcuts')}</h3>
        </div>
        <div className="pf-shortcuts">
          {/* 作品与收藏已搬进本页,入口改为切分区,不再跳出到图库 */}
          <button type="button" className="pf-shortcut" onClick={() => onGotoSection?.('works')}>
            <LayoutGrid size={18} aria-hidden="true" />
            <span className="pf-shortcut-text">
              <strong>{t('profile.center.manageWorks')}</strong>
              <small>{t('profile.center.manageWorksHint')}</small>
            </span>
            <ArrowRight size={15} aria-hidden="true" />
          </button>
          <button type="button" className="pf-shortcut" onClick={() => onGotoSection?.('favorites')}>
            <Heart size={18} aria-hidden="true" />
            <span className="pf-shortcut-text">
              <strong>{t('profile.center.manageFavorites')}</strong>
              <small>{t('profile.center.manageFavoritesHint')}</small>
            </span>
            <ArrowRight size={15} aria-hidden="true" />
          </button>
          <Link className="pf-shortcut" to="/my/beads">
            <Palette size={18} aria-hidden="true" />
            <span className="pf-shortcut-text">
              <strong>{t('profile.center.manageBeads')}</strong>
              <small>{t('profile.center.manageBeadsHint')}</small>
            </span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  )
}
