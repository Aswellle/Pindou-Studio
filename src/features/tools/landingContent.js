/**
 * 两个落地页(/bead-patterns、/pixel-art)的正文块(四语言)。
 *
 * 页面与构建期静态正文共用同一份数据:React 端按当前语言取
 * patternTips(lang) 等,构建期快照用 zh 具名导出(始终中文)——
 * 同一段话不会在两边写两遍,抓取端与浏览器不会分叉。
 * 两页仍按单语页声明 hreflang(canonical 裸路径,SEO 层只出中文静态 HTML)。
 */

/** 语言键归一:'en'→'en-US' 等;未知语言回退 zh-CN */
function langKey(lang) {
  if (typeof lang === 'string' && !lang.includes('-')) {
    const hit = Object.keys(PATTERN_TIPS_I18N).find(k => k.split('-')[0] === lang)
    if (hit) return hit
  }
  return typeof lang === 'string' && PATTERN_TIPS_I18N[lang] ? lang : 'zh-CN'
}

/** 拼豆图案页:挑图思路(四语言) */
export const PATTERN_TIPS_I18N = {
  'zh-CN': [
    [
      '看尺寸',
      '29×29 适合杯垫、钥匙扣与新手练习;57×57 起需要按底板分区,170×170 属于拼多块板的大图。尺寸越大,用豆量与制作时间增长得越快。',
    ],
    [
      '看用色数',
      '颜色越少越好备料。新手建议从 8–12 色内开始,颜色多、过渡细的图案更适合已经有一整套色卡之后再尝试。',
    ],
    [
      '看空置比例',
      '外轮廓不规则的图案(花朵、字母、动物剪影)空置多,实际用豆量明显低于满格;备料前可以先用豆子数量计算器估算。',
    ],
  ],
  'en-US': [
    [
      'Check the size',
      '29×29 suits coasters, keychains, and a first practice; from 57×57 up you work board by board, and 170×170 is a multi-board project. Bigger grids grow bead counts and time fast.',
    ],
    [
      'Check the color count',
      'Fewer colors means easier shopping. Beginners should start within 8–12 colors; color-heavy, finely shaded patterns are better once you own a full palette.',
    ],
    [
      'Check the empty ratio',
      'Patterns with irregular outlines (flowers, letters, animal silhouettes) leave many cells empty, so real usage is well below a full grid; estimate with the bead calculator before shopping.',
    ],
  ],
  'ja-JP': [
    [
      'サイズを確認',
      '29×29 はコースター・キーホルダー・初回練習に。57×57 からはボードを区切って作り、170×170 は複数ボードの大作。大きいほどビーズ数も時間も急増します。',
    ],
    [
      '色数を確認',
      '色が少ないほど材料集めが楽。初心者は 8〜12 色から。色数が多くグラデーションが細かい図案は、パレットを揃えてからがおすすめ。',
    ],
    [
      '空きマス率を確認',
      '輪郭が不規則な図案(花・文字・動物シルエット)は空きマスが多く、実際の使用数は満格よりかなり少ない。事前にビーズ計算ツールで概算を。',
    ],
  ],
  'ko-KR': [
    [
      '크기 확인',
      '29×29는 컵받침, 키링, 첫 연습에 적합합니다. 57×57부터는 보드를 나눠 만들고 170×170은 여러 보드를 잇는 대작. 클수록 비즈 수와 시간이 빠르게 늘어납니다.',
    ],
    [
      '색 수 확인',
      '색이 적을수록 재료 준비가 쉽습니다. 초보자는 8–12가지부터. 색이 많고 농담이 세밀한 도안은 팔레트를 갖춘 뒤에 도전하는 편이 좋습니다.',
    ],
    [
      '빈 칸 비율 확인',
      '외곽이 불규칙한 도안(꽃, 글자, 동물 실루엣)은 빈 칸이 많아 실제 사용량이 만 칸보다 훨씬 적습니다. 구매 전 비즈 계산기로 먼저 계산하세요.',
    ],
  ],
}

/** 按语言取挑图思路(界面用) */
export function patternTips(lang) {
  return PATTERN_TIPS_I18N[langKey(lang)]
}

/** zh 具名导出:仅供构建期静态正文(始终中文) */
export const PATTERN_TIPS = PATTERN_TIPS_I18N['zh-CN']

/** 图案页相关教程(按阅读顺序;标题随语言取教程数据) */
export const PATTERN_ARTICLE_IDS = [
  'first-project',
  'color-principles',
  'image-to-pattern',
  'large-grid-joining',
]

/** 拼豆图案页:三种获取方式(四语言;href 不翻译) */
export const PATTERN_WAYS_I18N = {
  'zh-CN': [
    [
      '从模板库挑一张',
      '图库按题材与难度筛选现成图案,选中即可载入画布,也可以把颜色重映射到手上的品牌色卡。',
      '/gallery',
      '浏览拼豆图纸模板库',
    ],
    [
      '把自己的照片转成图案',
      '上传图片,工具会按网格量化并匹配品牌色号,适合头像、宠物与照片。',
      '/create/image',
      '图片转拼豆图纸工具',
    ],
    [
      '从空白网格自己画',
      '画笔、填充、选区、镜像都齐备,网格尺寸可自定义,适合改图或原创。',
      '/',
      '打开拼豆画布工具',
    ],
  ],
  'en-US': [
    [
      'Pick one from the template library',
      'The gallery filters ready-made patterns by theme and difficulty — load one onto the canvas, or remap its colors to the brand palette you own.',
      '/gallery',
      'Browse the pattern library',
    ],
    [
      'Convert your own photo',
      'Upload an image and the tool quantizes it to the grid and matches brand color codes — great for portraits, pets, and photos.',
      '/create/image',
      'Photo-to-pattern tool',
    ],
    [
      'Draw from a blank grid',
      'Pencil, fill, selections, and mirroring are all built in, with custom grid sizes — ideal for edits and original work.',
      '/',
      'Open the bead canvas',
    ],
  ],
  'ja-JP': [
    [
      'テンプレートから選ぶ',
      'ギャラリーはテーマと難易度で既成図案を絞り込み、選んですぐキャンバスに読み込めます。手持ちのブランドパレットへ色の再マッピングも可能。',
      '/gallery',
      '図案ライブラリを見る',
    ],
    [
      '自分の写真を図案に変換',
      '画像をアップロードするとグリッドに量子化してブランド色番号をマッピング。アバター・ペット・写真に向きます。',
      '/create/image',
      '写真から図案変換ツール',
    ],
    [
      '白紙グリッドから描く',
      'ペン・塗りつぶし・選択範囲・ミラーを完備し、グリッドサイズも自由。改図やオリジナル制作に。',
      '/',
      'ビーズキャンバスを開く',
    ],
  ],
  'ko-KR': [
    [
      '템플릿에서 고르기',
      '갤러리가 테마와 난이도로 기성 도안을 걸러주고, 골라 바로 캔버스에 불러오거나 내 브랜드 팔레트로 색을 재매핑할 수 있습니다.',
      '/gallery',
      '도안 라이브러리 보기',
    ],
    [
      '내 사진을 도안으로 변환',
      '이미지를 올리면 그리드 단위로 양자화하고 브랜드 색상 코드를 매칭합니다. 아바타, 반려동물, 사진에 적합.',
      '/create/image',
      '사진 도안 변환 도구',
    ],
    [
      '빈 그리드에서 그리기',
      '펜, 채우기, 선택 영역, 미러까지 갖춰져 있고 그리드 크기도 자유. 수정이나 오리지널 작업에 적합합니다.',
      '/',
      '비즈 캔버스 열기',
    ],
  ],
}

/** 按语言取获取方式(界面用) */
export function patternWays(lang) {
  return PATTERN_WAYS_I18N[langKey(lang)]
}

/** zh 具名导出:仅供构建期静态正文(始终中文) */
export const PATTERN_WAYS = PATTERN_WAYS_I18N['zh-CN']

/** 像素画页:能力清单(四语言) */
export const PIXEL_FEATURES_I18N = {
  'zh-CN': [
    ['自由网格', '9–200 的方形或矩形网格,像素画、头像、图标、拼豆图纸都能用同一套画布。'],
    ['像素级工具', '画笔、橡皮、油漆桶填充、取色器、抓手平移;矩形与套索选区支持填充、镜像、旋转、复制粘贴。'],
    ['照片转像素', '上传照片按网格量化,可选配色空间与抖动方式,再逐格微调。'],
    ['品牌色卡', '按 COCO / MARD / MARD291 / Perler / Hama / Artkal 真实色号取最接近的颜色。'],
    ['导出', 'PNG / SVG;做拼豆时导出带色号的图纸与颜色清单,直接照着备料。'],
    ['本地处理', '图片与画布数据都在浏览器里处理,不上传服务器,也不需要注册。'],
  ],
  'en-US': [
    [
      'Free-form grid',
      'Square or rectangular grids from 9–200 — pixel art, avatars, icons, and bead patterns share one canvas.',
    ],
    [
      'Pixel-level tools',
      'Pencil, eraser, bucket fill, eyedropper, hand panning; rect and lasso selections support fill, mirror, rotate, copy & paste.',
    ],
    [
      'Photo to pixels',
      'Upload a photo, quantize it to the grid with optional color space and dithering, then tweak cell by cell.',
    ],
    [
      'Brand palettes',
      'Snap to the nearest color from real COCO / MARD / MARD291 / Perler / Hama / Artkal codes.',
    ],
    [
      'Export',
      'PNG / SVG; for beading, export the coded pattern sheet with a color list and shop directly from it.',
    ],
    [
      'Local processing',
      'Images and canvas data stay in your browser — nothing is uploaded and no account is needed.',
    ],
  ],
  'ja-JP': [
    [
      '自由なグリッド',
      '9〜200 の正方形/長方形グリッド。ピクセルアート・アバター・アイコン・ビーズ図案が同じキャンバスで。',
    ],
    [
      'ピクセル単位のツール',
      'ペン・消しゴム・塗りつぶし・スポイト・移動。矩形/なげなわ選択は塗り・ミラー・回転・コピペに対応。',
    ],
    [
      '写真からピクセル変換',
      '写真をアップロードしてグリッドに量子化。配色空間とディザを選び、1 マスずつ調整できます。',
    ],
    ['ブランドパレット', 'COCO / MARD / MARD291 / Perler / Hama / Artkal の実色番号から最も近い色を取得。'],
    ['書き出し', 'PNG / SVG。ビーズ用には色番号付きの図案と色リストを出力し、そのまま材料調達に。'],
    ['ローカル処理', '画像とキャンバスデータはブラウザ内で処理。アップロードも登録も不要です。'],
  ],
  'ko-KR': [
    [
      '자유 그리드',
      '9–200의 정사각/직사각 그리드. 픽셀 아트, 아바타, 아이콘, 비즈 도안이 하나의 캔버스에서 가능합니다.',
    ],
    [
      '픽셀 단위 도구',
      '펜, 지우개, 채우기, 스포이드, 이동. 사각형/올가미 선택 영역에 채우기, 미러, 회전, 복사·붙여넣기 지원.',
    ],
    [
      '사진 → 픽셀',
      '사진을 올리면 그리드 단위로 양자화하고 색 공간과 디더링을 선택한 뒤 한 칸씩 다듬을 수 있습니다.',
    ],
    [
      '브랜드 팔레트',
      'COCO / MARD / MARD291 / Perler / Hama / Artkal 실제 색상 코드에서 가장 가까운 색을 가져옵니다.',
    ],
    [
      '내보내기',
      'PNG / SVG. 비즈 제작용으로는 색상 코드가 있는 도안과 색 목록을 내보내 바로 준비할 수 있습니다.',
    ],
    ['로컬 처리', '이미지와 캔버스 데이터는 브라우저 안에서 처리됩니다. 업로드도 계정도 필요 없습니다.'],
  ],
}

/** 按语言取能力清单(界面用) */
export function pixelFeatures(lang) {
  return PIXEL_FEATURES_I18N[langKey(lang)]
}

/** zh 具名导出:仅供构建期静态正文(始终中文) */
export const PIXEL_FEATURES = PIXEL_FEATURES_I18N['zh-CN']

/** 像素画页:三步流程(四语言) */
export const PIXEL_STEPS_I18N = {
  'zh-CN': [
    [
      '选网格尺寸',
      '先想清楚用途:头像/图标用 29–57,插画用 87–114,大幅作品用 140 以上。也可以直接让工具按图片自动推荐。',
    ],
    ['画或转换', '从空白网格开始画,或上传照片自动转成像素图;不满意就继续用画笔与选区修改。'],
    ['导出或继续制作', '导出 PNG / SVG;要拼成实物时,把图纸载入画布逐格核对,再按色号备料。'],
  ],
  'en-US': [
    [
      'Pick a grid size',
      'Think about the use first: 29–57 for avatars/icons, 87–114 for illustrations, 140+ for large pieces. The tool can also recommend one from your image.',
    ],
    [
      'Draw or convert',
      'Start from a blank grid, or upload a photo to convert automatically; keep refining with the pencil and selection tools.',
    ],
    [
      'Export or keep making',
      'Export PNG / SVG; to bead it for real, load the sheet onto the canvas, check it cell by cell, then shop by color code.',
    ],
  ],
  'ja-JP': [
    [
      'グリッドサイズを選ぶ',
      '用途から決める:アイコン・アバターは 29〜57、イラストは 87〜114、大作は 140 以上。画像から自動推奨もできます。',
    ],
    [
      '描くか変換する',
      '白紙グリッドから描くか、写真を自動変換。気に入らない部分はペンと選択範囲で修正を続けられます。',
    ],
    [
      '書き出すか作り続ける',
      'PNG / SVG を書き出し。実際に作るなら図案をキャンバスに読み込んで 1 マスずつ確認し、色番号どおりに材料を。',
    ],
  ],
  'ko-KR': [
    [
      '그리드 크기 고르기',
      '용도를 먼저 생각하세요: 아바타/아이콘은 29–57, 일러스트는 87–114, 대작은 140 이상. 이미지 기준 자동 추천도 가능합니다.',
    ],
    [
      '그리거나 변환',
      '빈 그리드에서 그리거나 사진을 자동 변환. 마음에 들지 않는 부분은 펜과 선택 영역으로 계속 수정할 수 있습니다.',
    ],
    [
      '내보내거나 계속 만들기',
      'PNG / SVG로 내보내기. 실물로 만들 때는 도안을 캔버스에 불러와 한 칸씩 확인하고 색상 코드별로 준비하세요.',
    ],
  ],
}

/** 按语言取三步流程(界面用) */
export function pixelSteps(lang) {
  return PIXEL_STEPS_I18N[langKey(lang)]
}

/** zh 具名导出:仅供构建期静态正文(始终中文) */
export const PIXEL_STEPS = PIXEL_STEPS_I18N['zh-CN']

/** 像素画页相关教程(按阅读顺序;标题随语言取教程数据) */
export const PIXEL_ARTICLE_IDS = [
  'image-to-pattern',
  'color-principles',
  'shadow-highlight',
  'large-grid-joining',
]

/** 像素画页:尺寸与用途(尺寸共用,用途文案四语言) */
export const PIXEL_GRID_SIZES = [29, 57, 87, 114, 140, 170]

export const PIXEL_GRID_USES_I18N = {
  'zh-CN': [
    '头像、图标、杯垫、新手练习',
    '小挂件、钥匙扣、单块底板作品',
    '中等插画、多色图案',
    '细节较多的插画与照片转像素',
    '大幅装饰画,需要拼多块底板',
    '海报级大图,分块制作',
  ],
  'en-US': [
    'Avatars, icons, coasters, first practice',
    'Small charms, keychains, single-board pieces',
    'Mid-size illustrations, multi-color patterns',
    'Detailed illustrations and photo conversions',
    'Large decor pieces spanning several boards',
    'Poster-size works, built in sections',
  ],
  'ja-JP': [
    'アバター・アイコン・コースター・初回練習',
    '小さなチャーム・キーホルダー・1枚ボード作品',
    '中程度のイラスト・多色図案',
    'ディテール多めのイラストと写真変換',
    '複数ボードを必要とする大型デコ',
    'ポスター級の大作・分割制作',
  ],
  'ko-KR': [
    '아바타, 아이콘, 컵받침, 첫 연습',
    '작은 참장식, 키링, 단일 보드 작품',
    '중형 일러스트, 다색 도안',
    '디테일이 많은 일러스트와 사진 변환',
    '여러 보드가 필요한 대형 장식',
    '포스터급 대작, 분할 제작',
  ],
}

/** 按语言取尺寸用途(界面用;尺寸在 PIXEL_GRID_SIZES) */
export function pixelGridUses(lang) {
  return PIXEL_GRID_USES_I18N[langKey(lang)]
}

/** zh 具名导出:仅供构建期静态正文(始终中文) */
export const PIXEL_GRID_USES = PIXEL_GRID_SIZES.map((size, index) => [
  size,
  PIXEL_GRID_USES_I18N['zh-CN'][index],
])
