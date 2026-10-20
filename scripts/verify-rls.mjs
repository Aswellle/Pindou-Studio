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
 *   node scripts/verify-rls.mjs
 *
 *   # 可选:提供 service_role 时,脚本会用它建号并在结束时删除临时账号
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-rls.mjs
 *
 * 两种模式:
 *   - **有 service_role**:建号 → 验证 → 删号,不留下任何痕迹(推荐)。
 *   - **无 service_role**(项目开启 autoconfirm 时):用匿名 signUp 建两个临时账号,
 *     验证后**无法删除**(删号需要 admin),脚本会在结尾打印两个待清理邮箱。
 *     账号内只有脚本自己写入的测试行,不含任何真实用户数据。
 *
 * 脚本会:
 *   1. 创建两个临时账号(A / B,邮箱带 run id 前缀);
 *   2. 分别用 A、B 的会话写入自己的色卡/颜色/库存/作品;
 *   3. 断言 A 读不到、改不了、删不掉 B 的数据,反之亦然;
 *   4. 断言匿名(未登录)读不到个人表、写不进去;
 *   5. 正向对照:确认 A 仍能读自己的数据(防「全被拒」假阳性)。
 *
 * 安全:临时账号密码随机生成,只在内存中;不打印任何 token。
 * 该脚本**只读写自己命名的临时账号**,不读取、不修改任何现有用户的数据;
 * 但它确实会在目标 Supabase 项目里建号/写行,因此**必须由人显式执行**,
 * 不要接到 CI 或任何自动化流程里。
 *
 * 退出码:0 = 全部断言通过;1 = 有断言失败(打印明细)。
 */

import { createClient } from '@supabase/supabase-js'

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
// .env.local 里的占位符(如 "[SENSITIVE]")会让 supabase-js 发出无效请求,
// 视为「未提供」而不是「提供错了」。
const HAS_SERVICE = Boolean(SERVICE && SERVICE.length > 20 && !SERVICE.startsWith('['))

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * 网络抖动重试。
 *
 * 关键:supabase-js 把传输层失败(undici `fetch failed`)也塞进 `error`,
 * 与「RLS 拒绝」长得一模一样。若直接断言 `error 为空`,一次网络抖动就会变成
 * 假失败;若断言「有 error 就是拒绝」,抖动又会被误判成越权被拦。
 * 所以这里只对传输层错误重试,真正的 PostgREST 错误原样返回。
 */
const NETWORK_ERROR = /fetch failed|network|ECONNRESET|ETIMEDOUT|socket hang up/i

async function retry(fn, attempts = 4) {
  let last
  for (let i = 0; i < attempts; i++) {
    last = await fn()
    const msg = last?.error?.message || ''
    if (!NETWORK_ERROR.test(msg)) return last
    await new Promise((r) => setTimeout(r, 400 * (i + 1)))
  }
  return last
}

function randomPassword() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function createAndSignIn(admin, anonKey, email, password) {
  if (HAS_SERVICE) {
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

  // 无 service_role:走匿名 signUp。项目开启 autoconfirm 时会直接返回会话;
  // 若需要邮件确认,这里拿不到 session,直接给出可读的失败原因。
  const client = createClient(URL_, anonKey, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signUp({ email, password })
  if (error) throw new Error(`signUp failed: ${error.message}`)
  if (!data?.session) {
    throw new Error('signUp 未返回会话:项目未开启 autoconfirm,且没有 service_role 可用于建号')
  }
  return { client, user: data.user }
}

async function main() {
  if (!URL_ || !ANON) {
    console.error('缺少环境变量:需要 SUPABASE_URL / SUPABASE_ANON_KEY')
    process.exit(2)
  }

  const runId = `rls-${Date.now().toString(36)}`
  const admin = HAS_SERVICE ? createClient(URL_, SERVICE, { auth: { persistSession: false } }) : null
  const createdUsers = []
  const createdEmails = []
  console.log(`模式: ${HAS_SERVICE ? 'service_role(结束后删除临时账号)' : 'anon signUp(临时账号需手工清理)'}\n`)

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
    createdEmails.push(aEmail, bEmail)
    check('创建两个临时账号', true, `${aUser.id.slice(0, 8)}… / ${bUser.id.slice(0, 8)}…`)

    // ── A 写入自己的数据 ────────────────────────────────────
    const { data: palette, error: pErr } = await retry(() => a
      .from('user_palettes')
      .insert({ user_id: aUser.id, name: 'RLS test palette' })
      .select()
      .single())
    if (pErr || !palette) throw new Error(`A createPalette failed: ${pErr?.message || 'no row'}`)

    const { error: cErr } = await retry(() => a
      .from('user_palette_colors')
      .insert({
        user_id: aUser.id,
        palette_id: palette.id,
        code: 'T1',
        hex: '#123456',
        sort_order: 0,
        source: 'factory',
      }))
    check('A 能写自己的色卡与颜色', !cErr, cErr?.message)

    const { error: iErr } = await retry(() => a
      .from('user_bead_inventory')
      .upsert({
        user_id: aUser.id,
        palette_key: `user:${palette.id}:T1`,
        palette_color_id: null,
        quantity: 100,
        status: 'owned',
      }, { onConflict: 'user_id,palette_key' }))
    check('A 能写自己的库存', !iErr, iErr?.message)

    // works 也在验证范围内(B2 清单):A 建一件作品
    const { data: work, error: wErr } = await retry(() => a
      .from('works')
      .insert({
        user_id: aUser.id,
        name: 'RLS test work',
        canvas_data: [[null]],
        grid_size: 1,
      })
      .select()
      .single())
    check('A 能写自己的作品', !wErr && Boolean(work), wErr?.message || (!work ? '未返回行' : ''))

    // ── B 读不到 A 的数据 ───────────────────────────────────
    const { data: bReadsPalettes, error: bReadErr } = await retry(() => b
      .from('user_palettes')
      .select('*'))
    check('B 读不到 A 的色卡', !bReadErr && (bReadsPalettes || []).length === 0,
      bReadErr?.message || `返回 ${bReadsPalettes?.length ?? 0} 行`)

    const { data: bReadsInventory, error: bInvErr } = await retry(() => b
      .from('user_bead_inventory')
      .select('*'))
    check('B 读不到 A 的库存', !bInvErr && (bReadsInventory || []).length === 0,
      bInvErr?.message || `返回 ${bReadsInventory?.length ?? 0} 行`)

    const { data: bReadsColors, error: bColErr } = await retry(() => b
      .from('user_palette_colors')
      .select('*'))
    check('B 读不到 A 的颜色', !bColErr && (bReadsColors || []).length === 0,
      bColErr?.message || `返回 ${bReadsColors?.length ?? 0} 行`)

    // ── B 改不了 / 删不掉 A 的数据 ──────────────────────────
    const { data: bUpdates, error: bUpdErr } = await retry(() => b
      .from('user_palettes')
      .update({ name: 'hacked' })
      .eq('id', palette.id)
      .select())
    check('B 改不了 A 的色卡', (bUpdates || []).length === 0,
      bUpdErr?.message || `更新了 ${bUpdates?.length ?? 0} 行`)

    const { data: bDeletes, error: bDelErr } = await retry(() => b
      .from('user_palettes')
      .delete()
      .eq('id', palette.id)
      .select())
    check('B 删不掉 A 的色卡', (bDeletes || []).length === 0,
      bDelErr?.message || `删除了 ${bDeletes?.length ?? 0} 行`)

    // ── B 不能把颜色挂到 A 的色卡下 ─────────────────────────
    const { error: bInjectErr } = await retry(() => b
      .from('user_palette_colors')
      .insert({
        user_id: bUser.id,
        palette_id: palette.id, // A 的色卡
        code: 'X1',
        hex: '#FFFFFF',
        sort_order: 0,
        source: 'factory',
      }))
    check('B 不能把颜色挂到 A 的色卡下', Boolean(bInjectErr), bInjectErr?.message || '写入成功了(越权)')

    // ── works:跨用户隔离 ───────────────────────────────────
    const { data: bReadsWorks, error: bWorksErr } = await retry(() => b.from('works').select('*'))
    check('B 读不到 A 的作品', !bWorksErr && (bReadsWorks || []).length === 0,
      bWorksErr?.message || `返回 ${bReadsWorks?.length ?? 0} 行`)

    if (work) {
      const { data: bUpdatesWorks } = await retry(() => b
        .from('works')
        .update({ name: 'hacked' })
        .eq('id', work.id)
        .select())
      check('B 改不了 A 的作品', (bUpdatesWorks || []).length === 0)

      const { data: bDeletesWorks } = await retry(() => b
        .from('works')
        .delete()
        .eq('id', work.id)
        .select())
      check('B 删不掉 A 的作品', (bDeletesWorks || []).length === 0)
    } else {
      // A 的作品没建成功:跳过而不是假装通过
      check('B 改不了 A 的作品', false, '前置失败:A 的作品未创建')
      check('B 删不掉 A 的作品', false, '前置失败:A 的作品未创建')
    }

    // ── 匿名读不到任何个人表 ────────────────────────────────
    const anonPalettes = await retry(() => anon.from('user_palettes').select('*'))
    const anonInventory = await retry(() => anon.from('user_bead_inventory').select('*'))
    const anonWorks = await retry(() => anon.from('works').select('*'))
    check('匿名读不到 user_palettes',
      !anonPalettes.error && (anonPalettes.data || []).length === 0,
      anonPalettes.error?.message || `返回 ${anonPalettes.data?.length ?? 0} 行`)
    check('匿名读不到 user_bead_inventory',
      !anonInventory.error && (anonInventory.data || []).length === 0,
      anonInventory.error?.message || `返回 ${anonInventory.data?.length ?? 0} 行`)
    check('匿名读不到 works',
      !anonWorks.error && (anonWorks.data || []).length === 0,
      anonWorks.error?.message || `返回 ${anonWorks.data?.length ?? 0} 行`)

    // ── 匿名不能写 ─────────────────────────────────────────
    const anonWrite = await retry(() => anon
      .from('user_palettes')
      .insert({ user_id: aUser.id, name: 'anon' }))
    check('匿名不能写 user_palettes', Boolean(anonWrite.error), anonWrite.error?.message || '写入成功了(越权)')

    const anonWorksWrite = await retry(() => anon
      .from('works')
      .insert({ user_id: aUser.id, name: 'anon', canvas_data: [[null]], grid_size: 1 }))
    check('匿名不能写 works', Boolean(anonWorksWrite.error), anonWorksWrite.error?.message || '写入成功了(越权)')

    // ── A 自己的数据仍然可读(正向对照,防「全被拒」假阳性)──
    // 断言 >= 1 而不是 == 1:insert 是非幂等的,上面的网络重试可能写入重复行
    // (服务端成功但响应在传输中丢失)。这里只关心「A 看得见自己的数据」,
    // 跨用户泄漏已由 B 侧「返回 0 行」覆盖。
    const { data: aOwn, error: aOwnErr } = await retry(() => a.from('user_palettes').select('*'))
    check('A 仍能读自己的色卡(正向对照)',
      !aOwnErr && (aOwn || []).length >= 1,
      aOwnErr?.message || `返回 ${aOwn?.length ?? 0} 行`)
  } catch (e) {
    check('执行过程无异常', false, e?.message || String(e))
  } finally {
    // ── 清理:删除临时账号(级联删除其色卡/颜色/库存/作品)──
    if (HAS_SERVICE) {
      for (const id of createdUsers) {
        const { error } = await admin.auth.admin.deleteUser(id)
        if (error) console.error(`清理临时账号失败(${id.slice(0, 8)}…): ${error.message}`)
      }
    } else if (createdEmails.length > 0) {
      // 无 admin 权限时删不掉账号:明确列出,由人工在 Dashboard 清理
      console.log('')
      console.log('⚠️  以下临时账号未能自动删除(无 service_role),请到 Dashboard → Authentication 删除:')
      for (const email of createdEmails) console.log(`   - ${email}`)
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
