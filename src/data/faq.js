/**
 * 常见问题(FAQ)内容源。
 *
 * 为什么放在 data 而不是 locale JSON:
 *   问题和答案都是成段的产品说明,四语言各一份;放进 locale 会让本已很大的
 *   翻译文件再膨胀,也不方便预渲染脚本按语言直接取用。教程内容已经是同样的
 *   组织方式(src/data/tutorials.<lang>.js)。
 *
 * 约束:答案只能描述应用真实具备的能力与流程,不写没有依据的参数
 * (例如不给固定的熨烫温度);结构化数据(FAQPage)必须与页面可见内容一致,
 * 因此构建期静态页与运行时组件都从这份数据取文案。
 */

export const FAQ_ITEMS = [
  {
    id: 'free',
    q: {
      zh: '拼豆Studio 免费吗?需要注册账号吗?',
      en: 'Is 拼豆Studio free? Do I need an account?',
      ja: '拼豆Studio は無料ですか?アカウント登録は必要ですか?',
      ko: '拼豆Studio는 무료인가요? 계정이 필요한가요?',
    },
    a: {
      zh: '核心功能免费,不注册也能绘制图纸、把图片转成拼豆图纸并导出 PNG/SVG。注册后,作品、收藏与自定义色卡可以保存到云端,方便换设备继续编辑。',
      en: 'The core tools are free. You can draw patterns, convert images into bead patterns, and export PNG/SVG without signing up. An account adds cloud saving for works, favorites, and custom palettes so you can continue on another device.',
      ja: '基本機能は無料です。登録なしでも図案の作成、画像からアイロンビーズ図案への変換、PNG/SVG の書き出しができます。登録すると作品・お気に入り・カスタムパレットをクラウドに保存でき、別の端末でも続きから編集できます。',
      ko: '핵심 기능은 무료이며, 가입 없이도 도안 그리기, 이미지를 비즈 도안으로 변환, PNG/SVG 내보내기를 사용할 수 있습니다. 가입하면 작품, 즐겨찾기, 사용자 색상표를 클라우드에 저장해 다른 기기에서 이어서 편집할 수 있습니다.',
    },
  },
  {
    id: 'image-to-pattern',
    q: {
      zh: '怎么把一张图片转成拼豆图纸?',
      en: 'How do I turn an image into a bead pattern?',
      ja: '画像をアイロンビーズ図案に変換するには?',
      ko: '이미지를 비즈 도안으로 바꾸려면 어떻게 하나요?',
    },
    a: {
      zh: '打开「图片转拼豆图纸工具」,上传或粘贴图片,选择品牌色卡、目标尺寸和颜色数,预览后生成图纸。生成结果会进入画布,可以继续逐格修改,也可以直接导出带色号的图纸。',
      en: 'Open the Image to Bead Pattern tool, upload or paste an image, choose a brand palette, target size, and color count, then preview and generate. The result opens on the canvas for cell-by-cell edits or direct export with color IDs.',
      ja: '「画像からアイロンビーズ図案」ツールを開き、画像をアップロードまたは貼り付け、ブランドパレット・サイズ・色数を選んでプレビュー後に生成します。結果はキャンバスに読み込まれ、マス単位の修正や色番号付きの書き出しができます。',
      ko: '이미지→비즈 도안 도구를 열고 이미지를 업로드하거나 붙여넣은 뒤 브랜드 색상표, 목표 크기, 색상 수를 선택하고 미리보기 후 생성하세요. 결과는 캔버스로 들어가 칸 단위 수정이나 색상 코드가 포함된 내보내기를 할 수 있습니다.',
    },
  },
  {
    id: 'formats',
    q: {
      zh: '支持哪些图片格式?图片会上传到服务器吗?',
      en: 'Which image formats are supported? Are my images uploaded?',
      ja: '対応している画像形式は?画像はアップロードされますか?',
      ko: '어떤 이미지 형식을 지원하나요? 이미지가 서버로 업로드되나요?',
    },
    a: {
      zh: '支持 PNG、JPEG、WebP、GIF、AVIF、HEIC 和 PDF。转换在浏览器本地完成,图片不会上传到服务器;不需要注册也能使用。',
      en: 'PNG, JPEG, WebP, GIF, AVIF, HEIC, and PDF are supported. Conversion runs locally in your browser, so images are not uploaded to a server, and no account is required.',
      ja: 'PNG、JPEG、WebP、GIF、AVIF、HEIC、PDF に対応しています。変換はブラウザ内で完結するため画像はサーバーに送信されず、登録も不要です。',
      ko: 'PNG, JPEG, WebP, GIF, AVIF, HEIC, PDF를 지원합니다. 변환은 브라우저에서 처리되어 이미지가 서버로 업로드되지 않으며 가입도 필요 없습니다.',
    },
  },
  {
    id: 'export',
    q: {
      zh: '图纸可以导出成什么格式?',
      en: 'What export formats are available?',
      ja: '図案はどの形式で書き出せますか?',
      ko: '도안은 어떤 형식으로 내보낼 수 있나요?',
    },
    a: {
      zh: '支持导出 PNG 和 SVG。PNG 适合直接打印或分享;SVG 是矢量格式,放大后仍然清晰,适合后期排版。导出图可以包含每颗豆子的品牌色号、颜色清单与用量统计。',
      en: 'Patterns can be exported as PNG or SVG. PNG is convenient for printing and sharing; SVG stays sharp when scaled and suits further layout work. Exports can include brand color IDs for each bead, a color list, and usage counts.',
      ja: 'PNG と SVG で書き出せます。PNG は印刷や共有に便利で、SVG は拡大しても劣化しないためレイアウト作業に向いています。書き出しには各ビーズのブランド色番号・色リスト・使用数を含められます。',
      ko: 'PNG와 SVG로 내보낼 수 있습니다. PNG는 인쇄와 공유에 편리하고, SVG는 확대해도 선명해 후반 작업에 적합합니다. 내보내기에는 비즈별 브랜드 색상 코드, 색상 목록, 사용량 통계를 포함할 수 있습니다.',
    },
  },
  {
    id: 'palettes',
    q: {
      zh: '支持哪些拼豆品牌色卡?颜色匹配准确吗?',
      en: 'Which bead brand palettes are supported? How accurate is the color match?',
      ja: '対応しているビーズブランドの色番号は?色の一致精度は?',
      ko: '어떤 비즈 브랜드 색상표를 지원하나요? 색상 매칭은 얼마나 정확한가요?',
    },
    a: {
      zh: '内置 COCO、MARD、MARD291、Perler、Hama、Artkal 六大色卡,按 CIEDE2000 感知色差选择最接近的豆子。屏幕显示与实物珠子仍可能有轻微色差,正式备料前建议用实物色卡对照。',
      en: 'Six palettes are built in: COCO, MARD, MARD291, Perler, Hama, and Artkal. Colors are matched to the closest bead using CIEDE2000 perceptual distance. Screens and physical beads can still differ slightly, so check a physical color card before buying large quantities.',
      ja: 'COCO、MARD、MARD291、Perler、Hama、Artkal の6種類の色番号を内蔵し、CIEDE2000 の知覚色差で最も近いビーズを選びます。画面と実物のビーズには多少の差が出るため、大量購入前に実物の色見本で確認してください。',
      ko: 'COCO, MARD, MARD291, Perler, Hama, Artkal 6종 색상표를 내장하고 CIEDE2000 지각 색차로 가장 가까운 비즈를 선택합니다. 화면과 실제 비즈는 약간 다를 수 있으므로 대량 구매 전에 실물 색상표로 확인하세요.',
    },
  },
  {
    id: 'size-and-beads',
    q: {
      zh: '怎么确定图纸尺寸和需要多少颗豆子?',
      en: 'How do I choose a pattern size and know how many beads I need?',
      ja: '図案のサイズと必要なビーズ数はどう決めますか?',
      ko: '도안 크기와 필요한 비즈 수는 어떻게 정하나요?',
    },
    a: {
      zh: '在画布设置网格边长,或在图片转换时指定目标尺寸;图纸越大,细节越多,用豆量也越高。画布与图纸详情会统计总颗数和逐色用量,可以照着清单备料;想先估算,可以用豆子数量计算器按填充比例快速得出。',
      en: 'Set the grid size on the canvas or choose a target size during image conversion. Larger patterns hold more detail and use more beads. The canvas and pattern detail pages count total beads and per-color usage so you can prepare materials from that list; for a quick estimate, use the bead count calculator with a fill ratio.',
      ja: 'キャンバスでマス数を設定するか、画像変換時に目標サイズを指定します。図案が大きいほど細部が増え、ビーズ数も増えます。キャンバスと図案詳細で合計数と色別の使用数を確認できるので、そのリストで材料を用意できます。概算はビーズ数計算ツールで充填率を指定して出せます。',
      ko: '캔버스에서 격자 크기를 설정하거나 이미지 변환 시 목표 크기를 지정하세요. 도안이 클수록 디테일과 비즈 사용량이 늘어납니다. 캔버스와 도안 상세 페이지에서 총 비즈 수와 색상별 사용량을 확인해 준비할 수 있습니다. 대략적인 사용량은 비즈 개수 계산기로 채움 비율을 지정해 추정할 수 있습니다.',
    },
  },
  {
    id: 'mobile',
    q: {
      zh: '手机上可以使用吗?',
      en: 'Can I use it on a phone?',
      ja: 'スマートフォンでも使えますか?',
      ko: '휴대폰에서도 사용할 수 있나요?',
    },
    a: {
      zh: '可以。拼豆Studio 是响应式网页,手机、平板和电脑使用同一套地址;小屏上提供适合触控的工具栏与缩放操作。',
      en: 'Yes. 拼豆Studio is a responsive web app: phones, tablets, and computers use the same URL, and small screens get a touch-friendly toolbar and zoom controls.',
      ja: 'はい。拼豆Studio はレスポンシブな Web アプリで、スマートフォン・タブレット・PC が同じ URL を使えます。小さい画面ではタッチ操作向けのツールバーとズーム操作を提供します。',
      ko: '네. 拼豆Studio는 반응형 웹 앱으로 휴대폰, 태블릿, 컴퓨터가 같은 주소를 사용합니다. 작은 화면에서는 터치에 맞춘 도구 모음과 확대/축소를 제공합니다.',
    },
  },
  {
    id: 'saving',
    q: {
      zh: '我的作品会自动保存吗?',
      en: 'Are my works saved automatically?',
      ja: '作品は自動保存されますか?',
      ko: '작품은 자동으로 저장되나요?',
    },
    a: {
      zh: '未登录时作品保存在当前浏览器的本地存储;登录后作品与收藏会同步到云端,并在「我的作品」中按账号保存。更换浏览器或清理站点数据前,建议先登录并确认已同步。',
      en: 'When signed out, works are stored in the current browser. After signing in, works and favorites sync to the cloud and are saved to your account under My Works. Before switching browsers or clearing site data, sign in and confirm the sync first.',
      ja: '未ログイン時は作品は現在のブラウザに保存されます。ログイン後は作品とお気に入りがクラウドに同期され、「マイ作品」にアカウント単位で保存されます。ブラウザ変更やサイトデータの削除前に、ログインして同期済みか確認してください。',
      ko: '로그아웃 상태에서는 작품이 현재 브라우저에 저장됩니다. 로그인하면 작품과 즐겨찾기가 클라우드에 동기화되어 ‘내 작품’에 계정별로 저장됩니다. 브라우저를 바꾸거나 사이트 데이터를 지우기 전에 로그인해 동기화를 확인하세요.',
    },
  },
  {
    id: 'license',
    q: {
      zh: '做出来的图纸可以商用吗?',
      en: 'Can I use the patterns commercially?',
      ja: '作成した図案は商用利用できますか?',
      ko: '만든 도안을 상업적으로 사용할 수 있나요?',
    },
    a: {
      zh: '自己拍摄或绘制的素材,转换出的图纸可以用于个人制作;模板库里的现成图纸仅限个人创作使用。若要把成品批量售卖或用于商业宣传,请先确认素材版权与模板授权。',
      en: 'Patterns converted from your own photos or artwork can be used for personal crafting. Ready-made patterns in the gallery are licensed for personal creation only. For bulk sales or commercial promotion, confirm the rights to the source material and the template first.',
      ja: '自分で撮影・作成した素材から変換した図案は個人制作に使えます。ギャラリーの既成図案は個人創作利用に限られます。完成品の大量販売や商用宣伝には、素材の権利とテンプレートの許諾を事前に確認してください。',
      ko: '직접 촬영하거나 그린 소재로 만든 도안은 개인 제작에 사용할 수 있습니다. 갤러리의 기성 도안은 개인 창작 용도로만 허용됩니다. 완성품을 대량 판매하거나 상업적으로 홍보하려면 소재 권리와 템플릿 라이선스를 먼저 확인하세요.',
    },
  },
  {
    id: 'sharing',
    q: {
      zh: '如何把图纸分享给别人?',
      en: 'How do I share a pattern with someone else?',
      ja: '図案を他の人と共有するには?',
      ko: '도안을 다른 사람과 공유하려면 어떻게 하나요?',
    },
    a: {
      zh: '登录后可以从作品或图库生成公开分享链接;访客无需注册即可在线查看。分享出去的是一个独立快照,删除源作品不会影响已经发布的分享页。',
      en: 'After signing in, you can create a public share link from a work or gallery pattern; visitors can view it without an account. The shared page is an independent snapshot, so deleting the source work does not affect an already published share page.',
      ja: 'ログイン後、作品またはギャラリーから公開共有リンクを作成できます。閲覧者は登録不要で見られます。共有ページは独立したスナップショットなので、元の作品を削除しても公開済みの共有ページには影響しません。',
      ko: '로그인 후 작품이나 갤러리에서 공개 공유 링크를 만들 수 있으며, 방문자는 가입 없이 볼 수 있습니다. 공유 페이지는 독립된 스냅샷이라 원본 작품을 삭제해도 이미 게시된 공유 페이지에는 영향이 없습니다.',
    },
  },
  {
    id: 'ironing',
    q: {
      zh: '熨烫温度和时间是多少?',
      en: 'What ironing temperature and time should I use?',
      ja: 'アイロンの温度と時間はどのくらいですか?',
      ko: '다리미 온도와 시간은 어떻게 설정하나요?',
    },
    a: {
      zh: '官方口径都是中温、关蒸汽、隔熨纸:Perler 建议中温干熨、画圈约 10–20 秒;Hama 强调画圆移动、不停留;Artkal 官方给出 160–180°C 的参考区间。家用熨斗差异大,以珠面微微反光、边缘开始融合为准,宁可低温多次。教程里有完整的温度与手法章节。',
      en: 'Every brand calls for medium, dry heat over ironing paper: Perler suggests about 10–20 seconds of circular ironing; Hama stresses gliding in circles without stopping; Artkal officially recommends 160–180°C. Household irons vary a lot — watch for a subtle sheen and edges starting to fuse, and prefer low heat in multiple passes. The tutorials cover temperature and technique in depth.',
      ja: 'どのブランドも中温・スチームなし・当て紙使用が基本です。Perler は円を描くように 10〜20 秒、Hama は止めずに円を描いて動かすことを、Artkal は 160〜180°C の中温を公式に案内しています。家庭用アイロンは差が大きいので、表面がわずかに照り、縁が溶け始めたら OK。低めで複数回が安全です。詳細はチュートリアルへ。',
      ko: '모든 브랜드는 중간 온도·스팀 끔·다림질 종이 사용이 기본입니다. Perler는 원을 그리며 10~20초, Hama는 멈추지 않고 원을 그리며 움직이기를, Artkal은 160~180°C를 공식 안내합니다. 가정용 다리미는 편차가 크니 표면의 은은한 광택과 가장자리 융합을 기준으로 하고, 낮은 온도로 여러 번이 안전합니다. 자세한 내용은 튜토리얼을 참고하세요.',
    },
  },
  {
    id: 'color-difference',
    q: {
      zh: '为什么图纸颜色和实物豆子有差异?',
      en: 'Why does the pattern color differ from the physical beads?',
      ja: '図案の色と実物のビーズが違って見えるのはなぜ?',
      ko: '도안 색상이 실제 비즈와 다르게 보이는 이유는 무엇인가요?',
    },
    a: {
      zh: '色卡匹配依据品牌公布的色值计算,但屏幕、拍摄光线和珠子批次都会影响观感。图纸给出的是最接近的品牌色号,实际制作前建议用实物色卡确认。',
      en: 'Matching is calculated from published brand color values, but screens, lighting, and bead batches all affect how colors look. The pattern shows the closest brand color ID; confirm with a physical color card before crafting.',
      ja: '色の照合はブランド公表の色値に基づいて計算されますが、画面・撮影の光・ビーズのロットで見え方が変わります。図案は最も近い色番号を示すため、制作前に実物の色見本で確認してください。',
      ko: '색상 매칭은 브랜드가 공개한 색상값을 기준으로 계산되지만 화면, 촬영 조명, 비즈 생산 로트에 따라 보이는 색이 달라질 수 있습니다. 도안은 가장 가까운 브랜드 색상 코드를 제시하므로 제작 전에 실물 색상표로 확인하세요.',
    },
  },
  {
    id: 'age-safety',
    q: {
      zh: '拼豆适合多大的孩子玩?要注意什么安全事项?',
      en: 'What age are fuse beads for? What safety points matter?',
      ja: 'アイロンビーズは何歳から?安全面での注意は?',
      ko: '비즈는 몇 살부터? 안전 주의사항은?',
    },
    a: {
      zh: '主流品牌建议 5–6 岁以上;3 岁以下有误吞风险,大颗粒系列(如 Hama Maxi)3 岁以上可用。熨烫必须由大人操作,并在通风处进行;收纳放在幼儿拿不到的地方。',
      en: 'Most brands recommend ages 5–6 and up; small parts are a choking hazard under 3 (large-bead lines like Hama Maxi are rated 3+). An adult should always handle the ironing step and work in a ventilated spot; keep beads stored away from toddlers.',
      ja: '主要ブランドは 5〜6 歳以上が目安です。3 歳未満は誤飲の恐れがあるため避け、大サイズ(ハマ maxi など)は 3 歳以上向けです。アイロンがけは必ず大人が行い、風通しの良い場所で。小さい子の手が届かない場所に保管してください。',
      ko: '주요 브랜드는 5~6세 이상을 권합니다. 3세 미만은 삼킴 위험이 있어 피하고, 대형 비즈(하마 맥시 등)는 3세 이상용입니다. 다리미질은 반드시 어른이 하고 환기되는 곳에서 진행하세요. 어린아이 손이 닿지 않는 곳에 보관하세요.',
    },
  },
  {
    id: 'warp',
    q: {
      zh: '熨完的作品翘边或不平,怎么补救?',
      en: 'My finished piece warped or is uneven — how do I fix it?',
      ja: 'アイロン後に反ったり平らでない場合の直し方は?',
      ko: '다림질 후 휘었거나 평평하지 않을 때 해결법은?',
    },
    a: {
      zh: '多是温度不均加冷却过快:趁作品温热翻面,盖上熨纸用书本压住冷却 30 分钟以上;大图建议双面熨透。已经焦黄变形的无法恢复,只能拆掉重烫该区域。详细步骤见教程「翻车急救手册」。',
      en: 'Uneven heat plus fast cooling is the usual cause: while the piece is still warm, flip it, cover with ironing paper, and press under books for 30+ minutes; iron both sides for large pieces. Scorched, over-melted beads cannot be saved — redo that area. See the rescue tutorial for details.',
      ja: '温度ムラと急冷が主な原因です。温かいうちに裏返し、当て紙をのせて本などで 30 分以上重しします。大きな作品は両面をしっかり熱します。焦げて変形した部分は元に戻らないため、その部分を作り直してください。詳しくは「やり直しガイド」のチュートリアルを。',
      ko: '온도 불균형과 급냉이 원인입니다. 따뜻할 때 뒤집아 다림질 종이를 덮고 책 등으로 30분 이상 눌러 두세요. 큰 작품은 양면을 충분히 다림질합니다. 타서 변형된 부분은 복구되지 않으니 그 부분만 다시 만드세요. 자세한 내용은 구조 튜토리얼을 참고하세요.',
    },
  },
  {
    id: 'bead-sizes',
    q: {
      zh: '5mm 和 2.6mm 两种珠子能混用吗?',
      en: 'Can I mix 5mm and 2.6mm beads?',
      ja: '5mm と 2.6mm のビーズは混ぜて使えますか?',
      ko: '5mm과 2.6mm 비즈를 섞어 쓸 수 있나요?',
    },
    a: {
      zh: '不能直接混用:5mm(常规珠)与 2.6mm(迷你珠)的底板柱距不同,迷你珠要配迷你底板。5mm 珠之间(Perler/Hama/COCO/MARD)可以互放;本站 Artkal 色卡对应 2.6mm 的 C 系列,其余品牌为 5mm。',
      en: 'Not directly: 5mm (standard) and 2.6mm (mini) beads need different pegboard spacing, so minis require a mini board. Standard beads from Perler/Hama/COCO/MARD can share a board. This site\'s Artkal chart is the 2.6mm C-series; the other brands are 5mm.',
      ja: 'そのままでは使えません。5mm(スタンダード)と 2.6mm(ミニ)ではプレートのピン間隔が違い、ミニにはミニ用プレートが必要です。5mm 同士(Perler/Hama/COCO/MARD)は同じプレートに併用できます。当サイトの Artkal は 2.6mm の C シリーズ、他は 5mm です。',
      ko: '직접 섞을 수 없습니다. 5mm(일반)와 2.6mm(미니)는 보드 핀 간격이 달라 미니 비즈에는 전용 보드가 필요합니다. 5mm끼리(Perler/Hama/COCO/MARD)는 같은 보드에 함께 쓸 수 있습니다. 이 사이트의 Artkal은 2.6mm C 시리즈이고 나머지는 5mm입니다.',
    },
  },
  {
    id: 'finished-uses',
    q: {
      zh: '做好的拼豆作品可以用来做什么?',
      en: 'What can I make with finished fuse-bead pieces?',
      ja: '完成した作品は何に使えますか?',
      ko: '완성된 비즈 작품으로 무엇을 할 수 있나요?',
    },
    a: {
      zh: '常见用途:杯垫、钥匙扣、挂件、冰箱贴、相框装饰与小摆件;大尺寸作品可以分区拼接后当装饰画或桌垫。作品平放冷却定型后更耐用,展示与收纳技巧见教程。',
      en: 'Common uses: coasters, keychains, charms, fridge magnets, frame decorations, and small ornaments; large pieces can be joined in sections as wall art or desk mats. Let pieces cool flat so they hold their shape — see the tutorials for display and storage tips.',
      ja: 'コースター、キーホルダー、チャーム、マグネット、フォトフレーム飾り、小物などが定番です。大きい作品は分区して接合すればウォールアートやデスクマットに。平らに冷やして固めると長持ちします。飾り方・保管はチュートリアルへ。',
      ko: '컵받침, 키링, 참, 냉장고 자석, 액자 장식, 소품 등이 대표적입니다. 큰 작품은 구역별로 이어 붙여 월 아트나 데스크 매트로 만들 수 있습니다. 평평하게 식혀 굳히면 오래 쓸 수 있습니다. 전시와 보관 팁은 튜토리얼을 참고하세요.',
    },
  },
]

/** 页面文案(标题、导语、相关入口),与 FAQ 正文同语言切换 */
export const FAQ_PAGE_TEXT = {
  zh: {
    title: '拼豆常见问题',
    intro: '关于拼豆Studio 的使用、导出、色号匹配与商用范围的常见问题。',
    more: '继续使用',
    links: {
      create: '图片转拼豆图纸工具',
      gallery: '拼豆图纸模板库',
      tutorials: '拼豆教程',
      contact: '联系我们',
      colors: '品牌色卡对照表',
      calculator: '豆子数量计算器',
      ironing: '熨烫温度对照表',
    },
  },
  en: {
    title: 'Frequently Asked Questions',
    intro: 'Common questions about using 拼豆Studio, exporting patterns, color matching, and licensing.',
    more: 'Keep exploring',
    links: {
      create: 'Image to bead pattern',
      gallery: 'Pattern gallery',
      tutorials: 'Tutorials',
      contact: 'Contact us',
      colors: 'Brand color charts',
      calculator: 'Bead count calculator',
      ironing: 'Ironing guide',
    },
  },
  ja: {
    title: 'よくある質問',
    intro: '拼豆Studio の使い方、書き出し、色番号の照合、商用利用に関するよくある質問です。',
    more: '続けて使う',
    links: {
      create: '画像から図案を作る',
      gallery: '図案ギャラリー',
      tutorials: 'チュートリアル',
      contact: 'お問い合わせ',
      colors: 'カラー見本',
      calculator: 'ビーズ数計算ツール',
      ironing: 'アイロン温度',
    },
  },
  ko: {
    title: '자주 묻는 질문',
    intro: '拼豆Studio 사용법, 내보내기, 색상 매칭, 상업적 이용에 관한 자주 묻는 질문입니다.',
    more: '계속 둘러보기',
    links: {
      create: '이미지→비즈 도안',
      gallery: '도안 갤러리',
      tutorials: '튜토리얼',
      contact: '문의하기',
      colors: '컬러 차트',
      calculator: '비즈 개수 계산기',
      ironing: '다림질 온도',
    },
  },
}

/** i18n 语言码(zh-CN / en-US / ja-JP / ko-KR)归一化到数据文件的短码 */
export function normalizeFaqLanguage(language) {
  const code = String(language || '').toLowerCase()
  if (code.startsWith('en')) return 'en'
  if (code.startsWith('ja')) return 'ja'
  if (code.startsWith('ko')) return 'ko'
  return 'zh'
}

/** 当前语言下的问答列表 */
export function faqItemsFor(language) {
  const lang = normalizeFaqLanguage(language)
  return FAQ_ITEMS.map((item) => ({
    id: item.id,
    question: item.q[lang],
    answer: item.a[lang],
  }))
}

/** 当前语言下的页面文案 */
export function faqPageTextFor(language) {
  return FAQ_PAGE_TEXT[normalizeFaqLanguage(language)]
}
