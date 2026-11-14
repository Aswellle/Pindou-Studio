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
    introEn: "Animals like cats, dogs, rabbits, and pandas are the easiest to make recognizable. Block out the silhouette with large color areas first, then add eyes and markings with a few dark beads — even a 29×29 grid reads instantly.",
    introJa: "猫・犬・うさぎ・パンダなどの動物はシルエットが分かりやすい題材。大きな色面で形を取った後、濃色数個で目や模様を足せば、29×29 でも一見で分かります。",
    introKo: "고양이, 강아지, 토끼, 판다 같은 동물은 실루엣이 알아보기 쉬운 소재입니다. 큰 색 면으로 형태를 잡은 뒤 짙은 색 몇 개로 눈과 무늬를 더하면 29×29에서도 바로 알아볼 수 있습니다.",
  },
  {
    raw: 'food', slug: 'food', label: '食物',
    intro: '甜甜圈、蛋糕、水果、寿司等食物造型圆润、色块集中,是拼豆入门最友好的题材。做小尺寸时保留主色、去掉阴影色,成品反而更干净。',
    introEn: "Donuts, cakes, fruit, and sushi have rounded shapes and concentrated color blocks — the friendliest theme for beginners. On small sizes keep the main color and drop the shadow color for a cleaner result.",
    introJa: "ドーナツ・ケーキ・フルーツ・寿司などは丸みのある形とまとまった色面で、ビーズ初心者に最もやさしい題材。小サイズでは主色を残し影色を省くと、仕上がりがよりきれいになります。",
    introKo: "도넛, 케이크, 과일, 스시 같은 음식은 둥근 형태와 집중된 색 면 덕분에 비즈 입문에 가장 친화적인 소재입니다. 작은 크기에서는 주색을 남기고 그림자 색을 빼면 결과가 더 깔끔해집니다.",
  },
  {
    raw: 'icon', slug: 'icon', label: '图标',
    intro: '爱心、星星、箭头、音符这类图标用色少、图案简单,适合做钥匙扣与手机挂件。同一款图标换一组品牌色,就能批量做出整套小物。',
    introEn: "Hearts, stars, arrows, and music notes use few colors and simple shapes — perfect for keychains and phone charms. Swap the palette on the same icon to batch out a whole matching set.",
    introJa: "ハート・星・矢印・音符などのアイコンは色数が少なく構成がシンプル。キーホルダーやスマホチャームに最適で、配色を変えるだけでシリーズ展開できます。",
    introKo: "하트, 별, 화살표, 음표 같은 아이콘은 색이 적고 도형이 단순해 키링과 폰 채움에 적합합니다. 같은 아이콘의 색만 바꾸면 시리즈로 만들 수 있습니다.",
  },
  {
    raw: 'holiday', slug: 'holiday', label: '节日',
    intro: '圣诞、万圣节、春节、情人节的节日图案建议提前备料。先按色号统计用量再决定做多大尺寸,能避免节日当天缺色。',
    introEn: "Christmas, Halloween, Lunar New Year, and Valentine patterns are worth stocking up for. Count beads by color code before choosing a size so you do not run out on the day.",
    introJa: "クリスマス・ハロウィン・旧正月・バレンタインの図案は早めの材料準備を。色番号別に必要数を数えてからサイズを決めると、当日困りません。",
    introKo: "크리스마스, 핼러윈, 설, 밸런타인 도안은 미리 재료를 준비하는 것이 좋습니다. 색상 코드별 수량을 세고 나서 크기를 정하면 당일에 색이 떨어지는 일을 막을 수 있습니다.",
  },
  {
    raw: '卡通', slug: 'cartoon', label: '卡通',
    intro: '卡通角色的辨识度来自轮廓与配色。建议先用较少颜色还原主形象,细节留到 57×57 以上尺寸再补,小图塞太多颜色反而糊成一团。',
    introEn: "A character reads through its silhouette and palette. Start with fewer colors to capture the main figure, and save fine detail for 57×57 and up — too many colors on a small grid turns muddy.",
    introJa: "キャラクターの識別ポイントはシルエットと配色。まず少ない色で主形象を押さえ、細部は 57×57 以上のサイズで足すのが基本。小さい図に色を詰め込みすぎるとにじみます。",
    introKo: "캐릭터의 식별 포인트는 실루엣과 배색입니다. 적은 색으로 주요 형상을 먼저 잡고, 세부는 57×57 이상에서 더하세요. 작은 도안에 색을 너무 많이 넣으면 뭉개집니다.",
  },
  {
    raw: '人物形象', slug: 'person', label: '人物形象',
    intro: '人物头像重点在肤色与发色的层次。先把脸部大面积定成主肤色,再用两三个过渡色处理阴影,脸才不会显脏。',
    introEn: "Portraits live or die on skin-tone and hair layering. Fill the face with the main skin tone first, then shape shadows with two or three transition colors — otherwise faces look dirty.",
    introJa: "人物の顔は肌色と髪色の階調が生命線。まず顔の大部分を主肌色で埋め、2〜3 の中間色で陰影を作ると顔が濁りません。",
    introKo: "인물은 피부색과 머리색의 층위가 핵심입니다. 얼굴 대부분을 주 피부색으로 채운 뒤 두세 개의 중간색으로 그림자를 표현해야 얼굴이 탁해지지 않습니다.",
  },
  {
    raw: '庆祝', slug: 'celebration', label: '庆祝',
    intro: '生日、毕业、婚礼的庆祝图案常配文字与气球。做大尺寸条幅或摆件时注意留出拼接缝,熨烫后更容易对齐、也更平整。',
    introEn: "Birthday, graduation, and wedding pieces often pair letters with balloons. For large banners or standees, leave room for panel seams — fused panels align better and stay flatter.",
    introJa: "誕生日・卒業・結婚のお祝い図案は文字と風船の組み合わせが定番。大型バナーやスタンドでは継ぎ目の余地を残すと、アイロン後の揃いと平面性が上がります。",
    introKo: "생일, 졸업, 결혼 축하 도안에는 글자와 풍선이 자주 어울립니다. 큰 배너나 스탠드는 이음매 여유를 남겨두면 다림질 후 정렬이 쉽고 더 평평해집니다.",
  },
  {
    raw: '表情包', slug: 'emoji', label: '表情包',
    intro: '表情包图案小、对比强,最适合做磁贴与冰箱贴。黄色系表情用同一主色加一层暗黄,就能做出立体感。',
    introEn: "Emoji patterns are small and high-contrast — ideal for magnets and fridge stickers. For yellow faces, layer one darker yellow over the main color to get depth.",
    introJa: "絵文字図案は小さくコントラストが強く、マグネットや冷蔵庫シールに最適。黄色系は主色の上に暗い黄を一枚重ねるだけで立体感が出ます。",
    introKo: "이모티콘 도안은 작고 명암 대비가 강해 자석과 냉장고 스티커에 가장 적합합니다. 노란색 계열은 주색 위에 어두운 노랑을 한 겹 얹으면 입체감이 생깁니다.",
  },
  {
    raw: '植物-花', slug: 'plant', label: '植物-花',
    intro: '花叶题材的颜色过渡比动物细腻,建议用 5 种以上同色系豆子做渐变。先做一朵小花试色,确认效果后再放大到整束。',
    introEn: "Flowers and leaves demand finer gradients than animals — use five or more beads from the same color family. Fuse one small flower first to test the blend before scaling up to the whole bouquet.",
    introJa: "花・葉は動物より色のグラデーションが細かい題材。同系色 5 色以上を使い分け、まず小さな花 1 輪で試してから全体へ拡大するのがおすすめ。",
    introKo: "꽃과 잎사귀는 동물보다 색 그라데이션이 섬세한 소재입니다. 같은 색 계열 5가지 이상을 쓰고, 작은 꽃 한 송이로 먼저 시험한 뒤 전체로 확대하세요.",
  },
  {
    raw: '电子设备', slug: 'device', label: '电子设备',
    intro: '手机、游戏机、相机等设备图案线条硬朗,用 1–2 格宽的深色描边就能保住轮廓;填充色尽量选纯色,避免出现噪点。',
    introEn: "Phones, consoles, and cameras have hard, straight edges — a 1–2 cell dark outline keeps the silhouette crisp, and solid fill colors avoid noise.",
    introJa: "スマホ・ゲーム機・カメラなどのデバイスは直線的な輪郭。1〜2 マス幅の濃色アウトラインで輪郭を守り、塗りは無彩色に近い単色を選ぶとノイズが出ません。",
    introKo: "휴대폰, 게임기, 카메라 같은 기기 도안은 직선적인 외곽선이 특징입니다. 1–2칸 폭의 짙은 외곽선으로 실루엣을 지키고, 채움색은 단색으로 골라 노이즈를 피하세요.",
  },
  {
    raw: '衣物', slug: 'clothing', label: '衣物',
    intro: '衣服、鞋子、帽子适合做挂件与贴布。双面熨烫时先把细节面烫平,再压反面,能减少边缘卷边。',
    introEn: "Clothes, shoes, and hats work well as charms and patches. For double-sided fusing, flatten the detail side first, then the back — it keeps edges from curling.",
    introJa: "服・靴・帽子はチャームやワッペン向き。両面アイロンでは細部面を先に平らに仕上げてから裏面を押さえると、縁の反りを抑えられます。",
    introKo: "옷, 신발, 모자는 참장식과 와펜으로 적합합니다. 양면 다림질 때 디테일 면을 먼저 평평하게 한 뒤 뒷면을 누르면 가장자리 말림이 줄어듭니다.",
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

/** 按语言取分类简介:categoryIntro(meta, lang);zh 之外取 introEn/introJa/introKo,缺省回退中文 */
export function categoryIntro(meta, lang) {
  if (!meta) return ''
  const base = typeof lang === 'string' ? lang.split('-')[0] : ''
  if (base === 'en') return meta.introEn || meta.intro
  if (base === 'ja') return meta.introJa || meta.intro
  if (base === 'ko') return meta.introKo || meta.intro
  return meta.intro
}