/**
 * 拼豆图案落地页(/bead-patterns)。
 *
 * 高频词「拼豆图案」此前没有专属页面:/gallery 的标题与正文都用「图纸模板」,
 * 首页讲的是工具。这一页按题材汇总图案入口、说明挑选方法,并接到尺寸与
 * 用豆量参考,承接口语化的「图案」搜索词。
 *
 * 正文四语言:固定文案走 toolsPage.patterns 键;题材简介按语言取
 * categoryIntro(meta, lang)(zh/en/ja/ko);相关教程按语言取标题。
 * 构建期静态快照仍用 zh 具名导出(始终中文,canonical 裸路径不变)。
 */

import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BackButton from '../../components/BackButton'
import { GALLERY_CATEGORY_META, categoryIntro, categoryPagePath } from '../gallery/categoryMeta'
import { tutorialArticle } from './ironingGuide'
import { beadPresetRows } from './beadCalculator'
import { PATTERN_ARTICLE_IDS, patternTips, patternWays } from './landingContent'
import ToolFaq from './ToolFaq.jsx'
import { faqFor } from './toolFaq'
import '../gallery/gallery.css'
import './tools.css'

export default function BeadPatternsPage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const presets = beadPresetRows()
  const tips = patternTips(lang)
  const ways = patternWays(lang)
  const articles = PATTERN_ARTICLE_IDS.map(id => tutorialArticle(id, lang)).filter(Boolean)

  return (
    <div className="content-page tools-page">
      <div className="content-page-head">
        <BackButton size="md" onClick={() => navigate('/gallery')} />
        <span className="content-kicker">{t('toolsPage.patterns.kicker')}</span>
        <h1 className="content-title">{t('toolsPage.patterns.title')}</h1>
        <p className="content-desc">{t('toolsPage.patterns.lead')}</p>
      </div>

      <section className="tools-section">
        <h2>{t('toolsPage.patterns.byThemeTitle')}</h2>
        <div className="pattern-category-grid">
          {GALLERY_CATEGORY_META.map(meta => (
            <Link key={meta.slug} className="pattern-category-card" to={categoryPagePath(meta.slug)}>
              <span className="pattern-category-name">{t(`gallery.categories.${meta.raw}`, meta.label)}</span>
              {categoryIntro(meta, lang) ? (
                <span className="pattern-category-intro">{categoryIntro(meta, lang)}</span>
              ) : null}
            </Link>
          ))}
        </div>
      </section>

      <section className="tools-section">
        <h2>{t('toolsPage.patterns.pickTitle')}</h2>
        <ul className="tools-link-list pattern-tips">
          {tips.map(([title, text]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="tools-section">
        <h2>{t('toolsPage.patterns.waysTitle')}</h2>
        <div className="tools-rules">
          {ways.map(([title, text, href, cta]) => (
            <div key={title} className="tools-rule-card">
              <h3>{title}</h3>
              <p>{text}</p>
              <p>
                <Link to={href}>{cta}</Link>
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="tools-section">
        <h2>{t('toolsPage.patterns.sizeTitle')}</h2>
        <table className="tools-table">
          <caption className="sr-only">{t('toolsPage.patterns.sizeCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('toolsPage.patterns.colGrid')}</th>
              <th scope="col">{t('toolsPage.patterns.colCells')}</th>
              <th scope="col">{t('toolsPage.patterns.colFilled')}</th>
            </tr>
          </thead>
          <tbody>
            {presets.map(row => (
              <tr key={row.size}>
                <td>
                  {row.size} × {row.size}
                </td>
                <td>{row.cells}</td>
                <td>{row.filled80}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tools-note">
          {t('toolsPage.patterns.notePre')}
          <Link to="/bead-calculator">{t('toolsPage.patterns.noteCalc')}</Link>
          {t('toolsPage.patterns.noteMid')}
          <Link to="/colors">{t('toolsPage.patterns.noteColors')}</Link>
          {t('toolsPage.patterns.notePost')}
        </p>
      </section>

      <ToolFaq items={faqFor('patterns', lang)} />

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

      <nav className="tools-links" aria-label={t('toolsPage.relatedPages')}>
        <Link className="tools-link-card" to="/gallery">
          <span className="tools-link-card-title">{t('toolsPage.patterns.links.gallery.title')}</span>
          <span className="tools-link-card-desc">{t('toolsPage.patterns.links.gallery.desc')}</span>
        </Link>
        <Link className="tools-link-card" to="/pixel-art">
          <span className="tools-link-card-title">{t('toolsPage.patterns.links.pixel.title')}</span>
          <span className="tools-link-card-desc">{t('toolsPage.patterns.links.pixel.desc')}</span>
        </Link>
        <Link className="tools-link-card" to="/bead-calculator">
          <span className="tools-link-card-title">{t('toolsPage.patterns.links.calculator.title')}</span>
          <span className="tools-link-card-desc">{t('toolsPage.patterns.links.calculator.desc')}</span>
        </Link>
        <Link className="tools-link-card" to="/ironing">
          <span className="tools-link-card-title">{t('toolsPage.patterns.links.ironing.title')}</span>
          <span className="tools-link-card-desc">{t('toolsPage.patterns.links.ironing.desc')}</span>
        </Link>
      </nav>
    </div>
  )
}
