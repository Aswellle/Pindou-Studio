/**
 * ProfileAssetsSection — 个人中心「我的资产」分区。
 *
 * 三类资产各一张卡:作品 / 个人色卡与颜色 / 库存。
 * 全部消费 App 传入的同源数据,不新建 hook 实例,不复制 canvasData。
 *
 * 存储边界在这里说清楚:
 *   · 作品:登录且云端可用 → 云端;否则本机 IndexedDB。
 *   · 拼豆资产:beadStore.mode === 'cloud' ? 云端 : 本机。
 *   · 收藏 / 教程进度:始终是「此设备」,不跨设备同步。
 */

import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { inventoryQuantityState } from './profileSummary'

function MetricRow({ label, value, hint, loading }) {
  return (
    <div className="pf-metric-row">
      <span className="pf-metric-label">{label}</span>
      <span className="pf-metric-value">
        {loading || value === null ? <span className="pf-stat-skeleton" aria-hidden="true" /> : value}
        {hint ? <small>{hint}</small> : null}
      </span>
    </div>
  )
}

export default function ProfileAssetsSection({ summary, onRetryWorks, onRetryBeads, onGotoSection }) {
  const { t } = useTranslation()

  const worksLoading = summary.worksLoading || summary.worksDegraded
  const beadsLoading = summary.beadsLoading || !!summary.beadsError
  const inventoryState = inventoryQuantityState(summary)

  return (
    <div className="pf-section-stack">
      {/* ── 作品 ─────────────────────────────────────────────── */}
      <section className="pf-card">
        <div className="pf-card-head">
          <h3>{t('profile.center.assetWorks')}</h3>
          {summary.worksDegraded ? (
            <button type="button" className="pf-link-btn" onClick={onRetryWorks}>
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

        <MetricRow label={t('profile.center.statWorks')} value={summary.worksCount} loading={worksLoading} />

        {!worksLoading && summary.recentWorks.length > 0 ? (
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
              </li>
            ))}
          </ul>
        ) : null}

        {!worksLoading && summary.worksCount === 0 ? (
          <p className="pf-note">{t('profile.center.noWorks')}</p>
        ) : null}

        <button
          type="button"
          className="pf-inline-link as-button"
          onClick={() => onGotoSection?.('works')}
        >
          {t('profile.center.openWorks')}
          <ArrowRight size={13} aria-hidden="true" />
        </button>
      </section>

      {/* ── 个人色卡与颜色 ───────────────────────────────────── */}
      <section className="pf-card">
        <div className="pf-card-head">
          <h3>{t('profile.center.assetPalettes')}</h3>
          {summary.beadsError ? (
            <button type="button" className="pf-link-btn" onClick={onRetryBeads}>
              <RefreshCw size={13} aria-hidden="true" />
              {t('profile.center.retry')}
            </button>
          ) : null}
        </div>

        {summary.beadsError ? (
          <p className="pf-note pf-note-error" role="status">
            {t('profile.center.beadsFailed')}
          </p>
        ) : null}

        <MetricRow
          label={t('profile.center.statPalettes')}
          value={summary.palettesCount}
          loading={beadsLoading}
        />
        <MetricRow
          label={t('profile.center.statColors')}
          value={summary.colorsCount}
          loading={beadsLoading}
        />

        {summary.pendingLocalCount > 0 ? (
          <p className="pf-note pf-note-warn" role="status">
            {t('profile.center.pendingLocal', { n: summary.pendingLocalCount })}
          </p>
        ) : null}

        <Link className="pf-inline-link" to="/my/beads">
          {t('profile.center.openBeads')}
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </section>

      {/* ── 库存 ─────────────────────────────────────────────── */}
      <section className="pf-card">
        <div className="pf-card-head">
          <h3>{t('profile.center.assetInventory')}</h3>
        </div>

        <MetricRow
          label={t('profile.center.statInventory')}
          value={summary.inventoryEntriesCount}
          loading={beadsLoading}
        />

        {!beadsLoading && summary.inventoryEntriesCount !== null ? (
          <>
            <MetricRow label={t('profile.center.knownQtyLabel')} value={summary.knownQuantityTotal} />
            <MetricRow
              label={t('profile.center.unknownQtyLabel')}
              value={summary.unknownQuantityEntriesCount}
              hint={
                inventoryState === 'unknown' || inventoryState === 'mixed'
                  ? t('profile.center.unknownQtyHint')
                  : ''
              }
            />
          </>
        ) : null}

        {!beadsLoading && inventoryState === 'empty' ? (
          <p className="pf-note">{t('profile.center.noInventory')}</p>
        ) : null}

        <Link className="pf-inline-link" to="/my/beads">
          {t('profile.center.openInventory')}
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </section>

      {/* ── 存储边界说明 ─────────────────────────────────────── */}
      <section className="pf-card">
        <div className="pf-card-head">
          <h3>{t('profile.center.storageTitle')}</h3>
        </div>
        <dl className="pf-meta-list">
          <div className="pf-meta-row">
            <dt>{t('profile.center.storageWorks')}</dt>
            <dd>
              {summary.worksDegraded
                ? t('profile.center.storageWorksDegraded')
                : summary.beadMode === 'cloud' && summary.worksCount !== null
                  ? t('profile.center.storageCloud')
                  : t('profile.center.storageLocal')}
            </dd>
          </div>
          <div className="pf-meta-row">
            <dt>{t('profile.center.storageBeads')}</dt>
            <dd>
              {summary.beadMode === 'cloud'
                ? t('profile.center.storageCloud')
                : t('profile.center.storageLocal')}
            </dd>
          </div>
          <div className="pf-meta-row">
            <dt>{t('profile.center.storageDevice')}</dt>
            <dd>{t('profile.center.storageDeviceValue')}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
