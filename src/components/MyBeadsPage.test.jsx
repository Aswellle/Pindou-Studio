import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import MyBeadsPage from './MyBeadsPage'

/**
 * MyBeadsPage 集成测试(本地模式)。
 * 云端 RLS 需要真实 Supabase 实例,这里不 mock 成功路径,只验证本地仓库 + UI 行为。
 */

vi.mock('../services/supabase', () => ({
  supabase: null,
  SUPABASE_URL: '',
  SUPABASE_DIRECT_URL: '',
  SUPABASE_PROXIED: false,
}))

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
  // jsdom 无 canvas:缩略图直绘不崩即可
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, closePath: () => {},
    moveTo: () => {}, lineTo: () => {}, stroke: () => {}, clearRect: () => {},
    fillText: () => {}, arc: () => {}, fill: () => {}, save: () => {}, restore: () => {},
    clip: () => {}, translate: () => {}, scale: () => {}, drawImage: () => {},
    setTransform: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  }
  HTMLCanvasElement.prototype.getContext = function () { return ctx }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

const CANVAS = [
  ['#FF0000', null, '#0000FF'],
  ['#FF0000', '#FF0000', null],
]

const setup = (props = {}) => render(
  <MemoryRouter initialEntries={['/my/beads']}>
    <MyBeadsPage user={null} canvasData={CANVAS} onApplyMapping={vi.fn()} {...props} />
  </MemoryRouter>
)

describe('MyBeadsPage · 色卡管理(本地模式)', () => {
  it('未登录显示本地模式说明,且不冒充云端', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-mode.local')).toBeTruthy())
    expect(screen.getByText(/只保存在本机浏览器/)).toBeTruthy()
  })

  it('新建色卡:填写名称后出现在列表中', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-mode')).toBeTruthy())

    fireEvent.click(screen.getByText('新建色卡'))
    const dialog = document.querySelector('.my-beads-modal')
    fireEvent.change(within(dialog).getByPlaceholderText('例如：我的 5mm 拼豆'), { target: { value: '测试色卡' } })
    fireEvent.click(within(dialog).getByText('保存'))

    await waitFor(() => {
      expect(container.querySelector('.my-beads-palette-card')?.textContent).toContain('测试色卡')
    })
    // 持久化:localStorage 有记录
    const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
    expect(stored.palettes).toHaveLength(1)
  })

  it('非法 HEX 被拒绝,颜色不写入', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-mode')).toBeTruthy())
    fireEvent.click(screen.getByText('新建色卡'))
    let dialog = document.querySelector('.my-beads-modal')
    fireEvent.change(within(dialog).getByPlaceholderText('例如：我的 5mm 拼豆'), { target: { value: 'P' } })
    fireEvent.click(within(dialog).getByText('保存'))
    await waitFor(() => expect(container.querySelector('.my-beads-palette-detail')).toBeTruthy())

    fireEvent.click(screen.getByText('添加颜色'))
    dialog = document.querySelector('.my-beads-modal')
    fireEvent.change(within(dialog).getByPlaceholderText('A1'), { target: { value: 'A1' } })
    fireEvent.change(within(dialog).getByPlaceholderText('#RRGGBB'), { target: { value: '#f00' } })
    fireEvent.click(within(dialog).getByText('保存'))

    // 对话框保持打开(校验失败),颜色列表仍为空
    expect(document.querySelector('.my-beads-modal')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('personal-beads-v1')).colors).toHaveLength(0)
  })

  it('复制内置色卡得到个人副本,颜色随之复制', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-mode')).toBeTruthy())
    vi.spyOn(window, 'prompt').mockReturnValue('Perler 副本')

    const builtinGrid = container.querySelector('.my-beads-builtin-grid')
    const perlerCard = within(builtinGrid).getAllByText('复制为我的色卡')[0]
    fireEvent.click(perlerCard)

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.palettes).toHaveLength(1)
      expect(stored.palettes[0].name).toBe('Perler 副本')
      expect(stored.colors.length).toBeGreaterThan(0)
    })
  })

  it('删除色卡需要确认,确认后色卡与颜色一起消失', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-mode')).toBeTruthy())
    fireEvent.click(screen.getByText('新建色卡'))
    let dialog = document.querySelector('.my-beads-modal')
    fireEvent.change(within(dialog).getByPlaceholderText('例如：我的 5mm 拼豆'), { target: { value: '待删' } })
    fireEvent.click(within(dialog).getByText('保存'))
    await waitFor(() => expect(container.querySelector('.my-beads-palette-detail')).toBeTruthy())

    // 删除按钮(title=删除)
    const delBtn = container.querySelector('.my-beads-palette-detail .my-beads-icon-btn.danger')
    fireEvent.click(delBtn)
    expect(screen.getByText(/确定删除「待删」吗/)).toBeTruthy()
    // 确认框里提示画布不受影响
    expect(screen.getByText(/删除色卡不会改变画布或旧作品/)).toBeTruthy()

    const confirmDialog = document.querySelector('.my-beads-modal.confirm')
    fireEvent.click(within(confirmDialog).getByText('删除'))
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('personal-beads-v1')).palettes).toHaveLength(0)
    })
  })
})

describe('MyBeadsPage · 库存', () => {
  it('数量留空 = 未记录(不等于 0);填数量后统计更新', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-mode')).toBeTruthy())

    fireEvent.click(screen.getByRole('tab', { name: /我的库存/ }))
    await waitFor(() => expect(container.querySelector('.my-beads-inv-list')).toBeTruthy())

    // 默认 Perler:全部未记录
    expect(screen.getByText('未记录 80')).toBeTruthy()

    const firstQty = container.querySelector('.qty-input')
    fireEvent.change(firstQty, { target: { value: '25' } })
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.inventory).toHaveLength(1)
      expect(stored.inventory[0].quantity).toBe(25)
    })
  })

  it('标记缺货写入 out_of_stock 状态', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-mode')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: /我的库存/ }))
    await waitFor(() => expect(container.querySelector('.my-beads-inv-row')).toBeTruthy())

    const outBtn = container.querySelectorAll('.my-beads-inv-row .stock-btn')[1]
    fireEvent.click(outBtn)
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.inventory[0].status).toBe('out_of_stock')
    })
  })
})

describe('MyBeadsPage · 图纸匹配', () => {
  // 预置一张个人色卡。红/蓝用「几乎相同但不等」的 HEX:
  // ΔE 极小 → close,且替换确实会改变矩阵(与源色完全相同则无需替换)。
  function seedPersonalPalette({ exact = false } = {}) {
    localStorage.setItem('personal-beads-v1', JSON.stringify({
      version: 1,
      palettes: [{ id: 'pal-1', name: '测试色卡', brandName: '', seriesName: '', beadSizeMm: null, notes: '' }],
      colors: [
        { id: 'col-1', paletteId: 'pal-1', code: 'R1', name: '红', hex: exact ? '#FF0000' : '#FF0001', notes: '', sortOrder: 0 },
        { id: 'col-2', paletteId: 'pal-1', code: 'B1', name: '蓝', hex: exact ? '#0000FF' : '#0000FE', notes: '', sortOrder: 1 },
        { id: 'col-3', paletteId: 'pal-1', code: 'G1', name: '绿', hex: '#00FF00', notes: '', sortOrder: 2 },
      ],
      inventory: [],
    }))
  }

  async function openMatchWithPersonal(container) {
    await waitFor(() => expect(container.querySelector('.my-beads-mode')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: /图纸匹配/ }))
    await waitFor(() => expect(container.querySelector('.my-beads-match-table')).toBeTruthy())
    // 目标切到「我的色卡」并选中预置色卡
    const [kindSelect, paletteSelect] = container.querySelectorAll('.my-beads-filters select')
    fireEvent.change(kindSelect, { target: { value: 'user' } })
    await waitFor(() => expect(paletteSelect.value).toBe('pal-1'))
  }

  it('精确命中显示 exact,但同色无需替换 → 批量接受不勾选', async () => {
    seedPersonalPalette({ exact: true })
    const { container } = setup()
    await openMatchWithPersonal(container)

    const rows = container.querySelectorAll('.my-beads-match-table tbody tr')
    expect(rows.length).toBe(2) // 红 + 蓝
    expect(screen.getAllByText('精确').length).toBe(2)

    fireEvent.click(screen.getByText('仅自动接受精确/接近匹配'))
    await waitFor(() => {
      const checked = container.querySelectorAll('.my-beads-match-table tbody input[type="checkbox"]:checked')
      // 目标 HEX 与源色相同:替换没有意义,不应产生可应用项
      expect(checked.length).toBe(0)
    })
  })

  it('接近匹配可批量接受(2 色)', async () => {
    seedPersonalPalette()
    const { container } = setup()
    await openMatchWithPersonal(container)

    expect(screen.getAllByText('接近').length).toBe(2)
    fireEvent.click(screen.getByText('仅自动接受精确/接近匹配'))
    await waitFor(() => {
      const checked = container.querySelectorAll('.my-beads-match-table tbody input[type="checkbox"]:checked')
      expect(checked.length).toBe(2)
    })
  })

  it('较大色差(poor-match)不会被批量接受', async () => {
    const { container } = setup() // 默认内置 Perler:#FF0000 → P28 ΔE 8.65,较大色差
    await waitFor(() => expect(container.querySelector('.my-beads-mode')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: /图纸匹配/ }))
    await waitFor(() => expect(container.querySelector('.my-beads-match-table')).toBeTruthy())

    expect(screen.getAllByText('色差较大').length).toBe(2)
    fireEvent.click(screen.getByText('仅自动接受精确/接近匹配'))
    await waitFor(() => {
      const checked = container.querySelectorAll('.my-beads-match-table tbody input[type="checkbox"]:checked')
      expect(checked.length).toBe(0)
    })
  })

  it('应用替换只回调一次矩阵,且空白格不被填充', async () => {
    seedPersonalPalette()
    const onApplyMapping = vi.fn()
    const { container } = setup({ onApplyMapping })
    await openMatchWithPersonal(container)

    fireEvent.click(screen.getByText('仅自动接受精确/接近匹配'))
    await waitFor(() => {
      expect(container.querySelectorAll('.my-beads-match-table tbody input[type="checkbox"]:checked').length)
        .toBe(2)
    })

    fireEvent.click(screen.getByText(/应用替换/))

    await waitFor(() => expect(onApplyMapping).toHaveBeenCalledTimes(1))
    const next = onApplyMapping.mock.calls[0][0]
    // 红 → #FF0001、蓝 → #0000FE
    expect(next[0][0]).toBe('#FF0001')
    expect(next[1][0]).toBe('#FF0001')
    expect(next[0][2]).toBe('#0000FE')
    // 空白格数量不变(原矩阵 2 个 null)
    expect(next.flat().filter((c) => c === null)).toHaveLength(2)
    // 每格仍是合法 HEX 或 null
    for (const cell of next.flat()) {
      expect(cell === null || /^#[0-9A-F]{6}$/i.test(cell)).toBe(true)
    }
  })

  it('尺寸不兼容时整表标记,不给出目标色', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-mode')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: /图纸匹配/ }))
    await waitFor(() => expect(container.querySelector('.my-beads-match-table')).toBeTruthy())

    // 图纸豆径填 2.6,Perler 是 5mm → incompatible-size
    const sizeInput = container.querySelector('.my-beads-size input')
    fireEvent.change(sizeInput, { target: { value: '2.6' } })

    await waitFor(() => {
      expect(screen.getAllByText('尺寸不兼容').length).toBe(2)
    })
    const disabled = container.querySelectorAll('.my-beads-match-table tbody input[type="checkbox"][disabled]')
    expect(disabled.length).toBe(2)
  })
})
