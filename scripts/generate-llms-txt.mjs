#!/usr/bin/env node
/**
 * 构建后处理:生成 dist/llms.txt 与 dist/llms-full.txt。
 *
 * 接在 vite build 之后、generate-prerender-html.js 之前。两个文件都由
 * src/features/geo/llms.js 从站内真实数据生成,内容更新后不会残留旧数字。
 *
 * 失败策略:这里生成的是给 AI 检索端的辅助索引,不是页面本身;写盘失败
 * 只打印警告,不让整个构建失败(与 og-snapshots 的降级策略一致)。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLlmsTxt, buildLlmsFullTxt, llmsFacts } from '../src/features/geo/llms.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, '..', 'dist')

function main() {
  if (!fs.existsSync(DIST)) {
    console.warn('[llms] dist 不存在,跳过(应当接在 vite build 之后执行)')
    return
  }

  const facts = llmsFacts()
  try {
    fs.writeFileSync(path.join(DIST, 'llms.txt'), buildLlmsTxt(), 'utf-8')
    fs.writeFileSync(path.join(DIST, 'llms-full.txt'), buildLlmsFullTxt(), 'utf-8')
    console.log(
      `[llms] 已生成 llms.txt 与 llms-full.txt ` +
      `(${facts.brandCount} 个品牌 / ${facts.categoryCount} 个分类 / ` +
      `${facts.tutorialCount} 篇教程 / ${facts.faqCount} 条问答)`,
    )
  } catch (error) {
    console.warn(`[llms] 生成失败,保留现有文件:${error?.message || error}`)
  }
}

main()
