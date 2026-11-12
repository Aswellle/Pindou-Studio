/**
 * 备料工具页的「常见问题」段落。
 *
 * 问答数据在 toolFaq.js,构建期静态正文用同一份渲染;问题用 <h3> 独立成节,
 * 让检索端能按「一个问题 = 一段答案」直接摘取。
 */

export default function ToolFaq({ items }) {
  if (!items || items.length === 0) return null
  return (
    <section className="tools-section tools-faq" aria-label="常见问题">
      <h2>常见问题</h2>
      {items.map(([question, answer]) => (
        <div key={question} className="tools-faq-item">
          <h3>{question}</h3>
          <p>{answer}</p>
        </div>
      ))}
    </section>
  )
}
