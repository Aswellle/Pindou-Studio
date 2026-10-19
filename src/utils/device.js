/**
 * 设备判据(纯函数,便于测试)
 *
 * 为什么不用 UA 里的 iPhone|iPad|iPod:
 *   · iPadOS 13+ 默认上报桌面 UA(`Macintosh; Intel Mac OS X`),永远匹配不到,
 *     而 iPad 分屏/横屏正是键盘白屏最容易复现的场景;
 *   · 桌面 Safari 的 UA 同样是 Macintosh,必须再叠加「多点触控」才区分得开。
 *
 * 与导出链路 isMobileDevice()(BeadPatternExporter)语义不同:那个判「内存预算」,
 * 这里判「是否需要 iOS 的滚动容器重绘兜底」,不要互相替代。
 */
export function isIOSSafariLike(ua = '', maxTouchPoints = 0) {
  const s = String(ua || '')
  if (/iPad|iPhone|iPod/.test(s)) return true
  // iPadOS 13+ 桌面模式:Macintosh UA + 多点触控(桌面 Mac 的 maxTouchPoints 为 0)
  return /Macintosh/.test(s) && maxTouchPoints > 1
}
