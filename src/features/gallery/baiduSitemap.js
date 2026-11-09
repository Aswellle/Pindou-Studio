/**
 * baiduSitemap — 由标准 sitemap 生成百度专用变体(纯函数部分)。
 *
 * 背景:
 *   百度移动 sitemap 扩展(`xmlns:mobile` + `<mobile:mobile type="pc,mobile"/>`)
 *   不是 sitemaps.org 标准命名空间。Google 的解析器不认识它,在 GSC 里会把
 *   整份 sitemap 标成「站点地图可读取,但存在错误 — 命名空间不正确」。
 *   站点地图本身仍可被读取,但错误会一直挂着,而且没有保留这条标记的必要。
 *
 * 做法:
 *   标准 `sitemap.xml` 只保留通用命名空间,提交 Google/Bing/搜狗/360;
 *   构建末尾由本模块从同一份内容生成 `sitemap-baidu.xml`,给每个 <url> 补上
 *   百度移动标记,只提交到百度搜索资源平台。两份内容始终同源,不会漂移。
 *
 * 注意:`sitemap-baidu.xml` 不要写进 robots.txt、也不要在站内链接——
 *   Google 一旦发现它,又会被同样报错。
 */

export const BAIDU_MOBILE_NS = 'http://www.baidu.com/schemas/sitemap-mobile/1/'

/**
 * 给标准 sitemap 补上百度移动扩展。
 *
 * 幂等:已有命名空间/标记时不重复插入,重复执行结果一致。
 *
 * @param {string} xml 标准 sitemap.xml 内容
 * @returns {string}
 */
export function buildBaiduSitemap(xml) {
  if (typeof xml !== 'string' || !xml.includes('<urlset')) return xml

  let out = xml
  if (!out.includes('xmlns:mobile=')) {
    out = out.replace(/<urlset\b([^>]*)>/, `<urlset$1 xmlns:mobile="${BAIDU_MOBILE_NS}">`)
  }

  out = out.replace(/<url>[\s\S]*?<\/url>/g, (block) => {
    if (block.includes('<mobile:mobile')) return block
    return block.replace(/(<loc>[^<]*<\/loc>)/, '$1\n    <mobile:mobile type="pc,mobile"/>')
  })

  return out
}
