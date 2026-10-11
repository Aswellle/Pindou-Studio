/**
 * 密码强度校验(注册 / 改密共用,AuthPage 与 ProfilePage 同一规则)。
 * 返回 i18n 键(`errors.password*`),null 表示通过 —— 调用方直接 `t(result)` 展示。
 */

export function passwordWeakness(p) {
  if (p.length < 8) return 'errors.passwordTooShort'
  if (/^(.)\1+$/.test(p)) return 'errors.passwordRepeat'
  if (/(?:012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(p)) return 'errors.passwordSequence'
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'errors.passwordMix'
  return null
}
