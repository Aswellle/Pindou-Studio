import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import i18n from '../i18n'
import VersionHistoryDialog from './VersionHistoryDialog'
import { appendVersion, listVersions, __resetForTests } from '../services/project/worksStore'
import { MAX_VERSIONS_PER_WORK } from '../services/project/workVersions'

/**
 * 版本时间线浮层。
 *
 * 重点覆盖验收要求里能自动化的部分:
 *   - 空态与有版本两种渲染;
 *   - 差异显示(珠子数变化);
 *   - 配额可见;
 *   - 回滚要经过确认,取消则不调用;
 *   - 回滚后重新拉取时间线(否则界面看起来没变化)。
 *
 * 真机键盘行为由 mobileOverlayContract.test.js 用源码断言覆盖。
 */

const R = '#E53935'
const G = '#43A047'

const work = { id: 'w-1', name: '测试作品', paletteId: 'perler', gridSize: 2 }

beforeEach(async () => {
  await i18n.changeLanguage('zh-CN')
  localStorage.clear()
  globalThis.indexedDB = new IDBFactory()
  __resetForTests()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const noopLoad = async () => ({ versions: [], bytes: 0 })

describe('VersionHistoryDialog · 渲染', () => {
  it('关闭时不渲染任何内容', () => {
    const { container } = render(
      <VersionHistoryDialog open={false} work={work} loadVersions={noopLoad} onRollback={vi.fn()} onClose={vi.fn()} />
    )
    expect(container.querySelector('.version-dialog')).toBeNull()
  })

  it('没有版本时显示空态提示', async () => {
    render(
      <VersionHistoryDialog open work={work} loadVersions={noopLoad} onRollback={vi.fn()} onClose={vi.fn()} />
    )
    expect(await screen.findByText('这件作品还没有历史版本')).toBeTruthy()
    expect(screen.getByText(/自动保存的草稿不计入/)).toBeTruthy()
  })

  it('有版本时列出时间、珠子数与用色数,最新的标为当前版本', async () => {
    await appendVersion({ workId: 'w-1', canvasData: [[R]], savedAt: '2026-10-20T00:00:00.000Z' })
    await appendVersion({ workId: 'w-1', canvasData: [[R, G]], savedAt: '2026-10-21T00:00:00.000Z' })

    render(
      <VersionHistoryDialog open work={work} loadVersions={listVersionsWithBytes} onRollback={vi.fn()} onClose={vi.fn()} />
    )

    expect(await screen.findByText('当前版本')).toBeTruthy()
    // 最新一版是 [[R, G]]:2 颗珠子、2 种颜色
    expect(screen.getByText('2 珠子')).toBeTruthy()
    expect(screen.getByText('2 用色')).toBeTruthy()
  })

  it('非当前版本显示与当前版本的珠子数差异', async () => {
    await appendVersion({ workId: 'w-1', canvasData: [[R]], savedAt: '2026-10-20T00:00:00.000Z' })
    await appendVersion({ workId: 'w-1', canvasData: [[R, G]], savedAt: '2026-10-21T00:00:00.000Z' })

    render(
      <VersionHistoryDialog open work={work} loadVersions={listVersionsWithBytes} onRollback={vi.fn()} onClose={vi.fn()} />
    )
    // 旧版 1 颗珠子,当前 2 颗 → 差 -1
    expect(await screen.findByText('珠子 -1')).toBeTruthy()
    expect(screen.getByText('改动 1 格')).toBeTruthy()
  })

  it('底部显示版本占用与保留上限', async () => {
    await appendVersion({ workId: 'w-1', canvasData: [[R]], savedAt: '2026-10-20T00:00:00.000Z' })

    render(
      <VersionHistoryDialog open work={work} loadVersions={listVersionsWithBytes} onRollback={vi.fn()} onClose={vi.fn()} />
    )
    expect(await screen.findByText(/版本占用约/)).toBeTruthy()
    expect(screen.getByText(new RegExp(`最近 ${MAX_VERSIONS_PER_WORK} 个版本`))).toBeTruthy()
  })
})

describe('VersionHistoryDialog · 回滚', () => {
  it('回滚前必须确认,取消则不调用 onRollback', async () => {
    await appendVersion({ workId: 'w-1', canvasData: [[R]], savedAt: '2026-10-20T00:00:00.000Z' })
    await appendVersion({ workId: 'w-1', canvasData: [[R, G]], savedAt: '2026-10-21T00:00:00.000Z' })
    const onRollback = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(
      <VersionHistoryDialog open work={work} loadVersions={listVersionsWithBytes} onRollback={onRollback} onClose={vi.fn()} />
    )

    const buttons = await screen.findAllByText('回滚到此版本')
    fireEvent.click(buttons[0])
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(onRollback).not.toHaveBeenCalled()
  })

  it('确认后调用 onRollback,并重新拉取时间线(回滚会产生新版本)', async () => {
    await appendVersion({ workId: 'w-1', canvasData: [[R]], savedAt: '2026-10-20T00:00:00.000Z' })
    await appendVersion({ workId: 'w-1', canvasData: [[R, G]], savedAt: '2026-10-21T00:00:00.000Z' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const onRollback = vi.fn(async () => ({ ...work }))
    const loadVersions = vi.fn(listVersionsWithBytes)

    render(
      <VersionHistoryDialog open work={work} loadVersions={loadVersions} onRollback={onRollback} onClose={vi.fn()} />
    )

    const buttons = await screen.findAllByText('回滚到此版本')
    fireEvent.click(buttons[0])

    await waitFor(() => expect(onRollback).toHaveBeenCalledTimes(1))
    // 初次加载 1 次 + 回滚后刷新 1 次
    await waitFor(() => expect(loadVersions).toHaveBeenCalledTimes(2))
  })

  it('回滚失败时提示,不静默吞掉', async () => {
    await appendVersion({ workId: 'w-1', canvasData: [[R]], savedAt: '2026-10-20T00:00:00.000Z' })
    await appendVersion({ workId: 'w-1', canvasData: [[R, G]], savedAt: '2026-10-21T00:00:00.000Z' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    render(
      <VersionHistoryDialog
        open
        work={work}
        loadVersions={listVersionsWithBytes}
        onRollback={vi.fn(async () => null)}
        onClose={vi.fn()}
      />
    )

    const buttons = await screen.findAllByText('回滚到此版本')
    fireEvent.click(buttons[0])

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('回滚失败，请稍后重试'))
  })
})

describe('VersionHistoryDialog · 关闭', () => {
  it('点关闭按钮触发 onClose', async () => {
    const onClose = vi.fn()
    render(
      <VersionHistoryDialog open work={work} loadVersions={noopLoad} onRollback={vi.fn()} onClose={onClose} />
    )
    fireEvent.click(await screen.findByLabelText('关闭'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('点遮罩空白处关闭', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <VersionHistoryDialog open work={work} loadVersions={noopLoad} onRollback={vi.fn()} onClose={onClose} />
    )
    fireEvent.click(container.ownerDocument.querySelector('.version-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('点面板内部不关闭', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <VersionHistoryDialog open work={work} loadVersions={noopLoad} onRollback={vi.fn()} onClose={onClose} />
    )
    fireEvent.click(container.ownerDocument.querySelector('.version-dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

/** 与 useSavedWorks.loadVersions 返回形状一致,组件测试直接用它 */
async function listVersionsWithBytes(workId) {
  const versions = await listVersions(workId)
  const bytes = versions.reduce((n, v) => n + JSON.stringify(v).length, 0)
  return { versions, bytes }
}
