/**
 * 熨烫温度对照页(/ironing)。
 *
 * 内容是**中文单语**的:温度表与翻车表直接取自中文教程数据,不另写一份。
 * 目标搜索词(拼豆熨烫温度、熨斗档位、烫焦了怎么办)本身就是中文,
 * 声明单语页比给中文正文挂 en/ja/ko 变体更诚实(见 SEO_CONFIG.singleLanguage)。
 */

import { Link, useNavigate } from 'react-router-dom'
import BackButton from '../../components/BackButton'
import { IRONING_RULES, ironingReference } from './ironingGuide'
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
          {table.headers.map((header) => (
            <th key={header} scope="col">{header}</th>
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

const RULES = IRONING_RULES

export default function IroningGuidePage() {
  const navigate = useNavigate()
  const { brandTable, failureTable, articles } = ironingReference()

  return (
    <div className="content-page tools-page">
      <div className="content-page-head">
        <BackButton size="md" onClick={() => navigate('/tutorials')} />
        <span className="content-kicker">熨烫参考</span>
        <h1 className="content-title">拼豆熨烫温度对照表</h1>
        <p className="content-desc">
          各品牌熨斗档位、正反面时间与常见翻车的对照。表格内容与拼豆教程的熨烫章节同源,
          具体温度请以手上那包珠子的说明为准。
        </p>
      </div>

      <section className="tools-rules" aria-label="熨烫要点">
        {RULES.map(([title, text]) => (
          <div key={title} className="tools-rule-card">
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
        ))}
      </section>

      <section className="tools-section">
        <h2>品牌温度对照</h2>
        <DataTable table={brandTable} caption="各拼豆品牌的熨斗档位与特性" />
        <p className="tools-note">
          新品牌第一次熨烫时,先在角落一两颗珠子上试温,观察融化程度再全面熨烫。
        </p>
      </section>

      <section className="tools-section">
        <h2>常见翻车与处理</h2>
        <DataTable table={failureTable} caption="熨烫常见问题的原因与急救方法" />
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
        <Link className="tools-link-chip" to="/create/image">图片转拼豆图纸</Link>
        <Link className="tools-link-chip" to="/gallery">拼豆图纸模板库</Link>
        <Link className="tools-link-chip" to="/colors">品牌色卡对照表</Link>
        <Link className="tools-link-chip" to="/bead-calculator">豆子数量计算器</Link>
      </nav>
    </div>
  )
}
