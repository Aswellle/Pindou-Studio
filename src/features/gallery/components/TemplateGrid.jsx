/**
 * TemplateGrid — 主题页 / 合集页共用的模板网格。
 *
 * 与首页卡片保持同一视觉语言(缩略图 + 名称 + 尺寸/难度),
 * 但点击行为由调用方决定(主题页进详情,不直接载入画布)。
 */

import { useTranslation } from 'react-i18next'
import ThumbnailCanvas from '../../../components/ThumbnailCanvas'
import { templateDimensions, extractPatternColors } from '../../../data/templates'

const MAX_VISIBLE_DOTS = 7

/** 色点:与图库首页卡片同一套展示规则(最多 7 个,其余折叠为 +N) */
function ColorDots({ pattern }) {
  const colors = extractPatternColors(pattern)
  const visible = colors.slice(0, MAX_VISIBLE_DOTS)
  const extra = colors.length - visible.length
  return (
    <>
      {visible.map((color, i) => (
        <span key={i} className="color-dot" style={{ backgroundColor: color }} title={color} />
      ))}
      {extra > 0 && <span className="color-dot-more" title={`+${extra}`}>+{extra}</span>}
    </>
  )
}

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
              {/* 分类行:图库首页卡片有,这里之前缺 —— 同一张卡在两处信息量不同,
                  卡片高度也差 17px(75 vs 92 的信息区)。 */}
              <span className="template-category">
                {t(`gallery.categories.${template.category}`, template.category)}
              </span>
            </div>
            {/* 页脚:与图库首页卡片对齐(色点 + 用色数)。
                主题页/合集页不放导出按钮(那是「载入画布」语义的入口),
                但保留色点,让用户在这里也能判断用色多少。 */}
            <div className="template-footer">
              <div className="template-colors">
                <ColorDots pattern={template.pattern} />
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
