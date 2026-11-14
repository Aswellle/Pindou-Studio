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
  return PALETTE_LIST.map(palette => ({
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

  const present = [...new Set(colors.map(c => c?.category).filter(Boolean))]
  const order = Array.isArray(palette.groupOrder) ? palette.groupOrder : []
  const keys = [...order.filter(key => present.includes(key)), ...present.filter(key => !order.includes(key))]
  return keys.map(key => ({
    key,
    colors: colors.filter(c => c.category === key),
  }))
}

/** 色系的展示名:后台配色表里的中文名;没有就退回字母本身 */
export function groupLabel(palette, key) {
  if (!key) return ''
  return palette?.groupNames?.[key] || key
}

/**
 * 每个品牌一段独立简介:BRAND_INTROS 是中文(构建期快照始终中文),
 * EN/JA/KO 供界面按语言取 brandIntro(id, lang)。
 */
export const BRAND_INTROS = {
  coco: 'COCO 拼豆色卡共 291 色,分 18 个字母色系,豆径 2.6mm 的小颗粒。色号形如 A01、B12,名称与色号一致;下面按色系列出色值与 RGB,方便按图纸备料或寻找近似替代色。',
  mard: 'MARD 拼豆标准色卡共 221 色,分黄橙、绿、蓝青、紫蓝、粉红、红、橙棕、黑白灰与莫兰迪 9 个色系,豆径 5mm。色号由字母加数字组成,下面按色系列出全部色号与色值。',
  mard291:
    'MARD 291 是 MARD 的完整色卡:在 221 色标准系列之外补充柔和过渡、亮色点缀等扩展色系,共 291 色,豆径 5mm。需要更细的过渡色时,可以先在这里找色号。',
  perler:
    'Perler 拼豆来自美国,标准固体色板共 80 色,豆径 5mm,色号 P01–P80,每个颜色都带英文名与中文译名。下面按色号列出全部颜色、名称与色值,方便按图纸备料。',
  hama: 'Hama 来自丹麦,标准色板共 56 色,豆径 5mm,色号 H01–H56,颜色带英文名与中文译名。下面的对照表按色号排列,适合新手备料与寻找近似色。',
  artkal:
    'Artkal 色卡共 100 色,豆径 2.6mm 的细颗粒,色号 C01–C100,颜色带英文名与中文译名。细颗粒适合细节较多的图纸,下面按色号列出全部色值。',
}

export const BRAND_INTROS_EN = {
  coco: 'The COCO fuse bead palette has 291 colors across 18 letter families, 2.6mm mini beads. Codes look like A01, B12 and double as names. Below, each family lists hex and RGB values for kit planning and finding near-match substitutes.',
  mard: 'The standard MARD palette has 221 colors in 9 families (yellow-orange, green, blue-cyan, purple-blue, pink, red, orange-brown, black-white-gray, and Morandi), 5mm beads. Codes are letter+number; every family is listed below with codes and values.',
  mard291:
    'MARD 291 is the complete MARD palette: the 221 standard colors plus extended soft-transition and bright-accent families, 291 colors at 5mm. Find finer transition codes here first.',
  perler:
    'Perler comes from the US. The standard solid palette has 80 colors at 5mm, codes P01–P80, each with an official English name. Below, every color is listed by code with name and value — handy for kit planning.',
  hama: 'Hama is from Denmark. The standard palette has 56 colors at 5mm, codes H01–H56, each with an official name. The chart below is ordered by code — good for beginners stocking up or matching near colors.',
  artkal:
    'The Artkal palette has 100 colors of 2.6mm mini beads, codes C01–C100, each with an official name. Mini beads suit detail-heavy patterns; all values are listed below.',
}

export const BRAND_INTROS_JA = {
  coco: 'COCO ビーズのパレットは 18 のアルファベット系に分かれた 291 色、2.6mm の小粒。コードは A01・B12 の形で、名前を兼ねます。系ごとに HEX と RGB を並べ、材料調達や近似色探しにどうぞ。',
  mard: 'MARD スタンダードパレットは 9 系(黄橙・緑・青シアン・紫藍・ピンク・赤・橙茶・黒白灰・モランディ)221 色、5mm。コードは英字+数字。全系のコードと色値を下に並べています。',
  mard291:
    'MARD 291 は MARD の完全パレット:221 色のスタンダードに加え、柔らかい中間色やアクセントの拡張系を足した 291 色・5mm。より細かい中間色はまずここで探せます。',
  perler:
    'Perler はアメリカ発。スタンダードのソリッドパレットは 80 色・5mm、コードは P01–P80、各色に公式の英語名が付きます。色番号順に全色の名前と色値を紹介します。',
  hama: 'Hama はデンマーク発。スタンダードパレットは 56 色・5mm、コードは H01–H56、各色に公式名が付きます。コード順の対照表は、初心者の材料集めや近似色探しに最適です。',
  artkal:
    'Artkal のパレットは 2.6mm の細粒 100 色、コードは C01–C100、各色に公式名が付きます。細粒はディテールの多い図案に向き、全色の色値を下に並べています。',
}

export const BRAND_INTROS_KO = {
  coco: 'COCO 퓨즈 비즈 팔레트는 18개의 알파벳 계열로 나뉜 291색, 2.6mm 소구경입니다. 코드는 A01, B12 형태이며 이름을 겸합니다. 아래에서 계열별 HEX와 RGB 값을 확인해 재료 준비와 근사색 대체에 활용하세요.',
  mard: 'MARD 스탠다드 팔레트는 황주황, 초록, 청록, 보라, 분홍, 빨강, 주황갈색, 흑백회, 모랑디 9개 계열의 221색, 5mm입니다. 코드는 알파벳+숫자이며 아래에 계열별 코드와 색값을 모두 나열했습니다.',
  mard291:
    'MARD 291은 MARD의 완전한 팔레트입니다: 221색 스탠다드에 부드러운 중간색과 포인트 확장 계열을 더한 291색, 5mm. 더 세밀한 중간색은 먼저 여기서 찾아보세요.',
  perler:
    'Perler는 미국 브랜드로, 스탠다드 솔리드 팔레트는 80색, 5mm, 코드 P01–P80이며 각 색에 공식 영어 이름이 붙습니다. 아래에서 코드순으로 모든 색의 이름과 색값을 확인할 수 있습니다.',
  hama: 'Hama는 덴마크 브랜드로, 스탠다드 팔레트는 56색, 5mm, 코드 H01–H56이며 각 색에 공식 이름이 있습니다. 코드순 대조표는 초보자의 재료 준비와 근사색 찾기에 적합합니다.',
  artkal:
    'Artkal 팔레트는 2.6mm 소구경 100색, 코드 C01–C100이며 각 색에 공식 이름이 있습니다. 소구경은 디테일이 많은 도안에 적합하며 아래에 전체 색값을 나열했습니다.',
}

/** 按语言取品牌简介(界面用);未知语言回退中文 */
export function brandIntro(id, lang) {
  const base = typeof lang === 'string' ? lang.split('-')[0] : ''
  const sets = { en: BRAND_INTROS_EN, ja: BRAND_INTROS_JA, ko: BRAND_INTROS_KO }
  if (sets[base]) return sets[base][id] || BRAND_INTROS[id]
  return BRAND_INTROS[id]
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
