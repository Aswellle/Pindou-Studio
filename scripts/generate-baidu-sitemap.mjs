#!/usr/bin/env node
/**
 * 构建后处理:从标准 dist/sitemap.xml 生成百度专用的 dist/sitemap-baidu.xml。
 *
 * 为什么拆两份:
 *   百度移动 sitemap 扩展命名空间不被 Google 接受,GSC 会报「命名空间不正确」。
 *   标准 sitemap 提交 Google/Bing;带 mobile 标记的这份只提交百度搜索资源平台。
 *
 * 接在 sitemap-lastmod.mjs 之后,保证两份文件的 URL 集合与 lastmod 完全一致。
 * 失败策略同其他构建后脚本:任何异常只跳过生成,不让构建失败。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildBaiduSitemap } from '../src/features/gallery/baiduSitemap.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'dist', 'sitemap.xml')
const OUT = path.join(ROOT, 'dist', 'sitemap-baidu.xml')

const log = (msg) => console.log(`[baidu-sitemap] ${msg}`)

try {
  if (!fs.existsSync(SRC)) {
    log('dist/sitemap.xml 不存在,跳过(应当接在 vite build 之后执行)')
  } else {
    const xml = fs.readFileSync(SRC, 'utf8')
    const out = buildBaiduSitemap(xml)
    fs.writeFileSync(OUT, out)
    const marked = (out.match(/type="pc,mobile"/g) || []).length
    log(`已生成 dist/sitemap-baidu.xml(${marked} 条移动标记)`)
  }
} catch (e) {
  log(`跳过:${e?.message || e}`)
}
