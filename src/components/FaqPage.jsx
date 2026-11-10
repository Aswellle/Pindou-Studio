import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { faqItemsFor, faqPageTextFor } from '../data/faq'
import './FaqPage.css'

/**
 * 常见问题页(/faq)。
 *
 * 正文来自 src/data/faq.js 的四语言内容源;构建期 /faq.html 使用同一份中文
 * 数据生成 FAQPage 结构化数据,保证页面可见内容与结构化数据完全一致。
 */
export default function FaqPage() {
  const { i18n } = useTranslation()
  const text = faqPageTextFor(i18n.language)
  const items = faqItemsFor(i18n.language)

  return (
    <div className="faq-page">
      <header className="faq-head">
        <h1>{text.title}</h1>
        <p className="faq-intro">{text.intro}</p>
      </header>

      <div className="faq-list">
        {items.map((item, index) => (
          <article key={item.id} className="faq-item" aria-labelledby={`faq-${item.id}`}>
            <div className="faq-question">
              <span className="faq-mark faq-mark-q" aria-hidden="true">Q</span>
              <h2 id={`faq-${item.id}`}>{item.question}</h2>
              <span className="faq-number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
            </div>
            <div className="faq-answer">
              <span className="faq-mark faq-mark-a" aria-hidden="true">A</span>
              <p>{item.answer}</p>
            </div>
          </article>
        ))}
      </div>

      <nav className="faq-links" aria-label={text.more}>
        <span className="faq-links-title">{text.more}</span>
        <Link to="/create/image">{text.links.create}</Link>
        <Link to="/gallery">{text.links.gallery}</Link>
        <Link to="/tutorials">{text.links.tutorials}</Link>
        <Link to="/contact">{text.links.contact}</Link>
      </nav>
    </div>
  )
}
