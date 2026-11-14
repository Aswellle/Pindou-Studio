/**
 * 像素画生成器落地页(/pixel-art)。
 *
 * 画布本身是像素编辑器,但此前没有一页用「像素画生成器」这组词承接搜索 ——
 * 首页标题里只带过一句「像素画在线制作」。这一页讲清楚能画什么、怎么画、
 * 网格怎么选,并把三条真实路径(空白画布 / 图片转像素 / 现成图案)摆出来。
 *
 * 正文四语言:固定文案走 toolsPage.pixel 键,内容块(能力/步骤/尺寸用途)
 * 与 FAQ 按当前语言取自 landingContent / toolFaq 的语言数据;
 * 构建期静态快照仍用 zh 具名导出(始终中文,canonical 裸路径不变)。
 */

import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BackButton from '../../components/BackButton'
import { beadPresetRows } from './beadCalculator'
import { tutorialArticle } from './ironingGuide'
import {
  PIXEL_ARTICLE_IDS,
  PIXEL_GRID_SIZES,
  pixelFeatures,
  pixelGridUses,
  pixelSteps,
} from './landingContent'
import ToolFaq from './ToolFaq.jsx'
import { faqFor } from './toolFaq'
import '../gallery/gallery.css'
import './tools.css'

export default function PixelArtPage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const presets = beadPresetRows()
  const features = pixelFeatures(lang)
  const steps = pixelSteps(lang)
  const uses = pixelGridUses(lang)
  const articles = PIXEL_ARTICLE_IDS.map(id => tutorialArticle(id, lang)).filter(Boolean)

  return (
    <div className="content-page tools-page">
      <div className="content-page-head">
        <BackButton size="md" onClick={() => navigate('/')} />
        <span className="content-kicker">{t('toolsPage.pixel.kicker')}</span>
        <h1 className="content-title">{t('toolsPage.pixel.title')}</h1>
        <p className="content-desc">{t('toolsPage.pixel.lead')}</p>
      </div>

      <div className="tools-cta">
        <Link className="tools-cta-primary" to="/">
          {t('toolsPage.pixel.ctaCanvas')}
        </Link>
        <Link to="/create/image">{t('toolsPage.pixel.ctaPhoto')}</Link>
      </div>

      <section className="tools-section">
        <h2>{t('toolsPage.pixel.featuresTitle')}</h2>
        <div className="tools-rules">
          {features.map(([title, text]) => (
            <div key={title} className="tools-rule-card">
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="tools-section">
        <h2>{t('toolsPage.pixel.stepsTitle')}</h2>
        <ol className="pattern-steps">
          {steps.map(([title, text]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="tools-section">
        <h2>{t('toolsPage.pixel.gridTitle')}</h2>
        <table className="tools-table">
          <caption className="sr-only">{t('toolsPage.pixel.gridCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('toolsPage.pixel.colGrid')}</th>
              <th scope="col">{t('toolsPage.pixel.colCells')}</th>
              <th scope="col">{t('toolsPage.pixel.colUses')}</th>
            </tr>
          </thead>
          <tbody>
            {PIXEL_GRID_SIZES.map((size, index) => {
              const row = presets.find(item => item.size === size)
              return (
                <tr key={size}>
                  <td>
                    {size} × {size}
                  </td>
                  <td>{row ? row.cells : '—'}</td>
                  <td>{uses[index]}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="tools-note">
          {t('toolsPage.pixel.notePre')}
          <Link to="/bead-calculator">{t('toolsPage.pixel.noteCalc')}</Link>
          {t('toolsPage.pixel.noteMid')}
          <Link to="/colors">{t('toolsPage.pixel.noteColors')}</Link>
          {t('toolsPage.pixel.notePost')}
        </p>
      </section>

      <section className="tools-section">
        <h2>{t('toolsPage.pixel.crossTitle')}</h2>
        <p>
          {t('toolsPage.pixel.crossA')}
          <Link to="/bead-patterns">{t('toolsPage.pixel.crossLinkPatterns')}</Link>
          {t('toolsPage.pixel.crossB')}
          <Link to="/ironing">{t('toolsPage.pixel.crossLinkIroning')}</Link>
          {t('toolsPage.pixel.crossC')}
        </p>
      </section>

      <ToolFaq items={faqFor('pixel', lang)} />

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
        <Link className="tools-link-card" to="/">
          <span className="tools-link-card-title">{t('toolsPage.pixel.links.canvas.title')}</span>
          <span className="tools-link-card-desc">{t('toolsPage.pixel.links.canvas.desc')}</span>
        </Link>
        <Link className="tools-link-card" to="/gallery">
          <span className="tools-link-card-title">{t('toolsPage.pixel.links.gallery.title')}</span>
          <span className="tools-link-card-desc">{t('toolsPage.pixel.links.gallery.desc')}</span>
        </Link>
        <Link className="tools-link-card" to="/create/image">
          <span className="tools-link-card-title">{t('toolsPage.pixel.links.createImage.title')}</span>
          <span className="tools-link-card-desc">{t('toolsPage.pixel.links.createImage.desc')}</span>
        </Link>
        <Link className="tools-link-card" to="/colors">
          <span className="tools-link-card-title">{t('toolsPage.pixel.links.colors.title')}</span>
          <span className="tools-link-card-desc">{t('toolsPage.pixel.links.colors.desc')}</span>
        </Link>
      </nav>
    </div>
  )
}
