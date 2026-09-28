#!/usr/bin/env node
/**
 * Supabase 迁移文件静态检查:版本号唯一 + $$ 配对
 *
 * 1) `supabase db push` 把文件名前缀 <version> 作为 supabase_migrations.schema_migrations
 *    的主键写入;两个文件共用同一版本号时,第二条记录的 INSERT 会主键冲突
 *    (SQLSTATE 23505, duplicate key value violates unique constraint "schema_migrations_pkey"),
 *    整个 push 失败。
 * 2) 函数体必须用 `as $$ ... $$;` 包住;缺少开头的 `as $$`(如 0014 曾经的样子)会让
 *    plpgsql 主体被当成裸 SQL 解析,执行时报语法错误 —— $$ 个数为奇数即是这种缺陷。
 *
 * 退出码 0 = 通过,1 = 有重复版本号、文件名不合规或 $$ 不配对。
 */
import { readdirSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = resolve(__dirname, '../supabase/migrations')

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
const byVersion = new Map()

let hasError = false

for (const file of files) {
  const match = file.match(/^(\d+)_(.+)\.sql$/)
  if (!match) {
    hasError = true
    console.error(`❌ 迁移文件名不符合 <version>_<name>.sql:${file}`)
    continue
  }
  const [, version] = match
  if (!byVersion.has(version)) byVersion.set(version, [])
  byVersion.get(version).push(file)
}

for (const [version, group] of byVersion) {
  if (group.length > 1) {
    hasError = true
    console.error(`❌ 版本号 ${version} 重复:${group.join('、')} —— supabase db push 会因 schema_migrations 主键冲突(23505)失败`)
  }
}

for (const file of files) {
  const dollarQuotes = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8').match(/\$\$/g)?.length ?? 0
  if (dollarQuotes % 2 !== 0) {
    hasError = true
    console.error(`❌ ${file} 的 \`$$\` 个数为奇数(${dollarQuotes})—— 函数体缺少 \`as $$\` 开头或 \`$$;\` 结尾,执行会报语法错误`)
  }
}

if (!hasError) {
  console.log(`✅ ${files.length} 个迁移文件:版本号唯一、\`$$\` 配对完整`)
}

process.exit(hasError ? 1 : 0)
