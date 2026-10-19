/**
 * 动态内容页的 SEO 覆盖(title / description / og / robots)。
 *
 * canonical 与 hreflang 由 App.jsx 统一生成(见 utils/seoPath.js):
 * Helmet 对 canonical 按 href 去重,两处同时声明会输出两条链接,
 * 所以这里只负责文案与索引策略,不重复声明 canonical。
 *
 * 挂载顺序:App 的 Helmet 先注册,页面组件后注册 → 同名字段由本组件覆盖;
 * 页面卸载后自动回退到图库级配置。
 */

import { Helmet } from 'react-helmet-async'

const SITE_NAME = '拼豆Studio'

export default function ContentSeo({ title, description, noindex = false }) {
  const fullTitle = title ? `${title} - ${SITE_NAME}` : null
  const robots = noindex
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'

  return (
    <Helmet>
      {fullTitle && <title>{fullTitle}</title>}
      {description && <meta name="description" content={description} />}
      <meta name="robots" content={robots} />
      {fullTitle && <meta property="og:title" content={fullTitle} />}
      {description && <meta property="og:description" content={description} />}
    </Helmet>
  )
}
