/**
 * ironingEffectPresets — 高级熨烫效果的材质预设(集中配置)。
 *
 * 六种材质是「成品效果模拟」的展示层参数,不是实物材料的物理测量值;
 * 数值以 docs/implementation/advanced-ironing-effects/references 的参考图为
 * 视觉基准校准,全部集中在本文件,渲染器不得在 if/else 里散落硬编码颜色。
 *
 * 契约(03 文档):
 *   - presetId 是一次预览/导出的临时渲染参数,禁止写入 PatternDocument、
 *     作品数据或项目 JSON;
 *   - fabricBase 只决定材料底板色,永远不会替换图案里的 HEX;
 *   - 未知 presetId 确定性回退到 linen,不抛错;
 *   - 全部对象深度冻结,调用方拿不到可改写的共享内部对象。
 */

/** 纹理类型白名单(渲染器据此选择 tile 生成器) */
export const IRONING_TEXTURE_TYPES = Object.freeze([
  'micro-grid',        // 无孔烫:细密均匀的微网格压纹,低反差
  'woven-crosshatch',  // 麻布烫:横纵交织纤维,经纬明暗有差异
  'terry-loop',        // 毛巾烫:不规则短弧绒圈簇,起伏明显
  'bath-mesh',         // 澡巾烫:斜向交叉网纹 + 局部网眼
  'fine-sparkle',      // 细闪烫:高密度微小冷色闪点
  'coarse-sparkle',    // 粗闪烫:低密度较大亮片,局部星芒
])

/**
 * 六种材质预设。
 *
 * 参数单位:
 *   - textureScale / sparkleSize / beadWobble / cellGap 为逻辑像素(样片坐标系,
 *     与 cellSize 无关,材质颗粒与缝隙相对底板恒定,预览与导出观感一致);
 *   - meltOverlap / beadRound 为 cellSize 的比例(0–0.5):熔融后珠子互相
 *     吞并间隙的外扩量与珠面圆角;
 *   - textureOpacity / surfaceOpacity / roughness / sheen / cellGap /
 *     edgeSoftness / edgeRadius / shadowOpacity / sparkleDensity /
 *     beadDome / beadSpecular / beadTint / beadSoftEdge 均为 0–1 强度或比例;
 *   - sparkleSize 为 [min, max] 区间;非闪粉材质 density/size 为 0,
 *     不让织物纹理读取无意义的闪粉参数。
 *
 * 熔融组参数(meltOverlap / beadDome 等 melt 与 bead 前缀)是「珠子本身长成材质」的关键:
 *   - meltOverlap 让相邻珠子互相重叠成连续色域,不再是一格格像素点;
 *   - beadDome/beadSpecular 给每颗熔珠顶面高光与边缘暗部(soft-light 叠加),
 *     无孔烫因此读作熔成一体的圆顶塑料,而不是平面色块;
 *   - beadTint 把织物色罩到珠面上(毛巾烫最重),对应参考图里「颜色被绒面吃掉」;
 *   - surfaceOpacity 是盖在珠面之上的纹理强度 —— 织物纹理必须横跨珠子与
 *     底布,珠子才像「烫进布里」而不是「贴在底板上」。
 */
export const IRONING_EFFECT_PRESETS = Object.freeze([
  Object.freeze({
    id: 'no-hole',
    labelKey: 'export.ironing.material.noHole',
    hintKey: 'export.ironing.hint.noHole',
    showcaseImage: '/ironing/no-hole.jpg',
    // UI 色块预览代表色(= 材质底色)
    swatchColor: '#CBE4D6',
    fabricBase: '#CBE4D6',
    textureType: 'micro-grid',
    textureScale: 7,
    textureOpacity: 0.12,
    surfaceOpacity: 0.1,
    roughness: 0.18,
    sheen: 0.08,
    sparkleDensity: 0,
    sparkleSize: Object.freeze([0, 0]),
    sparkleColors: Object.freeze([]),
    cellGap: 0.25,
    edgeSoftness: 0.18,
    edgeRadius: 0.42,
    shadowOpacity: 0.16,
    meltOverlap: 0.22,
    beadRound: 0.22,
    beadDome: 0.9,
    beadSpecular: 0.5,
    beadTint: 0,
    beadWobble: 0.5,
    beadSoftEdge: 0,
    seedSalt: 0x9e3779b9,
  }),
  Object.freeze({
    id: 'linen',
    labelKey: 'export.ironing.material.linen',
    hintKey: 'export.ironing.hint.linen',
    showcaseImage: '/ironing/linen.jpg',
    swatchColor: '#EDE8DA',
    fabricBase: '#EDE8DA',
    textureType: 'woven-crosshatch',
    textureScale: 9,
    textureOpacity: 0.16,
    surfaceOpacity: 0.5,
    roughness: 0.34,
    sheen: 0.05,
    sparkleDensity: 0,
    sparkleSize: Object.freeze([0, 0]),
    sparkleColors: Object.freeze([]),
    cellGap: 0.35,
    edgeSoftness: 0.22,
    edgeRadius: 0.48,
    shadowOpacity: 0.18,
    meltOverlap: 0.14,
    beadRound: 0.12,
    beadDome: 0.35,
    beadSpecular: 0,
    beadTint: 0.14,
    beadWobble: 0.9,
    beadSoftEdge: 0.25,
    seedSalt: 0x85ebca6b,
  }),
  Object.freeze({
    id: 'towel',
    labelKey: 'export.ironing.material.towel',
    hintKey: 'export.ironing.hint.towel',
    showcaseImage: '/ironing/towel.jpg',
    swatchColor: '#D8C9E8',
    fabricBase: '#D8C9E8',
    textureType: 'terry-loop',
    textureScale: 11,
    textureOpacity: 0.22,
    surfaceOpacity: 0.78,
    roughness: 0.72,
    sheen: 0.03,
    sparkleDensity: 0,
    sparkleSize: Object.freeze([0, 0]),
    sparkleColors: Object.freeze([]),
    cellGap: 0.2,
    edgeSoftness: 0.3,
    edgeRadius: 0.52,
    shadowOpacity: 0.2,
    meltOverlap: 0.16,
    beadRound: 0.18,
    beadDome: 0.15,
    beadSpecular: 0,
    beadTint: 0.3,
    beadWobble: 1.6,
    beadSoftEdge: 0.55,
    seedSalt: 0xc2b2ae35,
  }),
  Object.freeze({
    id: 'bath-mesh',
    labelKey: 'export.ironing.material.bathMesh',
    hintKey: 'export.ironing.hint.bathMesh',
    showcaseImage: '/ironing/bath-mesh.jpg',
    swatchColor: '#C7E2F0',
    fabricBase: '#C7E2F0',
    textureType: 'bath-mesh',
    textureScale: 10,
    textureOpacity: 0.2,
    surfaceOpacity: 0.62,
    roughness: 0.64,
    sheen: 0.05,
    sparkleDensity: 0,
    sparkleSize: Object.freeze([0, 0]),
    sparkleColors: Object.freeze([]),
    cellGap: 0.3,
    edgeSoftness: 0.28,
    edgeRadius: 0.55,
    shadowOpacity: 0.2,
    meltOverlap: 0.14,
    beadRound: 0.15,
    beadDome: 0.2,
    beadSpecular: 0,
    beadTint: 0.2,
    beadWobble: 1.2,
    beadSoftEdge: 0.4,
    seedSalt: 0x27d4eb2f,
  }),
  Object.freeze({
    id: 'fine-glitter',
    labelKey: 'export.ironing.material.fineGlitter',
    hintKey: 'export.ironing.hint.fineGlitter',
    showcaseImage: '/ironing/fine-glitter.jpg',
    swatchColor: '#063D78',
    fabricBase: '#063D78',
    textureType: 'fine-sparkle',
    textureScale: 5,
    textureOpacity: 0.12,
    surfaceOpacity: 0.9,
    roughness: 0.12,
    sheen: 0.42,
    sparkleDensity: 0.012,
    sparkleSize: Object.freeze([0.25, 1.0]),
    sparkleColors: Object.freeze(['#EAF4FF', '#BFD9F2', '#9FC3E8', '#FFFFFF']),
    cellGap: 0.15,
    edgeSoftness: 0.12,
    edgeRadius: 0.42,
    shadowOpacity: 0.18,
    meltOverlap: 0.08,
    beadRound: 0.1,
    beadDome: 0.3,
    beadSpecular: 0,
    beadTint: 0,
    beadWobble: 0.6,
    beadSoftEdge: 0.15,
    seedSalt: 0x165667b1,
  }),
  Object.freeze({
    id: 'coarse-glitter',
    labelKey: 'export.ironing.material.coarseGlitter',
    hintKey: 'export.ironing.hint.coarseGlitter',
    showcaseImage: '/ironing/coarse-glitter.jpg',
    swatchColor: '#EBCFE0',
    fabricBase: '#EBCFE0',
    textureType: 'coarse-sparkle',
    textureScale: 13,
    textureOpacity: 0.18,
    surfaceOpacity: 0.85,
    roughness: 0.2,
    sheen: 0.62,
    sparkleDensity: 0.0035,
    sparkleSize: Object.freeze([1.2, 3.6]),
    sparkleColors: Object.freeze(['#FFFFFF', '#FFE9F3', '#F6C6DF', '#E8B7D2']),
    cellGap: 0.1,
    edgeSoftness: 0.16,
    edgeRadius: 0.46,
    shadowOpacity: 0.2,
    meltOverlap: 0.1,
    beadRound: 0.1,
    beadDome: 0.3,
    beadSpecular: 0,
    beadTint: 0.14,
    beadWobble: 0.7,
    beadSoftEdge: 0.2,
    seedSalt: 0x2545f491,
  }),
])

/** 稳定的默认预设(未知 ID 的确定性回退) */
export const DEFAULT_IRONING_PRESET_ID = 'linen'

const PRESETS_BY_ID = new Map(IRONING_EFFECT_PRESETS.map((p) => [p.id, p]))

/**
 * 按 ID 取材质预设;未知 ID(含非法输入)确定性回退 linen。
 * 返回的是冻结对象,调用方无法改写共享常量。
 *
 * @param {string} id
 * @returns {object} 冻结的预设常量
 */
export function getIroningEffectPreset(id) {
  return PRESETS_BY_ID.get(id) || PRESETS_BY_ID.get(DEFAULT_IRONING_PRESET_ID)
}

/**
 * 预设参数合法性校验(纯函数;测试与未来调参 UI 共用同一口径)。
 *
 * @param {object} p - 预设对象
 * @returns {string[]} 违规项列表,空数组 = 合法
 */
export function validateIroningPreset(p) {
  const errors = []
  if (!p || typeof p !== 'object') return ['preset is not an object']
  if (!PRESETS_BY_ID.has(p.id)) errors.push(`unknown id: ${p.id}`)
  if (!IRONING_TEXTURE_TYPES.includes(p.textureType)) errors.push(`bad textureType: ${p.textureType}`)

  const unit01 = (name, v) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) errors.push(`${name} out of 0–1: ${v}`)
  }
  unit01('textureOpacity', p.textureOpacity)
  unit01('surfaceOpacity', p.surfaceOpacity)
  unit01('roughness', p.roughness)
  unit01('sheen', p.sheen)
  unit01('cellGap', p.cellGap)
  unit01('edgeSoftness', p.edgeSoftness)
  unit01('edgeRadius', p.edgeRadius)
  unit01('shadowOpacity', p.shadowOpacity)
  unit01('sparkleDensity', p.sparkleDensity)
  unit01('beadDome', p.beadDome)
  unit01('beadSpecular', p.beadSpecular)
  unit01('beadTint', p.beadTint)
  unit01('beadSoftEdge', p.beadSoftEdge)

  const ratio = (name, v, max) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) {
      errors.push(`${name} out of 0–${max}: ${v}`)
    }
  }
  ratio('meltOverlap', p.meltOverlap, 0.5)
  ratio('beadRound', p.beadRound, 0.5)

  const nonNegative = (name, v) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`${name} must be >= 0: ${v}`)
  }
  nonNegative('beadWobble', p.beadWobble)

  const positive = (name, v) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) errors.push(`${name} must be positive: ${v}`)
  }
  positive('textureScale', p.textureScale)

  const [min, max] = Array.isArray(p.sparkleSize) ? p.sparkleSize : [NaN, NaN]
  if (!(Number.isFinite(min) && Number.isFinite(max) && min >= 0 && min <= max)) {
    errors.push(`bad sparkleSize range: ${JSON.stringify(p.sparkleSize)}`)
  }
  // 非闪粉材质不应携带闪粉参数;闪粉材质必须有密度与色板
  const isSparkle = p.textureType === 'fine-sparkle' || p.textureType === 'coarse-sparkle'
  if (!isSparkle && (p.sparkleDensity > 0 || min > 0)) {
    errors.push('non-sparkle preset must keep sparkle params at 0')
  }
  if (isSparkle) {
    if (p.sparkleDensity <= 0) errors.push('sparkle preset needs positive sparkleDensity')
    if (!Array.isArray(p.sparkleColors) || p.sparkleColors.length === 0) {
      errors.push('sparkle preset needs sparkleColors')
    }
  }
  return errors
}
