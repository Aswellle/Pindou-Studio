import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { TUTORIALS, getAllTutorials } from '../data/tutorials'

// Inline SVG 图示，不引入图片文件
const SVG_DIAGRAMS = {
  'ironing-motion': (
    <svg width="280" height="180" viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="280" height="180" rx="12" fill="#f5f5f5"/>
      {/* pegboard dots */}
      {Array.from({length: 6}).map((_, i) =>
        Array.from({length: 9}).map((_, j) => (
          <circle key={`${i}-${j}`} cx={28 + j*28} cy={28 + i*28} r={5} fill="#e0e0e0"/>
        ))
      )}
      {/* concentric arcs */}
      <path d="M80 120 Q140 40 200 120" stroke="#1976D2" strokeWidth="3" fill="none" strokeDasharray="6 4"/>
      <path d="M60 120 Q140 10 220 120" stroke="#1976D2" strokeWidth="2" fill="none" strokeDasharray="6 4" opacity="0.5"/>
      <path d="M40 120 Q140 -20 240 120" stroke="#1976D2" strokeWidth="1.5" fill="none" strokeDasharray="6 4" opacity="0.25"/>
      <polygon points="200,116 210,120 202,124" fill="#1976D2"/>
      <polygon points="220,116 230,120 222,124" fill="#1976D2" opacity="0.5"/>
      {/* iron */}
      <rect x="100" y="130" width="80" height="36" rx="8" fill="#607D8B"/>
      <rect x="140" y="130" width="45" height="36" rx="4" fill="#78909C"/>
      <rect x="100" y="133" width="80" height="5" rx="2.5" fill="#90A4AE"/>
      <text x="140" y="174" textAnchor="middle" fontSize="11" fill="#9E9E9E">画圆弧熨烫，从中心向外</text>
    </svg>
  ),
  'pressing-stack': (
    <svg width="280" height="180" viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="280" height="180" rx="12" fill="#f5f5f5"/>
      {/* bead pattern board */}
      <rect x="60" y="40" width="160" height="100" rx="8" fill="#FFECB3" stroke="#FFC107" strokeWidth="2"/>
      {/* books stacked */}
      <rect x="50" y="90" width="180" height="16" rx="3" fill="#8D6E63"/>
      <rect x="50" y="106" width="180" height="16" rx="3" fill="#795548"/>
      <rect x="50" y="122" width="180" height="16" rx="3" fill="#6D4C41"/>
      {/* arrows down */}
      <path d="M100 30 L100 38" stroke="#E53935" strokeWidth="3"/>
      <polygon points="96,38 104,38 100,45" fill="#E53935"/>
      <path d="M140 30 L140 38" stroke="#E53935" strokeWidth="3"/>
      <polygon points="136,38 144,38 140,45" fill="#E53935"/>
      <path d="M180 30 L180 38" stroke="#E53935" strokeWidth="3"/>
      <polygon points="176,38 184,38 180,45" fill="#E53935"/>
      <text x="140" y="158" textAnchor="middle" fontSize="11" fill="#9E9E9E">书本压住，冷却 ≥30 分钟</text>
    </svg>
  ),
}

// 富文本 block 渲染器
function BlockRenderer({ blocks = [] }) {
  if (!blocks || blocks.length === 0) return null
  return (
    <div className="block-renderer">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'paragraph':
            return <p key={i} className="block-paragraph">{block.text}</p>
          case 'heading2':
            return <h2 key={i} className="block-h2">{block.text}</h2>
          case 'heading3':
            return <h3 key={i} className="block-h3">{block.text}</h3>
          case 'callout': {
            const variantColors = {
              tip:     { bg: '#E8F5E9', border: '#4CAF50', title: '#2E7D32' },
              warning:  { bg: '#FFF8E1', border: '#FFC107', title: '#F57F17' },
              danger:   { bg: '#FFEBEE', border: '#E53935', title: '#C62828' },
              info:     { bg: '#E3F2FD', border: '#1976D2', title: '#1565C0' },
            }
            const c = variantColors[block.variant] || variantColors.info
            return (
              <div key={i} className="block-callout" style={{ background: c.bg, borderLeft: `4px solid ${c.border}` }}>
                {block.title && <div className="callout-title" style={{ color: c.title }}>{block.title}</div>}
                <div className="callout-text">{block.text}</div>
              </div>
            )
          }
          case 'bulletList':
            return (
              <ul key={i} className="block-bullet-list">
                {block.items.map((item, j) => <li key={j}>{item}</li>)}
              </ul>
            )
          case 'numberedList':
            return (
              <ol key={i} className="block-numbered-list">
                {block.items.map((item, j) => <li key={j}>{item}</li>)}
              </ol>
            )
          case 'table':
            return (
              <div key={i} className="block-table-wrap">
                <table className="block-table">
                  <thead>
                    <tr>{block.headers.map((h, j) => <th key={j}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j}>{row.map((cell, k) => <td key={k}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'divider':
            return <hr key={i} className="block-divider"/>
          case 'svgDiagram': {
            const diagram = SVG_DIAGRAMS[block.id]
            return diagram ? (
              <figure key={i} className="block-svg-diagram">
                {diagram}
                {block.caption && <figcaption className="svg-caption">{block.caption}</figcaption>}
              </figure>
            ) : null
          }
          case 'keyPoint':
            return (
              <div key={i} className="block-key-point">
                <span className="key-point-bar"/>
                <span className="key-point-text">{block.text}</span>
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}

export default function Tutorials() {
  const { t } = useTranslation()
  const [expandedSections, setExpandedSections] = useState(['getting-started'])
  const [selectedTutorial, setSelectedTutorial] = useState(TUTORIALS[0].children[0])
  const [readProgress, setReadProgress] = useState(() => {
    const saved = localStorage.getItem('tutorial-progress')
    return saved ? JSON.parse(saved) : []
  })

  // 初始化选中第一个教程
  useEffect(() => {
    if (!selectedTutorial) {
      setSelectedTutorial(TUTORIALS[0].children[0])
    }
  }, [])

  // 保存阅读进度
  useEffect(() => {
    localStorage.setItem('tutorial-progress', JSON.stringify(readProgress))
  }, [readProgress])

  // 切换章节展开/收起
  const toggleSection = (sectionId) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    )
  }

  // 选中教程
  const selectTutorial = (tutorial) => {
    setSelectedTutorial(tutorial)
    // 标记为已读
    if (!readProgress.includes(tutorial.id)) {
      setReadProgress(prev => [...prev, tutorial.id])
    }
  }

  // 标记全部已读
  const markAllRead = () => {
    const allIds = getAllTutorials().map(t => t.id)
    setReadProgress(allIds)
  }

  // 重置进度
  const resetProgress = () => {
    setReadProgress([])
  }

  // 计算进度百分比
  const totalTutorials = getAllTutorials().length
  const progressPercent = Math.round((readProgress.length / totalTutorials) * 100)

  return (
    <div className="tutorials-page">
      <div className="tutorials-sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">{t('tutorials.title')}</h2>
          <div className="progress-info">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="progress-text">{readProgress.length}/{totalTutorials}</span>
          </div>
          <div className="progress-actions">
            <button className="progress-btn" onClick={markAllRead}>{t('tutorials.markAllRead')}</button>
            <button className="progress-btn reset" onClick={resetProgress}>{t('tutorials.reset')}</button>
          </div>
        </div>

        <nav className="tutorial-nav">
          {TUTORIALS.map(section => (
            <div key={section.id} className="nav-section">
              <button
                className={`section-header ${expandedSections.includes(section.id) ? 'expanded' : ''}`}
                onClick={() => toggleSection(section.id)}
              >
                <span className="section-icon">{section.icon}</span>
                <span className="section-title">{section.title}</span>
                <svg
                  className="chevron"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>

              {expandedSections.includes(section.id) && (
                <div className="section-content">
                  {section.children.map(tutorial => (
                    <button
                      key={tutorial.id}
                      className={`tutorial-link ${selectedTutorial?.id === tutorial.id ? 'active' : ''}`}
                      onClick={() => selectTutorial(tutorial)}
                    >
                      <span className="tutorial-title">{tutorial.title}</span>
                      {readProgress.includes(tutorial.id) && (
                        <svg
                          className="check-icon"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#4CAF50"
                          strokeWidth="2"
                        >
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      <div className="tutorials-content">
        {selectedTutorial ? (
          <>
            <div className="content-header">
              <div className="breadcrumb">
                <span>{TUTORIALS.find(s => s.children.some(c => c.id === selectedTutorial.id))?.title}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
                <span className="current">{selectedTutorial.title}</span>
              </div>
              <h1 className="content-title">{selectedTutorial.title}</h1>
            </div>

            <div className="content-body">
              {selectedTutorial.blocks && selectedTutorial.blocks.length > 0 ? (
                <BlockRenderer blocks={selectedTutorial.blocks} />
              ) : (
                <>
                  {selectedTutorial.content && (
                    <div className="tutorial-content">
                      {selectedTutorial.content.split('\n\n').map((paragraph, index) => (
                        <p key={index} className="block-paragraph">{paragraph}</p>
                      ))}
                    </div>
                  )}
                  {selectedTutorial.steps && selectedTutorial.steps.length > 0 && (
                    <div className="steps-section">
                      <h3 className="steps-title">{t('tutorials.steps')}</h3>
                      <ol className="steps-list">
                        {selectedTutorial.steps.map((step, index) => (
                          <li key={index} className="step-item">
                            <span className="step-number">{index + 1}</span>
                            <span className="step-text">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {selectedTutorial.tips && (
                    <div className="tips-box">
                      <div className="tips-header">{t('tutorials.tips')}</div>
                      <p className="tips-content">{selectedTutorial.tips}</p>
                    </div>
                  )}
                </>
              )}
              <div className="content-footer">
                <NavigationButtons currentTutorial={selectedTutorial} onSelect={selectTutorial} />
              </div>
            </div>
          </>
        ) : (
          <div className="no-selection">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            <p>{t('tutorials.noSelection')}</p>
          </div>
        )}
      </div>

      <style>{`
        .tutorials-page {
          display: flex;
          height: calc(100vh - 80px);
          max-width: 1400px;
          margin: 0 auto;
        }
        .tutorials-sidebar {
          width: 280px;
          flex-shrink: 0;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .sidebar-header {
          padding: 20px;
          border-bottom: 1px solid var(--border-color);
        }
        .sidebar-title {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 12px;
        }
        .progress-info {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .progress-bar {
          flex: 1;
          height: 6px;
          background: var(--bg-tertiary);
          border-radius: 3px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--success);
          border-radius: 3px;
          transition: width 0.3s ease;
        }
        .progress-text {
          font-size: 12px;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .progress-actions {
          display: flex;
          gap: 8px;
        }
        .progress-btn {
          padding: 6px 10px;
          font-size: 11px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          background: var(--bg-primary);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }
        .progress-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .progress-btn.reset {
          color: var(--error);
        }
        .progress-btn.reset:hover {
          border-color: var(--error);
          background: var(--error);
          color: white;
        }
        .tutorial-nav {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }
        .nav-section {
          margin-bottom: 8px;
        }
        .section-header {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border: none;
          border-radius: 6px;
          background: transparent;
          cursor: pointer;
          transition: background 0.2s;
          text-align: left;
        }
        .section-header:hover {
          background: var(--bg-tertiary);
        }
        .section-icon {
          font-size: 16px;
        }
        .section-title {
          flex: 1;
          font-size: 14px;
          font-weight: 600;
        }
        .chevron {
          color: var(--text-muted);
          transition: transform 0.2s;
        }
        .section-header.expanded .chevron {
          transform: rotate(180deg);
        }
        .section-content {
          padding-left: 12px;
        }
        .tutorial-link {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border: none;
          border-radius: 4px;
          background: transparent;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
        }
        .tutorial-link:hover {
          background: var(--bg-tertiary);
        }
        .tutorial-link.active {
          background: var(--accent);
          color: white;
        }
        .tutorial-link.active .check-icon {
          stroke: white;
        }
        .tutorial-title {
          font-size: 13px;
        }
        .check-icon {
          flex-shrink: 0;
        }
        .tutorials-content {
          flex: 1;
          min-width: 0;
          overflow-y: auto;
          padding: 32px 40px;
        }
        .content-header {
          margin-bottom: 32px;
        }
        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--text-muted);
          margin-bottom: 12px;
        }
        .breadcrumb .current {
          color: var(--text-secondary);
        }
        .content-title {
          font-size: 28px;
          font-weight: 600;
        }
        .content-body {
          max-width: 800px;
        }
        .tutorial-content {
          margin-bottom: 32px;
        }
        .tutorial-content p {
          font-size: 15px;
          line-height: 1.8;
          color: var(--text-secondary);
          margin-bottom: 16px;
        }
        .tutorial-content p:last-child {
          margin-bottom: 0;
        }
        .steps-section {
          background: var(--bg-secondary);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
        }
        .steps-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 16px;
          color: var(--text-primary);
        }
        .steps-list {
          list-style: none;
          counter-reset: step;
        }
        .step-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
          counter-increment: step;
        }
        .step-item:last-child {
          margin-bottom: 0;
        }
        .step-number {
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent);
          color: white;
          border-radius: 50%;
          font-size: 12px;
          font-weight: 600;
        }
        .step-text {
          font-size: 14px;
          line-height: 1.6;
          padding-top: 2px;
          color: var(--text-secondary);
        }
        .tips-box {
          background: linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%);
          border-left: 4px solid #1976D2;
          border-radius: 0 8px 8px 0;
          padding: 16px 20px;
          margin-bottom: 24px;
        }
        .tips-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: #1976D2;
          margin-bottom: 8px;
        }
        .tips-content {
          font-size: 14px;
          line-height: 1.6;
          color: #1565C0;
        }
        .image-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px;
          background: var(--bg-secondary);
          border: 2px dashed var(--border-color);
          border-radius: 12px;
          color: var(--text-muted);
          margin-bottom: 24px;
        }
        .image-placeholder span {
          font-size: 13px;
        }
        .content-footer {
          max-width: 800px;
          padding-top: 24px;
          border-top: 1px solid var(--border-color);
          margin-top: 32px;
        }
        .no-selection {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
        }
        .no-selection svg {
          margin-bottom: 16px;
          opacity: 0.5;
        }
        .nav-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border: 2px solid var(--border-color);
          border-radius: 6px;
          background: transparent;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .nav-btn:hover:not(:disabled) {
          border-color: var(--accent);
          color: var(--accent);
        }
        .nav-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .nav-btn-group {
          display: flex;
          justify-content: space-between;
        }
        /* Block Renderer */
        .block-renderer { margin-bottom: 32px; }
        .block-paragraph {
          font-size: 15px; line-height: 1.8;
          color: var(--text-secondary); margin-bottom: 16px;
        }
        .block-h2 {
          font-size: 20px; font-weight: 700;
          color: var(--text-primary); margin: 32px 0 16px;
          padding-left: 12px; border-left: 4px solid var(--accent);
        }
        .block-h3 {
          font-size: 16px; font-weight: 600;
          color: var(--text-primary); margin: 24px 0 12px;
        }
        .block-callout {
          border-radius: 0 8px 8px 0; padding: 14px 18px; margin-bottom: 16px;
        }
        .callout-title { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
        .callout-text { font-size: 14px; line-height: 1.6; color: var(--text-secondary); }
        .block-bullet-list, .block-numbered-list {
          padding-left: 20px; margin-bottom: 16px;
        }
        .block-bullet-list li, .block-numbered-list li {
          font-size: 14px; line-height: 1.7;
          color: var(--text-secondary); margin-bottom: 6px;
        }
        .block-table-wrap {
          overflow-x: auto; margin-bottom: 16px;
          border-radius: 8px; border: 1px solid var(--border-color);
        }
        .block-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .block-table th {
          background: var(--bg-secondary); padding: 10px 14px;
          text-align: left; font-weight: 600;
          color: var(--text-primary); border-bottom: 2px solid var(--border-color);
        }
        .block-table td {
          padding: 9px 14px; color: var(--text-secondary);
          border-bottom: 1px solid var(--border-color);
        }
        .block-table tr:last-child td { border-bottom: none; }
        .block-divider {
          border: none; border-top: 2px solid var(--border-color); margin: 28px 0;
        }
        .block-svg-diagram {
          display: flex; flex-direction: column; align-items: center;
          margin: 24px 0; background: white;
          border-radius: 12px; padding: 16px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.07);
        }
        .svg-caption { font-size: 12px; color: var(--text-muted); margin-top: 8px; text-align: center; }
        .block-key-point {
          display: flex; gap: 12px; align-items: flex-start;
          background: #FFF8E1; border-left: 4px solid #FF8F00;
          border-radius: 0 8px 8px 0; padding: 12px 16px; margin-bottom: 16px;
        }
        .key-point-bar {
          width: 4px; min-height: 20px; background: #FF8F00;
          border-radius: 2px; flex-shrink: 0; margin-top: 2px;
        }
        .key-point-text {
          font-size: 14px; line-height: 1.6;
          color: #E65100; font-weight: 500;
        }
      `}</style>
    </div>
  )
}

// 导航按钮组件
function NavigationButtons({ currentTutorial, onSelect }) {
  const { t } = useTranslation()
  const allTutorials = getAllTutorials()
  const currentIndex = allTutorials.findIndex(t => t.id === currentTutorial?.id)

  const prevTutorial = currentIndex > 0 ? allTutorials[currentIndex - 1] : null
  const nextTutorial = currentIndex < allTutorials.length - 1 ? allTutorials[currentIndex + 1] : null

  return (
    <div className="nav-btn-group">
      <button
        className="nav-btn"
        disabled={!prevTutorial}
        onClick={() => prevTutorial && onSelect(prevTutorial)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5"/>
          <path d="M12 19l-7-7 7-7"/>
        </svg>
        {t('tutorials.prev')}{prevTutorial?.title || t('tutorials.noMore')}
      </button>
      <button
        className="nav-btn"
        disabled={!nextTutorial}
        onClick={() => nextTutorial && onSelect(nextTutorial)}
      >
        {t('tutorials.next')}{nextTutorial?.title || t('tutorials.noMore')}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14"/>
          <path d="M12 5l7 7-7 7"/>
        </svg>
      </button>
    </div>
  )
}
