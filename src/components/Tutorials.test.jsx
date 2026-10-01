import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import Tutorials from './Tutorials'
import i18n from '../i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

describe('Tutorials 页面(教程数据按语言异步加载)', () => {
  it('先渲染 loading 态,数据就绪后显示进度与章节目录', async () => {
    render(<Tutorials />)
    // 数据 chunk 未就绪时不白屏、不抛错(getByText 找不到会抛错)
    expect(screen.getByText('加载中...')).toBeTruthy()
    // 18 篇教程全部就绪后进度条文本出现(0/18),目录渲染第一个章节
    expect(await screen.findByText('0/18')).toBeTruthy()
    expect(screen.getAllByText('入门指南').length).toBeGreaterThan(0)
  })
})
