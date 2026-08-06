/**
 * 预渲染静态 SEO HTML
 * 百度等爬虫不执行 JS,SPA 的动态 Helmet 对它们不可见。
 * 构建后为每个路由生成一份静态 index.html 副本(gallery.html 等),
 * 替换其中的 title/description/canonical/og 为对应页面的 SEO 信息。
 * Vercel 静态文件优先于 rewrites,访问 /gallery 会命中 gallery.html,
 * 爬虫拿到正确 SEO;客户端 JS 加载后 react-router 正常接管,功能不变。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SITE = 'https://tangnotes.site'
const PAGES = [
  {
    file: 'gallery.html',
    path: '/gallery',
    title: '拼豆图库与模板 - 拼豆Studio',
    desc: '浏览并收藏拼豆图案模板，按分类与难度筛选，一键载入画布开始创作。支持收藏与作品管理，适合拼豆爱好者和手工达人。',
  },
  {
    file: 'tutorials.html',
    path: '/tutorials',
    title: '拼豆教程 - 从入门到进阶 · 拼豆Studio',
    desc: '系统学习拼豆制作：入门指南、熨烫全解、防变形技巧、配色设计、进阶技巧与作品保护，配有图示与温度对照表，新手友好。',
  },
  {
    file: 'admin.html',
    path: '/admin',
    title: '后台管理 - 拼豆Studio',
    desc: '拼豆Studio 站点后台管理。',
    noindex: true,
  },
  {
    file: 'privacy.html',
    path: '/privacy',
    title: '隐私政策 - 拼豆Studio',
    desc: '了解拼豆Studio如何收集、使用和保护您的个人信息，以及账号验证、云端存储与第三方服务的详细说明。',
  },
  {
    file: 'terms.html',
    path: '/terms',
    title: '服务条款 - 拼豆Studio',
    desc: '使用拼豆Studio在线拼豆图纸设计工具的服务条款：账户安全、用户内容、模板库与使用规范。',
  },
]

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(__dirname, '..', 'dist')
const indexHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf-8')

const escapeReg = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

for (const page of PAGES) {
  const url = SITE + page.path
  const robots = page.noindex
    ? '<meta name="robots" content="noindex, nofollow" />'
    : '<meta name="robots" content="index, follow" />'

  let out = indexHtml
    .replace(/<title>.*?<\/title>/s, `<title>${page.title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${page.desc}" />`)
    .replace(/<meta name="robots" content="[^"]*"\s*\/?>/, robots)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${url}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${page.title}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${page.desc}" />`)

  fs.writeFileSync(path.join(dist, page.file), out)
  console.log(`prerendered: ${page.file} -> ${url}`)
}
console.log(`完成 ${PAGES.length} 个预渲染页面`)
