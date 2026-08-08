import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getPalette } from '../data/palettes'

// canvasData 只允许合法 6 位 hex,输入处校验(非法 fillStyle 渲染黑格/污染画布数据)
const HEX_RE = /^#[0-9a-fA-F]{6}$/

export default function ColorPalette({ selectedColor, onColorSelect, collapsed, onToggleCollapse, currentPalette }) {
  const { t } = useTranslation()
  // 与移动端同源:直接读官方品牌色卡(原硬编码 44 色与真实 Perler 色板 0 匹配)
  const palette = getPalette(currentPalette)
  const [hexInput, setHexInput] = useState(selectedColor)

  useEffect(() => { setHexInput(selectedColor) }, [selectedColor])

  // 失焦/回车时校验提交;非法输入回弹为当前色(输入过程中允许自由编辑)
  const commitHex = () => {
    if (HEX_RE.test(hexInput)) onColorSelect(hexInput)
    else setHexInput(selectedColor)
  }

  return (
    <div className={`palette-drawer ${collapsed ? 'collapsed' : ''}`}>
      <button
        className="drawer-toggle right-toggle"
        onClick={onToggleCollapse}
        title={collapsed ? t('palette.expand') : t('palette.collapse')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {collapsed ? (
            <path d="M15 18l-6-6 6-6"/>
          ) : (
            <path d="M9 18l6-6-6-6"/>
          )}
        </svg>
      </button>

      <div className="palette-inner">
        <div className="palette-header">
          <h3 className="palette-title">{t('palette.title2')}</h3>
          <p className="palette-subtitle">{palette.nameZh} · {palette.colorCount}</p>
        </div>

        <div className="palette-scroll">
          <div className="color-grid">
            {palette.colors.map((c) => (
              <button
                key={c.id}
                className={`color-swatch ${selectedColor === c.hex ? 'selected' : ''}${c.id === 'P01' ? ' white' : ''}`}
                style={{ backgroundColor: c.hex }}
                onClick={() => onColorSelect(c.hex)}
                title={`${c.id} · ${c.nameZh}`}
              />
            ))}
          </div>
        </div>

        <div className="current-color">
          <div
            className="color-preview"
            style={{ backgroundColor: selectedColor }}
          />
          <div className="color-info">
            <span className="color-hex">{selectedColor}</span>
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={commitHex}
              onKeyDown={(e) => { if (e.key === 'Enter') commitHex() }}
              className="color-input"
            />
          </div>
        </div>
      </div>

      <style>{`
        .palette-drawer {
          position: relative;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          width: 200px;
          display: flex;
          flex-direction: column;
          transition: width 0.3s ease;
          overflow: hidden;
        }
        .palette-drawer.collapsed {
          width: 56px;
        }
        .palette-drawer.collapsed .palette-inner {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }
        .palette-inner {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          transition: opacity 0.2s ease, visibility 0.2s ease;
        }
        .palette-header {
          flex-shrink: 0;
          padding: 16px 16px 12px;
        }
        .drawer-toggle {
          position: absolute;
          top: 50%;
          left: -12px;
          transform: translateY(-50%);
          width: 24px;
          height: 48px;
          border-radius: 8px 0 0 8px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-right: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          transition: all 0.2s ease;
          color: var(--text-secondary);
        }
        .drawer-toggle:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }
        .drawer-toggle.right-toggle {
          left: -12px;
        }
        .palette-title {
          font-size: var(--text-md);
          font-weight: var(--font-weight-semibold);
          margin-bottom: 4px;
        }
        .collapsed .palette-title,
        .collapsed .palette-subtitle {
          display: none;
        }
        .palette-subtitle {
          font-size: var(--text-xs);
          color: var(--text-muted);
        }
        .palette-scroll {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0 16px;
          min-height: 0;
        }
        .color-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          padding-bottom: 12px;
        }
        .color-swatch {
          aspect-ratio: 1;
          border-radius: 4px;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.15s;
        }
        .color-swatch:hover {
          transform: scale(1.1);
          z-index: 1;
        }
        .color-swatch.selected {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--bg-primary), 0 0 0 4px var(--accent);
        }
        .color-swatch.white {
          border: 1px solid var(--border-color);
        }
        .current-color {
          flex-shrink: 0;
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 12px 16px;
          border-top: 1px solid var(--border-color);
          background: var(--bg-primary);
        }
        .color-preview {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          flex-shrink: 0;
        }
        .color-info {
          flex: 1;
          min-width: 0;
        }
        .color-hex {
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          font-weight: var(--font-weight-semibold);
          display: block;
          margin-bottom: 4px;
        }
        .color-input {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
        }
      `}</style>
    </div>
  )
}
