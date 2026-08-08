// 图像量化 Web Worker - 基于 pixelbead.art 完整算法
// 包含: 背景检测, K-means++ 调色板选择, 边缘感知区域采样,
//       Floyd-Steinberg/有序抖动, ICM 空间优化, Unsharp Mask 预处理
// Phase 2: 支持 Transferable ArrayBuffer 输入, outW/outH 非正方形, highQuality/removeBackground 外部控制
// Phase 6.2: 补充 labToRgb, nearestColorWithDist

const paletteCache = new Map();
const BLANK = 0xffff;

// ==================== 工具函数 ====================

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function radToDeg(r) {
  return (r * 180) / Math.PI;  // 修复: 弧度 × (180/π) = 角度
}

// ==================== 颜色空间转换 ====================

function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v) {
  const c = Math.max(0, Math.min(1, v));
  return c <= 0.0031308 ? c * 12.92 * 255 : (1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;
}

function labF(t) {
  return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
}

function rgbToLab(r, g, b) {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  const x = rl * 0.4124 + gl * 0.3576 + bl * 0.1805;
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  const z = rl * 0.0193 + gl * 0.1192 + bl * 0.9505;

  const xn = 0.95047, yn = 1.0, zn = 1.08883;

  const fx = labF(x / xn);
  const fy = labF(y / yn);
  const fz = labF(z / zn);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// Lab → RGB 反转换（供 labToRgb 使用）
function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const xn = 0.95047, yn = 1.0, zn = 1.08883;
  const labFInv = (t) => t > 6 / 29 ? t * t * t : 3 * (6 / 29) * (6 / 29) * (t - 4 / 29);

  const x = xn * labFInv(fx);
  const y = yn * labFInv(fy);
  const z = zn * labFInv(fz);

  const rl = 3.2406 * x - 1.5372 * y - 0.4986 * z;
  const gl = -0.9689 * x + 1.8758 * y + 0.0415 * z;
  const bl2 = 0.0557 * x - 0.2040 * y + 1.0570 * z;

  return [
    clamp(linearToSrgb(rl), 0, 255),
    clamp(linearToSrgb(gl), 0, 255),
    clamp(linearToSrgb(bl2), 0, 255)
  ];
}

// ==================== CIEDE2000 ====================

function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const avgLp = (L1 + L2) / 2.0;
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (C1 + C2) / 2.0;

  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  const avgCp = (C1p + C2p) / 2.0;

  let h1p = Math.atan2(b1, a1p);
  if (h1p < 0) h1p += 2 * Math.PI;
  let h2p = Math.atan2(b2, a2p);
  if (h2p < 0) h2p += 2 * Math.PI;

  let avgHp = 0;
  if (Math.abs(h1p - h2p) > Math.PI) {
    avgHp = (h1p + h2p + 2 * Math.PI) / 2.0;
  } else {
    avgHp = (h1p + h2p) / 2.0;
  }

  let deltahp = 0;
  if (Math.abs(h1p - h2p) <= Math.PI) {
    deltahp = h2p - h1p;
  } else if (h2p <= h1p) {
    deltahp = h2p - h1p + 2 * Math.PI;
  } else {
    deltahp = h2p - h1p - 2 * Math.PI;
  }

  const deltaLp = L2 - L1;
  const deltaCp = C2p - C1p;
  const deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deltahp / 2.0);

  const T = 1 - 0.17 * Math.cos(avgHp - degToRad(30)) + 0.24 * Math.cos(2 * avgHp) +
            0.32 * Math.cos(3 * avgHp + degToRad(6)) - 0.2 * Math.cos(4 * avgHp - degToRad(63));

  const deltaTheta = degToRad(30) * Math.exp(-Math.pow((radToDeg(avgHp) - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2));
  const Sc = 1 + 0.045 * avgCp;
  const Sh = 1 + 0.015 * avgCp * T;
  const Rt = -Math.sin(2 * deltaTheta) * Rc;

  const kL = 1, kC = 1, kH = 1;

  return Math.sqrt(
    Math.pow(deltaLp / (kL * Sl), 2) +
    Math.pow(deltaCp / (kC * Sc), 2) +
    Math.pow(deltaHp / (kH * Sh), 2) +
    Rt * (deltaCp / (kC * Sc)) * (deltaHp / (kH * Sh))
  );
}

// 快速色差（CIEDE76）
function deltaEFast(lab1, lab2) {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

// ==================== 背景检测 ====================

function quantKey(r, g, b) {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function detectBackground(data, width, height, userThreshold) {
  const edgeCount = width * 2 + height * 2;
  const stride = Math.max(1, Math.floor(edgeCount / 5000));
  const colors = [];

  for (let x = 0; x < width; x += stride) {
    const top = x * 4;
    colors.push([data[top], data[top + 1], data[top + 2]]);
    const bottom = ((height - 1) * width + x) * 4;
    colors.push([data[bottom], data[bottom + 1], data[bottom + 2]]);
  }
  for (let y = 0; y < height; y += stride) {
    const left = (y * width) * 4;
    colors.push([data[left], data[left + 1], data[left + 2]]);
    const right = (y * width + (width - 1)) * 4;
    colors.push([data[right], data[right + 1], data[right + 2]]);
  }

  if (!colors.length) return null;

  const buckets = new Map();
  for (const [r, g, b] of colors) {
    const key = quantKey(r, g, b);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  let bestKey = null, bestCount = -1;
  for (const [k, c] of buckets.entries()) {
    if (c > bestCount) { bestCount = c; bestKey = k; }
  }
  if (bestKey === null) return null;

  let sumR = 0, sumG = 0, sumB = 0, n = 0;
  for (const [r, g, b] of colors) {
    if (quantKey(r, g, b) === bestKey) { sumR += r; sumG += g; sumB += b; n += 1; }
  }

  const baseRgb = [Math.round(sumR / n), Math.round(sumG / n), Math.round(sumB / n)];
  const baseLab = rgbToLab(baseRgb[0], baseRgb[1], baseRgb[2]);

  const sampleDists = colors.map(([r, g, b]) => deltaE2000(baseLab, rgbToLab(r, g, b)));
  const med = median(sampleDists);
  const deviations = sampleDists.map((d) => Math.abs(d - med));
  const mad = median(deviations) || 1;
  const autoThresh = Math.max(8, Math.min(16, med + 2 * mad));
  const threshold = userThreshold ? Math.max(6, Math.min(24, userThreshold)) : autoThresh;

  const total = width * height;
  const mask = new Uint8Array(total);
  const queue = [];

  const pushIf = (idx) => {
    if (idx < 0 || idx >= total || mask[idx]) return;
    const o = idx * 4;
    const dist = deltaE2000(baseLab, rgbToLab(data[o], data[o + 1], data[o + 2]));
    if (dist <= threshold) { mask[idx] = 1; queue.push(idx); }
  };

  for (let x = 0; x < width; x += 1) { pushIf(x); pushIf((height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { pushIf(y * width); pushIf(y * width + (width - 1)); }

  while (queue.length) {
    const idx = queue.pop();
    const x = idx % width;
    const y = Math.floor(idx / width);
    if (x > 0) pushIf(idx - 1);
    if (x + 1 < width) pushIf(idx + 1);
    if (y > 0) pushIf(idx - width);
    if (y + 1 < height) pushIf(idx + width);
  }

  const erode = (src) => {
    const dst = new Uint8Array(total);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const idx = y * width + x;
        if (!src[idx]) continue;
        if (src[idx - width] && src[idx + width] && src[idx - 1] && src[idx + 1]) {
          dst[idx] = 1;
        }
      }
    }
    return dst;
  };

  const eroded = erode(mask);
  let covCount = 0;
  for (let i = 0; i < total; i += 1) covCount += eroded[i];
  const coverage = covCount / total;

  if (coverage < 0.005 || coverage > 0.35) return null;
  return eroded;
}

// ==================== 调色板处理 ====================

function getPaletteLabs(palette) {
  const key = palette.map((p) => p.id).join('|');
  if (paletteCache.has(key)) return paletteCache.get(key);
  const labs = palette.map((p) => rgbToLab(p.rgb.r, p.rgb.g, p.rgb.b));
  paletteCache.set(key, { key, labs });
  return { key, labs };
}

// K-means++ 调色板选择
function kmeansSelectPalette(imageData, maxColors, palette, paletteLabs, bgMask, highQuality) {
  const { data, width, height } = imageData;
  const total = width * height;
  const targetSamples = highQuality ? 22000 : 8000;
  const stride = Math.max(1, Math.floor(total / targetSamples));
  const samples = [];

  for (let i = 0; i < total; i += stride) {
    if (bgMask && bgMask[i]) continue;
    const o = i * 4;
    samples.push(rgbToLab(data[o], data[o + 1], data[o + 2]));
  }

  if (!samples.length || maxColors >= palette.length) {
    return { palette, labs: paletteLabs.labs };
  }

  const k = Math.min(maxColors, samples.length);

  const centers = [];
  centers.push(samples[Math.floor(Math.random() * samples.length)]);
  while (centers.length < k) {
    const dists = samples.map((s) => {
      let best = Infinity;
      for (const c of centers) {
        const d = deltaEFast(s, c);
        if (d < best) best = d;
      }
      return best * best;
    });
    const sum = dists.reduce((a, b) => a + b, 0);
    const r = Math.random() * sum;
    let acc = 0;
    for (let i = 0; i < dists.length; i += 1) {
      acc += dists[i];
      if (acc >= r) { centers.push(samples[i]); break; }
    }
  }

  const assign = new Array(samples.length).fill(0);
  const iterMax = highQuality ? 16 : 8;
  for (let iter = 0; iter < iterMax; iter += 1) {
    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i];
      let best = 0, bestDist = Infinity;
      for (let c = 0; c < centers.length; c += 1) {
        const d = deltaEFast(s, centers[c]);
        if (d < bestDist) { bestDist = d; best = c; }
      }
      assign[i] = best;
    }

    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i += 1) {
      const c = assign[i];
      const s = samples[i];
      sums[c][0] += s[0]; sums[c][1] += s[1]; sums[c][2] += s[2]; sums[c][3] += 1;
    }
    for (let c = 0; c < centers.length; c += 1) {
      if (sums[c][3] === 0) continue;
      centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    }
  }

  const mapped = centers.map((cen) => {
    let best = 0, bestDist = Infinity;
    for (let p = 0; p < palette.length; p += 1) {
      const d = deltaE2000(cen, paletteLabs.labs[p]);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    return { index: best, dist: bestDist };
  }).sort((a, b) => a.dist - b.dist);

  const picked = [];
  const used = new Set();
  for (const m of mapped) {
    if (!used.has(m.index)) { picked.push(m.index); used.add(m.index); }
    if (picked.length === maxColors) break;
  }
  for (let i = 0; picked.length < maxColors && i < palette.length; i += 1) {
    if (!used.has(i)) { picked.push(i); used.add(i); }
  }

  const subset = picked.map((i) => palette[i]);
  const subsetLabs = picked.map((i) => paletteLabs.labs[i]);
  return { palette: subset, labs: subsetLabs };
}

function nearestColor(lab, palette, paletteLabs) {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < palette.length; i += 1) {
    const d = deltaE2000(lab, paletteLabs[i]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// 返回索引和色差值（供未来扩展使用）
function nearestColorWithDist(lab, palette, paletteLabs) {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < palette.length; i += 1) {
    const d = deltaE2000(lab, paletteLabs[i]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return { index: best, dist: bestDist };
}

// ==================== 亮度/对比度调整 ====================

function applyBrightnessContrastLinear(r, g, b, brightness, contrast) {
  const toLinear = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const toSRGB = (v) => {
    const c = Math.max(0, Math.min(1, v));
    return c <= 0.0031308 ? c * 12.92 * 255 : (1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;
  };

  const rl = toLinear(r), gl = toLinear(g), bl = toLinear(b);
  const bShift = (brightness / 100);
  const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const adj = (x) => cFactor * (x - 0.5) + 0.5 + bShift;

  return [
    clamp(toSRGB(adj(rl)), 0, 255),
    clamp(toSRGB(adj(gl)), 0, 255),
    clamp(toSRGB(adj(bl)), 0, 255)
  ];
}

// ==================== 边缘感知区域采样 ====================

function computeEdgeAwareAreaColors(hiResData, hiResW, hiResH, outW, outH, brightness, contrast) {
  const cellW = hiResW / outW;
  const cellH = hiResH / outH;
  const result = new Array(outW * outH);
  const edgeMap = new Float32Array(outW * outH);
  const EDGE_VARIANCE_THRESHOLD = 0.008;

  for (let oy = 0; oy < outH; oy += 1) {
    for (let ox = 0; ox < outW; ox += 1) {
      const x0 = ox * cellW, y0 = oy * cellH;
      const x1 = (ox + 1) * cellW, y1 = (oy + 1) * cellH;
      const ix0 = Math.floor(x0), iy0 = Math.floor(y0);
      const ix1 = Math.min(Math.ceil(x1), hiResW);
      const iy1 = Math.min(Math.ceil(y1), hiResH);

      const pixels = [];
      let totalWeight = 0, transparentWeight = 0;

      for (let py = iy0; py < iy1; py += 1) {
        const coverY = Math.min(py + 1, y1) - Math.max(py, y0);
        for (let px = ix0; px < ix1; px += 1) {
          const coverX = Math.min(px + 1, x1) - Math.max(px, x0);
          const weight = coverX * coverY;
          const srcIdx = (py * hiResW + px) * 4;
          const a = hiResData[srcIdx + 3];
          if (a < 5) { transparentWeight += weight; continue; }

          let r = hiResData[srcIdx], g = hiResData[srcIdx + 1], b = hiResData[srcIdx + 2];
          if (brightness !== 0 || contrast !== 0) {
            [r, g, b] = applyBrightnessContrastLinear(r, g, b, brightness, contrast);
          }
          const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
          pixels.push({ lr, lg, lb, weight });
          totalWeight += weight;
        }
      }

      const outIdx = oy * outW + ox;
      if (totalWeight < 0.001 || transparentWeight > totalWeight) {
        result[outIdx] = null; edgeMap[outIdx] = 0; continue;
      }

      let sumLR = 0, sumLG = 0, sumLB = 0;
      for (const p of pixels) { sumLR += p.lr * p.weight; sumLG += p.lg * p.weight; sumLB += p.lb * p.weight; }
      const avgLR = sumLR / totalWeight, avgLG = sumLG / totalWeight, avgLB = sumLB / totalWeight;

      let variance = 0;
      for (const p of pixels) {
        const dr = p.lr - avgLR, dg = p.lg - avgLG, db = p.lb - avgLB;
        variance += (dr * dr + dg * dg + db * db) * p.weight;
      }
      variance /= totalWeight;
      edgeMap[outIdx] = variance;

      if (variance > EDGE_VARIANCE_THRESHOLD && pixels.length >= 4) {
        const labAvg = rgbToLab(linearToSrgb(avgLR), linearToSrgb(avgLG), linearToSrgb(avgLB));
        const labPixels = pixels.map(p => ({
          lab: rgbToLab(linearToSrgb(p.lr), linearToSrgb(p.lg), linearToSrgb(p.lb)),
          lr: p.lr, lg: p.lg, lb: p.lb, weight: p.weight
        }));

        let farthestDist = 0, farthestIdx = 0;
        for (let i = 0; i < labPixels.length; i++) {
          const d = deltaEFast(labPixels[i].lab, labAvg);
          if (d > farthestDist) { farthestDist = d; farthestIdx = i; }
        }

        let c1 = labAvg, c2 = labPixels[farthestIdx].lab;
        let w1 = 0, w2 = 0;
        let sumLR1 = 0, sumLG1 = 0, sumLB1 = 0;
        let sumLR2 = 0, sumLG2 = 0, sumLB2 = 0;
        let sumL1 = 0, sumA1 = 0, sumB1 = 0;
        let sumL2 = 0, sumA2 = 0, sumB2 = 0;

        for (let iter = 0; iter < 3; iter++) {
          w1 = 0; w2 = 0;
          sumLR1 = 0; sumLG1 = 0; sumLB1 = 0;
          sumLR2 = 0; sumLG2 = 0; sumLB2 = 0;
          sumL1 = 0; sumA1 = 0; sumB1 = 0;
          sumL2 = 0; sumA2 = 0; sumB2 = 0;

          for (const p of labPixels) {
            const d1 = deltaEFast(p.lab, c1);
            const d2 = deltaEFast(p.lab, c2);
            if (d1 <= d2) {
              w1 += p.weight; sumLR1 += p.lr * p.weight; sumLG1 += p.lg * p.weight; sumLB1 += p.lb * p.weight;
              sumL1 += p.lab[0] * p.weight; sumA1 += p.lab[1] * p.weight; sumB1 += p.lab[2] * p.weight;
            } else {
              w2 += p.weight; sumLR2 += p.lr * p.weight; sumLG2 += p.lg * p.weight; sumLB2 += p.lb * p.weight;
              sumL2 += p.lab[0] * p.weight; sumA2 += p.lab[1] * p.weight; sumB2 += p.lab[2] * p.weight;
            }
          }
          if (w1 > 0) c1 = [sumL1 / w1, sumA1 / w1, sumB1 / w1];
          if (w2 > 0) c2 = [sumL2 / w2, sumA2 / w2, sumB2 / w2];
        }

        if (w1 >= w2 && w1 > 0) {
          const r = linearToSrgb(sumLR1 / w1), g = linearToSrgb(sumLG1 / w1), b = linearToSrgb(sumLB1 / w1);
          result[outIdx] = { lab: rgbToLab(r, g, b), rgb: [r, g, b] };
        } else if (w2 > 0) {
          const r = linearToSrgb(sumLR2 / w2), g = linearToSrgb(sumLG2 / w2), b = linearToSrgb(sumLB2 / w2);
          result[outIdx] = { lab: rgbToLab(r, g, b), rgb: [r, g, b] };
        } else {
          const r = linearToSrgb(avgLR), g = linearToSrgb(avgLG), b = linearToSrgb(avgLB);
          result[outIdx] = { lab: rgbToLab(r, g, b), rgb: [r, g, b] };
        }
      } else {
        const r = linearToSrgb(avgLR), g = linearToSrgb(avgLG), b = linearToSrgb(avgLB);
        result[outIdx] = { lab: rgbToLab(r, g, b), rgb: [r, g, b] };
      }
    }
  }
  return { colors: result, edgeMap };
}

// ==================== 区域方差计算 ====================

function computeAreaVariance(hiResData, hiResW, hiResH, outW, outH) {
  const cellW = hiResW / outW, cellH = hiResH / outH;
  const result = new Float32Array(outW * outH);

  for (let oy = 0; oy < outH; oy += 1) {
    for (let ox = 0; ox < outW; ox += 1) {
      const x0 = Math.floor(ox * cellW), y0 = Math.floor(oy * cellH);
      const x1 = Math.min(Math.ceil((ox + 1) * cellW), hiResW);
      const y1 = Math.min(Math.ceil((oy + 1) * cellH), hiResH);

      let sumLum = 0, sumLum2 = 0, count = 0;
      for (let py = y0; py < y1; py += 1) {
        for (let px = x0; px < x1; px += 1) {
          const srcIdx = (py * hiResW + px) * 4;
          if (hiResData[srcIdx + 3] < 5) continue;
          const lum = 0.2126 * hiResData[srcIdx] + 0.7152 * hiResData[srcIdx + 1] + 0.0722 * hiResData[srcIdx + 2];
          sumLum += lum; sumLum2 += lum * lum; count += 1;
        }
      }
      if (count > 0) {
        const mean = sumLum / count;
        result[oy * outW + ox] = sumLum2 / count - mean * mean;
      }
    }
  }
  return result;
}

// ==================== Unsharp Mask 锐化 ====================

function applyUnsharpMask(data, width, height, amount, radius) {
  const total = width * height;
  const blurred = new Float32Array(total * 3);
  const kernelSize = radius <= 1 ? 3 : 5;
  const half = Math.floor(kernelSize / 2);
  const kernel = kernelSize === 3
    ? [1, 2, 1, 2, 4, 2, 1, 2, 1]
    : [1, 4, 6, 4, 1, 4, 16, 24, 16, 4, 6, 24, 36, 24, 6, 4, 16, 24, 16, 4, 1, 4, 6, 4, 1];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0, wSum = 0;
      for (let ky = -half; ky <= half; ky++) {
        const yy = clamp(y + ky, 0, height - 1);
        for (let kx = -half; kx <= half; kx++) {
          const xx = clamp(x + kx, 0, width - 1);
          const ki = (ky + half) * kernelSize + (kx + half);
          const w = kernel[ki];
          const srcIdx = (yy * width + xx) * 4;
          if (data[srcIdx + 3] < 5) continue;
          sumR += srgbToLinear(data[srcIdx]) * w;
          sumG += srgbToLinear(data[srcIdx + 1]) * w;
          sumB += srgbToLinear(data[srcIdx + 2]) * w;
          wSum += w;
        }
      }
      const idx = y * width + x;
      if (wSum > 0) {
        blurred[idx * 3] = sumR / wSum;
        blurred[idx * 3 + 1] = sumG / wSum;
        blurred[idx * 3 + 2] = sumB / wSum;
      }
    }
  }

  const result = new Uint8ClampedArray(data.length);
  for (let i = 0; i < total; i++) {
    const srcIdx = i * 4;
    const a = data[srcIdx + 3];
    result[srcIdx + 3] = a;
    if (a < 5) {
      result[srcIdx] = data[srcIdx]; result[srcIdx + 1] = data[srcIdx + 1]; result[srcIdx + 2] = data[srcIdx + 2];
      continue;
    }
    const origR = srgbToLinear(data[srcIdx]), origG = srgbToLinear(data[srcIdx + 1]), origB = srgbToLinear(data[srcIdx + 2]);
    const sharpR = origR + amount * (origR - blurred[i * 3]);
    const sharpG = origG + amount * (origG - blurred[i * 3 + 1]);
    const sharpB = origB + amount * (origB - blurred[i * 3 + 2]);
    result[srcIdx] = clamp(linearToSrgb(sharpR), 0, 255);
    result[srcIdx + 1] = clamp(linearToSrgb(sharpG), 0, 255);
    result[srcIdx + 2] = clamp(linearToSrgb(sharpB), 0, 255);
  }
  return result;
}

// ==================== ICM 空间优化 ====================

function spatialRefinement(outIdx, areaColors, activePalette, activeLabs, outW, outH, iterations, spatialWeight) {
  const total = outW * outH;
  const current = new Uint16Array(outIdx);

  for (let iter = 0; iter < iterations; iter++) {
    let changed = 0;
    for (let y = 0; y < outH; y += 1) {
      for (let x = 0; x < outW; x += 1) {
        const idx = y * outW + x;
        if (!areaColors[idx] || current[idx] === BLANK) continue;

        const targetLab = areaColors[idx].lab;
        let bestCost = Infinity, bestColor = current[idx];

        const neighbors = [];
        if (x > 0 && current[idx - 1] !== BLANK) neighbors.push(current[idx - 1]);
        if (x + 1 < outW && current[idx + 1] !== BLANK) neighbors.push(current[idx + 1]);
        if (y > 0 && current[idx - outW] !== BLANK) neighbors.push(current[idx - outW]);
        if (y + 1 < outH && current[idx + outW] !== BLANK) neighbors.push(current[idx + outW]);

        const candidates = new Set();
        candidates.add(current[idx]);
        for (const n of neighbors) candidates.add(n);
        candidates.add(nearestColor(targetLab, activePalette, activeLabs));

        for (const ci of candidates) {
          const fidelityCost = deltaE2000(targetLab, activeLabs[ci]);
          let smoothCost = 0;
          for (const n of neighbors) {
            if (n !== ci) smoothCost += deltaEFast(activeLabs[ci], activeLabs[n]);
          }
          smoothCost = neighbors.length > 0 ? smoothCost / neighbors.length : 0;
          const totalCost = fidelityCost + spatialWeight * smoothCost;
          if (totalCost < bestCost) { bestCost = totalCost; bestColor = ci; }
        }

        if (bestColor !== current[idx]) { current[idx] = bestColor; changed += 1; }
      }
    }
    if (changed === 0) break;
  }

  const counts = new Array(activePalette.length).fill(0);
  for (let i = 0; i < total; i++) {
    outIdx[i] = current[i];
    if (current[i] !== BLANK) counts[current[i]] += 1;
  }
  return counts;
}

// ==================== 有序抖动 ====================

function orderedDitherValue(x, y) {
  const matrix = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  return matrix[y % 4][x % 4] / 16 - 0.5;
}

// ==================== 主处理流程 ====================

self.onmessage = (event) => {
  const { type, payload } = event.data;

  if (type === 'QUANTIZE') {
    try {
      const {
        imageData,
        gridSize,          // 向后兼容：正方形尺寸
        gridWidth,         // Phase 3: 支持非正方形
        gridHeight,
        maxColors,
        paletteColors,
        dithering,
        brightness = 0,
        contrast = 0,
        highQuality: inputHighQuality,   // Phase 2: 外部控制质量模式
        removeBackground = true          // Phase 4: 背景移除开关
      } = payload;

      const outW = gridWidth || gridSize;
      const outH = gridHeight || gridSize;
      const highQuality = inputHighQuality !== false; // 默认 true
      // 钳制颜色数下界:maxColors≤0 会产生空调色板 → 全部格子 NaN 索引,主线程崩溃
      const safeMaxColors = Math.max(1, Math.min(maxColors || 1, paletteColors.length));

      self.postMessage({ type: 'PROGRESS', progress: 5 });

      // 处理调色板格式 — 统一为 { id, name, hex, rgb: { r, g, b } }
      const palette = paletteColors.map(c => {
        const r = c.rgb?.r ?? parseInt((c.hex||'#000').slice(1, 3), 16)
        const g = c.rgb?.g ?? parseInt((c.hex||'#000').slice(3, 5), 16)
        const b = c.rgb?.b ?? parseInt((c.hex||'#000').slice(5, 7), 16)
        return {
          id: c.id || c.hex,   // 品牌色号优先（P18），回退到 hex
          name: c.name || c.id || c.hex,
          hex: c.hex || '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0').toUpperCase()).join(''),
          rgb: { r, g, b }
        }
      })

      // Phase 2: 支持 ArrayBuffer (Transferable) 和 Array 两种输入格式
      let hiResData;
      if (imageData.data instanceof ArrayBuffer) {
        hiResData = new Uint8ClampedArray(imageData.data);
      } else if (imageData.data instanceof Uint8ClampedArray) {
        hiResData = imageData.data;
      } else {
        hiResData = new Uint8ClampedArray(imageData.data);
      }
      const hiResW = imageData.width;
      const hiResH = imageData.height;
      // 图片两维都不大于网格时不能直接 1:1 映射(会越界读 undefined → NaN),
      // 必须走边缘感知分支(内含放大)。canDirectMap 为 true 时走原逻辑。
      const canDirectMap = hiResW >= outW && hiResH >= outH;
      const hasHiRes = canDirectMap ? (hiResW > outW || hiResH > outH) : true;

      const paletteLabs = getPaletteLabs(palette);

      self.postMessage({ type: 'PROGRESS', progress: 10 });

      // 锐化预处理
      if (hasHiRes) {
        const scaleRatio = hiResW / outW;
        if (scaleRatio > 3) {
          const sharpAmount = clamp(0.15 + (scaleRatio - 5) * 0.03, 0.1, 0.5);
          hiResData = applyUnsharpMask(hiResData, hiResW, hiResH, sharpAmount, 1);
        }
      }

      self.postMessage({ type: 'PROGRESS', progress: 20 });

      // 背景检测（由 removeBackground 参数控制）
      const bgMask = removeBackground
        ? detectBackground(hiResData, hiResW, hiResH, null)
        : null;

      // K-means++ 调色板选择
      let subset;
      if (hasHiRes) {
        subset = kmeansSelectPalette({ data: hiResData, width: hiResW, height: hiResH }, safeMaxColors, palette, paletteLabs, bgMask, highQuality);
      } else {
        subset = kmeansSelectPalette({ data: hiResData, width: hiResW, height: hiResH }, safeMaxColors, palette, paletteLabs, null, highQuality);
      }
      const activePalette = subset.palette;
      const activeLabs = subset.labs;

      self.postMessage({ type: 'PROGRESS', progress: 40 });

      // 边缘感知区域采样
      let areaColors, edgeMap;
      if (hasHiRes) {
        const areaResult = computeEdgeAwareAreaColors(hiResData, hiResW, hiResH, outW, outH, brightness, contrast);
        areaColors = areaResult.colors;
        edgeMap = areaResult.edgeMap;
      } else {
        areaColors = new Array(outW * outH);
        edgeMap = new Float32Array(outW * outH);
        const srcTotal = hiResW * hiResH;
        for (let i = 0; i < outW * outH; i += 1) {
          if (i >= srcTotal) { areaColors[i] = null; continue; } // 防御:越界按透明处理
          const o = i * 4;
          const a = hiResData[o + 3];
          if (a < 5) { areaColors[i] = null; continue; }
          let r = hiResData[o], g = hiResData[o + 1], b = hiResData[o + 2];
          if (brightness !== 0 || contrast !== 0) {
            [r, g, b] = applyBrightnessContrastLinear(r, g, b, brightness, contrast);
          }
          areaColors[i] = { lab: rgbToLab(r, g, b), rgb: [r, g, b] };
        }
      }

      self.postMessage({ type: 'PROGRESS', progress: 60 });

      // 区域方差计算
      let areaVariance;
      if (hasHiRes) {
        areaVariance = computeAreaVariance(hiResData, hiResW, hiResH, outW, outH);
      } else {
        areaVariance = new Float32Array(outW * outH);
        for (let y = 0; y < outH; y += 1) {
          for (let x = 0; x < outW; x += 1) {
            let sum = 0, sum2 = 0, count = 0;
            for (let dy = -1; dy <= 1; dy += 1) {
              const yy = y + dy; if (yy < 0 || yy >= outH) continue;
              for (let dx = -1; dx <= 1; dx += 1) {
                const xx = x + dx; if (xx < 0 || xx >= outW) continue;
                const idx = yy * outW + xx;
                const o = idx * 4;
                const lum = 0.2126 * hiResData[o] + 0.7152 * hiResData[o + 1] + 0.0722 * hiResData[o + 2];
                sum += lum; sum2 += lum * lum; count += 1;
              }
            }
            const mean = sum / count;
            areaVariance[y * outW + x] = sum2 / count - mean * mean;
          }
        }
      }

      const outTotal = outW * outH;
      const outIdx = new Uint16Array(outTotal);
      let outCounts = new Array(activePalette.length).fill(0);

      const resolutionFactor = Math.min(1.0, Math.max(0.15, (Math.min(outW, outH) - 15) / 60));
      const VAR_LOW = 50, VAR_HIGH = 240;

      self.postMessage({ type: 'PROGRESS', progress: 70 });

      // Floyd-Steinberg 蛇形抖动
      if (dithering === 'floyd-steinberg') {
        const bufferL = new Float32Array(outTotal);
        const bufferA = new Float32Array(outTotal);
        const bufferB = new Float32Array(outTotal);
        const isTransparent = new Uint8Array(outTotal);

        for (let i = 0; i < outTotal; i += 1) {
          if (!areaColors[i]) { isTransparent[i] = 1; outIdx[i] = BLANK; continue; }
          bufferL[i] = areaColors[i].lab[0];
          bufferA[i] = areaColors[i].lab[1];
          bufferB[i] = areaColors[i].lab[2];
        }

        for (let y = 0; y < outH; y += 1) {
          const leftToRight = (y % 2 === 0);
          const xStart = leftToRight ? 0 : outW - 1;
          const xEnd = leftToRight ? outW : -1;
          const xStep = leftToRight ? 1 : -1;

          for (let x = xStart; x !== xEnd; x += xStep) {
            const idx = y * outW + x;
            if (isTransparent[idx]) continue;

            const lab = [bufferL[idx], bufferA[idx], bufferB[idx]];
            const colorIndex = nearestColor(lab, activePalette, activeLabs);
            outIdx[idx] = colorIndex;
            outCounts[colorIndex] += 1;

            const matchedLab = activeLabs[colorIndex];
            let errL = bufferL[idx] - matchedLab[0];
            let errA = bufferA[idx] - matchedLab[1];
            let errB = bufferB[idx] - matchedLab[2];

            const variance = areaVariance[idx];
            const varFactor = Math.max(0, Math.min(1, (variance - VAR_LOW) / (VAR_HIGH - VAR_LOW)));
            const diffusionStrength = varFactor * resolutionFactor;

            if (diffusionStrength <= 0.02) continue;
            errL *= diffusionStrength; errA *= diffusionStrength; errB *= diffusionStrength;

            const xFwd = x + xStep, xBack = x - xStep;

            if (xFwd >= 0 && xFwd < outW && !isTransparent[y * outW + xFwd]) {
              const fi = y * outW + xFwd;
              bufferL[fi] += (errL * 7) / 16; bufferA[fi] += (errA * 7) / 16; bufferB[fi] += (errB * 7) / 16;
            }
            if (y + 1 < outH) {
              const below = (y + 1) * outW + x;
              if (!isTransparent[below]) {
                bufferL[below] += (errL * 5) / 16; bufferA[below] += (errA * 5) / 16; bufferB[below] += (errB * 5) / 16;
              }
              if (xBack >= 0 && xBack < outW && !isTransparent[(y + 1) * outW + xBack]) {
                const bi = (y + 1) * outW + xBack;
                bufferL[bi] += (errL * 1) / 16; bufferA[bi] += (errA * 1) / 16; bufferB[bi] += (errB * 1) / 16;
              }
              if (xFwd >= 0 && xFwd < outW && !isTransparent[(y + 1) * outW + xFwd]) {
                const fi = (y + 1) * outW + xFwd;
                bufferL[fi] += (errL * 3) / 16; bufferA[fi] += (errA * 3) / 16; bufferB[fi] += (errB * 3) / 16;
              }
            }
          }
        }
      } else if (dithering === 'ordered') {
        // 有序抖动
        for (let y = 0; y < outH; y += 1) {
          for (let x = 0; x < outW; x += 1) {
            const idx = y * outW + x;
            if (!areaColors[idx]) { outIdx[idx] = BLANK; continue; }

            const lab = [...areaColors[idx].lab];
            const variance = areaVariance[idx];
            const varFactor = Math.max(0, Math.min(1, (variance - VAR_LOW) / (VAR_HIGH - VAR_LOW)));
            const t = orderedDitherValue(x, y);
            const amount = 12 * varFactor * resolutionFactor;
            lab[0] = clamp(lab[0] + t * amount, 0, 100);

            const colorIndex = nearestColor(lab, activePalette, activeLabs);
            outIdx[idx] = colorIndex;
            outCounts[colorIndex] += 1;
          }
        }
      } else {
        // 无抖动
        for (let y = 0; y < outH; y += 1) {
          for (let x = 0; x < outW; x += 1) {
            const idx = y * outW + x;
            if (!areaColors[idx]) { outIdx[idx] = BLANK; continue; }
            const colorIndex = nearestColor(areaColors[idx].lab, activePalette, activeLabs);
            outIdx[idx] = colorIndex;
            outCounts[colorIndex] += 1;
          }
        }
      }

      self.postMessage({ type: 'PROGRESS', progress: 85 });

      // ICM 空间优化（对小尺寸图纸效果更明显）— 短边 ≤120 即触发，兼容矩形网格
      if (Math.min(outW, outH) <= 120) {
        const minDim = Math.min(outW, outH);
        const spatialWeight = minDim <= 30 ? 0.25 : (minDim <= 50 ? 0.18 : minDim <= 80 ? 0.12 : 0.07);
        const refinementIters = highQuality ? 4 : 2;
        outCounts = spatialRefinement(outIdx, areaColors, activePalette, activeLabs, outW, outH, refinementIters, spatialWeight);
      }

      self.postMessage({ type: 'PROGRESS', progress: 90 });

      // 颜色统计
      const colorStats = {};
      for (let i = 0; i < activePalette.length; i++) {
        if (outCounts[i] > 0) colorStats[activePalette[i].id] = outCounts[i];
      }

      self.postMessage({ type: 'PROGRESS', progress: 100 });

      // Transferable 索引输出 — 大图节省 >90% 序列化时间
      // outIdx.buffer 所有权转移给主线程，Worker 此后不可访问
      self.postMessage(
        {
          type: 'COMPLETE',
          payload: {
            indexBuffer: outIdx.buffer,
            width: outW,
            height: outH,
            quantizedColors: activePalette,
            colorStats,
            BLANK_MARKER: 0xffff
          }
        },
        [outIdx.buffer]
      );

    } catch (error) {
      self.postMessage({ type: 'ERROR', error: error.message + '\n' + error.stack });
    }
  }
};
