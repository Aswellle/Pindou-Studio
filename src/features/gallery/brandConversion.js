/**
 * 模板品牌选择与图案转换(图库首页 / 主题页 / 合集页 / 详情页共用)。
 *
 * 语义:
 *   - 模板自带 paletteId 是「原始品牌」;用户在图库卡片上可以临时覆盖;
 *   - 覆盖只影响载入/导出/预览,不修改云端模板本身;
 *   - 覆盖品牌与原始品牌相同时等价于「跟随模板」。
 */

import { convertTemplateToBrand, templateDimensions } from '../../data/templates'

/** 生效品牌:用户覆盖 > 模板自带 > perler(缺省) */
export function resolveTemplateBrand(template, override) {
  if (override) return override
  return template?.paletteId || 'perler'
}

/** 是否处于用户覆盖状态(与原始品牌不同才显示「已转换」标记) */
export function isBrandOverridden(template, override) {
  return !!override && override !== (template?.paletteId || 'perler')
}

/** 载入/导出使用的图案:仅在覆盖且与原始品牌不同时做 CIEDE2000 重映射 */
export function convertedPattern(template, override) {
  if (!template) return []
  if (!isBrandOverridden(template, override)) return template.pattern
  return convertTemplateToBrand(template.pattern, override)
}

/**
 * 载入画布的参数(与 App.handleLoadTemplate 的契约一致):
 *   - 方形模板不传 gridWidth/gridHeight,保持旧调用形态;
 *   - 有品牌时附带 palette,让 App 同步切换色卡。
 */
export function templateLoadOptions(template, override) {
  const brand = resolveTemplateBrand(template, override)
  const { width, height } = templateDimensions(template)
  const options = {}
  if (brand) options.palette = brand
  if (width !== height) {
    options.gridWidth = width
    options.gridHeight = height
  }
  return { options, width, height }
}

/** 导出参数:始终显式给真实宽高,矩形模板不会被当正方形裁切 */
export function templateExportArgs(template, override) {
  const brand = resolveTemplateBrand(template, override)
  const { width, height } = templateDimensions(template)
  return {
    pattern: convertedPattern(template, override),
    size: Math.max(width, height),
    brand,
    width,
    height,
  }
}
