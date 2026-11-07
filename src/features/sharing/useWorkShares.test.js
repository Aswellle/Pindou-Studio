/**
 * useWorkShares 联调测试:状态机、草稿复用、并发守卫与全部失败路径。
 *
 * shareService 与 shareCardRenderer 用 vi.mock 替身;i18n 用真实 zh-CN 资源,
 * 保证 `t('share.author.default')` 等调用与线上行为一致。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import i18n from '../../i18n'
import { SHARE_ERROR_CODES, SHARE_STATES } from './shareConstants'

vi.mock('./shareService', () => ({
  isSharingConfigured: vi.fn(() => true),
  fetchReleaseGate: vi.fn(async () => ({ ok: true, data: true, error: null, detail: null })),
  createDraft: vi.fn(),
  uploadShareCard: vi.fn(),
  publishShare: vi.fn(),
  revokeShare: vi.fn(),
  listMyShares: vi.fn(),
}))
vi.mock('./shareCardRenderer', () => ({
  renderShareCard: vi.fn(async () => ({ blob: new Blob(['png']) })),
}))

const { createDraft, uploadShareCard, publishShare, revokeShare, fetchReleaseGate, isSharingConfigured } =
  await import('./shareService')
const { renderShareCard } = await import('./shareCardRenderer')
const { useWorkShares } = await import('./useWorkShares')

const UUID = '550e8400-e29b-41d4-a716-446655440000'

/** 9×9 棋盘矩阵:满足 validateSharePattern 的最小合法形状 */
function makePattern(n = 9) {
  return Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => ((x + y) % 2 === 0 ? '#FF0000' : null))
  )
}

const draft = () => ({
  id: UUID,
  title: '测试标题',
  description: '',
  authorLabel: '拼豆创作者',
  gridWidth: 9,
  gridHeight: 9,
  canvasData: makePattern(),
  paletteId: 'perler',
  status: 'draft',
})

const work = () => ({ id: 'work-uuid-1', name: '小鸭子', canvasData: makePattern() })
const payload = () => ({ work: work(), title: '测试标题', description: '', authorLabel: '拼豆创作者' })

/** 延迟解析的 promise:用于逐段推进状态机 */
function deferred() {
  let resolve
  const promise = new Promise(res => {
    resolve = res
  })
  return { promise, resolve }
}

const GATE_OK = { ok: true, data: true, error: null, detail: null }
const RENDER_OK = { blob: new Blob(['png']) }

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

beforeEach(() => {
  // mockReset 清掉上一位用例遗留的实现与 once 队列(clearAllMocks 做不到),
  // 再按「全部成功」重设默认行为,用例只覆盖自己关心的分支
  for (const fn of [
    createDraft,
    uploadShareCard,
    publishShare,
    revokeShare,
    fetchReleaseGate,
    isSharingConfigured,
    renderShareCard,
  ]) {
    fn.mockReset()
  }
  isSharingConfigured.mockReturnValue(true)
  fetchReleaseGate.mockResolvedValue(GATE_OK)
  renderShareCard.mockResolvedValue(RENDER_OK)
  createDraft.mockResolvedValue({ ok: true, data: draft(), error: null, detail: null })
  uploadShareCard.mockResolvedValue({ ok: true, data: `${UUID}/r1.png`, error: null, detail: null })
  publishShare.mockResolvedValue({ ok: true, data: true, error: null, detail: null })
  revokeShare.mockResolvedValue({ ok: true, data: true, error: null, detail: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useWorkShares 初始化', () => {
  it('默认 idle、gate 未知,挂载后拉取 gate', async () => {
    const { result } = renderHook(() => useWorkShares())
    expect(result.current.state).toBe(SHARE_STATES.IDLE)
    expect(result.current.gate).toBeNull()
    expect(result.current.configured).toBe(true)
    await act(async () => {})
    expect(fetchReleaseGate).toHaveBeenCalledTimes(1)
    expect(result.current.gate).toBe(true)
  })

  it('gate 查询失败时按未开放处理(false),而不是报错', async () => {
    fetchReleaseGate.mockResolvedValueOnce({ ok: false, data: null, error: 'network', detail: 'x' })
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    expect(result.current.gate).toBe(false)
    expect(result.current.state).toBe(SHARE_STATES.IDLE)
  })

  it('enabled=false 时不拉取 gate', async () => {
    renderHook(() => useWorkShares({ enabled: false }))
    await act(async () => {})
    expect(fetchReleaseGate).not.toHaveBeenCalled()
  })

  it('云端未配置时 gate 直接为 false', async () => {
    isSharingConfigured.mockReturnValue(false)
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    expect(result.current.gate).toBe(false)
    expect(fetchReleaseGate).not.toHaveBeenCalled()
  })
})

describe('useWorkShares 预检', () => {
  it.each([
    [
      'work 缺 id',
      () => ({ name: 'x', canvasData: makePattern() }),
      '标题',
      SHARE_ERROR_CODES.WORK_NOT_FOUND,
    ],
    [
      'work.id 非字符串',
      () => ({ id: 123, name: 'x', canvasData: makePattern() }),
      '标题',
      SHARE_ERROR_CODES.WORK_NOT_FOUND,
    ],
    ['矩阵为空', () => ({ id: 'w', name: 'x', canvasData: [] }), '标题', SHARE_ERROR_CODES.INVALID_PATTERN],
    [
      '标题与作品名都为空',
      () => ({ id: 'w', name: '', canvasData: makePattern() }),
      '',
      SHARE_ERROR_CODES.TITLE_REQUIRED,
    ],
  ])('%s → %s', async (_name, makeWork, title, expectedCode) => {
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    let out
    await act(async () => {
      out = await result.current.createAndPublish({ work: makeWork(), title })
    })
    expect(out).toBeNull()
    expect(result.current.state).toBe(SHARE_STATES.ERROR)
    expect(result.current.error).toBe(expectedCode)
    expect(createDraft).not.toHaveBeenCalled()
  })

  it('未配置云端 → unauthorized', async () => {
    isSharingConfigured.mockReturnValue(false)
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    let out
    await act(async () => {
      out = await result.current.createAndPublish(payload())
    })
    expect(out).toBeNull()
    expect(result.current.error).toBe(SHARE_ERROR_CODES.UNAUTHORIZED)
  })
})

describe('useWorkShares 完整状态机', () => {
  it('creating → rendering → uploading → publishing → success,成功后草稿释放', async () => {
    const createGate = deferred()
    const renderGate = deferred()
    const uploadGate = deferred()
    const publishGate = deferred()
    createDraft.mockImplementation(() => createGate.promise)
    renderShareCard.mockImplementation(() => renderGate.promise)
    uploadShareCard.mockImplementation(() => uploadGate.promise)
    publishShare.mockImplementation(() => publishGate.promise)

    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})

    let flowPromise
    await act(async () => {
      flowPromise = result.current.createAndPublish(payload())
    })
    expect(result.current.state).toBe(SHARE_STATES.CREATING)
    expect(result.current.isBusy).toBe(true)

    await act(async () => {
      createGate.resolve({ ok: true, data: draft() })
    })
    expect(result.current.state).toBe(SHARE_STATES.RENDERING)

    await act(async () => {
      renderGate.resolve({ blob: new Blob(['png']) })
    })
    expect(result.current.state).toBe(SHARE_STATES.UPLOADING)

    await act(async () => {
      uploadGate.resolve({ ok: true, data: `${UUID}/r1.png` })
    })
    expect(result.current.state).toBe(SHARE_STATES.PUBLISHING)

    let out
    await act(async () => {
      publishGate.resolve({ ok: true, data: true })
      out = await flowPromise
    })
    expect(out).not.toBeNull()
    expect(result.current.state).toBe(SHARE_STATES.SUCCESS)
    expect(result.current.isBusy).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.share).toMatchObject({
      id: UUID,
      // 分享链接按当前访问环境生成(jsdom 下即 jsdom 的 origin)
      url: `${window.location.origin}/share/${UUID}`,
      previewPath: `${UUID}/r1.png`,
    })
    // 卡片上的统计来自快照矩阵,不是自报数字
    expect(result.current.share.stats.beads).toBe(makePattern().flat().filter(Boolean).length)
    expect(createDraft).toHaveBeenCalledTimes(1)
    expect(uploadShareCard).toHaveBeenCalledWith(UUID, expect.any(Blob))
    expect(publishShare).toHaveBeenCalledWith(UUID, `${UUID}/r1.png`)
  })

  it('服务端创建失败 → error + 稳定错误码,不渲染不上传', async () => {
    createDraft.mockResolvedValue({
      ok: false,
      data: null,
      error: SHARE_ERROR_CODES.RATE_LIMITED,
      detail: 'rate_limited',
    })
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    let out
    await act(async () => {
      out = await result.current.createAndPublish(payload())
    })
    expect(out).toBeNull()
    expect(result.current.state).toBe(SHARE_STATES.ERROR)
    expect(result.current.error).toBe(SHARE_ERROR_CODES.RATE_LIMITED)
    expect(renderShareCard).not.toHaveBeenCalled()
    expect(uploadShareCard).not.toHaveBeenCalled()
  })

  it.each([
    ['渲染失败', SHARE_ERROR_CODES.CARD_RENDER_FAILED],
    ['上传失败', SHARE_ERROR_CODES.UPLOAD_FAILED],
    ['发布失败', SHARE_ERROR_CODES.INVALID_STATE],
  ])('%s → 对应错误码', async (stage, expectedCode) => {
    if (stage === '渲染失败') {
      renderShareCard.mockRejectedValue(new Error('boom'))
    } else if (stage === '上传失败') {
      uploadShareCard.mockResolvedValue({
        ok: false,
        data: null,
        error: SHARE_ERROR_CODES.UPLOAD_FAILED,
        detail: 'x',
      })
    } else {
      publishShare.mockResolvedValue({
        ok: false,
        data: null,
        error: SHARE_ERROR_CODES.INVALID_STATE,
        detail: 'x',
      })
    }
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    let out
    await act(async () => {
      out = await result.current.createAndPublish(payload())
    })
    expect(out).toBeNull()
    expect(result.current.state).toBe(SHARE_STATES.ERROR)
    expect(result.current.error).toBe(expectedCode)
  })

  it('意外异常 → unknown', async () => {
    createDraft.mockRejectedValue(new TypeError('unexpected'))
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    let out
    await act(async () => {
      out = await result.current.createAndPublish(payload())
    })
    expect(result.current.error).toBe(SHARE_ERROR_CODES.UNKNOWN)
    expect(out).toBeNull()
  })
})

describe('useWorkShares 草稿复用与重试', () => {
  it('渲染失败后重试复用草稿:createDraft 只调用一次', async () => {
    renderShareCard.mockRejectedValueOnce(new Error('canvas gone'))
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    await act(async () => {
      await result.current.createAndPublish(payload())
    })
    expect(result.current.error).toBe(SHARE_ERROR_CODES.CARD_RENDER_FAILED)

    let out
    await act(async () => {
      out = await result.current.retry(payload())
    })
    expect(out).not.toBeNull()
    expect(result.current.state).toBe(SHARE_STATES.SUCCESS)
    expect(createDraft).toHaveBeenCalledTimes(1)
  })

  it('上传失败后重试复用草稿,成功后草稿清空', async () => {
    uploadShareCard.mockResolvedValueOnce({
      ok: false,
      data: null,
      error: SHARE_ERROR_CODES.UPLOAD_FAILED,
      detail: 'x',
    })
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    await act(async () => {
      await result.current.createAndPublish(payload())
    })
    await act(async () => {
      await result.current.retry(payload())
    })
    expect(createDraft).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe(SHARE_STATES.SUCCESS)

    // 成功后草稿已释放:再来一次完整流程会新建草稿
    await act(async () => {
      await result.current.createAndPublish(payload())
    })
    expect(createDraft).toHaveBeenCalledTimes(2)
  })

  it('修改标题后重试会放弃旧草稿并重新创建', async () => {
    renderShareCard.mockRejectedValue(new Error('canvas gone'))
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    await act(async () => {
      await result.current.createAndPublish(payload())
    })
    await act(async () => {
      await result.current.retry({ ...payload(), title: '另一个标题' })
    })
    expect(createDraft).toHaveBeenCalledTimes(2)
    expect(createDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ workId: 'work-uuid-1', title: '另一个标题' })
    )
  })

  it('只改说明不改标题时同样放弃草稿(快照文案必须与用户输入一致)', async () => {
    renderShareCard.mockRejectedValue(new Error('canvas gone'))
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    await act(async () => {
      await result.current.createAndPublish(payload())
    })
    await act(async () => {
      await result.current.retry({ ...payload(), description: '新说明' })
    })
    expect(createDraft).toHaveBeenCalledTimes(2)
  })

  it('非 error 状态下 retry 不执行任何动作', async () => {
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    let out
    await act(async () => {
      out = await result.current.retry(payload())
    })
    expect(out).toBeNull()
    expect(createDraft).not.toHaveBeenCalled()
  })
})

describe('useWorkShares 并发守卫', () => {
  it('进行中重复调用被忽略,不产生第二个草稿', async () => {
    const createGate = deferred()
    createDraft.mockImplementation(() => createGate.promise)
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})

    let first
    await act(async () => {
      first = result.current.createAndPublish(payload())
    })
    let second
    await act(async () => {
      second = await result.current.createAndPublish(payload())
    })
    expect(second).toBeNull()

    await act(async () => {
      createGate.resolve({ ok: true, data: draft() })
      await first
    })
    expect(createDraft).toHaveBeenCalledTimes(1)
  })
})

describe('useWorkShares revoke / reset', () => {
  it('撤销当前分享后清空 share;撤销失败的返回值原样透传', async () => {
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    await act(async () => {
      await result.current.createAndPublish(payload())
    })
    expect(result.current.share).not.toBeNull()

    revokeShare.mockResolvedValueOnce({ ok: true, data: true, error: null, detail: null })
    await act(async () => {
      await result.current.revoke(UUID)
    })
    expect(result.current.share).toBeNull()

    revokeShare.mockResolvedValueOnce({
      ok: false,
      data: null,
      error: SHARE_ERROR_CODES.NETWORK,
      detail: 'x',
    })
    const out = await act(async () => result.current.revoke(UUID))
    expect(out.ok).toBe(false)
    expect(out.error).toBe(SHARE_ERROR_CODES.NETWORK)
  })

  it('reset 回到 idle 并清空错误与结果', async () => {
    const { result } = renderHook(() => useWorkShares())
    await act(async () => {})
    await act(async () => {
      await result.current.createAndPublish(payload())
    })
    await act(async () => {
      result.current.reset()
    })
    expect(result.current.state).toBe(SHARE_STATES.IDLE)
    expect(result.current.share).toBeNull()
    expect(result.current.error).toBeNull()
  })
})
