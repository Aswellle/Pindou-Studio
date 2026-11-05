import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Sparkles } from 'lucide-react'
import { IRONING_EFFECT_PRESETS } from '../../services/export/ironingEffectPresets'
import IroningStudioDialog from './IroningStudioDialog'

/**
 * IroningEffectSection — 导出面板里的「高级熨烫效果」入口。
 *
 * 六种材质靠成品样张来选,预览要看细节,侧栏都放不下 —— 选择与预览
 * 搬进全屏工作室(IroningStudioDialog),这里只留一个带样张墙缩略的
 * 入口卡片:展示三张代表样张 + 标题 + 描述,点击打开工作室。
 *
 * 守卫契约不变:locked(游客)时点击入口改为打开登录引导,渲染器
 * 与工作室都不会挂载;isExporting 期间入口禁用,防止并发导出。
 */
export default function IroningEffectSection({
  canvasData,
  gridSize,
  gridWidth,
  gridHeight,
  paletteId = 'perler',
  designName,
  // 导出进行中(父级共享状态):禁用入口与工作室内的导出按钮
  isExporting = false,
  // 高级导出守卫:游客不可打开工作室,点击入口改为打开登录引导
  locked = false,
  onRequireAuth,
  /** (presetId) => void — 父级接入 requestExport 确认流程 */
  onRequestExport,
}) {
  const { t } = useTranslation()
  const [studioOpen, setStudioOpen] = useState(false)

  // 入口缩略墙:取三种质感差异最大的材质作代表(无孔/毛巾/细闪)
  const THUMBNAIL_IDS = ['no-hole', 'towel', 'fine-glitter']
  const thumbnails = THUMBNAIL_IDS.map(id => IRONING_EFFECT_PRESETS.find(p => p.id === id)).filter(Boolean)

  const openStudio = () => {
    if (locked) {
      onRequireAuth?.()
      return
    }
    setStudioOpen(true)
  }

  return (
    <div className="export-section ironing-section">
      <button
        type="button"
        className="ironing-entry"
        onClick={openStudio}
        disabled={isExporting}
        aria-label={locked ? t('auth.gate.ironingTitle') : t('export.ironing.studioOpen')}
      >
        <span className="ironing-entry-thumbs" aria-hidden="true">
          {thumbnails.map(p => (
            <img key={p.id} src={p.showcaseImage} alt="" loading="lazy" />
          ))}
        </span>
        <span className="ironing-entry-text">
          <span className="ironing-entry-title">
            <Sparkles size={14} aria-hidden="true" />
            {t('export.ironing.title')}
            {locked && <span className="ironing-lock">{t('auth.gate.locked')}</span>}
          </span>
          <span className="ironing-entry-desc">{t('export.ironing.description')}</span>
        </span>
        <ChevronRight size={16} className="ironing-entry-arrow" aria-hidden="true" />
      </button>

      <style>{`
        .ironing-entry {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          text-align: left;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .ironing-entry:hover { border-color: var(--text-secondary); }
        .ironing-entry:disabled { opacity: 0.55; cursor: not-allowed; }
        .ironing-entry-thumbs {
          display: flex;
          flex: none;
        }
        .ironing-entry-thumbs img {
          width: 34px;
          height: 34px;
          object-fit: cover;
          border-radius: 8px;
          border: 1.5px solid var(--bg-primary);
          box-shadow: 0 1px 4px rgba(43, 36, 32, 0.14);
        }
        .ironing-entry-thumbs img + img { margin-left: -10px; }
        .ironing-entry-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .ironing-entry-title {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: var(--text-sm);
          font-weight: var(--font-weight-semibold);
          color: var(--text-primary);
        }
        .ironing-lock {
          flex: none;
          padding: 1px 6px;
          border: 1px solid var(--border-color);
          border-radius: 999px;
          font-size: 10px;
          font-weight: var(--font-weight-normal);
          color: var(--text-muted);
          background: var(--bg-primary);
        }
        .ironing-entry-desc {
          font-size: var(--text-xs);
          color: var(--text-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ironing-entry-arrow {
          margin-left: auto;
          flex: none;
          color: var(--text-muted);
        }
        /* 桌面端 220px 侧栏:完整描述放不下(此前标题被挤成逐字竖排),
           收成「缩略墙 + 单行标题 + 箭头」,详情进工作室再看 */
        @media (min-width: 1024px) {
          .ironing-entry {
            padding: 8px;
            gap: 8px;
          }
          .ironing-entry-thumbs img {
            width: 26px;
            height: 26px;
          }
          .ironing-entry-thumbs img + img {
            margin-left: -8px;
          }
          .ironing-entry-text {
            min-width: 0;
          }
          .ironing-entry-title {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .ironing-entry-desc {
            display: none;
          }
        }
      `}</style>

      <IroningStudioDialog
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        canvasData={canvasData}
        gridSize={gridSize}
        gridWidth={gridWidth}
        gridHeight={gridHeight}
        paletteId={paletteId}
        designName={designName}
        isExporting={isExporting}
        onRequestExport={onRequestExport}
      />
    </div>
  )
}
