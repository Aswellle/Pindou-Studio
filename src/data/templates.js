// 预设模板数据
export const TEMPLATES = [
  {
    id: 1,
    nameKey: 'bear',
    size: 29,
    difficulty: 'easy',
    category: 'animal',
    colors: ['#8D6E63', '#A1887F', '#795548'],
    pattern: generateBearPattern()
  },
  {
    id: 2,
    nameKey: 'strawberry',
    size: 29,
    difficulty: 'easy',
    category: 'food',
    colors: ['#E53935', '#4CAF50', '#FFEB3B'],
    pattern: generateStrawberryPattern()
  },
  {
    id: 3,
    nameKey: 'heart',
    size: 29,
    difficulty: 'easy',
    category: 'icon',
    colors: ['#E53935', '#FF8A80'],
    pattern: generateHeartPattern()
  },
  {
    id: 4,
    nameKey: 'pikachu',
    size: 29,
    difficulty: 'hard',
    category: 'animal',
    colors: ['#FDD835', '#000000', '#E53935'],
    pattern: generatePikachuPattern()
  },
  {
    id: 5,
    nameKey: 'christmasTree',
    size: 29,
    difficulty: 'medium',
    category: 'holiday',
    colors: ['#32CD32', '#E53935', '#FDD835'],
    pattern: generateChristmasTreePattern()
  },
  {
    id: 6,
    nameKey: 'unicorn',
    size: 29,
    difficulty: 'hard',
    category: 'animal',
    colors: ['#F06292', '#BA68C8', '#FDD835'],
    pattern: generateUnicornPattern()
  },
  {
    id: 7,
    nameKey: 'burger',
    size: 29,
    difficulty: 'medium',
    category: 'food',
    colors: ['#FFB74D', '#8D6E63', '#4CAF50', '#E53935'],
    pattern: generateBurgerPattern()
  },
  {
    id: 8,
    nameKey: 'rainbow',
    size: 29,
    difficulty: 'easy',
    category: 'icon',
    colors: ['#E53935', '#FF9800', '#FDD835', '#4CAF50', '#1976D2'],
    pattern: generateRainbowPattern()
  }
]

// 生成小熊图案
function generateBearPattern() {
  const size = 29
  const grid = Array(size).fill(null).map(() => Array(size).fill(null))

  // 熊头
  const centerX = 14, centerY = 14, radius = 8
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
      if (dist < radius) {
        grid[y][x] = '#8D6E63'
      }
    }
  }

  // 耳朵
  for (let y = 4; y < 8; y++) {
    for (let x = 5; x < 9; x++) {
      grid[y][x] = '#8D6E63'
      grid[y + 1][x + 1] = '#A1887F'
    }
  }
  for (let y = 4; y < 8; y++) {
    for (let x = 20; x < 24; x++) {
      grid[y][x] = '#8D6E63'
      grid[y + 1][x - 1] = '#A1887F'
    }
  }

  // 眼睛
  grid[12][11] = '#000000'
  grid[12][17] = '#000000'

  // 鼻子
  grid[15][13] = '#795548'
  grid[15][14] = '#795548'
  grid[15][15] = '#795548'

  return grid
}

// 生成草莓图案
function generateStrawberryPattern() {
  const size = 29
  const grid = Array(size).fill(null).map(() => Array(size).fill(null))

  // 草莓主体
  for (let y = 8; y < 24; y++) {
    for (let x = 8; x < 21; x++) {
      const distX = (x - 14.5) / 6.5
      const distY = (y - 15) / 7
      if (distX * distX + distY * distY < 1) {
        grid[y][x] = '#E53935'
      }
    }
  }

  // 叶子
  for (let x = 11; x < 18; x++) {
    grid[7][x] = '#4CAF50'
    grid[6][x - 1] = '#4CAF50'
    grid[6][x + 1] = '#4CAF50'
  }

  // 草莓籽
  const seeds = [[11, 12], [14, 11], [17, 12], [10, 16], [13, 15], [16, 16], [19, 13], [12, 19], [15, 18], [18, 18]]
  seeds.forEach(([x, y]) => {
    if (y < size && x < size) grid[y][x] = '#FFEB3B'
  })

  return grid
}

// 生成爱心图案
function generateHeartPattern() {
  const size = 29
  const grid = Array(size).fill(null).map(() => Array(size).fill(null))

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x - 14.5) / 7
      const dy = (y - 10) / 8
      const val = dx * dx + dy * dy - 1
      if (val * val * val < dx * dx * dy * dy * dy) {
        if (y < 14) {
          grid[y][x] = '#E53935'
        } else {
          grid[y][x] = '#FF8A80'
        }
      }
    }
  }

  return grid
}

// 生成皮卡丘图案
function generatePikachuPattern() {
  const size = 29
  const grid = Array(size).fill(null).map(() => Array(size).fill(null))

  // 黄色身体
  for (let y = 8; y < 22; y++) {
    for (let x = 8; x < 21; x++) {
      const dx = (x - 14.5) / 6.5
      const dy = (y - 14) / 7
      if (dx * dx + dy * dy < 1) {
        grid[y][x] = '#FDD835'
      }
    }
  }

  // 耳朵
  grid[6][7] = '#FDD835'
  grid[5][8] = '#FDD835'
  grid[4][8] = '#000000'
  grid[6][21] = '#FDD835'
  grid[5][20] = '#FDD835'
  grid[4][20] = '#000000'

  // 眼睛
  grid[12][11] = '#000000'
  grid[12][17] = '#000000'

  // 脸颊
  grid[14][9] = '#E53935'
  grid[14][19] = '#E53935'

  // 嘴巴
  grid[17][13] = '#000000'
  grid[18][14] = '#000000'

  return grid
}

// 生成圣诞树图案
function generateChristmasTreePattern() {
  const size = 29
  const grid = Array(size).fill(null).map(() => Array(size).fill(null))

  // 树冠
  for (let y = 2; y < 18; y++) {
    const width = Math.min(y, 14)
    for (let x = 14 - width; x <= 14 + width; x++) {
      if (y < 8) {
        grid[y][x] = '#32CD32'
      } else if (y < 13) {
        grid[y][x] = '#228B22'
      } else {
        grid[y][x] = '#32CD32'
      }
    }
  }

  // 树干
  for (let y = 18; y < 24; y++) {
    for (let x = 12; x < 17; x++) {
      grid[y][x] = '#8D6E63'
    }
  }

  // 装饰
  const ornaments = [[5, 12], [5, 16], [10, 10], [10, 18], [15, 8], [15, 20]]
  ornaments.forEach(([y, x]) => {
    if (y < size && x < size) grid[y][x] = '#E53935'
  })

  // 星星
  grid[2][14] = '#FDD835'
  grid[1][13] = '#FDD835'
  grid[1][15] = '#FDD835'
  grid[3][13] = '#FDD835'
  grid[3][15] = '#FDD835'

  return grid
}

// 生成独角兽图案
function generateUnicornPattern() {
  const size = 29
  const grid = Array(size).fill(null).map(() => Array(size).fill(null))

  // 头部
  for (let y = 6; y < 20; y++) {
    for (let x = 8; x < 21; x++) {
      const dx = (x - 14.5) / 6.5
      const dy = (y - 13) / 7
      if (dx * dx + dy * dy < 1) {
        grid[y][x] = '#F8F8F8'
      }
    }
  }

  // 鬃毛
  for (let y = 6; y < 12; y++) {
    grid[y][18] = '#F06292'
    grid[y][19] = '#BA68C8'
    if (y < 10) grid[y][20] = '#FDD835'
  }

  // 角
  for (let y = 2; y < 8; y++) {
    grid[y][11] = '#FDD835'
    if (y < 6) grid[y + 1][10] = '#FDD835'
    if (y < 6) grid[y + 1][12] = '#FDD835'
  }

  // 眼睛
  grid[11][13] = '#BA68C8'
  grid[11][17] = '#BA68C8'

  // 脸颊
  grid[14][10] = '#F06292'
  grid[14][18] = '#F06292'

  return grid
}

// 生成汉堡图案
function generateBurgerPattern() {
  const size = 29
  const grid = Array(size).fill(null).map(() => Array(size).fill(null))

  // 上面包
  for (let y = 4; y < 10; y++) {
    for (let x = 6; x < 23; x++) {
      const dx = (x - 14.5) / 8
      const dy = (y - 7) / 3
      if (dx * dx + dy * dy < 1) {
        grid[y][x] = '#FFB74D'
      }
    }
  }

  // 生菜
  for (let y = 10; y < 13; y++) {
    for (let x = 5; x < 24; x++) {
      grid[y][x] = '#4CAF50'
    }
  }

  // 肉饼
  for (let y = 13; y < 17; y++) {
    for (let x = 6; x < 23; x++) {
      grid[y][x] = '#8D6E63'
    }
  }

  // 芝士
  for (let y = 17; y < 19; y++) {
    for (let x = 5; x < 24; x++) {
      grid[y][x] = '#FDD835'
    }
  }

  // 下面包
  for (let y = 19; y < 25; y++) {
    for (let x = 6; x < 23; x++) {
      const dx = (x - 14.5) / 8
      const dy = (y - 22) / 3
      if (dx * dx + dy * dy < 1) {
        grid[y][x] = '#FFB74D'
      }
    }
  }

  return grid
}

// 生成彩虹图案
function generateRainbowPattern() {
  const size = 29
  const grid = Array(size).fill(null).map(() => Array(size).fill(null))

  const colors = ['#E53935', '#FF9800', '#FDD835', '#4CAF50', '#1976D2']
  const centerY = 14

  colors.forEach((color, i) => {
    const topY = centerY - 12 + i * 2
    const bottomY = centerY + 12 - i * 2
    for (let y = topY; y <= bottomY; y++) {
      for (let x = 3; x < 26; x++) {
        if (y === topY || y === bottomY) {
          grid[y][x] = color
        }
      }
    }
  })

  return grid
}

export const CATEGORIES = ['all', 'animal', 'food', 'icon', 'holiday']
export const DIFFICULTIES = ['all', 'easy', 'medium', 'hard']
