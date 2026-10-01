/**
 * brandMark — 品牌标识数据(拼豆Studio 站点左上角 Logo)
 *
 * 图案与 Header.jsx 的 logo SVG 完全一致:4×4 彩色拼豆方块
 * (红黄绿蓝 / 粉紫青橙 / 白灰黑棕 / 四阶棕),导出图纸署名处
 * 用它 + "拼豆Studio" 字标替代纯文字署名,强化品牌识别。
 * RasterRenderer(canvas fillRect)与 VectorRenderer(SVG rect)共用同一份数据。
 */

// 4×4 色块(与 Header logo 同色序);白色块在浅底上需要 #E0E0E0 描边
export const BRAND_MARK_CELLS = [
  ['#E53935', '#FDD835', '#32CD32', '#1976D2'],
  ['#F06292', '#BA68C8', '#00BCD4', '#FF9800'],
  ['#FFFFFF', '#9E9E9E', '#000000', '#795548'],
  ['#8D6E63', '#A1887F', '#BDBDBD', '#6D4C41'],
]

// 白色块描边色(Header logo 同款)
export const BRAND_MARK_WHITE_STROKE = '#E0E0E0'

// 图纸署名处的 Logo 单元尺寸(逻辑 px,4×4 → 32×32,与 Header 32px 同大小)
export const BRAND_MARK_CELL = 8

export const BRAND_WORDMARK = '拼豆Studio'
