/**
 * GalleryPage — Gallery V2 壳组件
 *
 * 目标：从「分类器」升级为「内容发现中心」
 * 首页显示：精选、热门、最新、主题、合集、分类
 *
 * 当前阶段：壳组件 + 占位 section，后续阶段逐步迁移
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TEMPLATES, CATEGORIES, extractPatternColors } from '../../data/templates'
import { useCustomTemplates } from '../../hooks/useCustomTemplates'

/**
 * GalleryPage 壳组件
 *
 * @param {Object} props
 * @param {Array} props.templates - 模板列表（云端或本地）
 * @param {Function} props.onLoadTemplate - 加载模板回调
 * @param {Function} props.onLogin - 登录回调
 * @param {Function} props.onRegister - 注册回调
 */
export default function GalleryPage({ templates = [], onLoadTemplate, onLogin, onRegister }) {
  const { t } = useTranslation()
  const localStore = useCustomTemplates()

  // 筛选状态
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedDifficulty, setSelectedDifficulty] = useState('all')

  // 过滤后的模板
  const filtered = useMemo(() => {
    let result = templates
    if (selectedCategory !== 'all') {
      result = result.filter(t => t.category === selectedCategory)
    }
    if (selectedDifficulty !== 'all') {
      result = result.filter(t => t.difficulty === selectedDifficulty)
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      result = result.filter(t =>
        (t.name || t.nameZh || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [templates, selectedCategory, selectedDifficulty, searchTerm])

  // 分类选项
  const categoryOptions = useMemo(() => {
    const cats = new Set([...CATEGORIES, ...localStore.categories.map(c => c.id)])
    return Array.from(cats)
  }, [localStore.categories])

  return (
    <div className="gallery-v2">
      {/* Hero 区域 */}
      <section className="gallery-hero">
        <h2>{t('gallery.discover', '发现拼豆图案')}</h2>
        <p>{t('gallery.discoverDesc', '浏览精选模板，一键载入画布开始创作')}</p>
      </section>

      {/* 搜索栏 */}
      <div className="gallery-search-bar">
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder={t('gallery.searchPlaceholder', '搜索模板...')}
          className="gallery-search-input"
        />
      </div>

      {/* 分类快捷入口 */}
      <div className="gallery-quick-cats">
        <button
          className={selectedCategory === 'all' ? 'active' : ''}
          onClick={() => setSelectedCategory('all')}
        >
          {t('gallery.all', '全部')}
        </button>
        {categoryOptions.map(cat => (
          <button
            key={cat}
            className={selectedCategory === cat ? 'active' : ''}
            onClick={() => setSelectedCategory(cat)}
          >
            {t(`gallery.categories.${cat}`, cat)}
          </button>
        ))}
      </div>

      {/* 难度筛选 */}
      <div className="gallery-difficulty-filter">
        <select
          value={selectedDifficulty}
          onChange={e => setSelectedDifficulty(e.target.value)}
        >
          <option value="all">{t('gallery.allDifficulties', '全部难度')}</option>
          <option value="easy">{t('gallery.easy', '简单')}</option>
          <option value="medium">{t('gallery.medium', '中等')}</option>
          <option value="hard">{t('gallery.hard', '困难')}</option>
        </select>
      </div>

      {/* 模板网格 */}
      <div className="gallery-grid">
        {filtered.map(template => (
          <div key={template.id} className="gallery-card" onClick={() => onLoadTemplate(template.pattern, template.size || template.gridSize)}>
            <div className="gallery-card-preview">
              {/* 占位：后续阶段添加 ThumbnailCanvas */}
              <div className="gallery-card-dots">
                {extractPatternColors(template.pattern).slice(0, 5).map((color, i) => (
                  <span key={i} className="color-dot" style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
            <div className="gallery-card-info">
              <h3>{template.name || template.nameZh}</h3>
              <span className="gallery-card-size">{template.size || template.gridSize}×{template.size || template.gridSize}</span>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="gallery-empty">
          <p>{t('gallery.noResults', '没有找到匹配的模板')}</p>
        </div>
      )}
    </div>
  )
}
