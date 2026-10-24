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
 *   # 新旧两种密钥格式都接受,新格式(sb_secret_…)优先
 *   SUPABASE_SECRET_KEY=... node scripts/verify-rls.mjs
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

/**
 * 密钥选择:新格式(sb_secret_ / sb_publishable_)优先,旧 JWT 兜底。
 *
 * 按**值的形状**排序,而不是按变量名 —— 停用 Legacy JWT keys 之后,环境里
 * 残留的旧 key 会一律 401。若它排在前面,整套断言会集体失败,看起来像 RLS
 * 坏了,实际只是拿了一把已作废的钥匙。
 *
 * 占位符(如 .env.local 里 vercel env pull 留下的 "[SENSITIVE]")视为「未提供」
 * 而不是「提供错了」,否则「新格式是占位符、旧格式是真的」这种组合会被误判成
 * 「没有密钥」,白跑一遍 anon 模式。
 */
const isPlaceholder = (v) => !v || v.length <= 20 || v.startsWith('[')
const isNewKeyFormat = (v) => v.startsWith('sb_secret_') || v.startsWith('sb_publishable_')

function pickKey(names) {
  const usable = names.map((n) => process.env[n]).filter((v) => !isPlaceholder(v))
  return usable.find(isNewKeyFormat) || usable[0]
}

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const ANON = pickKey(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'])
const SERVICE = pickKey(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'])
const HAS_SERVICE = Boolean(SERVICE)

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
 *
 * `terminated` 是 undici 在连接被中途掐断时给的消息(网关超时、HTTP/2 GOAWAY
 * 都会这样),比 `fetch failed` 更常见于长连接场景 —— GoTrue 的登录请求正好
 * 走在长连接上,实测会以 `signIn failed: terminated` 的形式冒出来。
 *
 * 两种失败形态都要接:supabase-js 大多数接口把传输层错误**返回**在 `error` 里,
 * 但少数路径(如 PostgREST 的 delete/update)直接 **throw** `TypeError: fetch failed`。
 * 只处理返回值的话,后者会一路冒到最外层,把整轮验证判成失败。
 */
const NETWORK_ERROR = /fetch failed|network|ECONNRESET|ETIMEDOUT|socket hang up|terminated|ECONNREFUSED|EAI_AGAIN/i

async function retry(fn, attempts = 4) {
  let last
  for (let i = 0; i < attempts; i++) {
    try {
      last = await fn()
    } catch (e) {
      // 抛出的异常:只有传输层错误值得重试,业务异常原样抛出
      if (i === attempts - 1 || !NETWORK_ERROR.test(e?.message || String(e))) throw e
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
      continue
    }
    const msg = last?.error?.message || ''
    if (!NETWORK_ERROR.test(msg)) return last
    await new Promise((r) => setTimeout(r, 400 * (i + 1)))
  }
  return last
}

/**
 * 幂等地拿到一行(用于建探针)。
 *
 * 非幂等 insert 包 `retry` 是危险的:网络抖动时写入可能已经成功、只是响应丢了,
 * 重试就会撞唯一索引 —— 于是「一次抖动」被放大成「一条假失败」。
 *
 * 这里先查后插:查询本身幂等,插入只在确认不存在后发生;若插入仍因抖动失败,
 * 下一轮重试的查询会看到上一次其实写成功的那一行。
 *
 * @param {Function} find - 返回 { data, error } 的查询,不存在时 data 为 null
 * @param {Function} create - 返回 { data, error } 的插入
 * @returns {Promise<{data: any, error: any}>} 形状与 supabase-js 一致
 */
async function ensureRow(find, create) {
  const found = await retry(find)
  if (found.error) return found
  if (found.data) return found
  const created = await retry(create)
  // 插入撞唯一索引说明并发/重试下已存在:回查一次,把它当成成功
  if (created.error && /duplicate key|unique constraint/i.test(created.error.message)) {
    return await retry(find)
  }
  return created
}

function randomPassword() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 建号并登录。
 *
 * `onCreated` 在**账号真的建出来之后、登录之前**调用 —— 这是清理能否兜住
 * 失败路径的关键:建号成功但登录失败时函数会抛异常,若等到返回后才登记,
 * 那个账号就永远不会被 `finally` 删掉,残留在 auth.users 里。
 * (2026-10-24 的 6 个 rls-* 残留正是这么来的。)
 */
async function createAndSignIn(admin, anonKey, email, password, onCreated) {
  if (HAS_SERVICE) {
    // 用 service_role 直接建号并标记邮箱已确认:不依赖项目的注册开关/邮件投递,
    // 也不会因为 OTP 配置不同而卡住。临时账号最后一定会被删除。
    //
    // 建号/登录也要重试:上面的 retry 只覆盖数据操作,而这里同样会吃到网络抖动
    // (`createUser failed: fetch failed` 会让整个脚本在第一步就崩掉)。
    //
    // 「已注册」是重试的产物,不是错误:上一次尝试其实建成功了,只是响应丢了。
    // 此时账号已存在、密码就是本次生成的,直接按已建号处理并登记到清理列表 ——
    // 否则会以「email already registered」整轮失败,还留下一个没人认领的账号。
    let created = await retry(() => admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }))
    if (created.error && /already been registered|already exists/i.test(created.error.message)) {
      const list = await retry(() => admin.auth.admin.listUsers({ page: 1, perPage: 1000 }))
      const hit = (list.data?.users || []).find((u) => u.email === email)
      if (hit) created = { data: { user: hit }, error: null }
    }
    if (created.error) throw new Error(`createUser failed: ${created.error.message}`)
    const data = created.data
    onCreated?.(data.user.id, email)

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
  // signUp 也可能建出账号却没给会话(待邮件确认),同样要登记
  if (data?.user) onCreated?.(data.user.id, email)
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
  // 建号即登记:createAndSignIn 在建出账号后立刻回调,失败路径也不会漏掉
  const track = (id, email) => { createdUsers.push(id); createdEmails.push(email) }
  console.log(`模式: ${HAS_SERVICE ? 'service_role(结束后删除临时账号)' : 'anon signUp(临时账号需手工清理)'}\n`)

  try {
    // ── 准备两个用户 ────────────────────────────────────────
    const aEmail = `${runId}-a@example.com`
    const bEmail = `${runId}-b@example.com`
    const password = randomPassword()

    const anon = createClient(URL_, ANON, { auth: { persistSession: false } })

    const aSession = await createAndSignIn(admin, ANON, aEmail, password, track)
    const bSession = await createAndSignIn(admin, ANON, bEmail, password, track)
    const aUser = aSession.user
    const bUser = bSession.user
    const a = aSession.client
    const b = bSession.client
    check('创建两个临时账号', true, `${aUser.id.slice(0, 8)}… / ${bUser.id.slice(0, 8)}…`)

    // ── A 写入自己的数据 ────────────────────────────────────
    const { data: palette, error: pErr } = await retry(() => a
      .from('user_palettes')
      .insert({ user_id: aUser.id, name: 'RLS test palette' })
      .select()
      .single())
    if (pErr || !palette) throw new Error(`A createPalette failed: ${pErr?.message || 'no row'}`)

    // 色号在 (palette_id, lower(btrim(code))) 上有**表达式**唯一索引,
    // onConflict 指不到它,所以不能靠 upsert 收敛。
    // 改为:重复键 = 上一次尝试其实写成功了(行是我们刚建的临时色卡下的),
    // 这正是这条断言要证明的结果,按通过处理。
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
    const cDup = /duplicate key|unique constraint/i.test(cErr?.message || '')
    check('A 能写自己的色卡与颜色', !cErr || cDup,
      cDup ? '重复键(上一次写入已成功)' : cErr?.message)

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
      // 幂等建探针:先按 slug 查,没有才插。网络抖动时「写成功但响应丢失」会让
      // 重试撞唯一索引(slug 上是 lower(slug) 唯一索引,onConflict 指不到它),
      // 所以用查-插两步而不是 upsert。
      const { data: draftTheme, error: draftErr } = await ensureRow(
        () => admin.from('gallery_themes').select('id').eq('slug', draftSlug).maybeSingle(),
        () => admin.from('gallery_themes')
          .insert({ slug: draftSlug, title: `${runId} draft probe`, status: 'draft' })
          .select('id').single(),
      )

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
          // update 是幂等的(同一行改成同一值),可以安全重试。
          const { error: pubErr } = await retry(() => admin
            .from('gallery_themes').update({ status: 'published' }).eq('id', themeId))
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
          await retry(() => admin.from('gallery_themes').delete().eq('id', themeId))
        }
      }

      const draftCollSlug = `${runId}-draft-coll`
      const { data: draftColl, error: collErr } = await ensureRow(
        () => admin.from('gallery_collections').select('id').eq('slug', draftCollSlug).maybeSingle(),
        () => admin.from('gallery_collections')
          .insert({ slug: draftCollSlug, title: `${runId} draft coll`, status: 'draft' })
          .select('id').single(),
      )
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
          await retry(() => admin.from('gallery_collections').delete().eq('id', draftColl.id))
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
      const cSession = await createAndSignIn(admin, ANON, cEmail, password, track)
      const cUser = cSession.user
      const c = cSession.client

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
        const { error: reSignErr } = await retry(() => cAdminClient.auth.signInWithPassword({
          email: cEmail, password,
        }))
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
    //
    // 清理失败必须是**断言**,不能只打 stderr:脚本的主要危害就是往真实项目里
    // 留垃圾,清理没做成却退出 0,等于把「跑完了」和「收拾干净了」混为一谈。
    if (HAS_SERVICE) {
      // 清墓碑:admin_delete_user 会在 removed_accounts 里留一条永久记录
      // (用于阻止被删账号用同一邮箱/用户名重新注册)。验证脚本调用它时
      // 也会留下痕迹,所以按本次 runId 前缀清掉 —— 只删自己写的,不动真实记录。
      const { error: tombErr } = await retry(() => admin
        .from('removed_accounts')
        .delete()
        .like('email', `${runId}-%`))
      check('清理 removed_accounts 墓碑', !tombErr, tombErr?.message)

      const undeleted = []
      for (const id of createdUsers) {
        // 删除也要重试:一次 `fetch failed` 就会把账号永久留在 auth.users 里。
        // 上面已经证明网络抖动在这个环境里确实会发生,清理路径没有理由不设防。
        const { error } = await retry(() => admin.auth.admin.deleteUser(id))
        // `User not found` 不是失败:上一轮的网络抖动可能其实已经删成功了,
        // 只是响应没回来;重试时账号已不存在。目标状态(账号不存在)已经达成。
        if (error && !/user not found/i.test(error.message)) {
          undeleted.push(`${id.slice(0, 8)}…: ${error.message}`)
        }
      }
      check('清理临时账号', undeleted.length === 0,
        undeleted.length === 0
          ? `已删除 ${createdUsers.length} 个`
          : `以下未能删除,请到 Dashboard → Authentication 手工清理 —— ${undeleted.join(' | ')}`)
    } else if (createdEmails.length > 0) {
      // 无 admin 权限时删不掉账号:明确列出,由人工在 Dashboard 清理。
      // 这不是断言失败 —— 该模式下「删不掉」是已知且被接受的约束。
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
