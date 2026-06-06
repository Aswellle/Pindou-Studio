/**
 * Color utility functions for bead studio
 */

/**
 * Resolve a color value (brand ID like 'P18' or hex string) to a hex string.
 * Returns null if the value cannot be resolved.
 */
export function resolveToHex(colorVal, palette) {
  if (!colorVal) return null
  if (typeof colorVal === 'string' && colorVal.startsWith('#')) return colorVal
  const found = palette?.colors?.find(c => c.id === colorVal)
  return found ? found.hex : null
}

/**
 * Convert hex color to RGB
 */
export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 }
}

/**
 * Convert RGB to hex color
 */
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
}

/**
 * Calculate color distance (Euclidean distance in RGB space)
 */
export function colorDistance(c1, c2) {
  const dR = c1.r - c2.r
  const dG = c1.g - c2.g
  const dB = c1.b - c2.b
  return Math.sqrt(dR * dR + dG * dG + dB * dB)
}

/**
 * Calculate relative luminance (for contrast calculations)
 */
export function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Calculate contrast ratio between two colors
 */
export function getContrastRatio(color1, color2) {
  const l1 = getLuminance(color1.r, color1.g, color1.b)
  const l2 = getLuminance(color2.r, color2.g, color2.b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Determine if text should be light or dark based on background
 */
export function getTextColor(bgHex) {
  const rgb = hexToRgb(bgHex)
  const luminance = getLuminance(rgb.r, rgb.g, rgb.b)
  return luminance > 0.5 ? '#000000' : '#FFFFFF'
}
