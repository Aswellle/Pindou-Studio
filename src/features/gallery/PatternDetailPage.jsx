/**
 * 公共图纸详情页(/gallery/pattern/:id)
 *
 * 主动作是「复制到我的图纸」——在当前用户工作区生成个人副本并记录来源模板 id;
 * 源模板永远不被修改(规格 07 §3)。
 *
 * 复制路径:
 *   templateToProject(复制语义,新 id + source.kind='gallery-copy')
 *   → projectToImportWork(旧 work 形状,带 sourceTemplateId)
 *   → onSaveProject(useSavedWorks 的 saveWork,本地/云端同一路径)
 *   → 可选:载入画布继续编辑(通过 onLoadTemplate,不落库)
 */

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Copy, Pencil, Download } from 'lucide-react'
import BackButton from '../../components/BackButton'
import { useToast } from '../../components/Toast'
import ThumbnailCanvas from '../../components/ThumbnailCanvas'
import {
  templateDimensions,
  convertTemplateToBrand,
} from '../../data/templates'
import { getPalette, findClosestColor } from '../../data/palettes'
import { exportAsPNG } from '../../services/BeadPatternExporter'
import { templateToProject } from '../../services/project/adapters'
import { projectToImportWork } from '../../services/project/importProject'
import { useGalleryTemplates } from './hooks/useGalleryTemplates'
import { templateById } from './discovery'
import ContentSeo from './components/ContentSeo'
import './gallery.css'

export default function PatternDetailPage({ cloudStore, onSaveProject, onLoadTemplate }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const { id } = useParams()
  const { allTemplates, cloudDown } = useGalleryTemplates(cloudStore)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const template = useMemo(() => templateById(allTemplates, id), [allTemplates, id])
  const { width, height } = templateDimensions(template)
  // 制作信息:豆子总数、用色数,以及逐色清单(颗数降序)。
  // 逐色清单是「照着买豆子」真正需要的信息,比只给一个总数有用得多。
  const makingInfo = useMemo(() => {
    if (!template?.pattern) return { beads: 0, colors: 0, list: [] }
    const counts = new Map()
    let beads = 0
    for (const row of template.pattern) {
      for (const cell of row || []) {
        if (!cell) continue
        beads++
        counts.set(cell, (counts.get(cell) || 0) + 1)
      }
    }
    const brand = template.paletteId || 'perler'
    const list = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([hex, count]) => {
        // 色号解析:模板颜色与品牌色卡就近匹配(与导出图例同口径)
        let code = ''
        try {
          code = findClosestColor(hex, brand)?.id || ''
        } catch {
          code = ''
        }
        return { hex, count, code }
      })
    return { beads, colors: list.length, list }
  }, [template])
  const name = template
    ? (template.name ? (template.nameZh || template.name) : t(`templates.names.${template.nameKey}`, template.nameKey))
    : ''

  // 复制到我的图纸:生成独立副本,源模板不被修改
  const handleCopy = async () => {
    if (!template || !onSaveProject || busy) return
    setBusy(true)
    try {
      const project = templateToProject(template)
      const work = projectToImportWork(project, { savedAt: new Date().toISOString() })
      if (!work) {
        toast(t('errors.saveFailed'), 'error')
        return
      }
      const withSource = { ...work, sourceTemplateId: template.id }
      const ok = await onSaveProject(withSource)
      if (ok) {
        setSaved(true)
        toast(t('gallery.discovery.copied'), 'success')
      }
    } finally {
      setBusy(false)
    }
  }

  // 开始编辑:载入画布(不落库,用户自行决定是否保存)
  const handleEdit = () => {
    if (!template || !onLoadTemplate) return
    const options = { palette: template.paletteId || 'perler' }
    if (width !== height) {
      options.gridWidth = width
      options.gridHeight = height
    }
    onLoadTemplate(template.pattern, Math.max(width, height), options)
  }

  // 导出当前图纸(与图库卡片一致:专业样式,计数不计入公共模板)
  const handleExport = async () => {
    if (!template || busy) return
    setBusy(true)
    try {
      const brand = template.paletteId || 'perler'
      const pattern = brand ? convertTemplateToBrand(template.pattern, brand) : template.pattern
      await exportAsPNG(pattern, Math.max(width, height), brand, name, getPalette(brand), {
        beadStyle: 'professional',
        gridWidth: width,
        gridHeight: height,
      })
    } catch (err) {
      console.error('Pattern export failed:', err)
      toast(t('export.exportFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="content-page detail-page">
      <ContentSeo
        title={name}
        description={template
          ? `${name} · ${width} × ${height} · ${t(`palette.brand.${template.paletteId || 'perler'}`)}`
          : undefined}
        noindex={!template}
      />

      <div className="content-page-head">
        <BackButton size="md" onClick={() => navigate('/gallery')} />
        {!template ? (
          <p className="content-desc" role="status">
            {cloudDown ? t('gallery.discovery.unavailable') : t('gallery.discovery.notFound')}
          </p>
        ) : (
          <h1 className="content-title">{name}</h1>
        )}
      </div>

      {template && (
        <div className="detail-layout">
          {/* 左:预览。画布按容器宽度自适应,不再用固定 8px/格 ——
              170×170 的图纸按固定格宽会撑到 1360px,直接溢出视口。 */}
          <div className="detail-preview-pane">
            <div className="content-detail-preview">
              <ThumbnailCanvas
                pattern={template.pattern}
                size={template.size}
                gridWidth={width}
                gridHeight={height}
              />
            </div>
            <p className="content-detail-source">
              {t('gallery.discovery.sourceNote')} · {t('gallery.discovery.licenseNote')}
            </p>
          </div>

          {/* 右:信息与操作。窄屏时堆叠到预览下方。 */}
          <aside className="detail-info-pane">
            <dl className="detail-facts">
              <div>
                <dt>{t('gallery.discovery.factSize')}</dt>
                <dd>{width} × {height}</dd>
              </div>
              <div>
                <dt>{t('gallery.discovery.factBeads')}</dt>
                <dd>{makingInfo.beads}</dd>
              </div>
              <div>
                <dt>{t('gallery.discovery.factColors')}</dt>
                <dd>{makingInfo.colors}</dd>
              </div>
              <div>
                <dt>{t('gallery.discovery.factDifficulty')}</dt>
                <dd>{t(`gallery.difficulties.${template.difficulty}`, template.difficulty)}</dd>
              </div>
              <div>
                <dt>{t('gallery.discovery.factBrand')}</dt>
                <dd>{t(`palette.brand.${template.paletteId || 'perler'}`)}</dd>
              </div>
            </dl>

            <div className="content-detail-actions">
              <button className="btn btn-primary" onClick={handleCopy} disabled={busy || !onSaveProject}>
                <Copy size={16} aria-hidden="true" />
                {t('gallery.discovery.copyToWorkspace')}
              </button>
              <button className="btn btn-ghost" onClick={handleEdit} disabled={!onLoadTemplate}>
                <Pencil size={16} aria-hidden="true" />
                {t('gallery.discovery.openPattern')}
              </button>
              <button className="btn btn-ghost" onClick={handleExport} disabled={busy}>
                <Download size={16} aria-hidden="true" />
                {t('export.title')}
              </button>
            </div>
            {saved && <span className="content-count" role="status">{t('gallery.discovery.copied')}</span>}
          </aside>
        </div>
      )}

      {/* 逐色清单:通栏网格。窄栏里塞单列列表只能靠内部滚动,
          滚动条既难用又看不见;PC 宽度足够时直接铺开,一屏看完。 */}
      {template && makingInfo.list.length > 0 && (
        <section className="detail-colors" aria-label={t('gallery.discovery.colorList')}>
          <div className="detail-colors-head">
            <h2 className="detail-section-title">{t('gallery.discovery.colorList')}</h2>
            <span className="detail-colors-summary">
              {t('gallery.discovery.colorSummary', {
                colors: makingInfo.colors,
                beads: makingInfo.beads,
              })}
            </span>
          </div>
          <ul className="detail-color-grid">
            {makingInfo.list.map((c) => (
              <li key={c.hex} className="detail-color-item">
                <span className="detail-color-swatch" style={{ background: c.hex }} aria-hidden="true" />
                <span className="detail-color-text">
                  {c.code && <code className="detail-color-code">{c.code}</code>}
                  <span className="detail-color-hex">{c.hex}</span>
                </span>
                <span className="detail-color-count">
                  {t('gallery.discovery.beadCount', { n: c.count })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
