import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { IDBFactory } from 'fake-indexeddb'
import i18n from './i18n'
import App from './App'
import { loadDraft, saveDraft, __resetForTests as resetWorksStore } from './services/project/worksStore'

/**
 * 自动保存草稿在 App 层的接线(规格 03 §7)。
 *
 * 验收要点(来自 FUTURE_BACKLOG C1):
 *   - 自动保存**不得**产生历史记录;
 *   - 自动保存**不得**触发云端写入(本测试跑在本地模式,间接验证:
 *     草稿只出现在 IndexedDB 的 drafts,不进 works);
 *   - 关闭自动保存后行为与改造前一致;
 *   - 显式保存成功后清掉草稿,下次不再提示恢复。
 *
 * 用 Canvas 桩直接驱动画布内容,绕开真实指针交互 —— 这里要验证的是
 * 「画布变了之后发生了什么」,不是画布怎么响应指针。
 */

const { canvasProps, profileProps } = vi.hoisted(() => ({
  canvasProps: { current: null },
  profileProps: { current: null },
}))

vi.mock('./services/supabase', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, supabase: null, SUPABASE_URL: '', SUPABASE_DIRECT_URL: '', SUPABASE_PROXIED: false }
})

// 个人中心只需要把开关接出来,不必渲染整页(整页还依赖登录态与作品数据)
vi.mock('./components/ProfilePage', async () => {
  const React = await import('react')
  function MockProfilePage(props) {
    profileProps.current = props
    return React.createElement('div', { className: 'mock-profile' })
  }
  return { default: MockProfilePage }
})

vi.mock('./components/Canvas', async () => {
  const React = await import('react')
  const MockCanvas = React.forwardRef(function MockCanvas(props, ref) {
    canvasProps.current = props
    React.useImperativeHandle(ref, () => ({
      cancelStroke: () => {}, resetTransform: () => {}, fitToScreen: () => {},
    }))
    return React.createElement('div', { className: 'mock-canvas' })
  })
  return { default: MockCanvas }
})

function installMatchMedia() {
  const orig = window.matchMedia
  window.matchMedia = (query) => ({
    matches: true, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })
  return () => { window.matchMedia = orig }
}

let restoreMedia

beforeAll(async () => {
  window.scrollTo = () => {}
  await i18n.changeLanguage('zh-CN')
})

beforeEach(() => {
  localStorage.clear()
  globalThis.indexedDB = new IDBFactory()
  resetWorksStore()
  restoreMedia = installMatchMedia()
})

afterEach(() => {
  cleanup()
  restoreMedia()
  vi.useRealTimers()
})

function renderApp(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </MemoryRouter>
  )
}

/** 等首次渲染完成(画布已初始化) */
async function waitForCanvas() {
  await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())
}

describe('App · 自动保存草稿(规格 03 §7)', () => {
  it('启动时不提示恢复(没有草稿)', async () => {
    renderApp()
    await waitForCanvas()

    expect(document.body.querySelector('.draft-restore-dialog')).toBeNull()
  })

  it('本机有草稿时启动弹出恢复提示', async () => {
    await saveDraft({
      canvasData: [['#E53935', null], [null, null]],
      gridSize: 2,
      paletteId: 'perler',
      savedAt: '2026-10-23T09:00:00.000Z',
    })
    resetWorksStore()

    renderApp()
    await waitFor(() => expect(document.body.querySelector('.draft-restore-dialog')).toBeTruthy())
  })

  it('点「恢复」把草稿内容载入画布', async () => {
    await saveDraft({
      canvasData: [['#E53935', '#43A047'], [null, null]],
      gridSize: 2,
      paletteId: 'perler',
      savedAt: '2026-10-23T09:00:00.000Z',
    })
    resetWorksStore()

    renderApp()
    await waitFor(() => expect(document.body.querySelector('.draft-restore-dialog')).toBeTruthy())

    const restoreBtn = [...document.body.querySelectorAll('.draft-restore-actions button')]
      .find(b => b.textContent === i18n.t('autosave.restore'))
    await act(async () => { fireEvent.click(restoreBtn) })

    await waitFor(() => {
      expect(canvasProps.current.committedData[0][0]).toBe('#E53935')
      expect(canvasProps.current.committedData[0][1]).toBe('#43A047')
    })
    // 提示已消失
    expect(document.body.querySelector('.draft-restore-dialog')).toBeNull()
  })

  it('点「丢弃」清掉草稿,画布保持空白', async () => {
    await saveDraft({
      canvasData: [['#E53935', null], [null, null]],
      gridSize: 2,
      paletteId: 'perler',
      savedAt: '2026-10-23T09:00:00.000Z',
    })
    resetWorksStore()

    renderApp()
    await waitFor(() => expect(document.body.querySelector('.draft-restore-dialog')).toBeTruthy())

    const discardBtn = [...document.body.querySelectorAll('.draft-restore-actions button')]
      .find(b => b.textContent === i18n.t('autosave.discard'))
    await act(async () => { fireEvent.click(discardBtn) })

    await waitFor(() => expect(document.body.querySelector('.draft-restore-dialog')).toBeNull())
    await waitFor(async () => expect(await loadDraft()).toBeNull())
    // 画布没有被草稿污染
    expect(canvasProps.current.committedData[0][0]).toBeNull()
  })

  it('恢复草稿本身不算一次改动,不会立刻重写草稿', async () => {
    // 「恢复」是把已有内容搬回画布,不是用户新画的一笔。
    // 若不对齐基线,恢复后防抖会立刻再写一次同样的草稿 —— 时间戳被刷新,
    // 状态条还会闪一下「正在自动保存」,读起来像刚做了改动。
    const savedAt = '2026-10-23T09:00:00.000Z'
    await saveDraft({
      canvasData: [['#E53935', null], [null, null]],
      gridSize: 2,
      paletteId: 'perler',
      savedAt,
    })
    resetWorksStore()

    renderApp()
    await waitFor(() => expect(document.body.querySelector('.draft-restore-dialog')).toBeTruthy())

    const restoreBtn = [...document.body.querySelectorAll('.draft-restore-actions button')]
      .find(b => b.textContent === i18n.t('autosave.restore'))
    await act(async () => { fireEvent.click(restoreBtn) })
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))

    // 越过一个完整防抖窗口:基线已对齐 → 不该有新的写盘
    await act(async () => { await new Promise((r) => setTimeout(r, 2300)) })

    const after = await loadDraft()
    expect(after.savedAt).toBe(savedAt)
  })

  it('自动保存不产生历史记录(撤销栈不受影响)', async () => {
    renderApp()
    await waitForCanvas()

    // 先画一笔(一条历史),再等自动保存
    act(() => {
      canvasProps.current.onCanvasChange([['#E53935', null], [null, null]])
    })
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))

    // 等防抖窗口过去(2s)+ 写盘
    await act(async () => { await new Promise((r) => setTimeout(r, 2300)) })

    // 一次撤销应当回到空画布 —— 说明自动保存没有额外压栈
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBeNull())
  })

  it('关闭自动保存后不写草稿', async () => {
    localStorage.setItem('bead_studio_settings', JSON.stringify({ autoSave: false }))

    renderApp()
    await waitForCanvas()

    act(() => {
      canvasProps.current.onCanvasChange([['#E53935', null], [null, null]])
    })
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))

    await act(async () => { await new Promise((r) => setTimeout(r, 2300)) })

    expect(await loadDraft()).toBeNull()
  })

  it('显式保存成功后清掉草稿,下次不再提示恢复', async () => {
    renderApp()
    await waitForCanvas()

    // 画一笔并等自动保存落地
    act(() => {
      canvasProps.current.onCanvasChange([['#E53935', null], [null, null]])
    })
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))
    await act(async () => { await new Promise((r) => setTimeout(r, 2300)) })
    await waitFor(async () => expect(await loadDraft()).not.toBeNull())

    // 走真实保存流程:Header 保存按钮 → 弹层 → 确认
    const saveBtn = document.body.querySelector(`button[aria-label="${i18n.t('gallery.saveTitle')}"]`)
    expect(saveBtn).toBeTruthy()
    await act(async () => { fireEvent.click(saveBtn) })
    await waitFor(() => expect(document.body.querySelector('.save-dialog')).toBeTruthy())

    const confirmBtn = [...document.body.querySelectorAll('.save-dialog-actions button')]
      .find(b => b.textContent === i18n.t('gallery.saveConfirm'))
    await act(async () => { fireEvent.click(confirmBtn) })

    // 草稿被清掉 —— 内容已经正式存进作品库,再提示「恢复未保存的修改」只会让人困惑
    await waitFor(async () => expect(await loadDraft()).toBeNull())
  })

  it('个人中心关掉自动保存后,创作页立刻停止写草稿', async () => {
    // 开关必须是同一份状态:个人中心只是它的一个入口,不是第二个数据源。
    // 若两处各持一份 useState,关掉后当前会话仍会继续写草稿 —— 用户以为关了。
    renderApp(['/profile'])
    await waitFor(() => expect(profileProps.current).toBeTruthy())

    expect(profileProps.current.autoSaveEnabled).toBe(true)
    act(() => { profileProps.current.onToggleAutoSave(false) })
    await waitFor(() => expect(profileProps.current.autoSaveEnabled).toBe(false))

    // 回到创作页画一笔:已经关了,不该落草稿
    act(() => {
      canvasProps.current.onCanvasChange([['#E53935', null], [null, null]])
    })
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))

    await act(async () => { await new Promise((r) => setTimeout(r, 2300)) })

    expect(await loadDraft()).toBeNull()
  })
})
