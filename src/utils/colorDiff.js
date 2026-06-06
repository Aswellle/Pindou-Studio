/**
 * CIEDE2000 Color Difference Algorithm
 *
 * Based on the CIEDE2000 color-difference formula developed by the CIE
 * for better perceptual color difference measurement than Euclidean distance.
 *
 * Reference: http://www.ece.rochester.edu/~gsharma/ciede2000/
 */

/**
 * Convert RGB to LAB color space
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {Object} - { L, a, b }
 */
export function rgbToLab(r, g, b) {
  // Convert RGB to XYZ
  let rr = r / 255
  let gg = g / 255
  let bb = b / 255

  // Apply gamma correction
  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92

  // Scale
  rr *= 100
  gg *= 100
  bb *= 100

  // Convert to XYZ using D65 illuminant
  const x = rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375
  const y = rr * 0.2126729 + gg * 0.7151522 + bb * 0.0721750
  const z = rr * 0.0193339 + gg * 0.1191920 + bb * 0.9503041

  // Convert XYZ to LAB (using D65 reference)
  const xn = 95.047
  const yn = 100.0
  const zn = 108.883

  const xx = x / xn
  const yy = y / yn
  const zz = z / zn

  const fx = xx > 0.008856 ? Math.pow(xx, 1 / 3) : (7.787 * xx) + (16 / 116)
  const fy = yy > 0.008856 ? Math.pow(yy, 1 / 3) : (7.787 * yy) + (16 / 116)
  const fz = zz > 0.008856 ? Math.pow(zz, 1 / 3) : (7.787 * zz) + (16 / 116)

  const L = (116 * fy) - 16
  const a = 500 * (fx - fy)
  const bLab = 200 * (fy - fz)

  return { L, a: a, b: bLab }
}

/**
 * Calculate CIEDE2000 color difference between two LAB colors
 * @param {Object} lab1 - First color in LAB { L, a, b }
 * @param {Object} lab2 - Second color in LAB { L, a, b }
 * @returns {number} - Delta E (color difference)
 */
export function ciede2000(lab1, lab2) {
  const { L: L1, a: a1, b: b1 } = lab1
  const { L: L2, a: a2, b: b2 } = lab2

  // Parameters for CIEDE2000
  const kL = 1
  const kC = 1
  const kH = 1
  const k1 = 0.045  // SC weight (CIEDE2000 standard)
  const k2 = 0.015  // SH weight (CIEDE2000 standard) — was wrongly 0.065

  // Calculate C and h
  const C1 = Math.sqrt(a1 * a1 + b1 * b1)
  const C2 = Math.sqrt(a2 * a2 + b2 * b2)
  const Cab = (C1 + C2) / 2

  const Cab7 = Math.pow(Cab, 7)
  const G = 0.5 * (1 - Math.sqrt(Cab7 / (Cab7 + Math.pow(25, 7))))

  const a1p = a1 * (1 + G)
  const a2p = a2 * (1 + G)

  const C1p = Math.sqrt(a1p * a1p + b1 * b1)
  const C2p = Math.sqrt(a2p * a2p + b2 * b2)

  let h1p = 0
  if (b1 !== 0 || a1p !== 0) {
    h1p = Math.atan2(b1, a1p) * 180 / Math.PI
    if (h1p < 0) h1p += 360
  }

  let h2p = 0
  if (b2 !== 0 || a2p !== 0) {
    h2p = Math.atan2(b2, a2p) * 180 / Math.PI
    if (h2p < 0) h2p += 360
  }

  const dLp = L2 - L1
  const dCp = C2p - C1p

  let dhp = 0
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p
    if (diff > 180) {
      dhp = diff - 360
    } else if (diff < -180) {
      dhp = diff + 360
    } else {
      dhp = diff
    }
  }

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI / 180) / 2)

  const Lp = (L1 + L2) / 2
  const Cp = (C1p + C2p) / 2

  let Hp = h1p + h2p
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p
    if (diff > 180) {
      if (h2p <= h1p) {
        Hp += 360
      }
    } else if (diff < -180) {
      if (h2p >= h1p) {
        Hp -= 360
      }
    }
  }
  Hp /= 2

  const Lp7 = Math.pow(Lp - 50, 2)
  const T = 1 -
    0.17 * Math.cos((Hp - 30) * Math.PI / 180) +
    0.24 * Math.cos(2 * Hp * Math.PI / 180) +
    0.32 * Math.cos((3 * Hp + 6) * Math.PI / 180) -
    0.20 * Math.cos((4 * Hp - 63) * Math.PI / 180)

  const dTheta = 30 * Math.exp(-Math.pow((Hp - 275) / 25, 2))
  const Cp7 = Math.pow(Cp, 7)
  const RC = 2 * Math.sqrt(Cp7 / (Cp7 + Math.pow(25, 7)))
  const SL = 1 + (0.015 * Lp7) / Math.sqrt(20 + Lp7)
  const SC = 1 + k1 * Cp
  const SH = 1 + k2 * Cp * T
  const RT = -Math.sin((2 * dTheta * Math.PI) / 180) * RC

  const dE = Math.sqrt(
    Math.pow(dLp / (kL * SL), 2) +
    Math.pow(dCp / (kC * SC), 2) +
    Math.pow(dHp / (kH * SH), 2) +
    RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
  )

  return dE
}

/**
 * Find the closest color in a palette using CIEDE2000
 * @param {Object} rgb - Target color { r, g, b }
 * @param {Array} paletteColors - Array of palette colors with rgb property
 * @returns {Object} - Closest palette color
 */
export function findClosestColorCIEDE2000(rgb, paletteColors) {
  const lab1 = rgbToLab(rgb.r, rgb.g, rgb.b)

  let closest = paletteColors[0]
  let minDeltaE = Infinity

  for (const color of paletteColors) {
    const lab2 = rgbToLab(color.rgb.r, color.rgb.g, color.rgb.b)
    const deltaE = ciede2000(lab1, lab2)

    if (deltaE < minDeltaE) {
      minDeltaE = deltaE
      closest = color
    }
  }

  return closest
}

/**
 * Simple Euclidean distance (fallback for performance)
 */
export function colorDistanceEuclidean(c1, c2) {
  const dR = c1.r - c2.r
  const dG = c1.g - c2.g
  const dB = c1.b - c2.b
  return Math.sqrt(dR * dR + dG * dG + dB * dB)
}
