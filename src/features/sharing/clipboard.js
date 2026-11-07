/**
 * 复制 / 下载的小工具。
 *
 * 不引入第三方依赖:分享卡下载只需要 Blob + object URL;
 * 剪贴板在非 HTTPS 或旧内核里没有 `navigator.clipboard`,需要 textarea 兜底。
 */

/**
 * 复制文本。返回是否成功 —— 调用方必须据此区分「已复制」与「请手动复制」。
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  if (typeof text !== 'string' || !text) return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 落到 execCommand 兜底
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/**
 * 触发浏览器下载。
 *
 * object URL 不能在 click 之后立刻 revoke —— 部分浏览器还没开始读取。
 * 延迟释放,避免长时间占内存。
 */
export function downloadBlob(blob, filename) {
  if (!blob) return false
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

/**
 * 下载文件名清洗:去掉路径分隔符与各系统非法字符,限制长度。
 * 空标题回退到 `share-card.png`(不重复拼后缀)。
 * 例:`小鸭-share-card.png`
 */
export function cardFileName(title) {
  const base = String(title || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  if (!base) return 'share-card.png'
  return `${base}-share-card.png`
}
