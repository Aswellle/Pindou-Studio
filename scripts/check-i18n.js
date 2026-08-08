#!/usr/bin/env node
/**
 * i18n 键同步检查
 * 以 zh-CN 为基准，检查其他三个 locale 是否有缺失或多余的键。
 * 退出码 0 = 全部同步，1 = 有差异。
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = resolve(__dirname, '../src/i18n/locales')

const LOCALE_FILES = {
  'zh-CN': `${LOCALES_DIR}/zh-CN.json`,
  'en-US': `${LOCALES_DIR}/en-US.json`,
  'ja-JP': `${LOCALES_DIR}/ja-JP.json`,
  'ko-KR': `${LOCALES_DIR}/ko-KR.json`,
}

function extractKeys(obj, prefix = '') {
  const keys = []
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...extractKeys(v, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

// 提取每个 leaf 值中的插值变量 {{name}},用于跨语言一致性校验
function extractInterpolations(obj, prefix = '') {
  const vars = []
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      vars.push(...extractInterpolations(v, fullKey))
    } else if (typeof v === 'string') {
      const found = [...v.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort().join(',')
      if (found) vars.push([fullKey, found])
    }
  }
  return vars
}

let hasError = false

const keysByLocale = {}
const dataByLocale = {}
for (const [locale, filePath] of Object.entries(LOCALE_FILES)) {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'))
    dataByLocale[locale] = data
    keysByLocale[locale] = new Set(extractKeys(data))
  } catch (e) {
    console.error(`[${locale}] 无法读取文件: ${e.message}`)
    hasError = true
  }
}

if (!hasError) {
  const reference = keysByLocale['zh-CN']
  const refVars = new Map(extractInterpolations(dataByLocale['zh-CN']))

  for (const [locale, keys] of Object.entries(keysByLocale)) {
    if (locale === 'zh-CN') continue

    const missing = [...reference].filter(k => !keys.has(k))
    const extra   = [...keys].filter(k => !reference.has(k))

    if (missing.length > 0) {
      console.error(`\n[${locale}] 缺少 ${missing.length} 个键:`)
      missing.forEach(k => console.error(`  - ${k}`))
      hasError = true
    }
    if (extra.length > 0) {
      console.error(`\n[${locale}] 多余 ${extra.length} 个键（zh-CN 中不存在）:`)
      extra.forEach(k => console.error(`  + ${k}`))
      hasError = true
    }

    // 插值变量一致性:同一键在 zh-CN 与各语言中的 {{var}} 集合必须一致,
    // 否则运行时渲染出字面量占位符
    const locVars = new Map(extractInterpolations(dataByLocale[locale]))
    const varDiff = [...refVars].filter(([k, v]) => locVars.get(k) !== v)
    if (varDiff.length > 0) {
      console.error(`\n[${locale}] ${varDiff.length} 个键的插值变量与 zh-CN 不一致:`)
      varDiff.forEach(([k, zhVars]) => {
        console.error(`  - ${k}:zh-CN [${zhVars}] vs ${locale} [${locVars.get(k) || ''}]`)
      })
      hasError = true
    }
  }
}

if (!hasError) {
  console.log('✅ 所有 i18n 键同步一致,插值变量一致')
}

process.exit(hasError ? 1 : 0)
