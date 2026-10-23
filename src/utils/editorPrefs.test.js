import { describe, it, expect, beforeEach } from 'vitest'
import {
  SETTINGS_KEY,
  DEFAULT_FILL_INCLUDE_EMPTY,
  loadFillIncludeEmpty,
  saveFillIncludeEmpty,
  DEFAULT_DEDUCT_INVENTORY,
  loadDeductInventory,
  saveDeductInventory,
  DEFAULT_AUTO_SAVE,
  loadAutoSaveEnabled,
  saveAutoSaveEnabled,
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

describe('editorPrefs · deductInventory(导出后扣减库存)', () => {
  it('默认关闭(规格 05 §3:必须用户显式开启)', () => {
    expect(DEFAULT_DEDUCT_INVENTORY).toBe(false)
    expect(loadDeductInventory()).toBe(false)
  })

  it('保存后能读回,且不冲掉其他偏好', () => {
    saveFillIncludeEmpty(true)
    saveDeductInventory(true)
    expect(loadDeductInventory()).toBe(true)
    // 两个偏好互不覆盖
    expect(loadFillIncludeEmpty()).toBe(true)
  })

  it('类型不对时回退默认值', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ deductInventory: 'true' }))
    expect(loadDeductInventory()).toBe(false)
  })
})

describe('editorPrefs · autoSave(自动保存草稿)', () => {
  it('默认开启 —— 默认关闭等于没有这个功能', () => {
    expect(DEFAULT_AUTO_SAVE).toBe(true)
    expect(loadAutoSaveEnabled()).toBe(true)
  })

  it('保存后能读回,且不冲掉其他偏好', () => {
    saveFillIncludeEmpty(true)
    saveDeductInventory(true)
    saveAutoSaveEnabled(false)

    expect(loadAutoSaveEnabled()).toBe(false)
    expect(loadFillIncludeEmpty()).toBe(true)
    expect(loadDeductInventory()).toBe(true)
  })

  it('类型不对时回退默认值(true,而不是 false)', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ autoSave: 'false' }))
    expect(loadAutoSaveEnabled()).toBe(true)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ autoSave: 0 }))
    expect(loadAutoSaveEnabled()).toBe(true)
  })

  it('存储损坏时回退默认值,不抛异常', () => {
    localStorage.setItem(SETTINGS_KEY, '{broken')
    expect(() => loadAutoSaveEnabled()).not.toThrow()
    expect(loadAutoSaveEnabled()).toBe(true)
  })
})
