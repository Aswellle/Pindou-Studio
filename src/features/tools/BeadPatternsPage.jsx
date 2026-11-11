/**
 * 拼豆图案落地页(/bead-patterns)。
 *
 * 高频词「拼豆图案」此前没有专属页面:/gallery 的标题与正文都用「图纸模板」,
 * 首页讲的是工具。这一页按题材汇总图案入口、说明挑选方法,并接到尺寸与
 * 用豆量参考,承接口语化的「图案」搜索词。
 *
 * 正文中文单语(题材简介来自 categoryMeta 的中文文案),按单语页声明。
 */

import { Link, useNavigate } from 'react-router-dom'
import BackButton from '../../components/BackButton'
import { GALLERY_CATEGORY_META, categoryPagePath } from '../gallery/categoryMeta'
import { tutorialArticle } from './ironingGuide'
import { beadPresetRows } from './beadCalculator'
import { PATTERN_ARTICLE_IDS, PATTERN_TIPS, PATTERN_WAYS } from './landingContent'
import '../gallery/gallery.css'
import './tools.css'

export default function BeadPatternsPage() {
  const navigate = useNavigate()
  const presets = beadPresetRows()
  const articles = PATTERN_ARTICLE_IDS.map((id) => tutorialArticle(id)).filter(Boolean)

  return (
    <div className="content-page tools-page">
      <div className="content-page-head">
        <BackButton size="md" onClick={() => navigate('/gallery')} />
        <span className="content-kicker">图案入口</span>
        <h1 className="content-title">拼豆图案</h1>
        <p className="content-desc">
          拼豆图案就是一颗颗豆子拼出的像素化图形。下面按题材汇总可以直接使用的免费图案,
          并说明尺寸、难度与用色怎么选,以及三种获取图案的方式。
        </p>
      </div>

      <section className="tools-section">
        <h2>按题材找拼豆图案</h2>
        <div className="pattern-category-grid">
          {GALLERY_CATEGORY_META.map((meta) => (
            <Link key={meta.slug} className="pattern-category-card" to={categoryPagePath(meta.slug)}>
              <span className="pattern-category-name">{meta.label}</span>
              {meta.intro ? <span className="pattern-category-intro">{meta.intro}</span> : null}
            </Link>
          ))}
        </div>
      </section>

      <section className="tools-section">
        <h2>怎么挑一张合适的图案</h2>
        <ul className="tools-link-list pattern-tips">
          {PATTERN_TIPS.map(([title, text]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="tools-section">
        <h2>三种获取图案的方式</h2>
        <div className="tools-rules">
          {PATTERN_WAYS.map(([title, text, href, cta]) => (
            <div key={title} className="tools-rule-card">
              <h3>{title}</h3>
              <p>{text}</p>
              <p><Link to={href}>{cta}</Link></p>
            </div>
          ))}
        </div>
      </section>

      <section className="tools-section">
        <h2>常见网格尺寸与用豆量</h2>
        <table className="tools-table">
          <caption className="sr-only">常见方形网格尺寸的用豆量估算</caption>
          <thead>
            <tr>
              <th scope="col">网格</th>
              <th scope="col">总格数</th>
              <th scope="col">八成填充</th>
            </tr>
          </thead>
          <tbody>
            {presets.map((row) => (
              <tr key={row.size}>
                <td>{row.size} × {row.size}</td>
                <td>{row.cells}</td>
                <td>{row.filled80}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tools-note">
          需要按自己的尺寸估算时,用<Link to="/bead-calculator">豆子数量计算器</Link>;
          品牌色号对照见<Link to="/colors">色卡对照表</Link>。
        </p>
      </section>

      {articles.length > 0 && (
        <section className="tools-section">
          <h2>相关教程</h2>
          <ul className="tools-link-list">
            {articles.map((article) => (
              <li key={article.id}>
                <Link to={`/tutorials/${article.id}`}>{article.title}</Link>
                {article.sectionTitle ? <span className="tools-link-meta">{article.sectionTitle}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="tools-links" aria-label="相关页面">
        <Link className="tools-link-chip" to="/gallery">拼豆图纸模板库</Link>
        <Link className="tools-link-chip" to="/pixel-art">像素画生成器</Link>
        <Link className="tools-link-chip" to="/bead-calculator">豆子数量计算器</Link>
        <Link className="tools-link-chip" to="/ironing">熨烫温度对照表</Link>
      </nav>
    </div>
  )
}
