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
// canonical 站点:OG 图片必须是绝对地址,社交平台不会解析相对路径
const SITE = 'https://tangnotes.site'

export default function ContentSeo({ title, description, image, noindex = false }) {
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
      {/* 社交卡片:有封面就用封面(必须是绝对地址),否则交给站点默认图 */}
      {image && <meta property="og:image" content={absoluteUrl(image)} />}
      {image && <meta name="twitter:image" content={absoluteUrl(image)} />}
      {fullTitle && <meta name="twitter:title" content={fullTitle} />}
      {description && <meta name="twitter:description" content={description} />}
    </Helmet>
  )
}

/**
 * 站内相对路径补全为绝对地址;已是绝对地址则原样返回。
 * 社交平台的抓取端不解析相对 URL,漏了这一步分享卡片会没有图。
 */
function absoluteUrl(url) {
  if (typeof url !== 'string' || !url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${SITE}${url.startsWith('/') ? '' : '/'}${url}`
}
