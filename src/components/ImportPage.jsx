/**
 * ImportPage — /import 个人图纸导入页
 *
 * 规格:docs/agent-spec/02 §3(路由 `/import`)、03 §3–§5(格式与校验)、03 §4B(图纸识别)。
 *
 * 两种导入模式(不要让所有输入走同一条管线,规格 03 §4 明确要求区分):
 *   1. 项目文件 —— .pindou.json / 模板 JSON:选文件 → 校验 → 预览 → 落库/进编辑器;
 *   2. 图纸截图 —— 已有拼豆格子的截图/照片:走 ChartImportWizard(网格检测 + 逐格修正),
 *      **不**复用照片量化的 K-means 管线。
 *
 * 页面职责(只做「选文件 → 校验 → 预览 → 落库/进编辑器」):
 *   - 校验全部委托给 services/project/importProject.js(纯函数);
 *   - 失败时**不改动画布、不写存储**,只在页面上给出分类错误;
 *   - 成功后两种出口:①保存为私有作品(与手绘作品同一套存储与隔离),
 *     ②直接载入画布继续编辑(不落库,交给用户自己决定是否保存)。
 *
 * 云端隔离:导入的作品经 useSavedWorks 保存 —— 登录且云端可用时写 `works`
 * 表(RLS:仅本人可读写);未登录时只写本机 localStorage。
 * 页面上如实标注落点,不做「已同步」之类未经证实的承诺。
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Upload, FileJson, CheckCircle2, AlertTriangle, Eye, Save, ImagePlus } from 'lucide-react'
import BackButton from './BackButton'
import { useToast } from '../components/Toast'
import ThumbnailCanvas from '../components/ThumbnailCanvas'
import ChartImportWizard from './ChartImportWizard'
import {
  parseImportText,
  checkImportFile,
  projectToImportWork,
  IMPORT_ERROR_CODES,
  MAX_IMPORT_BYTES,
} from '../services/project/importProject'
import { computeProjectStats } from '../services/project/projectModel'
import './importPage.css'

/** 错误码 → i18n 键(与 importProject 的错误码一一对应) */
const ERROR_KEY = {
  [IMPORT_ERROR_CODES.EMPTY]: 'importPage.errors.empty',
  [IMPORT_ERROR_CODES.FILE_TOO_LARGE]: 'importPage.errors.fileTooLarge',
  [IMPORT_ERROR_CODES.TOO_MANY_ITEMS]: 'importPage.errors.tooManyItems',
  [IMPORT_ERROR_CODES.JSON_PARSE]: 'importPage.errors.jsonParse',
  [IMPORT_ERROR_CODES.NOT_JSON]: 'importPage.errors.notJson',
  [IMPORT_ERROR_CODES.UNRECOGNIZED]: 'importPage.errors.unrecognized',
  [IMPORT_ERROR_CODES.TEMPLATE_INVALID]: 'importPage.errors.templateInvalid',
  [IMPORT_ERROR_CODES.LEGACY_UNSUPPORTED]: 'importPage.errors.legacyUnsupported',
  // 项目模型校验错误
  notObject: 'importPage.errors.notObject',
  unsupportedVersion: 'importPage.errors.unsupportedVersion',
  missingGrid: 'importPage.errors.missingGrid',
  invalidDimension: 'importPage.errors.invalidDimension',
  dimensionTooSmall: 'importPage.errors.dimensionTooSmall',
  dimensionTooLarge: 'importPage.errors.dimensionTooLarge',
  gridTooLarge: 'importPage.errors.gridTooLarge',
  cellsNotArray: 'importPage.errors.cellsNotArray',
  rowCountMismatch: 'importPage.errors.rowCountMismatch',
  rowLengthMismatch: 'importPage.errors.rowLengthMismatch',
  rowNotArray: 'importPage.errors.rowNotArray',
  invalidColor: 'importPage.errors.invalidColor',
  nameTooLong: 'importPage.errors.nameTooLong',
  invalidSourceKind: 'importPage.errors.invalidSourceKind',
  invalidVisibility: 'importPage.errors.invalidVisibility',
  // 模板协议错误
  nameRequired: 'importPage.errors.nameRequired',
  categoryRequired: 'importPage.errors.categoryRequired',
  patternRequired: 'importPage.errors.patternRequired',
  emptyPattern: 'importPage.errors.emptyPattern',
  emptyRow: 'importPage.errors.emptyRow',
  // 文件层
  fileReadError: 'importPage.errors.fileReadError',
}

/** 单条错误最多展示的条数(超出用「还有 N 条」概括,避免刷屏) */
const MAX_VISIBLE_ERRORS = 6

export default function ImportPage({ onLoadProject, onSaveProject }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const fileInputRef = useRef(null)

  const [fileName, setFileName] = useState('')
  const [projects, setProjects] = useState([])
  const [errors, setErrors] = useState([])
  const [reading, setReading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  // 导入模式:'file' 项目文件 / 'chart' 已有图纸截图识别。
  // 两种输入语义完全不同(离散色块 vs 连续照片),不共用一条管线。
  const [mode, setMode] = useState('file')

  const selected = projects[selectedIndex] || null
  const stats = useMemo(() => (selected ? computeProjectStats(selected) : null), [selected])

  const reset = useCallback(() => {
    setProjects([])
    setErrors([])
    setSelectedIndex(0)
    setFileName('')
  }, [])

  const handleText = useCallback((text, name) => {
    setFileName(name || '')
    const res = parseImportText(text)
    if (!res.ok) {
      setProjects([])
      setSelectedIndex(0)
      setErrors(res.errors)
      return
    }
    setErrors([])
    setProjects(res.projects)
    setSelectedIndex(0)
  }, [])

  const handleFile = useCallback((file) => {
    if (!file) return
    const gate = checkImportFile(file)
    if (gate) {
      setProjects([])
      setErrors([{ code: gate }])
      setFileName(file.name || '')
      return
    }
    setReading(true)
    const reader = new FileReader()
    reader.onload = () => {
      setReading(false)
      handleText(String(reader.result || ''), file.name)
    }
    reader.onerror = () => {
      setReading(false)
      setProjects([])
      setErrors([{ code: 'fileReadError' }])
    }
    reader.readAsText(file)
  }, [handleText])

  const handleDrop = (e) => {
    e.preventDefault()
    handleFile(e.dataTransfer?.files?.[0])
  }

  // 保存为私有作品:复用 App 的 saveWork(本地/云端双模式 + 云端 RLS 隔离)
  const handleSave = async () => {
    if (!selected || !onSaveProject || saving) return
    setSaving(true)
    try {
      const work = projectToImportWork(selected)
      const ok = await onSaveProject(work)
      if (ok) {
        toast(t('importPage.saved'), 'success')
        reset()
      }
      // 失败时 useSavedWorks 已给出 toast,这里不重复提示
    } finally {
      setSaving(false)
    }
  }

  // 载入画布继续编辑(不落库)
  const handleLoad = () => {
    if (!selected || !onLoadProject) return
    onLoadProject(selected)
  }

  const errorText = (e) => {
    const key = ERROR_KEY[e?.code]
    const base = key ? t(key) : t('importPage.errors.unknown')
    return e?.detail ? `${base}(${e.detail})` : base
  }

  const visibleErrors = errors.slice(0, MAX_VISIBLE_ERRORS)
  const hiddenErrorCount = errors.length - visibleErrors.length

  return (
    <div className="import-page">
      <div className="import-page-inner">
        <header className="import-page-bar">
          <BackButton size="md" onClick={() => navigate(-1)} />
          <div className="import-page-title">
            <span className="import-eyebrow">PINDOU STUDIO / IMPORT</span>
            <h1>{t('importPage.title')}</h1>
          </div>
        </header>

        <p className="import-intro">{t('importPage.intro')}</p>

        {/* ── 导入模式切换 ─────────────────────────────────── */}
        <div className="import-modes" role="tablist" aria-label={t('importPage.modeLabel')}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'file'}
            className={`import-mode${mode === 'file' ? ' active' : ''}`}
            onClick={() => setMode('file')}
          >
            <FileJson size={16} />
            <span>
              <strong>{t('importPage.modeFile')}</strong>
              <small>{t('importPage.modeFileHint')}</small>
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'chart'}
            className={`import-mode${mode === 'chart' ? ' active' : ''}`}
            onClick={() => setMode('chart')}
          >
            <ImagePlus size={16} />
            <span>
              <strong>{t('importPage.modeChart')}</strong>
              <small>{t('importPage.modeChartHint')}</small>
            </span>
          </button>
        </div>

        {mode === 'chart' ? (
          <ChartImportWizard onLoadProject={onLoadProject} onSaveProject={onSaveProject} />
        ) : (
          <>
        {/* ── 选择文件 ─────────────────────────────────────── */}
        <section
          className="import-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
          aria-label={t('importPage.chooseFile')}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="import-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              handleFile(file)
            }}
          />
          <Upload size={28} className="import-drop-icon" />
          <span className="import-drop-main">{t('importPage.chooseFile')}</span>
          <span className="import-drop-hint">
            {t('importPage.dropHint', { size: Math.round(MAX_IMPORT_BYTES / 1024) })}
          </span>
          {fileName && <span className="import-file-name"><FileJson size={14} />{fileName}</span>}
          {reading && <span className="import-reading">{t('common.loading')}</span>}
        </section>

        {/* ── 错误 ─────────────────────────────────────────── */}
        {errors.length > 0 && (
          <section className="import-errors" role="alert">
            <div className="import-errors-head">
              <AlertTriangle size={16} />
              <strong>{t('importPage.failedTitle')}</strong>
            </div>
            <ul>
              {visibleErrors.map((e, i) => (
                <li key={`${e.code}-${e.index ?? i}-${i}`}>
                  {e.index ? `#${e.index} ` : ''}{errorText(e)}
                </li>
              ))}
            </ul>
            {hiddenErrorCount > 0 && (
              <p className="import-errors-more">{t('importPage.moreErrors', { n: hiddenErrorCount })}</p>
            )}
            <p className="import-errors-hint">{t('importPage.failedHint')}</p>
          </section>
        )}

        {/* ── 预览 ─────────────────────────────────────────── */}
        {selected && (
          <section className="import-preview">
            <div className="import-preview-head">
              <CheckCircle2 size={16} className="import-ok-icon" />
              <strong>{t('importPage.previewTitle')}</strong>
              {projects.length > 1 && (
                <select
                  className="import-picker"
                  value={selectedIndex}
                  onChange={(e) => setSelectedIndex(Number(e.target.value))}
                >
                  {projects.map((p, i) => (
                    <option key={i} value={i}>{p.name || `#${i + 1}`}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="import-preview-body">
              <div className="import-thumb">
                <ThumbnailCanvas
                  pattern={selected.grid.cells}
                  gridWidth={selected.grid.width}
                  gridHeight={selected.grid.height}
                />
              </div>
              <dl className="import-meta">
                <div><dt>{t('importPage.name')}</dt><dd>{selected.name || t('importPage.unnamed')}</dd></div>
                <div><dt>{t('importPage.size')}</dt><dd>{selected.grid.width} × {selected.grid.height}</dd></div>
                <div><dt>{t('importPage.colors')}</dt><dd>{stats?.colorCount ?? 0}</dd></div>
                <div><dt>{t('importPage.beads')}</dt><dd>{stats?.totalBeads ?? 0}</dd></div>
                <div><dt>{t('importPage.palette')}</dt><dd>{selected.palette?.paletteId || 'perler'}</dd></div>
                <div><dt>{t('importPage.source')}</dt><dd>{selected.source?.kind || '—'}</dd></div>
              </dl>
            </div>

            <div className="import-actions">
              <button type="button" className="import-btn ghost" onClick={reset}>
                {t('importPage.reselect')}
              </button>
              <button type="button" className="import-btn secondary" onClick={handleLoad}>
                <Eye size={15} />{t('importPage.loadToCanvas')}
              </button>
              {onSaveProject && (
                <button type="button" className="import-btn primary" onClick={handleSave} disabled={saving}>
                  <Save size={15} />{saving ? t('common.loading') : t('importPage.saveAsWork')}
                </button>
              )}
            </div>

            {/* 落点如实说明:云端可用时进 works 表(RLS 仅本人),否则只在本机 */}
            <p className="import-storage-hint">{t('importPage.storageHint')}</p>
          </section>
        )}

        {/* ── 格式说明 ─────────────────────────────────────── */}
        <section className="import-format">
          <h2>{t('importPage.formatTitle')}</h2>
          <p>{t('importPage.formatBody')}</p>
          <pre>{`{
  "schemaVersion": 1,
  "name": "我的拼豆图纸",
  "grid": { "width": 2, "height": 2,
    "cells": [["#E53935", null], [null, "#FFFFFF"]] },
  "palette": { "paletteId": "perler" }
}`}</pre>
          <p className="import-format-note">{t('importPage.formatNote')}</p>
        </section>
          </>
        )}
      </div>
    </div>
  )
}
