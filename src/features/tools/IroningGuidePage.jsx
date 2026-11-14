/**
 * 熨烫温度对照页(/ironing)。
 *
 * 表格与翻车表直接取教程数据(四语言都有),按当前语言渲染;
 * 熨烫要点/FAQ 同样按语言取数。构建期静态快照仍用 zh 具名导出
 * (始终中文,canonical 裸路径不变)。
 */

import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BackButton from '../../components/BackButton'
import { IRONING_SOURCES, ironingReference, ironingRules } from './ironingGuide'
import ToolFaq from './ToolFaq.jsx'
import { faqFor } from './toolFaq'
import '../gallery/gallery.css'
import './tools.css'

/** 通用数据表:表头 + 行,均来自教程表格块 */
function DataTable({ table, caption }) {
  if (!table || !table.rows.length) return null
  return (
    <table className="tools-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {table.headers.map(header => (
            <th key={header} scope="col">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function IroningGuidePage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { brandTable, failureTable, articles } = ironingReference(lang)
  const rules = ironingRules(lang)

  return (
    <div className="content-page tools-page">
      <div className="content-page-head">
        <BackButton size="md" onClick={() => navigate('/tutorials')} />
        <span className="content-kicker">{t('toolsPage.ironing.kicker')}</span>
        <h1 className="content-title">{t('toolsPage.ironing.title')}</h1>
        <p className="content-desc">{t('toolsPage.ironing.lead')}</p>
      </div>

      <section className="tools-rules" aria-label={t('toolsPage.ironing.rulesTitle')}>
        {rules.map(([title, text]) => (
          <div key={title} className="tools-rule-card">
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
        ))}
      </section>

      <section className="tools-section">
        <h2>{t('toolsPage.ironing.brandTitle')}</h2>
        <DataTable table={brandTable} caption={t('toolsPage.ironing.brandCaption')} />
        <p className="tools-note">{t('toolsPage.ironing.brandTip')}</p>
      </section>

      <section className="tools-section">
        <h2>{t('toolsPage.ironing.failureTitle')}</h2>
        <DataTable table={failureTable} caption={t('toolsPage.ironing.failureCaption')} />
      </section>

      <ToolFaq items={faqFor('ironing', lang)} />

      {articles.length > 0 && (
        <section className="tools-section">
          <h2>{t('toolsPage.relatedTutorials')}</h2>
          <ul className="tools-link-list">
            {articles.map(article => (
              <li key={article.id}>
                <Link to={`/tutorials/${article.id}`}>{article.title}</Link>
                {article.sectionTitle ? (
                  <span className="tools-link-meta">{article.sectionTitle}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 参考来源:官方渠道链接(E-E-A-T)。温度口径以手上产品的说明为准 */}
      <section className="tools-section">
        <h2>{t('toolsPage.ironing.sourcesTitle')}</h2>
        <ul className="tools-link-list">
          {IRONING_SOURCES.map(source => (
            <li key={source.href}>
              <a href={source.href} target="_blank" rel="noopener noreferrer">
                {t('toolsPage.ironing.sourceLabel', { brand: source.brand, domain: source.domain })}
              </a>
            </li>
          ))}
        </ul>
        <p className="tools-note">{t('toolsPage.ironing.sourcesNote')}</p>
      </section>

      <nav className="tools-links" aria-label={t('toolsPage.relatedPages')}>
        <Link className="tools-link-card" to="/create/image">
          <span className="tools-link-card-title">{t('toolsPage.ironing.links.createImage.title')}</span>
          <span className="tools-link-card-desc">{t('toolsPage.ironing.links.createImage.desc')}</span>
        </Link>
        <Link className="tools-link-card" to="/gallery">
          <span className="tools-link-card-title">{t('toolsPage.ironing.links.gallery.title')}</span>
          <span className="tools-link-card-desc">{t('toolsPage.ironing.links.gallery.desc')}</span>
        </Link>
        <Link className="tools-link-card" to="/colors">
          <span className="tools-link-card-title">{t('toolsPage.ironing.links.colors.title')}</span>
          <span className="tools-link-card-desc">{t('toolsPage.ironing.links.colors.desc')}</span>
        </Link>
        <Link className="tools-link-card" to="/bead-calculator">
          <span className="tools-link-card-title">{t('toolsPage.ironing.links.calculator.title')}</span>
          <span className="tools-link-card-desc">{t('toolsPage.ironing.links.calculator.desc')}</span>
        </Link>
      </nav>
    </div>
  )
}
