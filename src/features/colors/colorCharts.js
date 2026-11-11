/**
 * 品牌色卡对照页的数据与文案(纯函数)。
 *
 * 为什么单独成页面:拼豆玩家最常用的长尾词之一就是「<品牌> 色号对照表」——
 * 按图纸备料、找近似替代色都靠它。应用里这些数据已经存在(六大品牌色卡),
 * 但只藏在色板选择器里,既不可直接链接,也进不了搜索结果。
 *
 * 每页正文全部由本地色卡数据生成,不新增应用里没有的说法;
 * 品牌简介各自独立撰写,避免六个页面互相竞争同一段模板文案。
 */

import { PALETTE_LIST, PALETTES } from '../../data/palettes/index.js'

export const COLORS_PATH = '/colors'

/** 品牌色卡页路径 */
export function colorChartPath(id) {
  return `${COLORS_PATH}/${encodeURIComponent(String(id))}`
}

/** slug → 色卡;未知 slug 返回 null(由页面与 SEO 层按 404 处理) */
export function resolveColorBrand(id) {
  if (!id || typeof id !== 'string') return null
  return PALETTES[id] || null
}

/** 有色卡数据的品牌(顺序与色板选择器一致) */
export function colorBrands() {
  return PALETTE_LIST.map((palette) => ({
    palette,
    id: palette.id,
    colorCount: palette.colors.length,
    // 有 groupNames 的品牌按色系分组展示,其余平铺
    grouped: !!palette.groupNames,
  }))
}

/**
 * 把色卡按色系切成展示分组。
 *
 * 顺序优先用 palette.groupOrder(销售热度排序),未列出的色系按首次出现顺序
 * 追加在后面 —— 不能因为 order 少写了一个色系就把整组颜色吞掉。
 * 没有 groupNames 的品牌(Perler/Hama/Artkal)返回单个无标题分组。
 */
export function colorGroups(palette) {
  const colors = Array.isArray(palette?.colors) ? palette.colors : []
  if (!palette?.groupNames) return [{ key: null, colors }]

  const present = [...new Set(colors.map((c) => c?.category).filter(Boolean))]
  const order = Array.isArray(palette.groupOrder) ? palette.groupOrder : []
  const keys = [
    ...order.filter((key) => present.includes(key)),
    ...present.filter((key) => !order.includes(key)),
  ]
  return keys.map((key) => ({
    key,
    colors: colors.filter((c) => c.category === key),
  }))
}

/** 色系的展示名:后台配色表里的中文名;没有就退回字母本身 */
export function groupLabel(palette, key) {
  if (!key) return ''
  return palette?.groupNames?.[key] || key
}

/** 每个品牌一段独立简介(中文,用于页面正文与静态快照) */
export const BRAND_INTROS = {
  coco:
    'COCO 拼豆色卡共 291 色,分 18 个字母色系,豆径 2.6mm 的小颗粒。色号形如 A01、B12,名称与色号一致;下面按色系列出色值与 RGB,方便按图纸备料或寻找近似替代色。',
  mard:
    'MARD 拼豆标准色卡共 221 色,分黄橙、绿、蓝青、紫蓝、粉红、红、橙棕、黑白灰与莫兰迪 9 个色系,豆径 5mm。色号由字母加数字组成,下面按色系列出全部色号与色值。',
  mard291:
    'MARD 291 是 MARD 的完整色卡:在 221 色标准系列之外补充柔和过渡、亮色点缀等扩展色系,共 291 色,豆径 5mm。需要更细的过渡色时,可以先在这里找色号。',
  perler:
    'Perler 拼豆来自美国,标准固体色板共 80 色,豆径 5mm,色号 P01–P80,每个颜色都带英文名与中文译名。下面按色号列出全部颜色、名称与色值,方便按图纸备料。',
  hama:
    'Hama 来自丹麦,标准色板共 56 色,豆径 5mm,色号 H01–H56,颜色带英文名与中文译名。下面的对照表按色号排列,适合新手备料与寻找近似色。',
  artkal:
    'Artkal 色卡共 100 色,豆径 2.6mm 的细颗粒,色号 C01–C100,颜色带英文名与中文译名。细颗粒适合细节较多的图纸,下面按色号列出全部色值。',
}

/** 网站总览页的 meta(与运行时 Helmet 共用同一份文案) */
export const COLOR_CHARTS_SEO = {
  title: '拼豆色卡对照表 - 六大品牌色号与色值查询 | 拼豆Studio',
  desc: 'COCO、MARD、MARD 291、Perler、Hama、Artkal 六大拼豆品牌色卡对照:全部色号、颜色名称、HEX/RGB 色值与豆径,方便按图纸备料、找替代色。',
}

/**
 * 单个品牌的 meta。
 * 不写死标题:色号数量从数据派生,色卡增删后标题会自动跟上。
 */
export function brandSeo(palette) {
  if (!palette) return COLOR_CHARTS_SEO
  const count = palette.colors.length
  const brand = palette.nameZh || palette.name
  return {
    title: `${brand}色卡对照表 - ${count} 色色号与色值 | 拼豆Studio`,
    desc:
      `${brand} ${count} 色完整色卡:全部色号、颜色名称、HEX/RGB 色值与豆径对照,` +
      `方便按图纸备料、寻找近似替代色,或直接在拼豆Studio 里用这份色卡生成图纸。`,
  }
}
