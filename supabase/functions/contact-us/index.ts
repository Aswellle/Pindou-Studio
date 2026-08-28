// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'

// 「联系我们」留言:校验 Cloudflare Turnstile 人机验证 → 写入 public.contact_messages。
// 前端在用户完成人机验证 + 输入消息后调用(fire-and-forget)。
//
// Secrets(在 Supabase 控制台 Functions → contact-us → Secrets,或 `supabase secrets set`):
//   TURNSTILE_SECRET_KEY  必填。Cloudflare Turnstile 的 Secret key(与站点前端
//                         VITE_TURNSTILE_SITE_KEY 配对;未设置时跳过验证——仅供本地开发)。
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由 Supabase Edge Function 自动注入,无需手动设置。

const verifyTurnstile = async (token: string, remoteIp?: string): Promise<boolean> => {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) {
    // 未配置密钥(本地开发):跳过人机验证,交由后端写入。生产必须配置。
    console.warn('[contact-us] TURNSTILE_SECRET_KEY 未设置,跳过人机验证')
    return true
  }
  if (!token) return false
  const body = new FormData()
  body.append('secret', secret)
  body.append('response', token)
  if (remoteIp) body.append('remoteip', remoteIp)
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    })
    const data: any = await res.json()
    return data?.success === true
  } catch (e) {
    console.error('[contact-us] siteverify 异常:', e)
    return false
  }
}

const json = (obj: any, status: number) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, reason: 'invalid_json' }, 400)
  }

  const message = String(body?.message || '').trim()
  const emailRaw = String(body?.email || '').trim()
  if (!message) return json({ ok: false, reason: 'empty_message' }, 400)
  if (message.length > 2000) return json({ ok: false, reason: 'message_too_long' }, 400)
  const email = emailRaw === '' ? null : emailRaw
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, reason: 'invalid_email' }, 400)
  }

  const remoteIp =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    undefined
  const captchaOk = await verifyTurnstile(String(body?.token || ''), remoteIp)
  if (!captchaOk) return json({ ok: false, reason: 'captcha_failed' }, 400)

  const sbUrl = Deno.env.get('SUPABASE_URL')
  const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!sbUrl || !sbKey) {
    return json({ ok: false, reason: 'not_configured' }, 500)
  }
  const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } })
  const { error } = await sb.from('contact_messages').insert({ email, message })
  if (error) {
    console.error('[contact-us] 入库失败:', error.message)
    return json({ ok: false, reason: 'db_error' }, 500)
  }
  return json({ ok: true }, 200)
})
