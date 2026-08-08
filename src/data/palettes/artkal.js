// Artkal Beads - Mini (2.6mm) solid colors with calibrated RGB values
// C-series solid colors, RGB values represent actual plastic bead pigmentation
export const ARTKAL_PALETTE = {
  id: 'artkal',
  name: 'Artkal Beads',
  nameZh: 'Artkal 拼豆',
  origin: '中国',
  beadSize: 2.6,
  beadSizeLabel: '细颗粒 (2.6mm)',
  colorCount: 100,
  website: 'https://www.artkal.com',

  colors: [
    // --- Neutrals ---
    { id: 'C01', name: 'White',          nameZh: '白色',     hex: '#F8F8F8', rgb: { r: 248, g: 248, b: 248 }, category: 'neutral' },
    { id: 'C02', name: 'Off-White',      nameZh: '米白色',   hex: '#F6E8BC', rgb: { r: 246, g: 232, b: 188 }, category: 'neutral' },
    { id: 'C03', name: 'Black',          nameZh: '黑色',     hex: '#0E0E0E', rgb: { r: 14,  g: 14,  b: 14  }, category: 'neutral' },
    { id: 'C04', name: 'Charcoal',       nameZh: '炭灰色',   hex: '#383838', rgb: { r: 56,  g: 56,  b: 56  }, category: 'neutral' },
    { id: 'C05', name: 'Dark Gray',      nameZh: '深灰色',   hex: '#545454', rgb: { r: 84,  g: 84,  b: 84  }, category: 'neutral' },
    { id: 'C06', name: 'Gray',           nameZh: '灰色',     hex: '#949494', rgb: { r: 148, g: 148, b: 148 }, category: 'neutral' },
    { id: 'C07', name: 'Light Gray',     nameZh: '浅灰色',   hex: '#C0C0C0', rgb: { r: 192, g: 192, b: 192 }, category: 'neutral' },

    // --- Browns & Skins ---
    { id: 'C08', name: 'Dark Brown',     nameZh: '深棕色',   hex: '#4E2A14', rgb: { r: 78,  g: 42,  b: 20  }, category: 'brown'   },
    { id: 'C09', name: 'Brown',          nameZh: '棕色',     hex: '#764422', rgb: { r: 118, g: 68,  b: 34  }, category: 'brown'   },
    { id: 'C10', name: 'Cinnamon',       nameZh: '肉桂色',   hex: '#985432', rgb: { r: 152, g: 84,  b: 50  }, category: 'brown'   },
    { id: 'C11', name: 'Rust',           nameZh: '锈红色',   hex: '#A23A22', rgb: { r: 162, g: 58,  b: 34  }, category: 'brown'   },
    { id: 'C12', name: 'Caramel',        nameZh: '焦糖色',   hex: '#A46432', rgb: { r: 164, g: 100, b: 50  }, category: 'brown'   },
    { id: 'C13', name: 'Tan',            nameZh: '棕褐色',   hex: '#C29870', rgb: { r: 194, g: 152, b: 112 }, category: 'brown'   },
    { id: 'C14', name: 'Sand',           nameZh: '沙色',     hex: '#DCC098', rgb: { r: 220, g: 192, b: 152 }, category: 'brown'   },
    { id: 'C15', name: 'Peach',          nameZh: '桃色',     hex: '#F2B088', rgb: { r: 242, g: 176, b: 136 }, category: 'skin'    },
    { id: 'C16', name: 'Flesh',          nameZh: '肤色',     hex: '#E4A272', rgb: { r: 228, g: 162, b: 114 }, category: 'skin'    },
    { id: 'C17', name: 'Copper',         nameZh: '铜色',     hex: '#B07844', rgb: { r: 176, g: 120, b: 68  }, category: 'brown'   },

    // --- Yellows & Oranges ---
    { id: 'C18', name: 'Butterscotch',   nameZh: '奶油糖',   hex: '#DAA43C', rgb: { r: 218, g: 164, b: 60  }, category: 'yellow'  },
    { id: 'C19', name: 'Golden',         nameZh: '金色',     hex: '#C69628', rgb: { r: 198, g: 150, b: 40  }, category: 'yellow'  },
    { id: 'C20', name: 'Honey',          nameZh: '蜂蜜色',   hex: '#D0A22C', rgb: { r: 208, g: 162, b: 44  }, category: 'yellow'  },
    { id: 'C21', name: 'Cheddar',        nameZh: '切达黄',   hex: '#E49418', rgb: { r: 228, g: 148, b: 24  }, category: 'yellow'  },
    { id: 'C22', name: 'Corn',           nameZh: '玉米黄',   hex: '#F8D654', rgb: { r: 248, g: 214, b: 84  }, category: 'yellow'  },
    { id: 'C23', name: 'Yellow',         nameZh: '黄色',     hex: '#FCD800', rgb: { r: 252, g: 216, b: 0   }, category: 'yellow'  },
    { id: 'C24', name: 'Lemon',          nameZh: '柠檬色',   hex: '#FFEE58', rgb: { r: 255, g: 238, b: 88  }, category: 'yellow'  },
    { id: 'C25', name: 'Light Yellow',   nameZh: '浅黄色',   hex: '#FAEE98', rgb: { r: 250, g: 238, b: 152 }, category: 'yellow'  },
    { id: 'C26', name: 'Dark Orange',    nameZh: '深橙色',   hex: '#DA5218', rgb: { r: 218, g: 82,  b: 24  }, category: 'orange'  },
    { id: 'C27', name: 'Orange',         nameZh: '橙色',     hex: '#F26C1C', rgb: { r: 242, g: 108, b: 28  }, category: 'orange'  },

    // --- Reds ---
    { id: 'C28', name: 'Bittersweet',    nameZh: '苦甜色',   hex: '#BE4430', rgb: { r: 190, g: 68,  b: 48  }, category: 'red'     },
    { id: 'C29', name: 'Orange Red',     nameZh: '橙红色',   hex: '#E44A34', rgb: { r: 228, g: 74,  b: 52  }, category: 'red'     },
    { id: 'C30', name: 'Dark Red',       nameZh: '深红色',   hex: '#941A1E', rgb: { r: 148, g: 26,  b: 30  }, category: 'red'     },
    { id: 'C31', name: 'Red',            nameZh: '红色',     hex: '#C82024', rgb: { r: 200, g: 32,  b: 36  }, category: 'red'     },
    { id: 'C32', name: 'Maroon',         nameZh: '栗红色',   hex: '#781818', rgb: { r: 120, g: 24,  b: 24  }, category: 'red'     },
    { id: 'C33', name: 'Wine',           nameZh: '酒红色',   hex: '#8E2032', rgb: { r: 142, g: 32,  b: 50  }, category: 'red'     },

    // --- Pinks & Magentas ---
    { id: 'C34', name: 'Magenta',        nameZh: '品红色',   hex: '#CE267C', rgb: { r: 206, g: 38,  b: 124 }, category: 'pink'    },
    { id: 'C35', name: 'Hot Pink',       nameZh: '亮粉色',   hex: '#E2387A', rgb: { r: 226, g: 56,  b: 122 }, category: 'pink'    },
    { id: 'C36', name: 'Deep Pink',      nameZh: '深粉色',   hex: '#C43266', rgb: { r: 196, g: 50,  b: 102 }, category: 'pink'    },
    { id: 'C37', name: 'Pink',           nameZh: '粉色',     hex: '#F4769C', rgb: { r: 244, g: 118, b: 156 }, category: 'pink'    },
    { id: 'C38', name: 'Flamingo',       nameZh: '火烈鸟粉', hex: '#F098AA', rgb: { r: 240, g: 152, b: 170 }, category: 'pink'    },
    { id: 'C39', name: 'Blush',          nameZh: '腮红色',   hex: '#EEBEC4', rgb: { r: 238, g: 190, b: 196 }, category: 'pink'    },
    { id: 'C40', name: 'Light Pink',     nameZh: '浅粉色',   hex: '#F8BECA', rgb: { r: 248, g: 190, b: 202 }, category: 'pink'    },

    // --- Purples ---
    { id: 'C41', name: 'Dark Purple',    nameZh: '深紫色',   hex: '#602268', rgb: { r: 96,  g: 34,  b: 104 }, category: 'purple'  },
    { id: 'C42', name: 'Purple',         nameZh: '紫色',     hex: '#842C88', rgb: { r: 132, g: 44,  b: 136 }, category: 'purple'  },
    { id: 'C43', name: 'Light Purple',   nameZh: '浅紫色',   hex: '#AA70B2', rgb: { r: 170, g: 112, b: 178 }, category: 'purple'  },
    { id: 'C44', name: 'Lavender',       nameZh: '薰衣草',   hex: '#C4AAD2', rgb: { r: 196, g: 170, b: 210 }, category: 'purple'  },
    { id: 'C45', name: 'Lilac',          nameZh: '丁香紫',   hex: '#B49AC8', rgb: { r: 180, g: 154, b: 200 }, category: 'purple'  },

    // --- Blues ---
    { id: 'C46', name: 'Navy',           nameZh: '海军蓝',   hex: '#122278', rgb: { r: 18,  g: 34,  b: 120 }, category: 'blue'    },
    { id: 'C47', name: 'Dark Blue',      nameZh: '深蓝色',   hex: '#183682', rgb: { r: 24,  g: 54,  b: 130 }, category: 'blue'    },
    { id: 'C48', name: 'Royal Blue',     nameZh: '皇室蓝',   hex: '#2C50AC', rgb: { r: 44,  g: 80,  b: 172 }, category: 'blue'    },
    { id: 'C49', name: 'Blue',           nameZh: '蓝色',     hex: '#1E5EA2', rgb: { r: 30,  g: 94,  b: 162 }, category: 'blue'    },
    { id: 'C50', name: 'Periwinkle',     nameZh: '长春花色', hex: '#6C86C4', rgb: { r: 108, g: 134, b: 196 }, category: 'blue'    },
    { id: 'C51', name: 'Sky Blue',       nameZh: '天蓝色',   hex: '#589AC8', rgb: { r: 88,  g: 154, b: 200 }, category: 'blue'    },
    { id: 'C52', name: 'Baby Blue',      nameZh: '婴儿蓝',   hex: '#84BEDC', rgb: { r: 132, g: 190, b: 220 }, category: 'blue'    },
    { id: 'C53', name: 'Pastel Blue',    nameZh: '粉蓝色',   hex: '#9ECAE2', rgb: { r: 158, g: 202, b: 226 }, category: 'blue'    },
    { id: 'C54', name: 'Light Blue',     nameZh: '浅蓝色',   hex: '#B2DAEA', rgb: { r: 178, g: 218, b: 234 }, category: 'blue'    },

    // --- Cyans & Teals ---
    { id: 'C55', name: 'Cyan',           nameZh: '青色',     hex: '#26B2C6', rgb: { r: 38,  g: 178, b: 198 }, category: 'cyan'    },
    { id: 'C56', name: 'Aqua',           nameZh: '水色',     hex: '#58BAC2', rgb: { r: 88,  g: 186, b: 194 }, category: 'cyan'    },
    { id: 'C57', name: 'Turquoise',      nameZh: '绿松石',   hex: '#1AA2B8', rgb: { r: 26,  g: 162, b: 184 }, category: 'cyan'    },
    { id: 'C58', name: 'Teal',           nameZh: '水鸭色',   hex: '#1A9290', rgb: { r: 26,  g: 146, b: 144 }, category: 'cyan'    },
    { id: 'C59', name: 'Dark Teal',      nameZh: '深水鸭色', hex: '#14646C', rgb: { r: 20,  g: 100, b: 108 }, category: 'cyan'    },
    { id: 'C60', name: 'Mermaid Blue',   nameZh: '美人鱼蓝', hex: '#26788A', rgb: { r: 38,  g: 120, b: 138 }, category: 'cyan'    },
    { id: 'C61', name: 'Mint',           nameZh: '薄荷色',   hex: '#A2D2C4', rgb: { r: 162, g: 210, b: 196 }, category: 'cyan'    },

    // --- Greens ---
    { id: 'C62', name: 'Dark Green',     nameZh: '深绿色',   hex: '#145A2C', rgb: { r: 20,  g: 90,  b: 44  }, category: 'green'   },
    { id: 'C63', name: 'Forest Green',   nameZh: '森林绿',   hex: '#247034', rgb: { r: 36,  g: 112, b: 52  }, category: 'green'   },
    { id: 'C64', name: 'Green',          nameZh: '绿色',     hex: '#2C8E3A', rgb: { r: 44,  g: 142, b: 58  }, category: 'green'   },
    { id: 'C65', name: 'Shamrock',       nameZh: '三叶草绿', hex: '#288640', rgb: { r: 40,  g: 134, b: 64  }, category: 'green'   },
    { id: 'C66', name: 'Bright Green',   nameZh: '亮绿色',   hex: '#3AA830', rgb: { r: 58,  g: 168, b: 48  }, category: 'green'   },
    { id: 'C67', name: 'Lime Green',     nameZh: '青柠绿',   hex: '#74BC38', rgb: { r: 116, g: 188, b: 56  }, category: 'green'   },
    { id: 'C68', name: 'Light Green',    nameZh: '浅绿色',   hex: '#9ECE8C', rgb: { r: 158, g: 206, b: 140 }, category: 'green'   },
    { id: 'C69', name: 'Pastel Green',   nameZh: '粉绿色',   hex: '#A8D298', rgb: { r: 168, g: 210, b: 152 }, category: 'green'   },
    { id: 'C70', name: 'Fern',           nameZh: '蕨绿',     hex: '#508A3A', rgb: { r: 80,  g: 138, b: 58  }, category: 'green'   },
    { id: 'C71', name: 'Artichoke',      nameZh: '朝鲜蓟绿', hex: '#748440', rgb: { r: 116, g: 132, b: 64  }, category: 'green'   },
    { id: 'C72', name: 'Olive',          nameZh: '橄榄色',   hex: '#6A762C', rgb: { r: 106, g: 118, b: 44  }, category: 'green'   },

    // ── 深肤色系（Dark Skin Tones）────────────────────────────────────
    { id: 'C73', name: 'Deep Tan',       nameZh: '深棕肤',   hex: '#9C7056', rgb: { r: 156, g: 112, b: 86  }, category: 'skin'    },
    { id: 'C74', name: 'Mahogany',       nameZh: '桃花心木', hex: '#70442C', rgb: { r: 112, g:  68, b: 44  }, category: 'skin'    },
    { id: 'C75', name: 'Sepia',          nameZh: '棕褐色',   hex: '#8C6044', rgb: { r: 140, g:  96, b: 68  }, category: 'skin'    },

    // ── 莫兰迪色系（Muted / Dusty）────────────────────────────────────
    { id: 'C76', name: 'Dusty Rose',     nameZh: '雾霾玫瑰', hex: '#C49494', rgb: { r: 196, g: 148, b: 148 }, category: 'pink'    },
    { id: 'C77', name: 'Dusty Blue',     nameZh: '雾蓝',     hex: '#94ACBC', rgb: { r: 148, g: 172, b: 188 }, category: 'blue'    },
    { id: 'C78', name: 'Sage Dust',      nameZh: '鼠尾草灰', hex: '#A2B094', rgb: { r: 162, g: 176, b: 148 }, category: 'green'   },
    { id: 'C79', name: 'Greige',         nameZh: '灰米色',   hex: '#BAAE9A', rgb: { r: 186, g: 174, b: 154 }, category: 'neutral' },

    // ── 霓虹色系（Neon）────────────────────────────────────────────────
    { id: 'C80', name: 'Neon Pink',      nameZh: '霓虹粉',   hex: '#FF4082', rgb: { r: 255, g:  64, b: 130 }, category: 'pink'    },
    { id: 'C81', name: 'Neon Yellow',    nameZh: '霓虹黄',   hex: '#F5F01E', rgb: { r: 245, g: 240, b:  30 }, category: 'yellow'  },
    { id: 'C82', name: 'Neon Green',     nameZh: '霓虹绿',   hex: '#78F050', rgb: { r: 120, g: 240, b:  80 }, category: 'green'   },
    { id: 'C83', name: 'Neon Orange',    nameZh: '霓虹橙',   hex: '#FF6E1E', rgb: { r: 255, g: 110, b:  30 }, category: 'orange'  },

    // ── 渐变过渡色（Pastel）────────────────────────────────────────────
    { id: 'C84', name: 'Baby Pink',      nameZh: '婴儿粉',   hex: '#F4C8D2', rgb: { r: 244, g: 200, b: 210 }, category: 'pink'    },
    { id: 'C85', name: 'Baby Yellow',    nameZh: '婴儿黄',   hex: '#FAEAB0', rgb: { r: 250, g: 234, b: 176 }, category: 'yellow'  },
    { id: 'C86', name: 'Mint Cream',     nameZh: '薄荷奶油', hex: '#DCF0D8', rgb: { r: 220, g: 240, b: 216 }, category: 'green'   },
    { id: 'C87', name: 'Lavender Mist',  nameZh: '薰衣草雾', hex: '#DCD2E8', rgb: { r: 220, g: 210, b: 232 }, category: 'purple'  },
    { id: 'C88', name: 'Sky Mist',       nameZh: '天空雾',   hex: '#D8E6F0', rgb: { r: 216, g: 230, b: 240 }, category: 'blue'    },

    // ── 深色互补（Dark Accents）────────────────────────────────────────
    { id: 'C89', name: 'Burgundy',       nameZh: '酒红色',   hex: '#781E30', rgb: { r: 120, g:  30, b:  48 }, category: 'red'     },
    { id: 'C90', name: 'Forest Shadow',  nameZh: '森林影',   hex: '#1C422A', rgb: { r:  28, g:  66, b:  42 }, category: 'green'   },
    { id: 'C91', name: 'Midnight',       nameZh: '午夜蓝',   hex: '#121838', rgb: { r:  18, g:  24, b:  56 }, category: 'blue'    },
    { id: 'C92', name: 'Espresso',       nameZh: '浓缩咖啡', hex: '#342218', rgb: { r:  52, g:  34, b:  24 }, category: 'brown'   },

    // ── 明亮互补（Brights）────────────────────────────────────────────
    { id: 'C93', name: 'Coral Punch',    nameZh: '亮珊瑚',   hex: '#FF7C64', rgb: { r: 255, g: 124, b: 100 }, category: 'red'     },
    { id: 'C94', name: 'Electric Blue',  nameZh: '电蓝',     hex: '#008CF0', rgb: { r:   0, g: 140, b: 240 }, category: 'blue'    },
    { id: 'C95', name: 'Emerald',        nameZh: '翡翠绿',   hex: '#00A878', rgb: { r:   0, g: 168, b: 120 }, category: 'green'   },
    { id: 'C96', name: 'Amethyst',       nameZh: '紫水晶',   hex: '#945CBC', rgb: { r: 148, g:  92, b: 188 }, category: 'purple'  },

    // ── 金属/闪光系（Metallic）────────────────────────────────────────
    { id: 'C97',  name: 'Silver Glitter', nameZh: '银闪',   hex: '#C8C8CC', rgb: { r: 200, g: 200, b: 204 }, category: 'neutral' },
    { id: 'C98',  name: 'Gold Shimmer',   nameZh: '金亮',   hex: '#D8B460', rgb: { r: 216, g: 180, b:  96 }, category: 'yellow'  },
    { id: 'C99',  name: 'Rose Gold',      nameZh: '玫瑰金', hex: '#DC9890', rgb: { r: 220, g: 152, b: 144 }, category: 'pink'    },
    { id: 'C100', name: 'Champagne',      nameZh: '香槟色', hex: '#E2D0AC', rgb: { r: 226, g: 208, b: 172 }, category: 'neutral' },
  ],

  categories: [
    { id: 'neutral', name: 'Neutral', nameZh: '中性色', count: 11 },
    { id: 'brown',   name: 'Brown',   nameZh: '棕色系', count: 9  },
    { id: 'skin',    name: 'Skin',    nameZh: '肤色系', count: 5  },
    { id: 'yellow',  name: 'Yellow',  nameZh: '黄色系', count: 10 },
    { id: 'orange',  name: 'Orange',  nameZh: '橙色系', count: 3  },
    { id: 'red',     name: 'Red',     nameZh: '红色系', count: 8  },
    { id: 'pink',    name: 'Pink',    nameZh: '粉色系', count: 12 },
    { id: 'purple',  name: 'Purple',  nameZh: '紫色系', count: 7  },
    { id: 'blue',    name: 'Blue',    nameZh: '蓝色系', count: 13 },
    { id: 'cyan',    name: 'Cyan',    nameZh: '青色系', count: 7  },
    { id: 'green',   name: 'Green',   nameZh: '绿色系', count: 15 },
  ]
}
