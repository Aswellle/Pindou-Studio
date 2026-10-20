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
import { ArrowLeft, Copy, Pencil, Download } from 'lucide-react'
import { useToast } from '../../components/Toast'
import ThumbnailCanvas from '../../components/ThumbnailCanvas'
import {
  templateDimensions,
  convertTemplateToBrand,
  extractPatternColors,
} from '../../data/templates'
import { getPalette } from '../../data/palettes'
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
  // 制作信息:豆子总数与用色数(规格 07 §3「显示预览和制作信息」)
  const makingInfo = useMemo(() => {
    if (!template?.pattern) return { beads: 0, colors: 0 }
    let beads = 0
    for (const row of template.pattern) {
      for (const cell of row || []) if (cell) beads++
    }
    return { beads, colors: extractPatternColors(template.pattern).length }
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
    <div className="content-page">
      <ContentSeo
        title={name}
        description={template
          ? `${name} · ${width} × ${height} · ${t(`palette.brand.${template.paletteId || 'perler'}`)}`
          : undefined}
        noindex={!template}
      />
      <div className="content-page-head">
        <button className="content-back" onClick={() => navigate('/gallery')}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t('gallery.discovery.backToGallery')}
        </button>
        {!template ? (
          <p className="content-desc" role="status">
            {cloudDown ? t('gallery.discovery.unavailable') : t('gallery.discovery.notFound')}
          </p>
        ) : (
          <>
            <h1 className="content-title">{name}</h1>
            <div className="content-detail-meta">
              <span>{width} × {height}</span>
              <span>{t(`gallery.difficulties.${template.difficulty}`, template.difficulty)}</span>
              <span>{t(`palette.brand.${template.paletteId || 'perler'}`)}</span>
              <span>{t('gallery.discovery.beads', { n: makingInfo.beads })}</span>
              <span>{t('gallery.discovery.colors', { n: makingInfo.colors })}</span>
            </div>
            {/* 来源与许可:只用可信字段,不展示用户私有信息(规格 07 §3) */}
            <p className="content-detail-source">
              {t('gallery.discovery.sourceNote')} · {t('gallery.discovery.licenseNote')}
            </p>
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
          </>
        )}
      </div>

      {template && (
        <div className="content-detail-preview">
          <ThumbnailCanvas
            pattern={template.pattern}
            size={template.size}
            gridWidth={width}
            gridHeight={height}
          />
        </div>
      )}
    </div>
  )
}
