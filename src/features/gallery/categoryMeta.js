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
  {
    raw: 'animal', slug: 'animal', label: '动物',
    intro: '猫咪、小狗、兔子、熊猫这类动物轮廓最容易做出辨识度。先用大色块定外形,再用少量深色点出眼睛与花纹,29×29 的网格也能一眼认出是什么动物。',
  },
  {
    raw: 'food', slug: 'food', label: '食物',
    intro: '甜甜圈、蛋糕、水果、寿司等食物造型圆润、色块集中,是拼豆入门最友好的题材。做小尺寸时保留主色、去掉阴影色,成品反而更干净。',
  },
  {
    raw: 'icon', slug: 'icon', label: '图标',
    intro: '爱心、星星、箭头、音符这类图标用色少、图案简单,适合做钥匙扣与手机挂件。同一款图标换一组品牌色,就能批量做出整套小物。',
  },
  {
    raw: 'holiday', slug: 'holiday', label: '节日',
    intro: '圣诞、万圣节、春节、情人节的节日图案建议提前备料。先按色号统计用量再决定做多大尺寸,能避免节日当天缺色。',
  },
  {
    raw: '卡通', slug: 'cartoon', label: '卡通',
    intro: '卡通角色的辨识度来自轮廓与配色。建议先用较少颜色还原主形象,细节留到 57×57 以上尺寸再补,小图塞太多颜色反而糊成一团。',
  },
  {
    raw: '人物形象', slug: 'person', label: '人物形象',
    intro: '人物头像重点在肤色与发色的层次。先把脸部大面积定成主肤色,再用两三个过渡色处理阴影,脸才不会显脏。',
  },
  {
    raw: '庆祝', slug: 'celebration', label: '庆祝',
    intro: '生日、毕业、婚礼的庆祝图案常配文字与气球。做大尺寸条幅或摆件时注意留出拼接缝,熨烫后更容易对齐、也更平整。',
  },
  {
    raw: '表情包', slug: 'emoji', label: '表情包',
    intro: '表情包图案小、对比强,最适合做磁贴与冰箱贴。黄色系表情用同一主色加一层暗黄,就能做出立体感。',
  },
  {
    raw: '植物-花', slug: 'plant', label: '植物-花',
    intro: '花叶题材的颜色过渡比动物细腻,建议用 5 种以上同色系豆子做渐变。先做一朵小花试色,确认效果后再放大到整束。',
  },
  {
    raw: '电子设备', slug: 'device', label: '电子设备',
    intro: '手机、游戏机、相机等设备图案线条硬朗,用 1–2 格宽的深色描边就能保住轮廓;填充色尽量选纯色,避免出现噪点。',
  },
  {
    raw: '衣物', slug: 'clothing', label: '衣物',
    intro: '衣服、鞋子、帽子适合做挂件与贴布。双面熨烫时先把细节面烫平,再压反面,能减少边缘卷边。',
  },
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
  // 描述由「分类名 + 该分类专属简介」组成:11 个分类此前共用同一句模板文案,
  // 只换了开头的名词,在搜索结果里几乎无法区分,等于自己和自己竞争。
  // 简介缺失时(未来新增分类忘了写)回退到通用说明,不让页面失去描述。
  const desc = meta.intro
    ? `${meta.label}拼豆图纸模板。${meta.intro}`
    : `${meta.label}主题免费拼豆图纸模板:打开即可查看网格尺寸与品牌色号,一键载入画布制作,支持 COCO/MARD/Perler 等色卡与 PNG/SVG 图纸导出。`
  return {
    title: `${meta.label}拼豆图纸模板 - 拼豆Studio`,
    desc,
  }
}
