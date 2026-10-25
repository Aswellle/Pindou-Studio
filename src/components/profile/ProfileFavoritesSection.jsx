/**
 * ProfileFavoritesSection — 个人中心「我的收藏」分区。
 *
 * 收藏本身只是模板 id 的列表(localStorage),要展示必须把 id 解析回模板。
 * 这里复用图库同一套来源选择(useGalleryTemplates):云端启用时用云端模板,
 * 未配置或拉取失败时回退「自定义 + 内置」,与图库看到的完全一致 ——
 * 否则会出现「图库里收藏了,个人中心显示不出来」。
 *
 * 动作只保留两件:
 *   · 载入到画布 —— 收藏的目的就是「以后要用它」;
 *   · 取消收藏 —— 就地移除,不必回图库找那张卡。
 * 导出与品牌转换仍留在图库卡片上:那两件需要品牌/格式菜单,是「用模板」
 * 的动作,不是「管理收藏」的动作,塞进收藏列表只会让每个条目变重。
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart, Search, LayoutGrid } from 'lucide-react'
import ThumbnailCanvas from '../ThumbnailCanvas'
import { templateDimensions, extractPatternColors } from '../../data/templates'
import { useGalleryTemplates } from '../../features/gallery/hooks/useGalleryTemplates'

const MAX_VISIBLE_DOTS = 6

function ColorDots({ pattern }) {
  const colors = extractPatternColors(pattern)
  const visible = colors.slice(0, MAX_VISIBLE_DOTS)
  const extra = colors.length - visible.length
  return (
    <>
      {visible.map((color, i) => (
        <span key={i} className="pf-color-dot" style={{ backgroundColor: color }} title={color} />
      ))}
      {extra > 0 && <span className="pf-color-dot-more">+{extra}</span>}
    </>
  )
}

export default function ProfileFavoritesSection({
  cloudStore,
  favorites,
  isFavorite,
  removeFavorite,
  onLoadTemplate,
  onOpenGallery,
}) {
  const { t } = useTranslation()
  const { cloudEnabled, cloudDown, allTemplates } = useGalleryTemplates(cloudStore)

  // 收藏 id 可能是数字(内置模板)或 uuid(云端模板),统一按 String 比较
  const favoriteTemplates = useMemo(() => {
    const wanted = new Set(favorites.map((id) => String(id)))
    return allTemplates.filter((tpl) => wanted.has(String(tpl.id)))
  }, [allTemplates, favorites])

  // 收藏了但已下架的模板:数量不为 0 时如实告知,而不是让数字悄悄对不上
  const missingCount = Math.max(0, favorites.length - favoriteTemplates.length)
  const loading = cloudEnabled && !cloudDown && !!cloudStore?.loading

  const difficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'easy': return 'var(--secondary-accent)'
      case 'medium': return 'var(--warning)'
      case 'hard': return 'var(--error)'
      default: return 'var(--text-muted)'
    }
  }

  const displayName = (tpl) =>
    tpl.name
      ? (tpl.nameZh || tpl.name)
      : t(`templates.names.${tpl.nameKey}`, tpl.nameKey)

  const handleLoad = (tpl) => {
    const { width, height } = templateDimensions(tpl)
    const options = {}
    if (tpl.paletteId) options.palette = tpl.paletteId
    if (width !== height) {
      options.gridWidth = width
      options.gridHeight = height
    }
    onLoadTemplate?.(
      tpl.pattern,
      Math.max(width, height),
      Object.keys(options).length > 0 ? options : undefined,
    )
  }

  return (
    <div className="pf-section-stack">
      <section className="pf-card">
        <div className="pf-card-head">
          <h3>
            <Heart size={16} aria-hidden="true" />
            {t('profile.center.sectionFavorites')}
          </h3>
          {favoriteTemplates.length > 0 ? (
            <span className="pf-works-count">
              {t('profile.center.favoritesCount', { n: favoriteTemplates.length })}
            </span>
          ) : null}
        </div>

        {missingCount > 0 ? (
          <p className="pf-note pf-note-warn" role="status">
            {t('profile.center.favoritesMissing', { n: missingCount })}
          </p>
        ) : null}

        {loading ? (
          <div className="pf-works-skeleton" aria-hidden="true">
            {[0, 1, 2].map((i) => <span key={i} className="pf-works-skeleton-card" />)}
          </div>
        ) : favoriteTemplates.length === 0 ? (
          <div className="pf-empty">
            <Heart size={32} aria-hidden="true" />
            <p>{t('profile.center.noFavorites')}</p>
            <span className="pf-empty-hint">{t('profile.center.noFavoritesHint')}</span>
            {onOpenGallery ? (
              <button type="button" className="pf-btn ghost" onClick={onOpenGallery}>
                {t('profile.center.browseGallery')}
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="pf-fav-grid">
            {favoriteTemplates.map((tpl) => {
              const { width, height } = templateDimensions(tpl)
              const name = displayName(tpl)
              return (
                <li key={tpl.id} className="pf-fav-card">
                  <button
                    type="button"
                    className="pf-fav-thumb"
                    onClick={() => handleLoad(tpl)}
                    title={t('profile.center.favoriteOpen')}
                    aria-label={`${name} — ${t('profile.center.favoriteOpen')}`}
                  >
                    <ThumbnailCanvas
                      pattern={tpl.pattern}
                      size={tpl.size}
                      gridWidth={width}
                      gridHeight={height}
                    />
                  </button>
                  <div className="pf-fav-body">
                    <span className="pf-fav-name" title={name}>{name}</span>
                    <span className="pf-fav-meta">
                      <span className="pf-fav-size">{width} × {height}</span>
                      {tpl.difficulty ? (
                        <span
                          className="pf-fav-difficulty"
                          style={{ '--diff-color': difficultyColor(tpl.difficulty) }}
                        >
                          {t(`gallery.difficulties.${tpl.difficulty}`)}
                        </span>
                      ) : null}
                    </span>
                    <span className="pf-fav-colors">
                      <ColorDots pattern={tpl.pattern} />
                    </span>
                  </div>
                  <div className="pf-fav-actions">
                    <button
                      type="button"
                      className="pf-btn primary sm"
                      onClick={() => handleLoad(tpl)}
                    >
                      {t('profile.center.favoriteOpen')}
                    </button>
                    <button
                      type="button"
                      className="pf-btn ghost sm"
                      onClick={() => removeFavorite(tpl.id)}
                      aria-pressed={isFavorite(tpl.id)}
                    >
                      {t('profile.center.favoriteRemove')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {favoriteTemplates.length > 0 && onOpenGallery ? (
          <button type="button" className="pf-inline-link as-button" onClick={onOpenGallery}>
            <LayoutGrid size={13} aria-hidden="true" />
            {t('profile.center.favoritesBrowseMore')}
          </button>
        ) : null}
      </section>
    </div>
  )
}
