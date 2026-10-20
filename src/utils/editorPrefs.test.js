import { describe, it, expect, beforeEach } from 'vitest'
import {
  SETTINGS_KEY,
  DEFAULT_FILL_INCLUDE_EMPTY,
  loadFillIncludeEmpty,
  saveFillIncludeEmpty,
} from './editorPrefs'

/**
 * 编辑器偏好(选区填充「含空白格」开关)的持久化。
 *
 * 关键约束:
 *   - 默认必须是 false(规格 04 §2:默认不填空白);
 *   - 与 language / rememberMe 共用 bead_studio_settings,写回时不能冲掉其他字段;
 *   - 存储损坏或不可写时静默回退,不能抛异常打断编辑器。
 */

beforeEach(() => { localStorage.clear() })

describe('editorPrefs · fillIncludeEmpty', () => {
  it('没有存储时默认 false', () => {
    expect(DEFAULT_FILL_INCLUDE_EMPTY).toBe(false)
    expect(loadFillIncludeEmpty()).toBe(false)
  })

  it('保存后能读回', () => {
    saveFillIncludeEmpty(true)
    expect(loadFillIncludeEmpty()).toBe(true)
    saveFillIncludeEmpty(false)
    expect(loadFillIncludeEmpty()).toBe(false)
  })

  it('写回时保留 settings 里的其他字段(语言/记住登录)', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ language: 'ja-JP', rememberMe: false }))
    saveFillIncludeEmpty(true)

    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY))
    expect(saved.fillIncludeEmpty).toBe(true)
    expect(saved.language).toBe('ja-JP')
    expect(saved.rememberMe).toBe(false)
  })

  it('损坏的 JSON 回退默认值,不抛异常', () => {
    localStorage.setItem(SETTINGS_KEY, '{not json')
    expect(() => loadFillIncludeEmpty()).not.toThrow()
    expect(loadFillIncludeEmpty()).toBe(false)

    // 损坏状态下写入也应成功覆盖为合法 JSON
    saveFillIncludeEmpty(true)
    expect(loadFillIncludeEmpty()).toBe(true)
  })

  it('存储值类型不对(字符串/数字)时回退默认值', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fillIncludeEmpty: 'yes' }))
    expect(loadFillIncludeEmpty()).toBe(false)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fillIncludeEmpty: 1 }))
    expect(loadFillIncludeEmpty()).toBe(false)
  })
})
