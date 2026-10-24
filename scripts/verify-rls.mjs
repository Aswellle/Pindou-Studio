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
 *   5. 正向对照:确认 A 仍能读自己的数据(防「全被拒」假阳性);
 *   6. 公开内容表:普通用户写 templates/categories 必须被拒,
 *      匿名读 gallery_themes/gallery_collections 只能看到 published;
 *   7. 管理员 RPC:普通用户调用 admin_* 必须被拒,admin 账号本身豁免删除/冻结。
 *
 * 关于第 7 项:它需要「一个真正的 admin 账号」。脚本不向你要 admin 密码,
 * 而是用 service_role 把自己创建的临时账号 C 的 profiles.role 临时改成 admin,
 * 验证完随 C 一起删掉。提权范围严格限定在脚本自己新建的临时账号内 ——
 * service_role 本来就能删号,提权不增加实际攻击面。
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
    //
    // 建号/登录也要重试:上面的 retry 只覆盖数据操作,而这里同样会吃到网络抖动
    // (`createUser failed: fetch failed` 会让整个脚本在第一步就崩掉)。
    const created = await retry(() => admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }))
    if (created.error) throw new Error(`createUser failed: ${created.error.message}`)
    const data = created.data

    const client = createClient(URL_, anonKey, { auth: { persistSession: false } })
    const signIn = await retry(() => client.auth.signInWithPassword({ email, password }))
    if (signIn.error) throw new Error(`signIn failed: ${signIn.error.message}`)
    return { client, user: data.user }
  }

  // 无 service_role:走匿名 signUp。项目开启 autoconfirm 时会直接返回会话;
  // 若需要邮件确认,这里拿不到 session,直接给出可读的失败原因。
  const client = createClient(URL_, anonKey, { auth: { persistSession: false } })
  const { data, error } = await retry(() => client.auth.signUp({ email, password }))
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

    // ── 公开内容表:templates / categories 只读,写必须被拒 ────────
    // 这两张表没有 status 字段(草稿概念在 gallery_themes / gallery_collections 上),
    // 所以这里验的是「写权限」而不是「草稿不可见」。
    // 正向对照放在前面:匿名能读到模板,说明拒绝确实来自写策略而非整表不可达。
    const anonTplRead = await retry(() => anon.from('templates').select('id').limit(1))
    check('匿名能读 templates(公开内容,正向对照)',
      !anonTplRead.error,
      anonTplRead.error?.message || `返回 ${anonTplRead.data?.length ?? 0} 行`)

    const aTplWrite = await retry(() => a.from('templates').insert({
      name: `${runId}-tpl`,
      category: 'animal',
      size: 1,
      pattern: [[null]],
      source: 'custom',
    }))
    check('普通用户写 templates 被拒', Boolean(aTplWrite.error), aTplWrite.error?.message || '写入成功了(越权)')

    const anonTplWrite = await retry(() => anon.from('templates').insert({
      name: `${runId}-anon-tpl`,
      category: 'animal',
      size: 1,
      pattern: [[null]],
      source: 'custom',
    }))
    check('匿名写 templates 被拒', Boolean(anonTplWrite.error), anonTplWrite.error?.message || '写入成功了(越权)')

    const anonCatRead = await retry(() => anon.from('categories').select('id').limit(1))
    check('匿名能读 categories(公开内容,正向对照)',
      !anonCatRead.error,
      anonCatRead.error?.message || `返回 ${anonCatRead.data?.length ?? 0} 行`)

    const aCatWrite = await retry(() => a.from('categories').insert({
      id: `${runId}-cat`,
      label: `${runId}-cat`,
    }))
    check('普通用户写 categories 被拒', Boolean(aCatWrite.error), aCatWrite.error?.message || '写入成功了(越权)')

    // 若写策略失效导致上面真的写进去了,立刻删掉,避免污染公开内容
    if (!aTplWrite.error) await retry(() => a.from('templates').delete().eq('name', `${runId}-tpl`))
    if (!anonTplWrite.error) await retry(() => anon.from('templates').delete().eq('name', `${runId}-anon-tpl`))
    if (!aCatWrite.error) await retry(() => a.from('categories').delete().eq('id', `${runId}-cat`))

    // ── 草稿可见性:gallery_themes / gallery_collections ───────────
    // 这两张表才有 status 字段,RLS 是 `using (status = 'published')`。
    // 先插一条 draft 作为探针(用 service_role,绕过 RLS 才能写进去),
    // 再验证匿名和普通用户都读不到它,最后删除探针。
    if (HAS_SERVICE) {
      const draftSlug = `${runId}-draft`
      const { data: draftTheme, error: draftErr } = await admin.from('gallery_themes').insert({
        slug: draftSlug,
        title: `${runId} draft probe`,
        status: 'draft',
      }).select('id').single()

      if (draftErr) {
        check('创建 draft 探针(service_role)', false, draftErr.message)
      } else {
        const themeId = draftTheme.id
        try {
          const anonDraft = await retry(() => anon
            .from('gallery_themes').select('id').eq('id', themeId))
          check('匿名读不到 gallery_themes 的 draft',
            !anonDraft.error && (anonDraft.data || []).length === 0,
            anonDraft.error?.message || `返回 ${anonDraft.data?.length ?? 0} 行`)

          const aDraft = await retry(() => a
            .from('gallery_themes').select('id').eq('id', themeId))
          check('普通用户读不到 gallery_themes 的 draft',
            !aDraft.error && (aDraft.data || []).length === 0,
            aDraft.error?.message || `返回 ${aDraft.data?.length ?? 0} 行`)

          // 正向对照:把它改成 published,匿名就应该能读到 ——
          // 否则「读不到」可能只是因为整张表不可达,而不是 status 过滤生效。
          const { error: pubErr } = await admin
            .from('gallery_themes').update({ status: 'published' }).eq('id', themeId)
          if (pubErr) {
            check('draft 探针改 published(正向对照准备)', false, pubErr.message)
          } else {
            const anonPub = await retry(() => anon
              .from('gallery_themes').select('id').eq('id', themeId))
            check('改为 published 后匿名能读到(正向对照)',
              !anonPub.error && (anonPub.data || []).length === 1,
              anonPub.error?.message || `返回 ${anonPub.data?.length ?? 0} 行`)
          }
        } finally {
          await admin.from('gallery_themes').delete().eq('id', themeId)
        }
      }

      const draftCollSlug = `${runId}-draft-coll`
      const { data: draftColl, error: collErr } = await admin.from('gallery_collections').insert({
        slug: draftCollSlug,
        title: `${runId} draft coll`,
        status: 'draft',
      }).select('id').single()
      if (collErr) {
        check('创建 collection draft 探针(service_role)', false, collErr.message)
      } else {
        try {
          const anonColl = await retry(() => anon
            .from('gallery_collections').select('id').eq('id', draftColl.id))
          check('匿名读不到 gallery_collections 的 draft',
            !anonColl.error && (anonColl.data || []).length === 0,
            anonColl.error?.message || `返回 ${anonColl.data?.length ?? 0} 行`)
        } finally {
          await admin.from('gallery_collections').delete().eq('id', draftColl.id)
        }
      }
    } else {
      console.log('⏭  跳过草稿可见性验证(需要 service_role 创建 draft 探针)')
    }

    // ── 管理员 RPC 越权 ────────────────────────────────────────
    // 三条要验的语义:
    //   1. 普通用户调用 admin_* 必须被拒(not authorized);
    //   2. 管理员能调用(正向对照,防「全被拒」假阳性);
    //   3. 管理员账号本身豁免删除/冻结(cannot_modify_admin)。
    //
    // 提权方式:把临时账号 C 的 profiles.role 改成 admin,用完随 C 一起删。
    // 不使用真实 admin 账号的凭据 —— 那会把真人密码带进环境变量。
    if (HAS_SERVICE) {
      const cEmail = `${runId}-c@example.com`
      const cSession = await createAndSignIn(admin, ANON, cEmail, password)
      const cUser = cSession.user
      const c = cSession.client
      createdUsers.push(cUser.id)
      createdEmails.push(cEmail)

      // 普通用户 A 调用 admin_* → 必须被拒
      const aList = await retry(() => a.rpc('admin_list_users'))
      check('普通用户调用 admin_list_users 被拒',
        Boolean(aList.error), aList.error?.message || '调用成功了(越权)')

      const aDel = await retry(() => a.rpc('admin_delete_user', { p_user_id: bUser.id }))
      check('普通用户调用 admin_delete_user 被拒',
        Boolean(aDel.error), aDel.error?.message || '调用成功了(越权)')

      const aLock = await retry(() => a.rpc('admin_lock_user', { p_user_id: bUser.id }))
      check('普通用户调用 admin_lock_user 被拒',
        Boolean(aLock.error), aLock.error?.message || '调用成功了(越权)')

      // 确认 B 没被 A 的越权调用删掉/锁掉(拒绝必须是真的没执行)
      const bAlive = await retry(() => admin.from('profiles').select('id').eq('id', bUser.id))
      check('B 未被越权调用删除', (bAlive.data || []).length === 1,
        `profiles 返回 ${bAlive.data?.length ?? 0} 行`)

      // 提权 C → admin。
      // 注意 is_admin() 是**双重判据**(见 0019_admin_hardening.sql):
      //   profiles.role = 'admin'  且  admin_allowlist 里有该 user_id
      // 只改 role 拿不到管理员权限 —— 这正是该迁移收紧安全性的目的。
      // 所以两步都要做,并且都回读确认。
      //
      // 为什么必须回读:网络抖动时 supabase-js 会把传输层失败塞进 error,
      // 只看 error 为 null 就判定成功,后续所有 admin_* 断言都会因为
      // 「C 其实还不是 admin」而集体失败,看起来像 RLS 有问题。
      const promoteRes = await retry(() => admin
        .from('profiles').update({ role: 'admin' }).eq('id', cUser.id).select('role'))
      const rolePromoted = (promoteRes.data || []).some((r) => r.role === 'admin')

      const allowRes = await retry(() => admin
        .from('admin_allowlist').upsert({ user_id: cUser.id, email: cEmail, note: `${runId} rls probe` })
        .select('user_id'))
      const allowlisted = (allowRes.data || []).some((r) => r.user_id === cUser.id)

      if (!rolePromoted || !allowlisted) {
        check('临时账号 C 提权为 admin', false,
          `role=${rolePromoted ? 'ok' : (promoteRes.error?.message || JSON.stringify(promoteRes.data))}`
          + ` / allowlist=${allowlisted ? 'ok' : (allowRes.error?.message || JSON.stringify(allowRes.data))}`)
      } else {
        check('临时账号 C 提权为 admin(role + 白名单)', true)

        // 提权后必须重新登录:is_admin() 是 `stable` 函数,PostgREST 会在同一
        // 连接/事务快照内复用结果。C 的会话是在提权前建立的,继续用它调用
        // admin_* 会一直拿到旧的 is_admin() = false,看起来像「提权没生效」。
        // 新建 client 重新登录 → 新连接 → 新快照。
        const cAdminClient = createClient(URL_, ANON, { auth: { persistSession: false } })
        const { error: reSignErr } = await cAdminClient.auth.signInWithPassword({
          email: cEmail, password,
        })
        if (reSignErr) {
          check('提权后重新登录 C', false, reSignErr.message)
        } else {
          check('提权后重新登录 C', true)

          // 正向对照:admin 能调用
          const cList = await retry(() => cAdminClient.rpc('admin_list_users'))
          check('admin 能调用 admin_list_users(正向对照)',
            !cList.error, cList.error?.message || `调用成功,返回 ${cList.data?.length ?? 0} 行`)

          // 管理员豁免删除:用 C 去删另一个 admin(自己),必须被拒
          const selfDel = await retry(() => cAdminClient.rpc('admin_delete_user', { p_user_id: cUser.id }))
          check('admin 账号本身豁免删除',
            Boolean(selfDel.error) && /cannot_modify_admin/.test(selfDel.error?.message || ''),
            selfDel.error?.message || '删除成功了(应当被拒)')

          // 管理员豁免冻结:同上
          const selfLock = await retry(() => cAdminClient.rpc('admin_lock_user', { p_user_id: cUser.id }))
          check('admin 账号本身豁免冻结',
            Boolean(selfLock.error) && /cannot_modify_admin/.test(selfLock.error?.message || ''),
            selfLock.error?.message || '冻结成功了(应当被拒)')

          // 管理员锁定普通用户 → 应当成功,再用 unlock 恢复
          const lockB = await retry(() => cAdminClient.rpc('admin_lock_user', { p_user_id: bUser.id }))
          check('admin 能锁定普通用户', !lockB.error, lockB.error?.message || '锁定成功')

          const unlockB = await retry(() => cAdminClient.rpc('admin_unlock_user', { p_user_id: bUser.id }))
          check('admin 能解锁普通用户', !unlockB.error, unlockB.error?.message || '解锁成功')
        }

        // 降权:删除 C 之前先撤掉白名单并改回 user。
        // admin_delete_user 会拒绝删 admin,而 is_admin() 需要 role + 白名单同时成立,
        // 所以两样都要撤 —— 只撤 role 的话,万一删号失败,C 仍带着白名单条目。
        await retry(() => admin.from('admin_allowlist').delete().eq('user_id', cUser.id))
        const demoteRes = await retry(() => admin
          .from('profiles').update({ role: 'user' }).eq('id', cUser.id).select('role'))
        const demoted = (demoteRes.data || []).some((r) => r.role === 'user')
        check('临时账号 C 降权回 user(role + 白名单已撤)', demoted,
          demoteRes.error?.message || `回读 role=${JSON.stringify(demoteRes.data)}`)
      }
    } else {
      console.log('⏭  跳过管理员 RPC 验证(需要 service_role 创建并提权临时账号)')
    }
  } catch (e) {
    check('执行过程无异常', false, e?.message || String(e))
  } finally {
    // ── 清理:删除临时账号(级联删除其色卡/颜色/库存/作品)──
    if (HAS_SERVICE) {
      // 清墓碑:admin_delete_user 会在 removed_accounts 里留一条永久记录
      // (用于阻止被删账号用同一邮箱/用户名重新注册)。验证脚本调用它时
      // 也会留下痕迹,所以按本次 runId 前缀清掉 —— 只删自己写的,不动真实记录。
      const { error: tombErr } = await admin
        .from('removed_accounts')
        .delete()
        .like('email', `${runId}-%`)
      if (tombErr) console.error(`清理 removed_accounts 失败: ${tombErr.message}`)

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
