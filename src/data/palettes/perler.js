// Perler Beads — 完整标准固体色板
// RGB 值基于实际塑料珠子色度测量校准（非屏幕色，饱和度偏低）
// 颜色名称对应 Perler 官方产品系列

function hex(r, g, b) {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0').toUpperCase()).join('')}`
}
function c(id, name, nameZh, r, g, b, category) {
  return { id, name, nameZh, hex: hex(r, g, b), rgb: { r, g, b }, category }
}

export const PERLER_PALETTE = {
  id: 'perler',
  name: 'Perler Beads',
  nameZh: 'Perler 拼豆',
  origin: '美国',
  beadSize: 5,
  beadSizeLabel: '中颗粒 (5mm)',
  colorCount: 80,
  website: 'https://www.perler.com',

  colors: [
    // ── 白色 / 奶油色系 ──────────────────────────────
    c('P01', 'White',               '白色',       242, 242, 242, 'neutral'),
    c('P02', 'Creme',               '奶油白',     244, 226, 168, 'neutral'),
    c('P03', 'Toasted Marshmallow', '烤棉花糖',   228, 205, 162, 'neutral'),
    c('P04', 'Sand',                '沙色',       220, 198, 154, 'neutral'),
    c('P05', 'Vanilla',             '香草色',     242, 230, 188, 'neutral'),

    // ── 灰色 / 黑色系 ────────────────────────────────
    c('P06', 'Black',               '黑色',        20,  20,  20, 'neutral'),
    c('P07', 'Charcoal',            '炭灰色',      60,  60,  64, 'neutral'),
    c('P08', 'Dark Gray',           '深灰色',      92,  92,  92, 'neutral'),
    c('P09', 'Gray',                '灰色',       148, 148, 148, 'neutral'),
    c('P10', 'Light Gray',          '浅灰色',     192, 192, 192, 'neutral'),
    c('P11', 'Silver',              '银色',       202, 202, 202, 'neutral'),

    // ── 棕色系 ───────────────────────────────────────
    c('P12', 'Dark Brown',          '深棕色',      72,  38,  18, 'brown'),
    c('P13', 'Brown',               '棕色',       120,  70,  34, 'brown'),
    c('P14', 'Cinnamon',            '肉桂色',     156,  88,  52, 'brown'),
    c('P15', 'Caramel',             '焦糖色',     162, 102,  48, 'brown'),
    c('P16', 'Light Brown',         '浅棕色',     164, 118,  70, 'brown'),
    c('P17', 'Tan',                 '棕褐色',     192, 154, 110, 'brown'),
    c('P18', 'Peach',               '桃色',       240, 176, 135, 'skin'),

    // ── 黄绿系（Sherbet 是关键色）────────────────────
    c('P19', 'Sherbet',             '酸甜绿',     192, 203, 122, 'green'),  // 参考站主色：暖调柔和黄绿
    c('P20', 'Slime',               '史莱姆绿',   156, 196,  76, 'green'),
    c('P21', 'Light Lime',          '浅莱姆绿',   178, 212, 118, 'green'),
    c('P22', 'Pastel Green',        '粉绿色',     163, 205, 148, 'green'),

    // ── 红色系 ───────────────────────────────────────
    c('P23', 'Dark Red',            '深红色',     148,  28,  32, 'red'),
    c('P24', 'Red',                 '红色',       194,  32,  34, 'red'),
    c('P25', 'Rust',                '锈红色',     165,  62,  36, 'red'),
    c('P26', 'Bittersweet',         '苦甜色',     196,  72,  50, 'red'),
    c('P27', 'Salmon',              '三文鱼粉',   230, 105,  88, 'red'),

    // ── 橙色系 ───────────────────────────────────────
    c('P28', 'Dark Orange',         '深橙色',     218,  82,  24, 'orange'),
    c('P29', 'Orange',              '橙色',       238, 108,  30, 'orange'),
    c('P30', 'Cheddar',             '切达黄橙',   222, 148,  28, 'orange'),

    // ── 黄色系 ───────────────────────────────────────
    c('P31', 'Butterscotch',        '奶油糖',     202, 148,  60, 'yellow'),
    c('P32', 'Honey',               '蜂蜜色',     200, 162,  50, 'yellow'),
    c('P33', 'Golden',              '金色',       198, 150,  40, 'yellow'),
    c('P34', 'Yellow',              '黄色',       248, 214,   0, 'yellow'),
    c('P35', 'Corn',                '玉米黄',     245, 212,  84, 'yellow'),
    c('P36', 'Lemon',               '柠檬色',     254, 234,  82, 'yellow'),
    c('P37', 'Light Yellow',        '浅黄色',     250, 236, 148, 'yellow'),

    // ── 绿色系 ───────────────────────────────────────
    c('P38', 'Evergreen',           '常青绿',      44,  88,  52, 'green'),
    c('P39', 'Dark Green',          '深绿色',      20,  92,  46, 'green'),
    c('P40', 'Fern',                '蕨绿',        80, 138,  70, 'green'),
    c('P41', 'Green',               '绿色',        42, 140,  54, 'green'),
    c('P42', 'Sour Apple',          '苹果绿',      95, 168,  68, 'green'),
    c('P43', 'Shamrock',            '三叶草绿',    42, 140,  66, 'green'),
    c('P44', 'Sage',                '鼠尾草绿',   125, 148, 100, 'green'),
    c('P45', 'Olive',               '橄榄色',      86,  98,  48, 'green'),
    c('P46', 'Artichoke',           '朝鲜蓟绿',   120, 136,  66, 'green'),

    // ── 青色 / 水鸭色系 ──────────────────────────────
    c('P47', 'Mint',                '薄荷色',     162, 208, 194, 'cyan'),
    c('P48', 'Aqua',                '水色',        90, 184, 194, 'cyan'),
    c('P49', 'Cyan',                '青色',        40, 180, 198, 'cyan'),
    c('P50', 'Turquoise',           '绿松石',      28, 162, 182, 'cyan'),
    c('P51', 'Teal',                '水鸭色',      26, 145, 145, 'cyan'),
    c('P52', 'Dark Teal',           '深水鸭色',    24, 102, 108, 'cyan'),
    c('P53', 'Mermaid',             '美人鱼色',    42, 122, 138, 'cyan'),

    // ── 蓝色系 ───────────────────────────────────────
    c('P54', 'Navy',                '海军蓝',      18,  46, 136, 'blue'),
    c('P55', 'Dark Blue',           '深蓝色',      22,  54, 128, 'blue'),
    c('P56', 'Blue',                '蓝色',        30,  94, 163, 'blue'),
    c('P57', 'Periwinkle',          '长春花色',   112, 136, 194, 'blue'),
    c('P58', 'Sky Blue',            '天蓝色',      88, 154, 198, 'blue'),
    c('P59', 'Baby Blue',           '婴儿蓝',     132, 190, 218, 'blue'),
    c('P60', 'Pastel Blue',         '粉蓝色',     152, 196, 224, 'blue'),
    c('P61', 'Light Blue',          '浅蓝色',     178, 216, 234, 'blue'),

    // ── 紫色系 ───────────────────────────────────────
    c('P62', 'Purple Passion',      '激情紫',     108,  46, 112, 'purple'),
    c('P63', 'Plum',                '梅子色',     100,  46, 102, 'purple'),
    c('P64', 'Purple',              '紫色',       126,  38, 128, 'purple'),
    c('P65', 'Light Purple',        '浅紫色',     166, 106, 174, 'purple'),
    c('P66', 'Lilac',               '丁香紫',     174, 150, 194, 'purple'),
    c('P67', 'Lavender',            '薰衣草',     188, 162, 198, 'purple'),
    c('P68', 'Pastel Lavender',     '粉薰衣草',   196, 172, 210, 'purple'),

    // ── 粉色系 ───────────────────────────────────────
    c('P69', 'Magenta',             '品红色',     205,  36, 126, 'pink'),
    c('P70', 'Hot Pink',            '亮粉色',     222,  50, 116, 'pink'),
    c('P71', 'Dark Pink',           '深粉色',     198,  48, 102, 'pink'),
    c('P72', 'Pink',                '粉色',       236, 108, 150, 'pink'),
    c('P73', 'Bubble Gum',          '泡泡糖粉',   236, 120, 160, 'pink'),
    c('P74', 'Rose',                '玫瑰粉',     226, 115, 130, 'pink'),
    c('P75', 'Flamingo',            '火烈鸟粉',   238, 154, 172, 'pink'),
    c('P76', 'Blush',               '腮红色',     240, 184, 172, 'pink'),
    c('P77', 'Light Pink',          '浅粉色',     240, 184, 198, 'pink'),
    c('P78', 'Mustard Yellow',      '芥末黄',     192, 144,  40, 'yellow'),
    c('P79', 'Rose Dust',           '玫瑰灰',     196, 156, 164, 'pink'),
    c('P80', 'Stone',               '石色',       168, 164, 154, 'neutral'),
  ],

  categories: [
    { id: 'neutral', name: 'Neutral',  nameZh: '中性色' },
    { id: 'skin',    name: 'Skin',     nameZh: '肤色系' },
    { id: 'brown',   name: 'Brown',    nameZh: '棕色系' },
    { id: 'red',     name: 'Red',      nameZh: '红色系' },
    { id: 'orange',  name: 'Orange',   nameZh: '橙色系' },
    { id: 'yellow',  name: 'Yellow',   nameZh: '黄色系' },
    { id: 'green',   name: 'Green',    nameZh: '绿色系' },
    { id: 'cyan',    name: 'Cyan',     nameZh: '青色系' },
    { id: 'blue',    name: 'Blue',     nameZh: '蓝色系' },
    { id: 'purple',  name: 'Purple',   nameZh: '紫色系' },
    { id: 'pink',    name: 'Pink',     nameZh: '粉色系' },
  ]
}
