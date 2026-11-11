/**
 * User-Agent 解析(后台用户管理的「设备 / UA」列)。
 *
 * 纯函数、无依赖:后台列表一页 20 行,不值得为此引入 50KB 的 ua-parser;
 * 这里只区分「什么系统 + 什么浏览器」这层管理员真正关心的信息,
 * 原始 UA 仍然完整入库,需要细节时悬浮可见。
 *
 * 判定顺序有讲究:浏览器要先把 Edge/Opera/三星壳浏览器排除掉,
 * 再认 Chrome / Safari —— 否则 Edge 会被看成 Chrome(Secret: Edg/ 在前)。
 */

/** 从 UA 里取「token/版本」形式的版本号;取不到返回空串 */
function versionAfter(ua, marker) {
  const idx = ua.indexOf(marker)
  if (idx === -1) return ''
  const rest = ua.slice(idx + marker.length)
  const match = rest.match(/^[\d.]+/)
  return match ? match[0] : ''
}

/**
 * 解析 UA。
 *
 * @param {string} ua
 * @returns {{os:string,browser:string,mobile:boolean,label:string}|null}
 *   无法解析(空串/纯空白)时返回 null
 */
export function parseUserAgent(ua) {
  const s = String(ua || '').trim()
  if (!s) return null

  // ── 操作系统(先判移动端,再判桌面;Android 必须在 Linux 之前) ──
  const mobile = /Mobi|Android|iPhone/i.test(s)
  let os = ''
  if (/Windows NT/i.test(s)) os = 'Windows'
  else if (/Android/i.test(s)) os = 'Android'
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS'
  else if (/CrOS/i.test(s)) os = 'ChromeOS'
  else if (/Mac OS X/i.test(s)) os = 'macOS'
  else if (/Linux/i.test(s)) os = 'Linux'

  // ── 浏览器(从特殊壳到通用内核依次排除) ─────────────────────
  let browser = ''
  if (/Edg(e|A|iOS)?\//i.test(s)) browser = `Edge ${versionAfter(s, 'Edg/')}`
  else if (/OPR\/|Opera/i.test(s)) browser = `Opera ${versionAfter(s, 'OPR/')}`
  else if (/SamsungBrowser\//i.test(s)) browser = `Samsung Internet ${versionAfter(s, 'SamsungBrowser/')}`
  else if (/Firefox\//i.test(s)) browser = `Firefox ${versionAfter(s, 'Firefox/')}`
  else if (/MSIE |Trident\//i.test(s)) browser = 'Internet Explorer'
  else if (/CriOS\//i.test(s)) browser = `Chrome ${versionAfter(s, 'CriOS/')}`
  else if (/Chrome\//i.test(s)) browser = `Chrome ${versionAfter(s, 'Chrome/')}`
  else if (/Safari\//i.test(s)) browser = `Safari ${versionAfter(s, 'Version/')}`

  const label = [os, browser].filter(Boolean).join(' · ')
  return { os, browser, mobile, label }
}
