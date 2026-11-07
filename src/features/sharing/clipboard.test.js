import { describe, it, expect } from 'vitest'
import { cardFileName } from './clipboard'

describe('cardFileName', () => {
  it('以作品名 + 固定后缀命名', () => {
    expect(cardFileName('小鸭')).toBe('小鸭-share-card.png')
  })

  it('去除文件系统非法字符与控制字符(替换为空格后收紧)', () => {
    expect(cardFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j-share-card.png')
    expect(cardFileName('a\u0000b')).toBe('a b-share-card.png')
  })

  it('空标题回退到默认名', () => {
    expect(cardFileName('')).toBe('share-card.png')
    expect(cardFileName('///')).toBe('share-card.png')
  })
})
