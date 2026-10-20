#!/usr/bin/env node
/**
 * RLS 越权验证脚本(规格 06 §7 访问矩阵)。
 *
 * 为什么需要它:仓库里的单测只验证「发给 PostgREST 的写入形状」,
 * 不能证明线上 RLS 真的拒绝跨用户访问。规格 06 明确要求「用不同用户 / anon
 * token 执行真实 Supabase integration test」。
 *
 * 用法:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_ANON_KEY=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/verify-rls.mjs
 *
 * 脚本会:
 *   1. 用 service_role 创建两个临时账号(A / B,邮箱带 run id 前缀);
 *   2. 分别用 A、B 的 anon 会话写入自己的色卡/库存;
 *   3. 断言 A 读不到、改不了、删不掉 B 的数据,反之亦然;
 *   4. 断言匿名(未登录)读不到个人表;
 *   5. 无论成功失败,最后都用 service_role 删除两个临时账号及其数据。
 *
 * 安全:临时账号密码随机生成,只在内存中;不打印任何 token。
 * 该脚本**只创建/删除自己命名的临时账号**,不读取、不修改任何现有用户的数据;
 * 但它确实会在目标 Supabase 项目里建号/写行,因此**必须由人显式执行**,
 * 不要接到 CI 或任何自动化流程里。
 *
 * 退出码:0 = 全部断言通过;1 = 有断言失败(打印明细)。
 */

import { createClient } from '@supabase/supabase-js'

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function randomPassword() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function createAndSignIn(admin, anonKey, email, password) {
  // 用 service_role 直接建号并标记邮箱已确认:不依赖项目的注册开关/邮件投递,
  // 也不会因为 OTP 配置不同而卡住。临时账号最后一定会被删除。
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser failed: ${error.message}`)

  const client = createClient(URL_, anonKey, { auth: { persistSession: false } })
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`)
  return { client, user: data.user }
}

async function main() {
  if (!URL_ || !ANON || !SERVICE) {
    console.error('缺少环境变量:需要 SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(2)
  }

  const runId = `rls-${Date.now().toString(36)}`
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
  const createdUsers = []

  try {
    // ── 准备两个用户 ────────────────────────────────────────
    const aEmail = `${runId}-a@example.com`
    const bEmail = `${runId}-b@example.com`
    const password = randomPassword()

    const anon = createClient(URL_, ANON, { auth: { persistSession: false } })

    const aSession = await createAndSignIn(admin, ANON, aEmail, password)
    const bSession = await createAndSignIn(admin, ANON, bEmail, password)
    const aUser = aSession.user
    const bUser = bSession.user
    const a = aSession.client
    const b = bSession.client
    createdUsers.push(aUser.id, bUser.id)
    check('创建两个临时账号', true, `${aUser.id.slice(0, 8)}… / ${bUser.id.slice(0, 8)}…`)

    // ── A 写入自己的数据 ────────────────────────────────────
    const { data: palette, error: pErr } = await a
      .from('user_palettes')
      .insert({ user_id: aUser.id, name: 'RLS test palette' })
      .select()
      .single()
    if (pErr) throw new Error(`A createPalette failed: ${pErr.message}`)

    const { error: cErr } = await a
      .from('user_palette_colors')
      .insert({
        user_id: aUser.id,
        palette_id: palette.id,
        code: 'T1',
        hex: '#123456',
        sort_order: 0,
        source: 'factory',
      })
    check('A 能写自己的色卡与颜色', !cErr, cErr?.message)

    const { error: iErr } = await a
      .from('user_bead_inventory')
      .upsert({
        user_id: aUser.id,
        palette_key: `user:${palette.id}:T1`,
        palette_color_id: null,
        quantity: 100,
        status: 'owned',
      }, { onConflict: 'user_id,palette_key' })
    check('A 能写自己的库存', !iErr, iErr?.message)

    // ── B 读不到 A 的数据 ───────────────────────────────────
    const { data: bReadsPalettes, error: bReadErr } = await b
      .from('user_palettes')
      .select('*')
    check('B 读不到 A 的色卡', !bReadErr && (bReadsPalettes || []).length === 0,
      bReadErr?.message || `返回 ${bReadsPalettes?.length ?? 0} 行`)

    const { data: bReadsInventory, error: bInvErr } = await b
      .from('user_bead_inventory')
      .select('*')
    check('B 读不到 A 的库存', !bInvErr && (bReadsInventory || []).length === 0,
      bInvErr?.message || `返回 ${bReadsInventory?.length ?? 0} 行`)

    const { data: bReadsColors, error: bColErr } = await b
      .from('user_palette_colors')
      .select('*')
    check('B 读不到 A 的颜色', !bColErr && (bReadsColors || []).length === 0,
      bColErr?.message || `返回 ${bReadsColors?.length ?? 0} 行`)

    // ── B 改不了 / 删不掉 A 的数据 ──────────────────────────
    const { data: bUpdates, error: bUpdErr } = await b
      .from('user_palettes')
      .update({ name: 'hacked' })
      .eq('id', palette.id)
      .select()
    check('B 改不了 A 的色卡', (bUpdates || []).length === 0,
      bUpdErr?.message || `更新了 ${bUpdates?.length ?? 0} 行`)

    const { data: bDeletes, error: bDelErr } = await b
      .from('user_palettes')
      .delete()
      .eq('id', palette.id)
      .select()
    check('B 删不掉 A 的色卡', (bDeletes || []).length === 0,
      bDelErr?.message || `删除了 ${bDeletes?.length ?? 0} 行`)

    // ── B 不能把颜色挂到 A 的色卡下 ─────────────────────────
    const { error: bInjectErr } = await b
      .from('user_palette_colors')
      .insert({
        user_id: bUser.id,
        palette_id: palette.id, // A 的色卡
        code: 'X1',
        hex: '#FFFFFF',
        sort_order: 0,
        source: 'factory',
      })
    check('B 不能把颜色挂到 A 的色卡下', Boolean(bInjectErr), bInjectErr?.message || '写入成功了(越权)')

    // ── 匿名读不到任何个人表 ────────────────────────────────
    const anonPalettes = await anon.from('user_palettes').select('*')
    const anonInventory = await anon.from('user_bead_inventory').select('*')
    check('匿名读不到 user_palettes',
      !anonPalettes.error && (anonPalettes.data || []).length === 0,
      anonPalettes.error?.message || `返回 ${anonPalettes.data?.length ?? 0} 行`)
    check('匿名读不到 user_bead_inventory',
      !anonInventory.error && (anonInventory.data || []).length === 0,
      anonInventory.error?.message || `返回 ${anonInventory.data?.length ?? 0} 行`)

    // ── 匿名不能写 ─────────────────────────────────────────
    const anonWrite = await anon
      .from('user_palettes')
      .insert({ user_id: aUser.id, name: 'anon' })
    check('匿名不能写 user_palettes', Boolean(anonWrite.error), anonWrite.error?.message || '写入成功了(越权)')

    // ── A 自己的数据仍然可读(正向对照,防「全被拒」假阳性)──
    const { data: aOwn, error: aOwnErr } = await a.from('user_palettes').select('*')
    check('A 仍能读自己的色卡(正向对照)',
      !aOwnErr && (aOwn || []).length === 1,
      aOwnErr?.message || `返回 ${aOwn?.length ?? 0} 行`)
  } catch (e) {
    check('执行过程无异常', false, e?.message || String(e))
  } finally {
    // ── 清理:删除临时账号(级联删除其色卡/颜色/库存)──
    for (const id of createdUsers) {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) console.error(`清理临时账号失败(${id.slice(0, 8)}…): ${error.message}`)
    }
    const failed = results.filter((r) => !r.ok)
    console.log('')
    console.log(`共 ${results.length} 项,通过 ${results.length - failed.length},失败 ${failed.length}`)
    process.exit(failed.length === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
