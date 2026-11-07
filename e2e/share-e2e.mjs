/**
 * 图纸分享 — 真浏览器 E2E(playwright-core + 本机 Edge + vite preview)。
 *
 * 运行方式:
 *   npm run build && node e2e/share-e2e.mjs
 *
 * 安全边界:dist 产物内嵌真实 Supabase URL/anon key,**绝不放行外网请求**。
 * 路由拦截只对 localhost:5283 放行,其余一律 mock —— 生产数据零接触。
 *
 * 场景(全边界):
 *   S1  匿名访问有效分享 → 标题/尺寸/豆数/色数/颜色清单/CTA
 *   S2  分享不存在或已撤销(REST 空)→ notFound,无重试按钮
 *   S3  网络失败 → network 状态 + 重试;恢复后重试成功
 *   S4  非法 id(/share/abc)→ notFound,不发数据请求
 *   S5  匿名点击复制 → sessionStorage 标记 + 跳 /login + share-copy 守卫文案
 *   S6  已登录复制(intent 恢复)→ POST works 且 source_kind=shared-copy,
 *       标记清除;刷新不重复复制
 *   S7  举报 → rpc 载荷正确,成功文案
 *   S8  移动端 390×844 → 渲染于 .mobile-page-area,无横向溢出
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASE = 'http://localhost:5283'
const UUID = '550e8400-e29b-41d4-a716-446655440000'

const results = []
const check = (name, cond) => {
  results.push({ name, ok: Boolean(cond) })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
}

if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  console.error('dist 不存在:先运行 npm run build')
  process.exit(1)
}

/** 从构建产物里解析内嵌的 Supabase 地址(只用于拼 mock 的 localStorage 键名) */
function findSupabaseBase() {
  for (const name of readdirSync(join(ROOT, 'dist', 'assets'))) {
    const content = readFileSync(join(ROOT, 'dist', 'assets', name), 'utf8')
    const m = content.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/)
    if (m) return `https://${m[1]}.supabase.co`
  }
  return null
}

const shareRow = {
  id: UUID,
  title: '雪景小屋',
  description: '冬日雪景',
  author_label: '拼豆创作者',
  grid_width: 9,
  grid_height: 9,
  palette_id: 'perler',
  preview_image_path: `${UUID}/r1.png`,
  status: 'published',
  published_at: new Date().toISOString(),
  canvas_data: Array.from({ length: 9 }, (_, y) =>
    Array.from({ length: 9 }, (_, x) => ((x + y) % 2 === 0 ? '#FF0000' : '#FFFFFF'))
  ),
}

const authUser = {
  id: 'e2e-user-0000-0000-000000000000',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e@example.com',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { nickname: 'E2E用户' },
  created_at: '2026-01-01T00:00:00Z',
}

function sessionFor(base) {
  const ref = base.replace(/^https:\/\//, '').split('.')[0]
  return {
    key: `sb-${ref}-auth-token`,
    value: {
      access_token: 'e2e-dummy-access-token',
      refresh_token: 'e2e-dummy-refresh-token',
      token_type: 'bearer',
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: authUser,
    },
  }
}

/** 等待 preview 服务器就绪 */
async function waitForServer(proc) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${BASE}/`)
      if (res.ok) return
    } catch {
      // 未就绪,继续等
    }
    if (proc.exitCode !== null) throw new Error('preview 进程提前退出')
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('preview 启动超时')
}

async function main() {
  const supabaseBase = findSupabaseBase()
  if (!supabaseBase) {
    console.error('dist 中未找到 Supabase 地址,无法构造 mock 键名')
    process.exit(1)
  }
  console.log(`supabase(mock): ${supabaseBase}`)
  const session = sessionFor(supabaseBase)

  // 可变 mock 状态:S3 用它在「断网」与「恢复」之间切换
  let restWorkShares = [shareRow]
  let restWorksSeen = []
  const rpcCalls = []

  // 直接用 node 启动 vite.js:Windows 下 spawn npx.cmd 会留孤儿进程,kill 不到真正的 vite
  const preview = spawn(process.execPath,
    [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', '5283', '--strictPort'],
    { cwd: ROOT, stdio: 'ignore' })
  try {
    await waitForServer(preview)
    console.log('preview 就绪')

    const browser = await chromium.launch({ channel: 'msedge', headless: true })

    /** 共用路由拦截:localhost 放行,其余全部 mock */
    async function intercept(context) {
      await context.route('**/*', async route => {
        const req = route.request()
        const url = new URL(req.url())
        if (url.origin === BASE) return route.continue()

        const path = url.pathname
        if (url.origin === supabaseBase) {
          if (path.startsWith('/auth/v1/')) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(path === '/auth/v1/token' ? session.value : authUser),
            })
          }
          if (path === '/rest/v1/works' && req.method() === 'POST') {
            restWorksSeen.push(req.postData())
            return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
          }
          if (path === '/rest/v1/work_shares') {
            // 'abort' = 传输层断网(fetch 拒绝);其余按数组响应。
            // 注意:HTTP 500 会被 supabase-js 当普通 REST 错误 → 页面显示「不存在」,
            // 只有传输失败才进 network 分支,故这里用 abort 模拟网络故障。
            if (restWorkShares === 'abort') return route.abort('connectionfailed')
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(restWorkShares),
            })
          }
          if (path === '/rest/v1/rpc/work_share_release_enabled') {
            return route.fulfill({ status: 200, contentType: 'application/json', body: 'true' })
          }
          if (path.startsWith('/rest/v1/rpc/')) {
            rpcCalls.push({ path, body: req.postData() })
            return route.fulfill({ status: 200, contentType: 'application/json', body: 'true' })
          }
          // 其余表查询(templates/admin 等):空集
          return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        }
        // 其他外网(字体/统计等):直接拒绝,确保测试离线
        return route.abort()
      })
    }

    const newContext = async ({ mobile = false, loggedIn = false } = {}) => {
      const context = await browser.newContext(
        mobile
          ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
          : { viewport: { width: 1280, height: 800 } }
      )
      if (loggedIn) {
        await context.addInitScript(
          ([key, value]) => localStorage.setItem(key, JSON.stringify(value)),
          [session.key, session.value]
        )
      }
      await intercept(context)
      return context
    }

    // ---------- S1 匿名有效分享 ----------
    {
      const ctx = await newContext()
      const page = await ctx.newPage()
      await page.goto(`${BASE}/share/${UUID}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=雪景小屋', { timeout: 15000 })
      check('S1 标题渲染', true)
      check('S1 尺寸', await page.getByText('尺寸 9 × 9').count() === 1)
      check('S1 豆数(81 颗:两色均为非空格)', await page.getByText('81 颗豆子').count() === 1)
      check('S1 色数', await page.getByText('2 种颜色').count() === 1)
      check('S1 颜色清单含色号', await page.getByText('#FF0000').count() >= 1)
      check('S1 署名', await page.getByText('拼豆创作者').count() >= 1)
      check('S1 匿名复制提示可见', await page.getByText(/登录或注册后/).count() === 1)
      check('S1 举报入口', await page.getByText('举报 / 权利投诉').count() === 1)
      await ctx.close()
    }

    // ---------- S2 不存在/已撤销 ----------
    {
      restWorkShares = []
      const ctx = await newContext()
      const page = await ctx.newPage()
      await page.goto(`${BASE}/share/${UUID}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=分享不存在或已被撤销', { timeout: 15000 })
      check('S2 notFound 文案', true)
      check('S2 无重试按钮(不可恢复)', await page.getByRole('button', { name: '重试' }).count() === 0)
      await ctx.close()
      restWorkShares = [shareRow]
    }

    // ---------- S3 网络失败 → 重试恢复 ----------
    {
      restWorkShares = 'abort'
      const ctx = await newContext()
      const page = await ctx.newPage()
      await page.goto(`${BASE}/share/${UUID}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=网络异常,暂时无法加载', { timeout: 15000 })
      check('S3 network 状态文案', true)
      check('S3 重试按钮存在', await page.getByRole('button', { name: '重试' }).count() === 1)
      restWorkShares = [shareRow]
      await page.getByRole('button', { name: '重试' }).click()
      await page.waitForSelector('text=雪景小屋', { timeout: 15000 })
      check('S3 重试后进入 ready', true)
      await ctx.close()
    }

    // ---------- S4 非法 id ----------
    {
      const ctx = await newContext()
      const page = await ctx.newPage()
      let dataRequested = false
      await page.route(`${supabaseBase}/rest/v1/work_shares*`, route => {
        dataRequested = true
        route.abort()
      })
      await page.goto(`${BASE}/share/abc`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=分享不存在或已被撤销', { timeout: 15000 })
      check('S4 非法 id 显示 notFound', true)
      check('S4 未发数据请求', dataRequested === false)
      await ctx.close()
    }

    // ---------- S5 匿名复制 → 登录守卫 ----------
    {
      const ctx = await newContext()
      const page = await ctx.newPage()
      await page.goto(`${BASE}/share/${UUID}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=复制到我的图纸', { timeout: 15000 })
      await page.getByText('复制到我的图纸').click()
      await page.waitForURL('**/login', { timeout: 10000 })
      check('S5 跳转 /login', page.url().includes('/login'))
      const flag = await page.evaluate(
        ([id]) => sessionStorage.getItem(`share-copy-intent:${id}`),
        [UUID]
      )
      check('S5 sessionStorage 意图标记 = 1', flag === '1')
      await page.waitForSelector('text=登录后即可复制图纸', { timeout: 10000 })
      check('S5 share-copy 守卫文案可见', true)
      await ctx.close()
    }

    // ---------- S6 已登录复制(intent 恢复,一次性) ----------
    {
      const ctx = await newContext({ loggedIn: true })
      const page = await ctx.newPage()
      await page.addInitScript(
        ([id]) => sessionStorage.setItem(`share-copy-intent:${id}`, '1'),
        [UUID]
      )
      await page.goto(`${BASE}/share/${UUID}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=已复制到你的作品', { timeout: 20000 })
      check('S6 自动复制成功文案', true)
      check('S6 POST works 恰好一次', restWorksSeen.length === 1)
      const body = restWorksSeen[0] ? JSON.parse(restWorksSeen[0]) : null
      check('S6 source_kind=shared-copy', body?.source_kind === 'shared-copy')
      check('S6 不覆盖分享 id(新作品)', body && body.id !== UUID)
      const flag = await page.evaluate(
        ([id]) => sessionStorage.getItem(`share-copy-intent:${id}`),
        [UUID]
      )
      check('S6 标记已清除', flag === null)

      restWorksSeen = []
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=雪景小屋', { timeout: 15000 })
      await page.waitForTimeout(1500)
      // 刷新后允许 useSavedWorks 既有的「本地→云端同步」上传(POST 不带 id),
      // 但 intent 复制绝不能再执行 —— intent 复制的 POST 一定带客户端生成的 id
      const dupCopy = restWorksSeen.filter(body => {
        try { return Boolean(JSON.parse(body).id) } catch { return false }
      })
      check('S6 刷新后不重复复制(无带 id 的复制 POST)', dupCopy.length === 0)
      await ctx.close()
    }

    // ---------- S7 举报 ----------
    {
      rpcCalls.length = 0
      const ctx = await newContext()
      const page = await ctx.newPage()
      await page.goto(`${BASE}/share/${UUID}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=举报 / 权利投诉', { timeout: 15000 })
      await page.getByText('举报 / 权利投诉').click()
      await page.waitForSelector('text=举报或权利投诉', { timeout: 5000 })
      await page.selectOption('select', 'privacy')
      await page.fill('textarea', 'E2E 举报内容')
      await page.getByText('提交', { exact: true }).click()
      await page.waitForSelector('text=已收到,我们会尽快处理。', { timeout: 10000 })
      check('S7 成功文案', true)
      const report = rpcCalls.find(call => call.path.endsWith('/submit_work_share_report'))
      check('S7 rpc 被调用', Boolean(report))
      if (report) {
        const payload = JSON.parse(report.body)
        check('S7 载荷含类别/详情/分享 id',
          payload.p_category === 'privacy' && payload.p_detail === 'E2E 举报内容' && payload.p_share_id === UUID)
      }
      await ctx.close()
    }

    // ---------- S8 移动端视口 ----------
    {
      const ctx = await newContext({ mobile: true })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/share/${UUID}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=雪景小屋', { timeout: 15000 })
      check('S8 挂载于 .mobile-page-area',
        await page.locator('.mobile-page-area .share-page').count() === 1)
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check('S8 无横向溢出', overflow <= 0)
      check('S8 CTA 可见(未滚出屏幕)', await page.getByText('复制到我的图纸').isVisible())
      await ctx.close()
    }

    await browser.close()
  } finally {
    preview.kill()
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n===== E2E 汇总:${results.length - failed.length}/${results.length} 通过 =====`)
  if (failed.length) {
    for (const f of failed) console.log(`FAIL: ${f.name}`)
    process.exit(1)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
