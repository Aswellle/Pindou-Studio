/**
 * 动态快照的干净 HTML 模板路径。
 *
 * 背景:
 *   generate-og-snapshots.js 需要在 <div id="root"></div> 里注入内容页正文,
 *   但它在 generate-prerender-html.js 之后运行 —— 此时 dist/index.html 的
 *   #root 已经被首页静态正文占满,快照会继承首页正文(标题是分类/图纸,
 *   正文却是首页),对不执行 JS 的抓取端就是内容与 URL 不符。
 *
 * 做法:
 *   generate-prerender-html.js 在写首页之前,把带 build-id 的**干净版本**
 *   写到系统临时目录;generate-og-snapshots.js 优先读它,读不到再退回
 *   dist/index.html(兼容单独运行快照脚本的旧用法)。
 *
 * 为什么用临时目录而不是 dist:
 *   dist 里的任何文件都会随部署上线。模板文件不需要被访问,也不该出现在
 *   sitemap 或站点目录里。路径带仓库根目录哈希,同机多个 checkout 不会互相覆盖。
 */
import crypto from 'crypto'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT_HASH = crypto.createHash('sha1').update(ROOT).digest('hex').slice(0, 12)

export const SEO_TEMPLATE_PATH = path.join(
  os.tmpdir(),
  `bead-studio-seo-template-${ROOT_HASH}.html`,
)
