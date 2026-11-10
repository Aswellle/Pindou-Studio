/**
 * 图库分类聚合页的分类元数据。
 *
 * 为什么需要单独一份映射:
 *   templates.category 是内容表里的原始值,既有内置的 ASCII id(animal/food/…),
 *   也有后台上传模板时填的中文分类(卡通、植物-花…)。URL 不能直接拿原始值拼:
 *   同一分类在 sitemap、预渲染快照、canonical 与站内链接里必须始终是同一个
 *   稳定 slug,否则搜索引擎会把同一个分类当成多个页面。
 *
 * label 是中文默认名,只在 i18n 缺少对应 key 时兜底;界面显示统一走
 * `t('gallery.categories.<raw>', label)`,与图库页的 getCategoryLabel 同口径。
 */
export const GALLERY_CATEGORY_META = Object.freeze([
  { raw: 'animal', slug: 'animal', label: '动物' },
  { raw: 'food', slug: 'food', label: '食物' },
  { raw: 'icon', slug: 'icon', label: '图标' },
  { raw: 'holiday', slug: 'holiday', label: '节日' },
  { raw: '卡通', slug: 'cartoon', label: '卡通' },
  { raw: '人物形象', slug: 'person', label: '人物形象' },
  { raw: '庆祝', slug: 'celebration', label: '庆祝' },
  { raw: '表情包', slug: 'emoji', label: '表情包' },
  { raw: '植物-花', slug: 'plant', label: '植物-花' },
  { raw: '电子设备', slug: 'device', label: '电子设备' },
  { raw: '衣物', slug: 'clothing', label: '衣物' },
])

/** 分类聚合页路径。slug 只含 ASCII,仍统一编码,避免调用方各拼一套。 */
export function categoryPagePath(slug) {
  return `/gallery/category/${encodeURIComponent(slug)}`
}

/** @param {string} slug - URL 中的分类 slug */
export function resolveCategoryBySlug(slug) {
  if (typeof slug !== 'string' || !slug) return null
  return GALLERY_CATEGORY_META.find((item) => item.slug === slug) || null
}

/** @param {string} raw - 模板行里的 category 原始值 */
export function resolveCategoryByRaw(raw) {
  if (typeof raw !== 'string' || !raw) return null
  return GALLERY_CATEGORY_META.find((item) => item.raw === raw) || null
}

/**
 * 分类的显示名:后台上传的分类名称(label)优先,其次用代码里的默认名。
 *
 * 为什么需要它:
 *   分类聚合页的 slug / raw 是代码里的稳定映射,但「显示成什么」由后台
 *   categories 表的 label 决定。图库侧栏一直是这样取名的(GalleryPage),
 *   分类页与预渲染快照如果只用代码默认名,后台改名后同一分类会在图库与
 *   分类页显示两个名字。这里把口径收敛到一处。
 *
 * 注意:label 只影响展示,不参与 URL;分类 ID 才是聚合页的锚点。
 *
 * @param {{raw:string,label:string}|null} meta
 * @param {Array<{id:string,label:string}>} [customCategories] - 后台分类行
 */
export function categoryLabelFor(meta, customCategories = []) {
  if (!meta) return ''
  const custom = (customCategories || []).find(
    (item) => item?.id === meta.raw && String(item.label || '').trim()
  )
  return String(custom?.label || meta.label || '').trim()
}

/**
 * 分类页的 SEO 文案。
 *
 * App 首帧 Helmet 与构建期快照必须给出一模一样的 title/description:
 * 两边不一致时,抓取端与执行 JS 的浏览器会看到两份不同的 meta,先到先得。
 * 因此文案只在这里定义一次。
 */
export function categorySeo(meta) {
  if (!meta) return null
  return {
    title: `${meta.label}拼豆图纸模板 - 拼豆Studio`,
    desc: `${meta.label}主题免费拼豆图纸模板：打开即可查看网格尺寸与品牌色号，一键载入画布制作，支持 COCO/MARD/Perler 等色卡与 PNG/SVG 图纸导出。`,
  }
}
