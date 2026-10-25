import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import Tutorials from './Tutorials'
import i18n from '../i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})
afterEach(() => cleanup())

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

describe('Tutorials · 数据来源说明', () => {
  it('页脚显示来源说明,且排在正文与翻页按钮之后', async () => {
    render(<Tutorials />)
    await screen.findByText('0/18')

    const note = document.querySelector('.content-sources')
    expect(note).toBeTruthy()
    // 只概述来源性质,不带网址
    expect(note.textContent).toMatch(/Perler/)
    expect(note.textContent).not.toMatch(/https?:\/\/|www\./)

    // 位置:在 .content-footer 内、翻页按钮组之后 —— 下滑到文末才看得到
    const footer = document.querySelector('.content-footer')
    const navGroup = footer.querySelector('.nav-btn-group')
    expect(footer.contains(note)).toBe(true)
    expect(navGroup.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('四种语言都配置了来源说明', async () => {
    for (const lang of ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']) {
      await i18n.changeLanguage(lang)
      const text = i18n.t('tutorials.sources')
      expect(text, lang).not.toBe('tutorials.sources')
      expect(text.length, lang).toBeGreaterThan(20)
    }
    await i18n.changeLanguage('zh-CN')
  })
})

describe('Tutorials · 切换教程回到开头', () => {
  it('点击另一篇教程后,内容区滚动位置归零', async () => {
    render(<Tutorials />)
    await screen.findByText('0/18')

    const content = document.querySelector('.tutorials-content')
    expect(content).toBeTruthy()

    // 模拟已滑到文末
    content.scrollTop = 900
    expect(content.scrollTop).toBe(900)

    // 展开第二个章节并点开其中一篇
    fireEvent.click(screen.getByText('熨烫全解'))
    const link = await screen.findByText('双面熨烫')
    fireEvent.click(link)

    await waitFor(() => {
      expect(content.scrollTop).toBe(0)
    })
  })
})
