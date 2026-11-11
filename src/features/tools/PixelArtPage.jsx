/**
 * 像素画生成器落地页(/pixel-art)。
 *
 * 画布本身是像素编辑器,但此前没有一页用「像素画生成器」这组词承接搜索 ——
 * 首页标题里只带过一句「像素画在线制作」。这一页讲清楚能画什么、怎么画、
 * 网格怎么选,并把三条真实路径(空白画布 / 图片转像素 / 现成图案)摆出来。
 *
 * 正文中文单语,按单语页声明 hreflang。
 */

import { Link, useNavigate } from 'react-router-dom'
import BackButton from '../../components/BackButton'
import { beadPresetRows } from './beadCalculator'
import { tutorialArticle } from './ironingGuide'
import {
  PIXEL_ARTICLE_IDS,
  PIXEL_FEATURES,
  PIXEL_GRID_USES,
  PIXEL_STEPS,
} from './landingContent'
import '../gallery/gallery.css'
import './tools.css'

export default function PixelArtPage() {
  const navigate = useNavigate()
  const presets = beadPresetRows()
  const articles = PIXEL_ARTICLE_IDS.map((id) => tutorialArticle(id)).filter(Boolean)

  return (
    <div className="content-page tools-page">
      <div className="content-page-head">
        <BackButton size="md" onClick={() => navigate('/')} />
        <span className="content-kicker">在线工具</span>
        <h1 className="content-title">像素画生成器</h1>
        <p className="content-desc">
          在浏览器里直接画像素画:自定义网格尺寸,画笔、填充、选区、镜像都齐备;
          也可以上传照片自动转成像素图,最后导出 PNG / SVG 或带色号的拼豆图纸。
        </p>
      </div>

      <div className="tools-cta">
        <Link className="tools-cta-primary" to="/">打开画布开始画</Link>
        <Link to="/create/image">上传照片转像素图</Link>
      </div>

      <section className="tools-section">
        <h2>能做什么</h2>
        <div className="tools-rules">
          {PIXEL_FEATURES.map(([title, text]) => (
            <div key={title} className="tools-rule-card">
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="tools-section">
        <h2>三步画出一张像素图</h2>
        <ol className="pattern-steps">
          {PIXEL_STEPS.map(([title, text]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="tools-section">
        <h2>网格尺寸怎么选</h2>
        <table className="tools-table">
          <caption className="sr-only">像素画网格尺寸与常见用途</caption>
          <thead>
            <tr>
              <th scope="col">网格</th>
              <th scope="col">总格数</th>
              <th scope="col">常见用途</th>
            </tr>
          </thead>
          <tbody>
            {PIXEL_GRID_USES.map(([size, use]) => {
              const row = presets.find((item) => item.size === size)
              return (
                <tr key={size}>
                  <td>{size} × {size}</td>
                  <td>{row ? row.cells : '—'}</td>
                  <td>{use}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="tools-note">
          不知道要多少豆子?用<Link to="/bead-calculator">豆子数量计算器</Link>按填充比例估算;
          配色查<Link to="/colors">品牌色卡对照表</Link>。
        </p>
      </section>

      <section className="tools-section">
        <h2>像素画还能怎么用</h2>
        <p>
          像素画和拼豆图纸是同一件事的两种叫法:都是网格上的一格一色。
          在拼豆Studio 里,同一张画布既能当像素画导出,也能转成带品牌色号的图纸 ——
          按色号买豆子、按网格数着拼即可。想要现成图案,可以从
          <Link to="/bead-patterns">拼豆图案</Link>按题材进入;
          第一次做拼豆,建议先看<Link to="/ironing">熨烫温度对照表</Link>。
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
        <Link className="tools-link-chip" to="/">拼豆画布工具</Link>
        <Link className="tools-link-chip" to="/gallery">拼豆图纸模板库</Link>
        <Link className="tools-link-chip" to="/create/image">图片转拼豆图纸</Link>
        <Link className="tools-link-chip" to="/colors">品牌色卡对照表</Link>
      </nav>
    </div>
  )
}
