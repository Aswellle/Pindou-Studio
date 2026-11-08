/**
 * ShareReports 组件测试:举报列表加载、状态筛选、处置动作与失败路径。
 *
 * mock 层级:supabase.rpc 直接打桩 —— 组件只依赖 admin_list_work_share_reports /
 * admin_resolve_work_share_report / admin_restore_work_share 三个 RPC。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import ToastProvider from './Toast'

const rpc = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: { rpc: (...args) => rpc(...args) },
  toStorageUrl: url => url,
}))

const { default: ShareReports } = await import('./ShareReports')

const received = row => ({
  id: 'r1',
  share_id: 's1',
  category: 'copyright',
  detail: '这个分享侵犯了我的版权',
  contact: 'reporter@example.com',
  status: 'received',
  created_at: '2026-11-08T02:00:00Z',
  share_title: '雪景小屋',
  share_status: 'published',
  share_author: '拼豆创作者',
  share_grid_width: 9,
  share_grid_height: 9,
  ...row,
})

const renderPanel = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <ShareReports />
      </ToastProvider>
    </MemoryRouter>
  )

beforeEach(async () => {
  await i18n.changeLanguage('zh-CN')
  rpc.mockReset()
  rpc.mockResolvedValue({ data: [], error: null })
})

afterEach(cleanup)

describe('ShareReports 列表加载', () => {
  it('挂载后拉取全部举报并渲染字段', async () => {
    rpc.mockResolvedValue({ data: [received()], error: null })
    renderPanel()
    await waitFor(() => expect(screen.getByText('这个分享侵犯了我的版权')).toBeTruthy())
    expect(rpc).toHaveBeenCalledWith('admin_list_work_share_reports', { p_status: 'all', p_limit: 200 })
    expect(screen.getByText('雪景小屋')).toBeTruthy()
    expect(screen.getByText(/reporter@example\.com/)).toBeTruthy()
    // 类别复用分享页的举报类别文案
    expect(screen.getByText('版权 / 商标')).toBeTruthy()
  })

  it('切换筛选按状态重新拉取', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByRole('tab', { name: /待处理/ })).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: /已成立/ }))
    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith('admin_list_work_share_reports', {
        p_status: 'actioned',
        p_limit: 200,
      })
    )
  })

  it('空列表显示空态', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('暂无举报记录')).toBeTruthy())
  })

  it('RPC 失败显示错误与重试入口', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    renderPanel()
    await waitFor(() => expect(screen.getByText(/boom/)).toBeTruthy())
    expect(screen.queryByText('暂无举报记录')).toBeNull()
  })
})

describe('ShareReports 处置动作', () => {
  it('待处理行提供 受理中/成立/驳回 三个操作;受理直接执行', async () => {
    rpc.mockResolvedValue({ data: [received()], error: null })
    renderPanel()
    await waitFor(() => expect(screen.getByText('开始受理')).toBeTruthy())

    fireEvent.click(screen.getByText('开始受理'))
    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith('admin_resolve_work_share_report', {
        p_report_id: 'r1',
        p_action: 'reviewing',
        p_reason: '',
      })
    )
    // 成功后重新拉列表
    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith('admin_list_work_share_reports', { p_status: 'all', p_limit: 200 })
    )
  })

  it('成立必须填理由:空理由无法提交,填后调用 actioned', async () => {
    rpc.mockResolvedValue({ data: [received()], error: null })
    renderPanel()
    await waitFor(() => expect(screen.getByText('标记成立并冻结')).toBeTruthy())

    fireEvent.click(screen.getByText('标记成立并冻结'))
    // 理由模态框:空理由禁用确认
    const confirm = await waitFor(() => screen.getByRole('button', { name: '确认' }))
    expect(confirm.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('处置理由'), {
      target: { value: '核实后确认侵犯版权' },
    })
    expect(screen.getByRole('button', { name: '确认' }).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith('admin_resolve_work_share_report', {
        p_report_id: 'r1',
        p_action: 'actioned',
        p_reason: '核实后确认侵犯版权',
      })
    )
  })

  it('驳回必须填理由,理由进入 p_reason', async () => {
    rpc.mockResolvedValue({ data: [received()], error: null })
    renderPanel()
    await waitFor(() => expect(screen.getByText('驳回', { exact: true })).toBeTruthy())

    fireEvent.click(screen.getByText('驳回', { exact: true }))
    fireEvent.change(screen.getByLabelText('处置理由'), { target: { value: '经核对不构成侵权' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith('admin_resolve_work_share_report', {
        p_report_id: 'r1',
        p_action: 'dismissed',
        p_reason: '经核对不构成侵权',
      })
    )
  })

  it('终态行不出现处置按钮;actioned 且分享已冻结时提供恢复入口', async () => {
    rpc.mockResolvedValue({
      data: [
        received({ id: 'r2', status: 'actioned', share_status: 'revoked' }),
        received({ id: 'r3', status: 'dismissed' }),
      ],
      error: null,
    })
    renderPanel()
    await waitFor(() => expect(screen.getByText('恢复分享')).toBeTruthy())
    expect(screen.queryByText('标记成立并冻结')).toBeNull()
    expect(screen.queryByText('开始受理')).toBeNull()
  })

  it('恢复分享经理由模态框调用 admin_restore_work_share', async () => {
    rpc.mockResolvedValue({ data: [received({ status: 'actioned', share_status: 'revoked' })], error: null })
    renderPanel()
    await waitFor(() => expect(screen.getByText('恢复分享')).toBeTruthy())

    fireEvent.click(screen.getByText('恢复分享'))
    fireEvent.change(screen.getByLabelText('处置理由'), { target: { value: '误冻结,恢复公开' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith('admin_restore_work_share', {
        p_share_id: 's1',
        p_reason: '误冻结,恢复公开',
      })
    )
  })

  it('actioned 但分享已不是 revoked:不显示恢复按钮,显示提示', async () => {
    rpc.mockResolvedValue({
      data: [received({ status: 'actioned', share_status: 'published' })],
      error: null,
    })
    renderPanel()
    await waitFor(() => expect(screen.getByText(/无需冻结/)).toBeTruthy())
    expect(screen.queryByText('恢复分享')).toBeNull()
  })

  it('处置失败时错误信息以 toast 展示(不崩溃)', async () => {
    rpc.mockResolvedValueOnce({ data: [received()], error: null }) // 列表
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'report_already_resolved' } }) // 处置
    renderPanel()
    await waitFor(() => expect(screen.getByText('开始受理')).toBeTruthy())
    fireEvent.click(screen.getByText('开始受理'))
    await waitFor(() => expect(screen.getByText(/report_already_resolved/)).toBeTruthy())
  })

  it('被举报分享已删除时显示缺失提示且无外链', async () => {
    rpc.mockResolvedValue({ data: [received({ share_status: null, share_title: null })], error: null })
    const { container } = renderPanel()
    await waitFor(() => expect(screen.getByText('(分享已删除)')).toBeTruthy())
    expect(container.querySelector('a.sr-share-link')).toBeNull()
  })
})
