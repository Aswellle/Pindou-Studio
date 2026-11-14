/**
 * 备料工具页的「常见问题」问答(四语言)。
 *
 * Microsoft Bing 的 AI 内容指南(2025-10)指出:生成式检索会把页面切成段落,
 * 每段单独评估 —— 1–2 句、脱离上下文仍能成立的问答最容易成为答案里的引用
 * 片段。这里给熨烫、图案、像素画三页各补一组问答;页面按语言取数,
 * zh 具名导出仅供构建期静态正文(始终中文)使用。
 *
 * 约束:答案只复述教程与页面上已有的口径,不新增温度、用量等数字。
 */

/** 按语言取一组 FAQ;未知语言回退中文 */
export function faqFor(kind, lang = 'zh-CN') {
  const sets = {
    ironing: IRONING_FAQ_I18N,
    patterns: PATTERNS_FAQ_I18N,
    pixel: PIXEL_ART_FAQ_I18N,
  }
  const set = sets[kind] || IRONING_FAQ_I18N
  const base = String(lang || '').split('-')[0]
  return set[`${base}-US`] || set[`${base}-CN`] || set[`${base}-JP`] || set[`${base}-KR`] || set['zh-CN']
}

/** 熨烫页(/ironing):温度口径来自 IRONING_RULES 与教程的官方参考 */
export const IRONING_FAQ_I18N = {
  'zh-CN': [
    [
      '拼豆熨斗应该调到多少度?',
      '家用熨斗选中温、关闭蒸汽。Artkal 官方给出的参考区间是 160–180°C;Perler 与 Hama 官方都强调中温、隔纸、画圈移动,以珠面微微反光、边缘开始融合为准。家用熨斗实际温差大,宁可偏低多次。',
    ],
    [
      '没有专用熨斗可以熨拼豆吗?',
      '可以用家用调温熨斗,关键是能保持中温并关掉蒸汽。第一次用新工具时,先在角落一两颗珠子上试温,观察融合程度再全面熨烫。',
    ],
    [
      '拼豆烫完为什么会翘边?',
      '常见原因是受热不均、冷却过快或冷却时没有压重。熨烫时从中心向外画圈移动、双面都烫,完成后趁温热用书本压住,冷却至少 30 分钟再取下重物。',
    ],
    [
      '烫黄、烫焦了还能救吗?',
      '轻微变形可以趁珠子还软时翻面压平;已经焦黑、完全熔化的部分无法恢复,只能拆掉重做。下次降低温度、缩短单次停留时间,低温多次比高温一次稳。',
    ],
  ],
  'en-US': [
    [
      'What setting should my iron be on for fuse beads?',
      'Use a household iron on medium heat with steam off. Artkal officially references 160–180°C; Perler and Hama both stress medium heat, ironing paper, and circular motion, stopping when the bead surface looks slightly glossy and the edges start to fuse. Home irons vary a lot, so several low passes beat one hot pass.',
    ],
    [
      'Can I fuse beads without a dedicated iron?',
      'Yes — any household iron with adjustable heat works, as long as it can hold medium heat with steam off. With any new tool, test on one or two beads in a corner first and check how they fuse before ironing the whole board.',
    ],
    [
      'Why did my finished piece warp?',
      'Usually uneven heat, cooling too fast, or no weight while cooling. Iron in circles from the center outward, fuse both sides, then press it under a book while still warm and let it cool for at least 30 minutes.',
    ],
    [
      'Can yellowed or scorched beads be saved?',
      'Slight warping can be flattened by flipping and pressing while the beads are still soft; scorched or fully melted areas cannot be restored and must be redone. Lower the heat and shorten each pass next time — low and slow is safer than hot and fast.',
    ],
  ],
  'ja-JP': [
    [
      'アイロンは何度に設定すればいい?',
      '家庭用アイロンは中温・蒸気オフが基本です。Artkal 公式は 160–180°C を提示。Perler と Hama も中温・当て紙・円を描く移動を強調し、表面がわずかに光って縁が溶け始めたら仕上げ。家庭用アイロンの個体差が大きいため、低めで複数回が安全です。',
    ],
    [
      '専用アイロンがなくても大丈夫?',
      '温度調節できる家庭用アイロンで大丈夫。ポイントは中温を保ち蒸気を切ること。初めての道具は、まず隅の 1〜2 個で試して溶け具合を確認してから全体へ進めます。',
    ],
    [
      '仕上がりが反り返るのはなぜ?',
      '多くは熱のムラ・急冷・冷却時の重し不足が原因。中心から外へ円を描くように動かし両面をアイロンし、温かいうちに本で押さえて 30 分以上冷ましてから外します。',
    ],
    [
      '黄色く焼けたり焦げたりしたら直せる?',
      '軽い反りは柔らかいうちに裏返して押さえれば平らに。焦黒化・完全溶融は元に戻せないので作り直し。次回は温度を下げ、当てる時間を短くして低温複数回を。',
    ],
  ],
  'ko-KR': [
    [
      '퓨즈 비즈 다리미 온도는 어느 정도?',
      '가정용 다리미는 중간 온도 + 스팀 OFF가 기본입니다. Artkal 공식 기준은 160–180°C이며, Perler와 Hama 모두 중간 온도, 종이 덮기, 원형 이동을 강조하고 표면이 살짝 윤기 나며 가장자리가 녹기 시작하면 완성입니다. 가정용 다리미는 편차가 크므로 낮은 온도로 여러 번이 안전합니다.',
    ],
    [
      '전용 다리미 없이도 가능한가요?',
      '온도 조절이 되는 가정용 다리미면 충분합니다. 핵심은 중간 온도 유지와 스팀 차단. 새 도구는 먼저 구석 비즈 한두 개로 녹는 정도를 확인한 뒤 전체로 진행하세요.',
    ],
    [
      '완성 후 휘어지는 이유는?',
      '대부분 열 불균일, 급랭, 냉각 시 눌러두지 않아서입니다. 중심에서 바깥으로 원을 그리며 양면을 다림질하고, 따뜻할 때 책으로 눌러 최소 30분 식힌 뒤 치우세요.',
    ],
    [
      '노랗게 탄 비즈를 살릴 수 있나요?',
      '약간의 휨은 비즈가 말랑할 때 뒤집어 누르면 펴집니다. 타서 완전히 녹은 부분은 복구할 수 없어 다시 만들어야 합니다. 다음에는 온도를 낮추고 가열 시간을 줄여 낮은 온도로 여러 번 하세요.',
    ],
  ],
}

/** zh 具名导出:仅供构建期静态正文(始终中文) */
export const IRONING_FAQ = IRONING_FAQ_I18N['zh-CN']

/** 图案页(/bead-patterns):用量口径来自 beadCalculator 的估算公式 */
export const PATTERNS_FAQ_I18N = {
  'zh-CN': [
    [
      '一张拼豆图案要多少颗豆子?',
      '按宽 × 高 × 填充比例估算:57×57 的网格、八成填充约 2600 颗;外轮廓不规则的图案空格多,实际用量会更少。精确颗数以图纸详情页的逐色统计为准。',
    ],
    [
      '新手适合从多大的图案开始?',
      '29×29 以内最稳,适合杯垫、钥匙扣和第一次练习;颜色控制在 8–12 种更好备料。熟练后再尝试 57×57 或需要拼多块底板的大图。',
    ],
    [
      '不同品牌的色号能直接通用吗?',
      '不能。同一种颜色在不同品牌之间的色号并不对应,换品牌时先用色卡对照按 CIEDE2000 就近匹配,再对照实物微调。',
    ],
    [
      '在哪里找免费的拼豆图案?',
      '图库按动物、食物、卡通等题材分类,选中即可载入画布;也可以上传自己的照片转成图案,或者从空白网格自己画一张。',
    ],
  ],
  'en-US': [
    [
      'How many beads does a pattern need?',
      'Estimate with width × height × fill ratio: a 57×57 grid at 80% fill is about 2,600 beads; patterns with irregular outlines have more empty cells and need fewer. Exact counts come from the per-color stats on the pattern page.',
    ],
    [
      'What size should a beginner start with?',
      '29×29 or smaller is safest — coasters, keychains, and a first practice piece; keep it to 8–12 colors for easier shopping. Try 57×57 or multi-board large works once you are comfortable.',
    ],
    [
      'Are color codes interchangeable across brands?',
      'No. The same color has different codes in each brand. When switching brands, match colors with the color chart (CIEDE2000 nearest) first, then fine-tune against the physical beads.',
    ],
    [
      'Where can I find free fuse bead patterns?',
      'The gallery sorts patterns by theme (animals, food, cartoons and more) — pick one and load it onto the canvas; you can also convert your own photos or draw from a blank grid.',
    ],
  ],
  'ja-JP': [
    [
      '図案に必要なビーズの数は?',
      '幅 × 高さ × 塗り率で概算:57×57 のグリッドで塗り率 80% なら約 2,600 個。輪郭が不規則な図案は空きマスが多く、実際はもっと少なくなります。正確な数は図案ページの色別統計を。',
    ],
    [
      '初心者はどのサイズから?',
      '29×29 以内が最も安全。コースター・キーホルダー・初めての練習に向きます。色数は 8〜12 色に抑えると用意が楽。慣れたら 57×57 や複数ボードの大作へ。',
    ],
    [
      'ブランドが違うと色番号は共通?',
      'いいえ。同じ色でもブランドごとに番号が異なります。ブランドを変えるときはカラーチャートで CIEDE2000 の近似色を合わせ、実物と見比べて調整を。',
    ],
    [
      '無料の図案はどこで見つかる?',
      'ギャラリーは動物・食べ物・キャラなどのテーマ別に分類され、選んですぐキャンバスに読み込めます。写真から変換したり、白紙グリッドから描いたりもできます。',
    ],
  ],
  'ko-KR': [
    [
      '도안에 비즈가 몇 개 필요한가요?',
      '가로 × 세로 × 채움 비율로 계산합니다: 57×57 그리드, 80% 채움이면 약 2,600개. 외곽이 불규칙한 도안은 빈 칸이 많아 실제로는 더 적습니다. 정확한 수는 도안 페이지의 색별 통계를 확인하세요.',
    ],
    [
      '초보자는 어느 크기부터 시작해야 하나요?',
      '29×29 이내가 가장 안전합니다. 컵받침, 키링, 첫 연습용으로 적합하고 색은 8–12가지로 제한하면 준비가 쉽습니다. 익숙해지면 57×57이나 여러 보드를 잇는 대작에 도전하세요.',
    ],
    [
      '브랜드가 다르면 색상 코드도 호환되나요?',
      '아니요. 같은 색이라도 브랜드마다 코드가 다릅니다. 브랜드를 바꿀 때는 색상표에서 CIEDE2000 근사 색을 먼저 찾고 실물과 비교해 미세 조정하세요.',
    ],
    [
      '무료 퓨즈 비즈 도안은 어디서 찾나요?',
      '갤러리가 동물, 음식, 캐릭터 등 테마별로 분류되어 있어 골라 바로 캔버스에 불러올 수 있습니다. 사진을 변환하거나 빈 그리드에서 직접 그릴 수도 있습니다.',
    ],
  ],
}

/** zh 具名导出:仅供构建期静态正文(始终中文) */
export const PATTERNS_FAQ = PATTERNS_FAQ_I18N['zh-CN']

/** 像素画页(/pixel-art):口径来自 PIXEL_FEATURES / PIXEL_STEPS / PIXEL_GRID_USES */
export const PIXEL_ART_FAQ_I18N = {
  'zh-CN': [
    [
      '像素画和拼豆图纸有什么区别?',
      '本质都是网格上的一格一色。像素画偏屏幕创作,导出 PNG/SVG;拼豆图纸额外给出品牌色号与逐色用量,能直接照着备料。同一张画布可以两种方式导出。',
    ],
    [
      '像素画网格尺寸怎么选?',
      '头像、图标用 29–57;插画用 87–114;海报级大图用 140 以上并分块制作。尺寸越大,可放细节越多,制作时间也越长。',
    ],
    [
      '照片能自动转成像素画吗?',
      '可以。上传照片后工具按网格量化并匹配品牌色卡,还能调整颜色数与抖动方式;转换在浏览器本地完成,图片不会上传到服务器。',
    ],
    [
      '画好的像素画怎么变成拼豆作品?',
      '按底板尺寸确定网格,导出带色号的图纸,按色号备料、按图纸逐格拼制,最后按熨烫温度参考定型。',
    ],
  ],
  'en-US': [
    [
      'Pixel art vs. fuse bead patterns — what is the difference?',
      'At heart both are one cell, one color. Pixel art leans toward on-screen creation with PNG/SVG export; fuse bead patterns additionally carry brand color codes and per-color quantities so you can shop directly. The same canvas can be exported either way.',
    ],
    [
      'How do I choose a pixel art grid size?',
      'Avatars and icons: 29–57; illustrations: 87–114; poster-size works: 140+ built from multiple boards. The bigger the grid, the more detail and the longer it takes.',
    ],
    [
      'Can photos be converted to pixel art automatically?',
      'Yes. Upload a photo and the tool quantizes it to the grid and matches brand palettes, with adjustable color count and dithering; everything runs locally in the browser — images are never uploaded.',
    ],
    [
      'How does a pixel drawing become a bead piece?',
      'Pick the grid to match your board, export the coded pattern, shop beads by color code, place them cell by cell, then fuse following the ironing temperature guide.',
    ],
  ],
  'ja-JP': [
    [
      'ピクセルアートとビーズ図案の違いは?',
      '本質はどちらも「1 マス = 1 色」。ピクセルアートは画面での制作寄りで PNG/SVG 書き出し、ビーズ図案は品牌色番号と色別の必要数も分かるのでそのまま材料調達に使えます。同じキャンバスを両方の形式で書き出せます。',
    ],
    [
      'グリッドサイズの選び方は?',
      'アイコン・アバターは 29〜57、イラストは 87〜114、ポスター級は 140 以上を分割制作。大きいほど細部を乗せられ、時間もかかります。',
    ],
    [
      '写真から自動変換できる?',
      'できます。写真をアップロードするとグリッドに量子化してブランドパレットにマッピングし、色数やディザも調整可能。処理はブラウザ内で完結し、画像はアップロードされません。',
    ],
    [
      '描いたピクセルアートをビーズ作品にするには?',
      'ボードサイズに合わせてグリッドを決め、色番号付きの図案を書き出し、番号どおりにビーズを用意して 1 マスずつ配置し、最後にアイロン温度ガイドで仕上げます。',
    ],
  ],
  'ko-KR': [
    [
      '픽셀 아트와 퓨즈 비즈 도안의 차이는?',
      '본질적으로 둘 다 한 칸 = 한 색입니다. 픽셀 아트는 화면 제작 중심이고 PNG/SVG로 내보내며, 퓨즈 비즈 도안은 브랜드 색상 코드와 색별 수량까지 알려주어 바로 재료 준비가 가능합니다. 같은 캔버스를 두 방식으로 내보낼 수 있습니다.',
    ],
    [
      '픽셀 아트 그리드 크기는 어떻게 고르나요?',
      '아바타·아이콘은 29–57, 일러스트는 87–114, 포스터급은 140 이상을 여러 보드로 나눠 제작합니다. 클수록 표현할 디테일이 많아지고 시간도 더 걸립니다.',
    ],
    [
      '사진을 자동으로 픽셀 아트로 바꿀 수 있나요?',
      '가능합니다. 사진을 업로드하면 그리드 단위로 양자화하고 브랜드 팔레트에 매칭하며, 색 수와 디더링도 조절할 수 있습니다. 처리는 브라우저에서 완료되며 이미지는 업로드되지 않습니다.',
    ],
    [
      '만든 픽셀 아트를 비즈 작품으로 만드는 방법은?',
      '보드 크기에 맞춰 그리드를 정하고, 색상 코드가 있는 도안을 내보낸 뒤 코드별로 비즈를 준비해 한 칸씩 배치하고, 마지막에 다림질 온도 가이드로 마무리하세요.',
    ],
  ],
}

/** zh 具名导出:仅供构建期静态正文(始终中文) */
export const PIXEL_ART_FAQ = PIXEL_ART_FAQ_I18N['zh-CN']
