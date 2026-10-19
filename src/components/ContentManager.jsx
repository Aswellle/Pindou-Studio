/**
 * ContentManager — 后台「内容运营」模块:主题 / 合集 CRUD、关联模板排序、健康检查。
 *
 * 安全:所有写入直接打 Supabase,由 migration 0022 的 RLS(is_admin())强制;
 * 这里不提供任何「前端判断管理员就放开」的旁路。
 *
 * 关联编辑是「整组替换」:选中模板 → 上下移动 → 保存时一次性 setLinks,
 * 避免逐条增删产生中间态。
 */

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react'
import { useGalleryContent } from '../hooks/useGalleryContent'
import {
  CONTENT_STATUS,
  TRANSLATION_LANGS,
  checkContentHealth,
  localizedContentText,
} from '../services/gallery/contentModel'

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
]

function ContentModal({ title, onClose, children }) {
  return createPortal(
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3>{title}</h3>
          <button className="admin-modal-close" onClick={onClose} aria-label="close">
            <X size={16} />
          </button>
        </div>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

const emptyForm = (kind) => ({
  slug: '',
  title: '',
  description: '',
  ...(kind === 'collection' ? { curationNote: '' } : {}),
  coverUrl: '',
  status: CONTENT_STATUS.DRAFT,
  isFeatured: false,
  sortOrder: 0,
  translations: Object.fromEntries(TRANSLATION_LANGS.map((lang) => [lang, {
    title: '',
    description: '',
    ...(kind === 'collection' ? { curationNote: '' } : {}),
  }])),
})

/** UI 表单 → normalizeContentInput 的输入(空翻译字段转成 null 由模型处理) */
function formToInput(form) {
  return {
    ...form,
    sortOrder: form.sortOrder === '' ? 0 : Number(form.sortOrder),
  }
}

/** 已保存对象 → 表单 */
function contentToForm(content) {
  if (!content) return null
  return {
    slug: content.slug || '',
    title: content.title || '',
    description: content.description || '',
    ...('curationNote' in content ? { curationNote: content.curationNote || '' } : {}),
    coverUrl: content.coverUrl || '',
    status: content.status || CONTENT_STATUS.DRAFT,
    isFeatured: !!content.isFeatured,
    sortOrder: content.sortOrder ?? 0,
    translations: Object.fromEntries(TRANSLATION_LANGS.map((lang) => {
      const tr = content.translations?.[lang] || {}
      return [lang, {
        title: tr.title || '',
        description: tr.description || '',
        ...('curationNote' in content ? { curationNote: tr.curationNote || '' } : {}),
      }]
    })),
  }
}

function HealthPanel({ themes, collections, templates, themeTemplateIds, collectionTemplateIds, onReload }) {
  const { t } = useTranslation()
  const issues = useMemo(() => {
    const links = []
    for (const [parentId, ids] of themeTemplateIds) {
      for (const templateId of ids) links.push({ kind: 'theme', parentId, templateId })
    }
    for (const [parentId, ids] of collectionTemplateIds) {
      for (const templateId of ids) links.push({ kind: 'collection', parentId, templateId })
    }
    return checkContentHealth({
      themes,
      collections,
      templateIds: templates.map((tpl) => tpl.id),
      links,
    })
  }, [themes, collections, templates, themeTemplateIds, collectionTemplateIds])

  return (
    <div className="admin-card content-health">
      <div className="admin-actions" style={{ justifyContent: 'space-between' }}>
        <strong>{t('admin.content.healthTitle')}</strong>
        <button className="admin-btn secondary small" onClick={onReload}>
          {t('admin.content.healthReload')}
        </button>
      </div>
      {issues.length === 0 ? (
        <div className="admin-empty">{t('admin.content.healthOk')}</div>
      ) : (
        <ul className="content-health-list">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.kind}-${issue.id}-${issue.detail || ''}-${index}`}>
              <span className={`content-health-code ${issue.code}`}>
                {t(`admin.content.issues.${issue.code}`, issue.code)}
              </span>
              <span className="content-health-detail">
                {issue.kind} · {issue.detail || issue.id}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ContentManager({ cloudStore }) {
  const { t, i18n } = useTranslation()
  const content = useGalleryContent()
  const [kind, setKind] = useState('theme')
  const [editing, setEditing] = useState(null) // { kind, id|null, form }
  const [deleting, setDeleting] = useState(null)
  const [linksFor, setLinksFor] = useState(null) // { kind, id, ids }
  const [linkSearch, setLinkSearch] = useState('')
  const [formError, setFormError] = useState('')

  const templates = cloudStore?.templates || []
  const list = kind === 'theme' ? content.themes : content.collections
  const linkMap = kind === 'theme' ? content.themeTemplateIds : content.collectionTemplateIds

  const templateName = (tpl) => tpl.name
    ? (tpl.nameZh || tpl.name)
    : t(`templates.names.${tpl.nameKey}`, tpl.nameKey)

  const openCreate = () => {
    setFormError('')
    setEditing({ kind, id: null, form: emptyForm(kind) })
  }
  const openEdit = (item) => {
    setFormError('')
    setEditing({ kind, id: item.id, form: contentToForm(item) })
  }

  const submit = async () => {
    if (!editing) return
    setFormError('')
    const input = formToInput(editing.form)
    const res = editing.id
      ? await content.updateContent(editing.kind, editing.id, input)
      : await content.createContent(editing.kind, input)
    if (!res.ok) {
      const first = res.errors?.[0]
      setFormError(first?.detail || t(`admin.content.errors.${first?.code}`, first?.code || 'unknown'))
      return
    }
    setEditing(null)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    await content.deleteContent(deleting.kind, deleting.id)
    setDeleting(null)
  }

  const saveLinks = async () => {
    if (!linksFor) return
    const res = await content.setLinks(linksFor.kind, linksFor.id, linksFor.ids)
    if (res.ok) setLinksFor(null)
  }

  const moveLink = (index, delta) => {
    setLinksFor((prev) => {
      if (!prev) return prev
      const next = [...prev.ids]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...prev, ids: next }
    })
  }

  const linkCandidates = useMemo(() => {
    if (!linksFor) return []
    const chosen = new Set(linksFor.ids.map(String))
    const q = linkSearch.trim().toLowerCase()
    return templates
      .filter((tpl) => !chosen.has(String(tpl.id)))
      .filter((tpl) => !q || templateName(tpl).toLowerCase().includes(q))
      .slice(0, 30)
  }, [linksFor, linkSearch, templates])

  return (
    <div>
      <HealthPanel
        themes={content.themes}
        collections={content.collections}
        templates={templates}
        themeTemplateIds={content.themeTemplateIds}
        collectionTemplateIds={content.collectionTemplateIds}
        onReload={content.reload}
      />

      <div className="admin-card">
        <div className="admin-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div className="content-kind-tabs">
            <button
              className={`admin-btn ${kind === 'theme' ? 'primary' : 'secondary'} small`}
              onClick={() => setKind('theme')}
            >
              {t('admin.content.themes')}
            </button>
            <button
              className={`admin-btn ${kind === 'collection' ? 'primary' : 'secondary'} small`}
              onClick={() => setKind('collection')}
            >
              {t('admin.content.collections')}
            </button>
          </div>
          <button className="admin-btn primary" onClick={openCreate}>
            <Plus size={14} aria-hidden="true" />
            {kind === 'theme' ? t('admin.content.addTheme') : t('admin.content.addCollection')}
          </button>
        </div>
      </div>

      {content.loading ? (
        <div className="admin-empty">{t('gallery.discovery.loading')}</div>
      ) : list.length === 0 ? (
        <div className="admin-empty">{t('admin.content.empty')}</div>
      ) : (
        <div className="admin-list">
          {list.map((item) => {
            const text = localizedContentText(item, i18n.language)
            const ids = linkMap.get(item.id) || []
            return (
              <div key={item.id} className="admin-template-row content-row">
                <div className="content-row-main">
                  <div className="admin-template-name">
                    {text.title}
                    <span className={`content-status ${item.status}`}>
                      {t(`admin.content.status.${item.status}`)}
                    </span>
                    {item.isFeatured && (
                      <span className="content-status featured">{t('admin.content.featured')}</span>
                    )}
                  </div>
                  <div className="admin-template-sub">
                    /{item.slug} · {t('admin.content.linkCount', { n: ids.length })}
                    {' · '}sort {item.sortOrder}
                  </div>
                </div>
                <div className="admin-actions">
                  <button
                    className="admin-btn secondary small"
                    onClick={() => { setLinkSearch(''); setLinksFor({ kind, id: item.id, ids: [...ids] }) }}
                  >
                    {t('admin.content.manageLinks')}
                  </button>
                  <button className="admin-btn secondary small" onClick={() => openEdit(item)}>
                    {t('admin.editTemplate')}
                  </button>
                  <button className="admin-btn danger small" onClick={() => setDeleting({ kind, id: item.id, title: text.title })}>
                    {t('admin.delete')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <ContentModal
          title={editing.id
            ? (editing.kind === 'theme' ? t('admin.content.editTheme') : t('admin.content.editCollection'))
            : (editing.kind === 'theme' ? t('admin.content.addTheme') : t('admin.content.addCollection'))}
          onClose={() => setEditing(null)}
        >
          <ContentForm
            kind={editing.kind}
            form={editing.form}
            onChange={(form) => setEditing((prev) => ({ ...prev, form }))}
          />
          {formError && <div className="admin-error" role="alert">{formError}</div>}
          <div className="admin-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="admin-btn secondary" onClick={() => setEditing(null)}>{t('admin.cancel')}</button>
            <button className="admin-btn primary" onClick={submit}>{t('admin.save')}</button>
          </div>
        </ContentModal>
      )}

      {deleting && (
        <ContentModal title={t('admin.delete')} onClose={() => setDeleting(null)}>
          <p>{t('admin.content.deleteHint', { name: deleting.title })}</p>
          <div className="admin-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="admin-btn secondary" onClick={() => setDeleting(null)}>{t('admin.cancel')}</button>
            <button className="admin-btn danger" onClick={confirmDelete}>{t('admin.delete')}</button>
          </div>
        </ContentModal>
      )}

      {linksFor && (
        <ContentModal title={t('admin.content.manageLinks')} onClose={() => setLinksFor(null)}>
          <div className="content-link-editor">
            <div className="content-link-current">
              <strong>{t('admin.content.selected', { n: linksFor.ids.length })}</strong>
              {linksFor.ids.length === 0 && <span className="admin-template-sub">{t('admin.content.noLinks')}</span>}
              {linksFor.ids.map((templateId, index) => {
                const tpl = templates.find((x) => String(x.id) === String(templateId))
                return (
                  <div key={templateId} className="content-link-row">
                    <span>{tpl ? templateName(tpl) : templateId}</span>
                    <span className="content-link-actions">
                      <button className="admin-btn secondary small" onClick={() => moveLink(index, -1)} aria-label="up">
                        <ArrowUp size={13} />
                      </button>
                      <button className="admin-btn secondary small" onClick={() => moveLink(index, 1)} aria-label="down">
                        <ArrowDown size={13} />
                      </button>
                      <button
                        className="admin-btn danger small"
                        onClick={() => setLinksFor((prev) => ({ ...prev, ids: prev.ids.filter((x) => x !== templateId) }))}
                        aria-label="remove"
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>

            <input
              className="admin-input"
              placeholder={t('admin.content.searchTemplates')}
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
            />
            <div className="content-link-candidates">
              {linkCandidates.map((tpl) => (
                <button
                  key={tpl.id}
                  className="admin-btn secondary small"
                  onClick={() => setLinksFor((prev) => ({ ...prev, ids: [...prev.ids, String(tpl.id)] }))}
                >
                  + {templateName(tpl)}
                </button>
              ))}
              {linkCandidates.length === 0 && (
                <span className="admin-template-sub">{t('admin.content.noCandidates')}</span>
              )}
            </div>
          </div>
          <div className="admin-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="admin-btn secondary" onClick={() => setLinksFor(null)}>{t('admin.cancel')}</button>
            <button className="admin-btn primary" onClick={saveLinks}>{t('admin.save')}</button>
          </div>
        </ContentModal>
      )}
    </div>
  )
}

function ContentForm({ kind, form, onChange }) {
  const { t } = useTranslation()
  const set = (patch) => onChange({ ...form, ...patch })
  const setTr = (lang, patch) => onChange({
    ...form,
    translations: { ...form.translations, [lang]: { ...form.translations[lang], ...patch } },
  })

  return (
    <div className="content-form">
      <div className="admin-field">
        <label>{t('admin.content.slug')}</label>
        <input
          className="admin-input"
          value={form.slug}
          onChange={(e) => set({ slug: e.target.value })}
          placeholder="spring-animals"
        />
        <span className="admin-template-sub">{t('admin.content.slugHint')}</span>
      </div>
      <div className="admin-field">
        <label>{t('admin.content.title')}</label>
        <input className="admin-input" value={form.title} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div className="admin-field">
        <label>{t('admin.content.description')}</label>
        <textarea
          className="admin-input"
          rows={2}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      {kind === 'collection' && (
        <div className="admin-field">
          <label>{t('admin.content.curationNote')}</label>
          <textarea
            className="admin-input"
            rows={2}
            value={form.curationNote}
            onChange={(e) => set({ curationNote: e.target.value })}
          />
        </div>
      )}
      <div className="admin-field">
        <label>{t('admin.content.coverUrl')}</label>
        <input className="admin-input" value={form.coverUrl} onChange={(e) => set({ coverUrl: e.target.value })} />
        <span className="admin-template-sub">{t('admin.content.coverHint')}</span>
      </div>
      <div className="content-form-row">
        <div className="admin-field">
          <label>{t('admin.content.statusLabel')}</label>
          <select className="admin-input" value={form.status} onChange={(e) => set({ status: e.target.value })}>
            <option value={CONTENT_STATUS.DRAFT}>{t('admin.content.status.draft')}</option>
            <option value={CONTENT_STATUS.PUBLISHED}>{t('admin.content.status.published')}</option>
          </select>
        </div>
        <div className="admin-field">
          <label>{t('admin.content.sortOrder')}</label>
          <input
            className="admin-input"
            type="number"
            value={form.sortOrder}
            onChange={(e) => set({ sortOrder: e.target.value })}
          />
        </div>
        <label className="admin-checkbox">
          <input
            type="checkbox"
            checked={form.isFeatured}
            onChange={(e) => set({ isFeatured: e.target.checked })}
          />
          {t('admin.content.featured')}
        </label>
      </div>

      {LANGS.map(({ code, label }) => (
        <fieldset key={code} className="content-form-lang">
          <legend>{label}</legend>
          <div className="admin-field">
            <label>{t('admin.content.title')}</label>
            <input
              className="admin-input"
              value={form.translations[code]?.title || ''}
              onChange={(e) => setTr(code, { title: e.target.value })}
            />
          </div>
          <div className="admin-field">
            <label>{t('admin.content.description')}</label>
            <textarea
              className="admin-input"
              rows={2}
              value={form.translations[code]?.description || ''}
              onChange={(e) => setTr(code, { description: e.target.value })}
            />
          </div>
          {kind === 'collection' && (
            <div className="admin-field">
              <label>{t('admin.content.curationNote')}</label>
              <textarea
                className="admin-input"
                rows={2}
                value={form.translations[code]?.curationNote || ''}
                onChange={(e) => setTr(code, { curationNote: e.target.value })}
              />
            </div>
          )}
        </fieldset>
      ))}
    </div>
  )
}
