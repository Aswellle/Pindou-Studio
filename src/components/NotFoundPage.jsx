/**
 * 404 页面 — 不存在的地址不再静默跳回首页。
 *
 * 此前 `*` 路由是 `<Navigate to="/" replace />`:访问一个不存在的 URL,浏览器
 * 短暂看到首页,地址栏被改写成 `/`,而服务器返回的是 200 —— 这就是典型的
 * 「软 404」。百度、Google、Bing 都明确要求已删除 / 不存在的页面返回 404,
 * 否则会制造无限多个可索引的重复 URL(每个乱路径都变成一份首页副本)。
 *
 * 现在:
 *   · 服务器侧:vercel.json 的兜底 rewrite 只覆盖真实存在的路由,未命中路径由
 *     Vercel 返回 dist/404.html(状态码 404,静态正文自带返回入口);
 *   · 客户端侧(站内点击跳到了不存在的子路由,例如收藏夹里的旧模板 id):
 *     仍渲染本组件,并给出回到主入口的链接。不自动跳转 —— 自动跳转会让用户
 *     分不清「我点错了」还是「页面被删了」。
 *
 * 页面不写进 sitemap,meta 由 App 的 SEO_CONFIG.NotFound 统一设为 noindex。
 */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <div className="not-found-page">
      <h1 className="not-found-title">{t('notFound.title')}</h1>
      <p className="not-found-lead">{t('notFound.lead')}</p>
      <nav className="not-found-links">
        <Link to="/" className="not-found-link">{t('notFound.toCanvas')}</Link>
        <Link to="/gallery" className="not-found-link">{t('notFound.toGallery')}</Link>
        <Link to="/tutorials" className="not-found-link">{t('notFound.toTutorials')}</Link>
      </nav>
      <style>{`
        .not-found-page {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          min-height: 60vh;
          padding: 40px 20px;
          text-align: center;
        }
        .not-found-title {
          margin: 0;
          font-size: var(--text-2xl);
          color: var(--text-primary);
        }
        .not-found-lead {
          margin: 0;
          max-width: 34em;
          color: var(--text-secondary);
          line-height: 1.7;
        }
        .not-found-links {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 10px;
          margin-top: 6px;
        }
        .not-found-link {
          padding: 10px 20px;
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          text-decoration: none;
          font-size: var(--text-sm);
          transition: background 0.15s, color 0.15s;
        }
        .not-found-link:hover {
          background: var(--accent);
          color: white;
        }
      `}</style>
    </div>
  )
}
