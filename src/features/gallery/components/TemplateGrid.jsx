/**
 * TemplateGrid — 主题页 / 合集页共用的模板网格。
 *
 * 与首页卡片保持同一视觉语言(缩略图 + 名称 + 尺寸/难度),
 * 但点击行为由调用方决定(主题页进详情,不直接载入画布)。
 */

import { useTranslation } from 'react-i18next'
import ThumbnailCanvas from '../../../components/ThumbnailCanvas'
import { templateDimensions } from '../../../data/templates'

export default function TemplateGrid({ templates = [], emptyText, onOpen }) {
  const { t } = useTranslation()

  if (!templates || templates.length === 0) {
    return <p className="content-empty">{emptyText || t('gallery.noResults')}</p>
  }

  return (
    <div className="templates-grid">
      {templates.map((template) => {
        const { width, height } = templateDimensions(template)
        const name = template.name
          ? (template.nameZh || template.name)
          : t(`templates.names.${template.nameKey}`, template.nameKey)
        return (
          <button
            key={template.id}
            className="template-card template-card-button"
            onClick={() => onOpen?.(template)}
            aria-label={name}
          >
            <div className="template-thumbnail">
              <ThumbnailCanvas
                pattern={template.pattern}
                size={template.size}
                gridWidth={width}
                gridHeight={height}
              />
            </div>
            <div className="template-info">
              <h3 className="template-name">{name}</h3>
              <div className="template-meta">
                <span className="template-size">{width} x {height}</span>
                <span
                  className="template-difficulty"
                  style={{ '--diff-color': difficultyColor(template.difficulty) }}
                >
                  {t(`gallery.difficulties.${template.difficulty}`, template.difficulty)}
                </span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** 与 GalleryPage.getDifficultyColor 保持一致(不引入第二套配色) */
function difficultyColor(difficulty) {
  switch (difficulty) {
    case 'easy': return 'var(--secondary-accent)'
    case 'medium': return 'var(--warning)'
    case 'hard': return 'var(--error)'
    default: return 'var(--text-muted)'
  }
}
