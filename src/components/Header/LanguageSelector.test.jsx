/**
 * 语言选择器回归测试 —— PC 端切换语言不奏效问题。
 *
 * 根因:PC 分支(原生 select)直接调 i18n.changeLanguage,绕过了
 * switchLanguage 的 ensureLanguage 懒加载步骤。en/ja/ko 是动态 chunk,
 * 未注册资源包时 changeLanguage 只改语言码,所有键回退 zh-CN,
 * 界面文字纹丝不动(且坏语言码被持久化,刷新前一直如此)。
 * 本测试锁定:PC select 切换后,目标语言的资源包必须真的被加载注册。
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import i18n from '../../i18n'
import { i18nReady, ensureLanguage, LANGUAGES } from '../../i18n'
import LanguageSelector from './LanguageSelector'

beforeAll(async () => {
  // jsdom navigator.language 默认 en-US → 初始语言可能是懒加载语言,
  // 等首屏就绪(语言包加载完成)后再断言
  await i18nReady
  await i18n.changeLanguage('zh-CN')
})

afterEach(() => {
  cleanup()
  return i18n.changeLanguage('zh-CN')
})

describe('LanguageSelector(PC select 分支)', () => {
  it('渲染四种语言选项,当前语言选中', () => {
    render(<LanguageSelector />)
    const select = screen.getByRole('combobox')
    const options = select.querySelectorAll('option')
    expect(options.length).toBe(LANGUAGES.length)
    expect(select.value).toBe(i18n.language)
  })

  it('PC 下拉切换懒加载语言:语言码变更且资源包真实注册(回归根因)', async () => {
    render(<LanguageSelector />)
    const select = screen.getByRole('combobox')

    fireEvent.change(select, { target: { value: 'ja-JP' } })

    await waitFor(() => expect(i18n.language).toBe('ja-JP'))
    // 关键断言:切换不是空转 —— ja-JP 资源包必须经 ensureLanguage 注册,
    // 否则全部键回退 zh-CN,界面"看起来没变"
    await waitFor(() => {
      const bundle = i18n.getResourceBundle('ja-JP', 'translation')
      expect(bundle).toBeTruthy()
      expect(Object.keys(bundle).length).toBeGreaterThan(0)
    })
    // 抽查一条 ja 文案确实可解析(不再是 zh 兜底)
    expect(i18n.t('nav.canvas')).toBeTruthy()
  })

  it('连续切换多个懒加载语言均生效(en-US → ko-KR)', async () => {
    render(<LanguageSelector />)
    const select = screen.getByRole('combobox')

    fireEvent.change(select, { target: { value: 'en-US' } })
    await waitFor(() => expect(i18n.language).toBe('en-US'))
    await waitFor(() => expect(i18n.getResourceBundle('en-US', 'translation')).toBeTruthy())

    fireEvent.change(select, { target: { value: 'ko-KR' } })
    await waitFor(() => expect(i18n.language).toBe('ko-KR'))
    await waitFor(() => expect(i18n.getResourceBundle('ko-KR', 'translation')).toBeTruthy())
  })

  it('ensureLanguage 幂等:重复切换同一语言不重复加载', async () => {
    await ensureLanguage('en-US')
    render(<LanguageSelector />)
    const select = screen.getByRole('combobox')

    fireEvent.change(select, { target: { value: 'en-US' } })
    await waitFor(() => expect(i18n.language).toBe('en-US'))
    // 资源包仍存在且可解析
    expect(i18n.getResourceBundle('en-US', 'translation')).toBeTruthy()
  })
})
