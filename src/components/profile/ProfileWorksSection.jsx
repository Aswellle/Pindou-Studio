/**
 * ProfileWorksSection — 个人中心「我的作品」分区。
 *
 * 从图库整块搬来(原 GalleryPage 的 view === 'works' 分支),并按个人中心的
 * 视觉语言重做:卡片网格 + 缩略图 + 载入/历史/删除。
 *
 * 与图库时期的三点不同:
 *   · 不再有「视图页签」概念 —— 个人中心本身就是入口,不需要再切一次;
 *   · 匿名用户的「注册软引导」换成个人中心语气:本页只有登录用户可达,
 *     所以那条横幅只在「本机有作品但尚未同步」时出现,措辞改为同步提醒;
 *   · 删除走二次确认 —— 图库里误删还能重新找模板,自己的作品删了就是删了。
 *
 * 数据仍由 App 持有的 useSavedWorks 提供(不在此新建实例),保证与画布
 * 保存链路是同一份状态。
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutGrid, RefreshCw, Search } from 'lucide-react'
import WorkThumbnail from '../../features/gallery/components/WorkThumbnail'
import { useDialogA11y } from '../../hooks/useDialogA11y'
import { useScrollLock } from '../../hooks/useScrollLock'

/** 来源类别 → i18n 后缀;旧作品没有该字段时不显示徽标 */
const SOURCE_KINDS = ['blank', 'photo-quantized', 'chart-import', 'native-file', 'gallery-copy']

export default function ProfileWorksSection({
  works = [],
  worksLoading,
  worksError,
  onRetry,
  onLoadWork,
  onDeleteWork,
  onShowVersions,
  cloudMirrorCount = 0,
  onOpenGallery,
}) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)

  useScrollLock(!!pendingDelete)
  const { ref: confirmRef, dialogProps: confirmDialogProps } = useDialogA11y({
    open: !!pendingDelete,
    onClose: () => setPendingDelete(null),
    label: t('profile.center.deleteWorkTitle'),
    role: 'alertdialog',
  })

  const loading = worksLoading || !!worksError
  const list = Array.isArray(works) ? works : []

  // 搜索只匹配名称:作品没有标签体系,按尺寸/日期搜出来的结果用户也看不懂
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return list
    return list.filter((w) => String(w?.name || '').toLowerCase().includes(term))
  }, [list, query])

  const formatDate = (value) => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    try {
      return d.toLocaleDateString(i18n.language, { year: 'numeric', month: '2-digit', day: '2-digit' })
    } catch {
      return String(value).slice(0, 10)
    }
  }

  const confirmDelete = async () => {
    const work = pendingDelete
    setPendingDelete(null)
    if (work && onDeleteWork) await onDeleteWork(work)
  }

  return (
    <div className="pf-section-stack">
      <section className="pf-card">
        <div className="pf-card-head">
          <h3>
            <LayoutGrid size={16} aria-hidden="true" />
            {t('profile.center.sectionWorks')}
          </h3>
          {worksError ? (
            <button type="button" className="pf-link-btn" onClick={onRetry}>
              <RefreshCw size={13} aria-hidden="true" />
              {t('profile.center.retry')}
            </button>
          ) : null}
        </div>

        {worksError ? (
          <p className="pf-note pf-note-warn" role="status">
            {t('profile.center.worksDegraded')}
          </p>
        ) : null}

        {/* 本机作品未同步提醒:登录后由 useSavedWorks 一次性迁移,迁移完成即消失 */}
        {!worksError && list.length > 0 && cloudMirrorCount > 0 && cloudMirrorCount !== list.length ? (
          <p className="pf-note" role="status">
            {t('profile.center.worksSyncHint', { n: cloudMirrorCount })}
          </p>
        ) : null}

        {list.length > 0 ? (
          <div className="pf-works-toolbar">
            <label className="pf-search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('profile.center.worksSearch')}
                aria-label={t('profile.center.worksSearch')}
              />
            </label>
            <span className="pf-works-count">
              {t('profile.center.worksCount', { n: filtered.length })}
            </span>
          </div>
        ) : null}

        {loading ? (
          <div className="pf-works-skeleton" aria-hidden="true">
            {[0, 1, 2].map((i) => <span key={i} className="pf-works-skeleton-card" />)}
          </div>
        ) : list.length === 0 ? (
          <div className="pf-empty">
            <LayoutGrid size={32} aria-hidden="true" />
            <p>{t('profile.center.noWorks')}</p>
            {onOpenGallery ? (
              <button type="button" className="pf-btn ghost" onClick={onOpenGallery}>
                {t('profile.center.browseGallery')}
              </button>
            ) : null}
          </div>
        ) : filtered.length === 0 ? (
          <div className="pf-empty">
            <Search size={28} aria-hidden="true" />
            <p>{t('profile.center.worksNoMatch')}</p>
            <button type="button" className="pf-btn ghost" onClick={() => setQuery('')}>
              {t('profile.center.worksClearSearch')}
            </button>
          </div>
        ) : (
          <ul className="pf-works-grid">
            {filtered.map((work, index) => {
              const w = work.gridWidth || work.gridSize
              const h = work.gridHeight || work.gridSize
              const name = work.name || `${t('gallery.workName')} ${index + 1}`
              const date = formatDate(work.savedAt)
              return (
                <li key={work.id ?? index} className="pf-work-card">
                  <div className="pf-work-thumb">
                    <WorkThumbnail work={work} />
                  </div>
                  <div className="pf-work-body">
                    <span className="pf-work-name" title={name}>{name}</span>
                    <span className="pf-work-meta">
                      {w && h ? `${w} × ${h}` : ''}
                      {date ? <span className="pf-work-date">{date}</span> : null}
                    </span>
                    {work.sourceKind && SOURCE_KINDS.includes(work.sourceKind) ? (
                      <span className={`pf-work-source source-${work.sourceKind}`}>
                        {t(`gallery.workSource.${work.sourceKind}`, '')}
                      </span>
                    ) : null}
                  </div>
                  <div className="pf-work-actions">
                    <button
                      type="button"
                      className="pf-btn primary sm"
                      onClick={() => onLoadWork?.(work)}
                    >
                      {t('profile.center.workOpen')}
                    </button>
                    {onShowVersions ? (
                      <button
                        type="button"
                        className="pf-btn ghost sm"
                        onClick={() => onShowVersions(work)}
                      >
                        {t('versions.open')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="pf-btn danger sm"
                      onClick={() => setPendingDelete(work)}
                    >
                      {t('profile.center.workDelete')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {pendingDelete ? (
        <div className="profile-confirm-overlay" onClick={() => setPendingDelete(null)}>
          <div className="modal-content confirm-box" ref={confirmRef} {...confirmDialogProps} onClick={(e) => e.stopPropagation()}>
            <h3>{t('profile.center.deleteWorkTitle')}</h3>
            <p>
              {t('profile.center.deleteWorkBody', {
                name: pendingDelete.name || t('gallery.workName'),
              })}
            </p>
            <div className="confirm-actions">
              <button type="button" className="pf-btn ghost" onClick={() => setPendingDelete(null)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="pf-btn danger" onClick={confirmDelete}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
