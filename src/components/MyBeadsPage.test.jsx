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
  HTMLCanvasElement.prototype.getContext = () => ctx
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
  it('未登录也能正常渲染,且不冒充云端', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    // 存储模式说明已移除(用户反馈是冗余文案);页面不应再出现任何
    // 「保存在云端 / 仅本人可访问」这类与当前模式不符的表述。
    expect(container.textContent).not.toMatch(/云端|仅本人可访问/)
    // 「我的色卡」既是页签也是页面标题,按标题角色断言,避免多元素命中
    expect(screen.getByRole('heading', { name: '我的色卡' })).toBeTruthy()
  })

  it('新建色卡:填写名称后出现在列表中', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())

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
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
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

  it('复制内置色卡:走应用内对话框(不再用 window.prompt),颜色随之复制', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    const promptSpy = vi.spyOn(window, 'prompt')

    // PALETTE_LIST 第一项是 COCO
    const builtinGrid = container.querySelector('.my-beads-builtin-grid')
    fireEvent.click(within(builtinGrid).getAllByText('复制为我的色卡')[0])

    // 弹出复制对话框,展示说明与默认名称
    const dialog = await waitFor(() => {
      const el = document.querySelector('.my-beads-modal.copy-builtin')
      expect(el).toBeTruthy()
      return el
    })
    expect(dialog.textContent).toContain('不会更改内置品牌数据')
    const nameInput = within(dialog).getByDisplayValue(/COCO 拼豆 副本/)
    fireEvent.change(nameInput, { target: { value: '我的副本' } })
    fireEvent.click(within(dialog).getByText('复制为我的色卡'))

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.palettes).toHaveLength(1)
      expect(stored.palettes[0].name).toBe('我的副本')
      expect(stored.colors.length).toBeGreaterThan(0)
    })
    // 规格 §4.3:复制过程不得再调用 window.prompt
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('复制成功后出现后续操作面板,可直达库存并自动选中副本', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())

    fireEvent.click(within(container.querySelector('.my-beads-builtin-grid')).getAllByText('复制为我的色卡')[0])
    const dialog = await waitFor(() => document.querySelector('.my-beads-modal.copy-builtin'))
    fireEvent.click(within(dialog).getByText('复制为我的色卡'))

    const panel = await waitFor(() => {
      const el = container.querySelector('.my-beads-copy-result')
      expect(el).toBeTruthy()
      return el
    })
    expect(panel.textContent).toContain('已创建副本')

    fireEvent.click(within(panel).getByText('录入库存'))
    await waitFor(() => expect(container.querySelector('.my-beads-inv-list')).toBeTruthy())
    // 库存页已切到「我的色卡」并选中新副本
    expect(container.querySelector('.picker-palette select').value).toBe(
      JSON.parse(localStorage.getItem('personal-beads-v1')).palettes[0].id,
    )
  })

  it('复制取消不写任何数据', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())

    fireEvent.click(within(container.querySelector('.my-beads-builtin-grid')).getAllByText('复制为我的色卡')[0])
    const dialog = await waitFor(() => document.querySelector('.my-beads-modal.copy-builtin'))
    fireEvent.click(within(dialog).getByText('取消'))

    await waitFor(() => expect(document.querySelector('.my-beads-modal.copy-builtin')).toBeNull())
    const raw = localStorage.getItem('personal-beads-v1')
    expect(raw ? JSON.parse(raw).palettes : []).toHaveLength(0)
  })

  it('空状态给出两个明确入口', async () => {
    const { container } = setup()
    const gs = await waitFor(() => {
      const el = container.querySelector('.my-beads-getting-started')
      expect(el).toBeTruthy()
      return el
    })
    expect(gs.textContent).toContain('先创建一张属于你的色卡')
    expect(within(gs).getByText('复制品牌色卡')).toBeTruthy()
    expect(within(gs).getByText('新建自定义色卡')).toBeTruthy()
  })

  it('编辑旧色卡时,不在预设里的品牌与豆径以自定义回显且不丢失', async () => {
    localStorage.setItem('personal-beads-v1', JSON.stringify({
      version: 1,
      palettes: [{
        id: 'pal-1', name: '旧色卡', brandName: '某小众牌子', seriesName: '手作系列',
        beadSizeMm: 3.2, notes: '',
      }],
      colors: [],
      inventory: [],
    }))
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-palette-card')).toBeTruthy())

    fireEvent.click(screen.getByText('编辑资料'))
    const dialog = await waitFor(() => document.querySelector('.my-beads-modal'))
    // 自定义品牌展开文本框并回显原值
    expect(within(dialog).getByDisplayValue('某小众牌子')).toBeTruthy()
    // 3.2 因个人色卡自身用过而被纳入预设,下拉正确回显;另测一个纯自定义值
    const selects = dialog.querySelectorAll('select')
    expect(selects[2].value).toBe('3.2')

    fireEvent.click(within(dialog).getByText('保存'))
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.palettes[0].brandName).toBe('某小众牌子')
      expect(stored.palettes[0].beadSizeMm).toBe(3.2)
      expect(stored.palettes[0].seriesName).toBe('手作系列')
    })
  })

  it('自定义豆径经新建保存后,再编辑仍完整回显', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    fireEvent.click(screen.getByText('新建色卡'))
    const dialog = document.querySelector('.my-beads-modal')
    fireEvent.change(within(dialog).getByPlaceholderText('例如：我的 5mm 拼豆'), { target: { value: '怪尺寸' } })

    const selects = dialog.querySelectorAll('select')
    fireEvent.change(selects[2], { target: { value: '__custom__' } })
    fireEvent.change(within(dialog).getByPlaceholderText('未知可留空'), { target: { value: '4.7' } })
    fireEvent.click(within(dialog).getByText('保存'))

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('personal-beads-v1')).palettes[0].beadSizeMm).toBe(4.7)
    })

    // 再次编辑:4.7 已由「用过的值」并入预设,回显不能丢
    fireEvent.click(screen.getByText('编辑资料'))
    const reopened = await waitFor(() => document.querySelector('.my-beads-modal'))
    expect(reopened.querySelectorAll('select')[2].value).toBe('4.7')
  })

  it('选中内置品牌预设后回填品牌名与豆径', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    fireEvent.click(screen.getByText('新建色卡'))
    const dialog = document.querySelector('.my-beads-modal')
    fireEvent.change(within(dialog).getByPlaceholderText('例如：我的 5mm 拼豆'), { target: { value: '预设测试' } })

    // 品牌下拉选 Perler;豆径下拉选 5mm
    const selects = dialog.querySelectorAll('select')
    fireEvent.change(selects[0], { target: { value: 'perler' } })
    fireEvent.change(selects[2], { target: { value: '5' } })
    fireEvent.click(within(dialog).getByText('保存'))

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.palettes[0].brandName).toBe('Perler 拼豆')
      expect(stored.palettes[0].beadSizeMm).toBe(5)
    })
  })

  it('删除色卡需要确认,确认后色卡与颜色一起消失', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    fireEvent.click(screen.getByText('新建色卡'))
    const dialog = document.querySelector('.my-beads-modal')
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

  it('颜色搜索:按色号/名称/HEX 过滤,无结果给空态并可清空', async () => {
    localStorage.setItem('personal-beads-v1', JSON.stringify({
      version: 1,
      palettes: [{ id: 'pal-1', name: '测试色卡', brandName: '', seriesName: '', beadSizeMm: null, notes: '' }],
      colors: [
        { id: 'c1', paletteId: 'pal-1', code: 'A1', name: '白色', hex: '#FFFFFF', notes: '', sortOrder: 0, source: 'factory' },
        { id: 'c2', paletteId: 'pal-1', code: 'B2', name: '黑色', hex: '#000000', notes: '', sortOrder: 1, source: 'factory' },
      ],
      inventory: [],
    }))
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-color-row')).toBeTruthy())
    expect(container.querySelectorAll('.my-beads-color-row')).toHaveLength(2)

    const search = container.querySelector('.my-beads-color-search input')
    fireEvent.change(search, { target: { value: 'b2' } })
    await waitFor(() => expect(container.querySelectorAll('.my-beads-color-row')).toHaveLength(1))
    expect(container.querySelector('.my-beads-color-row').textContent).toContain('B2')

    // 按 HEX 搜
    fireEvent.change(search, { target: { value: '#ffffff' } })
    await waitFor(() => expect(container.querySelector('.my-beads-color-row').textContent).toContain('A1'))

    // 无结果:提示「没有匹配」而不是「还没有颜色」
    fireEvent.change(search, { target: { value: 'zzz' } })
    await waitFor(() => expect(screen.getByText('没有匹配的颜色。')).toBeTruthy())
    // 清空搜索后颜色回来
    fireEvent.click(screen.getByText('清空搜索'))
    await waitFor(() => expect(container.querySelectorAll('.my-beads-color-row')).toHaveLength(2))
  })

  it('空色卡给「添加第一种颜色」与「批量导入」两个入口', async () => {
    localStorage.setItem('personal-beads-v1', JSON.stringify({
      version: 1,
      palettes: [{ id: 'pal-1', name: '空色卡', brandName: '', seriesName: '', beadSizeMm: null, notes: '' }],
      colors: [],
      inventory: [],
    }))
    const { container } = setup()
    const empty = await waitFor(() => {
      const el = container.querySelector('.my-beads-empty-inline')
      expect(el).toBeTruthy()
      return el
    })
    expect(within(empty).getByText('添加第一种颜色')).toBeTruthy()
    expect(within(empty).getByText('批量导入')).toBeTruthy()
  })

  it('颜色来源:新建时可选,保存后显示徽章', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    fireEvent.click(screen.getByText('新建色卡'))
    let dialog = document.querySelector('.my-beads-modal')
    fireEvent.change(within(dialog).getByPlaceholderText('例如：我的 5mm 拼豆'), { target: { value: '来源测试' } })
    fireEvent.click(within(dialog).getByText('保存'))
    await waitFor(() => expect(container.querySelector('.my-beads-palette-detail')).toBeTruthy())

    fireEvent.click(screen.getByText('添加颜色'))
    dialog = document.querySelector('.my-beads-modal')
    fireEvent.change(within(dialog).getByPlaceholderText('A1'), { target: { value: 'A1' } })
    fireEvent.change(within(dialog).getByPlaceholderText('#RRGGBB'), { target: { value: '#123456' } })
    // 来源下拉选「实测」
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'measured' } })
    fireEvent.click(within(dialog).getByText('保存'))

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.colors[0].source).toBe('measured')
    })
    expect(container.querySelector('.source-tag.measured')).toBeTruthy()
  })

  it('复制 HEX 写入剪贴板并提示', async () => {
    const writeText = vi.fn().mockResolvedValue()
    Object.assign(navigator, { clipboard: { writeText } })
    localStorage.setItem('personal-beads-v1', JSON.stringify({
      version: 1,
      palettes: [{ id: 'pal-1', name: 'P', brandName: '', seriesName: '', beadSizeMm: null, notes: '' }],
      colors: [{ id: 'c1', paletteId: 'pal-1', code: 'A1', name: '', hex: '#ABCDEF', notes: '', sortOrder: 0 }],
      inventory: [],
    }))
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-color-row')).toBeTruthy())

    const copyBtn = container.querySelector('.my-beads-color-row .my-beads-icon-btn')
    fireEvent.click(copyBtn)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('#ABCDEF'))
  })
})

describe('MyBeadsPage · 库存', () => {
  async function openInventory(container) {
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: /我的库存/ }))
    await waitFor(() => expect(container.querySelector('.my-beads-inv-list')).toBeTruthy())
  }

  it('数量留空 = 未记录(不等于 0);提交后统计更新', async () => {
    const { container } = setup()
    await openInventory(container)

    // 默认 Perler:全部未记录
    expect(screen.getByText('未记录 80')).toBeTruthy()

    const firstQty = container.querySelector('.qty-input')
    fireEvent.change(firstQty, { target: { value: '25' } })
    // 草稿阶段不写库(规格 §5.4)
    expect(JSON.parse(localStorage.getItem('personal-beads-v1') || '{"inventory":[]}').inventory).toHaveLength(0)

    fireEvent.blur(firstQty)
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.inventory).toHaveLength(1)
      expect(stored.inventory[0].quantity).toBe(25)
    })
  })

  it('逐字符输入只写最终值,不产生中间值', async () => {
    const { container } = setup()
    await openInventory(container)

    const qty = container.querySelector('.qty-input')
    // 模拟把 25 改成 100 的逐字符过程:2 → 10 → 100
    fireEvent.change(qty, { target: { value: '2' } })
    fireEvent.change(qty, { target: { value: '10' } })
    fireEvent.change(qty, { target: { value: '100' } })
    const before = JSON.parse(localStorage.getItem('personal-beads-v1') || '{"inventory":[]}').inventory
    expect(before).toHaveLength(0)

    fireEvent.blur(qty)
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.inventory).toHaveLength(1)
      expect(stored.inventory[0].quantity).toBe(100)
    })
  })

  it('输入 0 提交后状态变为缺货;清空输入保存为 null 而不是删除记录', async () => {
    const { container } = setup()
    await openInventory(container)
    const qty = container.querySelector('.qty-input')

    fireEvent.change(qty, { target: { value: '0' } })
    fireEvent.blur(qty)
    await waitFor(() => {
      const rec = JSON.parse(localStorage.getItem('personal-beads-v1')).inventory[0]
      expect(rec.quantity).toBe(0)
      expect(rec.status).toBe('out_of_stock')
    })

    // 清空 → 数量未知,记录仍在
    fireEvent.change(qty, { target: { value: '' } })
    fireEvent.blur(qty)
    await waitFor(() => {
      const inv = JSON.parse(localStorage.getItem('personal-beads-v1')).inventory
      expect(inv).toHaveLength(1)
      expect(inv[0].quantity).toBe(null)
    })
  })

  it('Esc 恢复上次保存的数量,不写库', async () => {
    const { container } = setup()
    await openInventory(container)
    const qty = container.querySelector('.qty-input')

    fireEvent.change(qty, { target: { value: '30' } })
    fireEvent.blur(qty)
    await waitFor(() => expect(qty.value).toBe('30'))

    fireEvent.change(qty, { target: { value: '999' } })
    fireEvent.keyDown(qty, { key: 'Escape' })
    expect(qty.value).toBe('30')
    expect(JSON.parse(localStorage.getItem('personal-beads-v1')).inventory[0].quantity).toBe(30)
  })

  it('标记缺货写入 out_of_stock 状态', async () => {
    const { container } = setup()
    await openInventory(container)
    await waitFor(() => expect(container.querySelector('.my-beads-inv-row')).toBeTruthy())

    // 三个状态按钮:拥有 / 数量不足 / 缺货
    const outBtn = container.querySelectorAll('.my-beads-inv-row .stock-btn')[2]
    fireEvent.click(outBtn)
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.inventory[0].status).toBe('out_of_stock')
    })
  })

  it('数量不足可显式登记(不再只能筛选)', async () => {
    const { container } = setup()
    await openInventory(container)
    const lowBtn = container.querySelectorAll('.my-beads-inv-row .stock-btn')[1]
    fireEvent.click(lowBtn)
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.inventory[0].status).toBe('low')
    })
  })

  it('状态筛选:只看未记录 / 缺货', async () => {
    localStorage.setItem('personal-beads-v1', JSON.stringify({
      version: 1,
      palettes: [],
      colors: [],
      // 只给第一个内置颜色记库存,其余保持未记录
      inventory: [{ id: 'i1', paletteKey: 'builtin:perler:P01', paletteColorId: null, quantity: 100, status: 'owned', notes: '' }],
    }))
    const { container } = setup()
    await openInventory(container)

    const filterSelect = container.querySelector('.inventory-toolbar select[aria-label="库存筛选"]')
    fireEvent.change(filterSelect, { target: { value: 'owned' } })
    await waitFor(() => expect(container.querySelectorAll('.my-beads-inv-row')).toHaveLength(1))

    fireEvent.change(filterSelect, { target: { value: 'unrecorded' } })
    await waitFor(() => {
      // Perler 80 色,1 条已记录 → 79 条未记录
      expect(container.querySelectorAll('.my-beads-inv-row')).toHaveLength(79)
    })

    fireEvent.change(filterSelect, { target: { value: 'out' } })
    await waitFor(() => expect(screen.getByText('当前筛选下没有颜色。')).toBeTruthy())
  })

  it('摘要项可点击,点击后设置对应筛选', async () => {
    const { container } = setup()
    await openInventory(container)
    const summary = container.querySelector('.inventory-summary')
    fireEvent.click(within(summary).getByText('未记录 80'))
    await waitFor(() => expect(container.querySelectorAll('.my-beads-inv-row')).toHaveLength(80))

    // 再点一次取消筛选
    fireEvent.click(within(summary).getByText('未记录 80'))
    await waitFor(() => expect(container.querySelectorAll('.my-beads-inv-row')).toHaveLength(80))
  })

  it('批量编辑:勾选两行设为同一数量', async () => {
    const { container } = setup()
    await openInventory(container)

    const boxes = container.querySelectorAll('.my-beads-inv-row > input[type="checkbox"]')
    fireEvent.click(boxes[0])
    fireEvent.click(boxes[1])
    await waitFor(() => expect(container.querySelector('.my-beads-batch')).toBeTruthy())
    expect(container.querySelector('.my-beads-batch').textContent).toContain('已选 2 种')

    fireEvent.change(container.querySelector('.my-beads-batch .qty-input'), { target: { value: '42' } })
    fireEvent.click(screen.getByText('设为该数量'))

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.inventory).toHaveLength(2)
      expect(stored.inventory.every((i) => i.quantity === 42)).toBe(true)
    })
    // 批量完成后清空选择
    await waitFor(() => expect(container.querySelector('.my-beads-batch')).toBeNull())
  })

  it('批量清除记录:移除库存行但不删颜色', async () => {
    localStorage.setItem('personal-beads-v1', JSON.stringify({
      version: 1,
      palettes: [],
      colors: [],
      inventory: [{ id: 'i1', paletteKey: 'builtin:perler:P01', paletteColorId: null, quantity: 5, status: 'owned', notes: '' }],
    }))
    const { container } = setup()
    await openInventory(container)

    fireEvent.click(container.querySelector('.my-beads-inv-row > input[type="checkbox"]'))
    fireEvent.click(screen.getByText('清除记录'))

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.inventory).toHaveLength(0)
    })
  })

  it('单行「清除库存记录」走确认框,确认后才删除', async () => {
    localStorage.setItem('personal-beads-v1', JSON.stringify({
      version: 1,
      palettes: [],
      colors: [],
      inventory: [{ id: 'i1', paletteKey: 'builtin:perler:P01', paletteColorId: null, quantity: 5, status: 'owned', notes: '' }],
    }))
    const { container } = setup()
    await openInventory(container)

    // 打开「更多操作」菜单
    fireEvent.click(within(container.querySelector('.my-beads-inv-row')).getByLabelText(/更多操作/))
    fireEvent.click(screen.getByText('清除库存记录'))

    const confirm = await waitFor(() => {
      const el = document.querySelector('.my-beads-modal.confirm')
      expect(el).toBeTruthy()
      return el
    })
    expect(confirm.textContent).toContain('颜色本身不会被删除')
    // 还没确认,记录仍在
    expect(JSON.parse(localStorage.getItem('personal-beads-v1')).inventory).toHaveLength(1)

    fireEvent.click(within(confirm).getByText('清除记录'))
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('personal-beads-v1')).inventory).toHaveLength(0)
    })
  })

  it('选择「我的色卡」且没有个人色卡时给出创建/复制入口', async () => {
    const { container } = setup()
    await openInventory(container)

    fireEvent.click(within(container.querySelector('.inventory-picker')).getByText('我的色卡'))
    const empty = await waitFor(() => {
      const el = container.querySelector('.my-beads-empty-action')
      expect(el).toBeTruthy()
      return el
    })
    expect(empty.textContent).toContain('你还没有个人色卡')
    expect(within(empty).getByText('复制品牌色卡')).toBeTruthy()
    expect(within(empty).getByText('新建自定义色卡')).toBeTruthy()
  })
})

describe('MyBeadsPage · 备份', () => {
  it('本地模式显示导出/导入按钮,云端模式不显示', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    expect(container.querySelector('.my-beads-backup')).toBeTruthy()
    expect(screen.getByText('导出备份')).toBeTruthy()
    expect(screen.getByText('导入备份')).toBeTruthy()
  })

  it('导入备份合并数据,重复 id 被跳过', async () => {
    // 现有 1 张色卡
    localStorage.setItem('personal-beads-v1', JSON.stringify({
      version: 1,
      palettes: [{ id: 'pal-1', name: '原有', brandName: '', seriesName: '', beadSizeMm: null, notes: '' }],
      colors: [],
      inventory: [],
    }))
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())

    const backup = {
      kind: 'pindou-personal-beads',
      version: 1,
      palettes: [
        { id: 'pal-1', name: '重复' },
        { id: 'pal-2', name: '导入的' },
      ],
      colors: [{ id: 'col-9', paletteId: 'pal-2', code: 'Z9', name: '', hex: '#00FF00', notes: '', sortOrder: 0 }],
      inventory: [],
    }
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })
    // jsdom 的 File 没有 text():补一个
    file.text = () => Promise.resolve(JSON.stringify(backup))
    const input = container.querySelector('.my-beads-backup-file-input')
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.palettes.map((p) => p.id).sort()).toEqual(['pal-1', 'pal-2'])
      expect(stored.palettes.find((p) => p.id === 'pal-1').name).toBe('原有')
      expect(stored.colors).toHaveLength(1)
    })
  })

  it('非法备份文件被拒绝,现有数据不变', async () => {
    localStorage.setItem('personal-beads-v1', JSON.stringify({
      version: 1,
      palettes: [{ id: 'pal-1', name: '原有', brandName: '', seriesName: '', beadSizeMm: null, notes: '' }],
      colors: [],
      inventory: [],
    }))
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())

    const file = new File(['not json'], 'bad.json', { type: 'application/json' })
    file.text = () => Promise.resolve('not json')
    fireEvent.change(container.querySelector('.my-beads-backup-file-input'), { target: { files: [file] } })

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.palettes).toHaveLength(1)
      expect(stored.palettes[0].name).toBe('原有')
    })
  })
})

describe('MyBeadsPage · 批量颜色导入(CSV / JSON)', () => {
  function seedPalette() {
    localStorage.setItem('personal-beads-v1', JSON.stringify({
      version: 1,
      palettes: [{ id: 'pal-1', name: '导入目标', brandName: '', seriesName: '', beadSizeMm: null, notes: '' }],
      colors: [{ id: 'c0', paletteId: 'pal-1', code: 'A1', name: '', hex: '#FFFFFF', notes: '', sortOrder: 0, source: 'factory' }],
      inventory: [],
    }))
  }

  function pickFile(container, name, text) {
    const file = new File([text], name, { type: 'text/csv' })
    file.text = () => Promise.resolve(text)
    fireEvent.change(container.querySelector('.my-beads-color-file-input'), { target: { files: [file] } })
  }

  it('CSV 导入先预览,确认后才写入;整批一次提交', async () => {
    seedPalette()
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-color-row')).toBeTruthy())

    pickFile(container, 'colors.csv', 'code,name,hex,notes,source\nB1,蓝色,#0000FF,,factory\nC1,绿色,#00FF00,自调,measured\n')

    // 预览面板出现,但尚未写入
    await waitFor(() => expect(container.querySelector('.my-beads-import-preview')).toBeTruthy())
    expect(JSON.parse(localStorage.getItem('personal-beads-v1')).colors).toHaveLength(1)
    expect(container.querySelectorAll('.my-beads-import-list li')).toHaveLength(2)

    fireEvent.click(within(container.querySelector('.my-beads-import-preview')).getByText('导入 2 个颜色'))

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.colors).toHaveLength(3)
      expect(stored.colors.map((c) => c.code).sort()).toEqual(['A1', 'B1', 'C1'])
      expect(stored.colors.find((c) => c.code === 'C1').source).toBe('measured')
    })
    // 成功后预览关闭
    await waitFor(() => expect(container.querySelector('.my-beads-import-preview')).toBeNull())
  })

  it('取消预览不写入任何颜色', async () => {
    seedPalette()
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-color-row')).toBeTruthy())

    pickFile(container, 'colors.csv', 'code,hex\nB1,#0000FF\n')
    await waitFor(() => expect(container.querySelector('.my-beads-import-preview')).toBeTruthy())
    fireEvent.click(within(container.querySelector('.my-beads-import-preview')).getByText('取消'))

    await waitFor(() => expect(container.querySelector('.my-beads-import-preview')).toBeNull())
    expect(JSON.parse(localStorage.getItem('personal-beads-v1')).colors).toHaveLength(1)
  })

  it('部分行非法:合法行可导入,错误行带行号列出', async () => {
    seedPalette()
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-color-row')).toBeTruthy())

    // 第 2 行合法;第 3 行 HEX 非法;第 4 行与已有 A1 重码
    pickFile(container, 'colors.csv', 'code,hex\nB1,#0000FF\nBAD,not-a-hex\nA1,#123456\n')
    await waitFor(() => expect(container.querySelector('.my-beads-import-preview')).toBeTruthy())

    const errors = container.querySelectorAll('.my-beads-import-errors li')
    expect(errors).toHaveLength(2)
    expect(errors[0].textContent).toContain('第 3 行')
    expect(errors[1].textContent).toContain('第 4 行')

    fireEvent.click(within(container.querySelector('.my-beads-import-preview')).getByText('导入 1 个颜色'))
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.colors.map((c) => c.code).sort()).toEqual(['A1', 'B1'])
    })
  })

  it('JSON 导入接受 { colors: [...] },缺少必需列时给出可读错误', async () => {
    seedPalette()
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-color-row')).toBeTruthy())

    pickFile(container, 'colors.json', JSON.stringify({ colors: [{ code: 'J1', hex: '#112233' }] }))
    await waitFor(() => expect(container.querySelector('.my-beads-import-list')).toBeTruthy())
    fireEvent.click(within(container.querySelector('.my-beads-import-preview')).getByText('导入 1 个颜色'))
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('personal-beads-v1')).colors.some((c) => c.code === 'J1')).toBe(true)
    })

    // 坏 JSON:整份拒绝,预览里只有错误、没有可导入项
    pickFile(container, 'bad.json', '{ not json')
    await waitFor(() => expect(container.querySelector('.my-beads-import-errors')).toBeTruthy())
    expect(container.querySelector('.my-beads-import-list')).toBeNull()
    const confirmBtn = container.querySelector('.my-beads-import-actions .my-beads-btn.primary')
    expect(confirmBtn.disabled).toBe(true)
    expect(confirmBtn.textContent).toContain('导入 0 个颜色')
  })
})

describe('MyBeadsPage · 删除被引用色卡时重新指定', () => {
  function seedTwoPalettes() {
    localStorage.setItem('personal-beads-v1', JSON.stringify({
      version: 1,
      palettes: [
        { id: 'pal-1', name: '旧色卡', brandName: '', seriesName: '', beadSizeMm: null, notes: '' },
        { id: 'pal-2', name: '新色卡', brandName: '', seriesName: '', beadSizeMm: null, notes: '' },
      ],
      colors: [],
      inventory: [],
    }))
  }

  const WORKS = [
    { id: 'w1', name: '作品一', paletteId: 'pal-1', canvasData: [[null]] },
    { id: 'w2', name: '作品二', paletteId: 'pal-2', canvasData: [[null]] },
  ]

  it('有作品引用时,删除确认框列出数量与「重新指定」选项', async () => {
    seedTwoPalettes()
    const { container } = setup({ works: WORKS })
    await waitFor(() => expect(container.querySelector('.my-beads-palette-card')).toBeTruthy())
    fireEvent.click(within(container.querySelectorAll('.my-beads-palette-card')[0]).getByText('旧色卡'))
    await waitFor(() => expect(container.querySelector('.my-beads-palette-detail')).toBeTruthy())

    fireEvent.click(container.querySelector('.my-beads-palette-detail .my-beads-icon-btn.danger'))
    // 确认框 portal 到 document.body,不在 container 内
    await waitFor(() => expect(document.querySelector('.my-beads-reassign')).toBeTruthy())
    expect(document.querySelector('.my-beads-reassign').textContent).toContain('1 件已保存作品')
    // 默认「保留原 HEX」,不显示重新指定按钮
    expect(within(document.querySelector('.my-beads-reassign')).queryByText(/重新指定到所选色卡/)).toBeNull()
  })

  it('选择目标色卡后:先改作品归属,再删除色卡', async () => {
    seedTwoPalettes()
    const onReassignWorkPalette = vi.fn().mockResolvedValue(true)
    const { container } = setup({ works: WORKS, onReassignWorkPalette })
    await waitFor(() => expect(container.querySelector('.my-beads-palette-card')).toBeTruthy())
    fireEvent.click(within(container.querySelectorAll('.my-beads-palette-card')[0]).getByText('旧色卡'))
    await waitFor(() => expect(container.querySelector('.my-beads-palette-detail')).toBeTruthy())
    fireEvent.click(container.querySelector('.my-beads-palette-detail .my-beads-icon-btn.danger'))

    const select = await waitFor(() => {
      const el = document.querySelector('.my-beads-reassign select')
      expect(el).toBeTruthy()
      return el
    })
    fireEvent.change(select, { target: { value: 'pal-2' } })
    fireEvent.click(within(document.querySelector('.my-beads-reassign')).getByText(/重新指定到所选色卡/))

    await waitFor(() => expect(onReassignWorkPalette).toHaveBeenCalledTimes(1))
    // 只改引用旧色卡的那件作品,目标为新色卡
    expect(onReassignWorkPalette.mock.calls[0][0].id).toBe('w1')
    expect(onReassignWorkPalette.mock.calls[0][1]).toBe('pal-2')

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
      expect(stored.palettes.map((p) => p.id)).toEqual(['pal-2'])
    })
  })

  it('作品重新指定失败时不删除色卡,避免作品指向不存在的色卡', async () => {
    seedTwoPalettes()
    const onReassignWorkPalette = vi.fn().mockResolvedValue(false)
    const { container } = setup({ works: WORKS, onReassignWorkPalette })
    await waitFor(() => expect(container.querySelector('.my-beads-palette-card')).toBeTruthy())
    fireEvent.click(within(container.querySelectorAll('.my-beads-palette-card')[0]).getByText('旧色卡'))
    await waitFor(() => expect(container.querySelector('.my-beads-palette-detail')).toBeTruthy())
    fireEvent.click(container.querySelector('.my-beads-palette-detail .my-beads-icon-btn.danger'))

    const select = await waitFor(() => document.querySelector('.my-beads-reassign select'))
    fireEvent.change(select, { target: { value: 'pal-2' } })
    fireEvent.click(within(document.querySelector('.my-beads-reassign')).getByText(/重新指定到所选色卡/))

    await waitFor(() => expect(onReassignWorkPalette).toHaveBeenCalled())
    // 有作品没改成功 → 色卡保留
    await new Promise((r) => setTimeout(r, 20))
    const stored = JSON.parse(localStorage.getItem('personal-beads-v1'))
    expect(stored.palettes.map((p) => p.id)).toEqual(['pal-1', 'pal-2'])
  })

  it('无作品引用时删除确认框不显示重新指定区块', async () => {
    seedTwoPalettes()
    const { container } = setup({ works: [] })
    await waitFor(() => expect(container.querySelector('.my-beads-palette-card')).toBeTruthy())
    fireEvent.click(within(container.querySelectorAll('.my-beads-palette-card')[0]).getByText('旧色卡'))
    await waitFor(() => expect(container.querySelector('.my-beads-palette-detail')).toBeTruthy())
    fireEvent.click(container.querySelector('.my-beads-palette-detail .my-beads-icon-btn.danger'))

    await waitFor(() => expect(document.querySelector('.my-beads-modal.confirm')).toBeTruthy())
    expect(document.querySelector('.my-beads-reassign')).toBeNull()
  })
})

describe('MyBeadsPage · 颜色换算', () => {
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
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: /颜色换算/ }))
    await waitFor(() => expect(container.querySelector('.match-results')).toBeTruthy())
    // 目标切到「我的色卡」并选中预置色卡
    fireEvent.click(within(container.querySelector('.match-config .segmented')).getByText('我的色卡'))
    await waitFor(() => expect(container.querySelector('.match-config .picker-palette select').value).toBe('pal-1'))
  }

  it('精确命中显示 exact,但同色无需替换 → 批量接受不勾选', async () => {
    seedPersonalPalette({ exact: true })
    const { container } = setup()
    await openMatchWithPersonal(container)

    const rows = container.querySelectorAll('.match-results .match-card')
    expect(rows.length).toBe(2) // 红 + 蓝
    expect(screen.getAllByText('精确').length).toBe(2)

    fireEvent.click(screen.getByText('勾选精确 / 接近匹配'))
    await waitFor(() => {
      const checked = container.querySelectorAll('.match-results input[type="checkbox"]:checked')
      // 目标 HEX 与源色相同:替换没有意义,不应产生可应用项
      expect(checked.length).toBe(0)
    })
  })

  it('接近匹配可批量接受(2 色)', async () => {
    seedPersonalPalette()
    const { container } = setup()
    await openMatchWithPersonal(container)

    expect(screen.getAllByText('接近').length).toBe(2)
    fireEvent.click(screen.getByText('勾选精确 / 接近匹配'))
    await waitFor(() => {
      const checked = container.querySelectorAll('.match-results input[type="checkbox"]:checked')
      expect(checked.length).toBe(2)
    })
  })

  it('较大色差(poor-match)不会被批量接受', async () => {
    const { container } = setup() // 默认内置 Perler:#FF0000 → P28 ΔE 8.65,较大色差
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: /颜色换算/ }))
    await waitFor(() => expect(container.querySelector('.match-results')).toBeTruthy())

    expect(screen.getAllByText('色差较大').length).toBe(2)
    fireEvent.click(screen.getByText('勾选精确 / 接近匹配'))
    await waitFor(() => {
      const checked = container.querySelectorAll('.match-results input[type="checkbox"]:checked')
      expect(checked.length).toBe(0)
    })
  })

  it('应用替换只回调一次矩阵,且空白格不被填充', async () => {
    seedPersonalPalette()
    const onApplyMapping = vi.fn()
    const { container } = setup({ onApplyMapping })
    await openMatchWithPersonal(container)

    fireEvent.click(screen.getByText('勾选精确 / 接近匹配'))
    await waitFor(() => {
      expect(container.querySelectorAll('.match-results input[type="checkbox"]:checked').length).toBe(2)
    })

    fireEvent.click(screen.getByText(/应用替换|应用 \d+ 种替色/))

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

  it('勾选替色只更新临时预览,不修改真实画布', async () => {
    seedPersonalPalette()
    const onApplyMapping = vi.fn()
    const { container } = setup({ onApplyMapping })
    await openMatchWithPersonal(container)

    fireEvent.click(screen.getByText('勾选精确 / 接近匹配'))
    await waitFor(() => {
      expect(container.querySelectorAll('.match-results input[type="checkbox"]:checked').length).toBe(2)
    })
    // 预览摘要出现,但真实画布未被回调
    expect(container.querySelector('.match-preview-stats').textContent).toContain('预计修改')
    expect(onApplyMapping).not.toHaveBeenCalled()
  })

  it('没有勾选任何替色时应用按钮禁用并说明原因', async () => {
    seedPersonalPalette()
    const { container } = setup()
    await openMatchWithPersonal(container)

    const applyBtn = container.querySelector('.my-beads-match-actions .my-beads-btn.primary')
    expect(applyBtn.disabled).toBe(true)
    expect(container.textContent).toContain('先勾选至少一种替色')
  })

  it('阈值 0 不回退到默认 6(全部判为色差较大)', async () => {
    seedPersonalPalette()
    const { container } = setup()
    await openMatchWithPersonal(container)
    // 默认阈值 6 时是「接近」
    expect(screen.getAllByText('接近').length).toBe(2)

    fireEvent.click(screen.getByText('高级设置'))
    const thresholdSelect = await waitFor(() => {
      const el = container.querySelector('.match-advanced select[aria-label="颜色接近程度"]')
      expect(el).toBeTruthy()
      return el
    })
    fireEvent.change(thresholdSelect, { target: { value: 'custom' } })
    const numInput = container.querySelector('.match-advanced input[aria-label="颜色接近程度"]')
    fireEvent.change(numInput, { target: { value: '0' } })

    // ΔE 极小但非 0 的两色在阈值 0 下全部判为「色差较大」
    await waitFor(() => expect(screen.getAllByText('色差较大').length).toBe(2))
  })

  it('尺寸不兼容时整表标记,不给出目标色', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: /颜色换算/ }))
    await waitFor(() => expect(container.querySelector('.match-results')).toBeTruthy())

    // 高级设置里把图纸豆径填 2.6,Perler 是 5mm → incompatible-size
    fireEvent.click(screen.getByText('高级设置'))
    const sizeSelect = await waitFor(() => {
      const el = container.querySelector('.match-advanced select[aria-label="你准备使用的豆子直径"]')
      expect(el).toBeTruthy()
      return el
    })
    fireEvent.change(sizeSelect, { target: { value: '2.6' } })

    await waitFor(() => {
      expect(screen.getAllByText('尺寸不兼容').length).toBe(2)
    })
    const disabled = container.querySelectorAll('.match-results input[type="checkbox"][disabled]')
    expect(disabled.length).toBe(2)
  })

  it('没有可匹配的图纸时给可行动空状态与返回画布入口', async () => {
    const { container } = setup({ canvasData: [] })
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: /颜色换算/ }))

    const empty = await waitFor(() => {
      const el = container.querySelector('.my-beads-empty-action')
      expect(el).toBeTruthy()
      return el
    })
    expect(empty.textContent).toContain('先画一张图纸，再回来换算')
    // 空状态也要解释「这页什么时候用得上」,否则第一次进来的用户无从下手
    const section = container.querySelector('.match-workspace')
    expect(section.textContent).toContain('什么时候用得上')
    expect(within(empty).getByText('返回画布')).toBeTruthy()
  })

  it('个人目标色卡没有颜色时给「去管理这张色卡」入口', async () => {
    localStorage.setItem('personal-beads-v1', JSON.stringify({
      version: 1,
      palettes: [{ id: 'pal-empty', name: '空色卡', brandName: '', seriesName: '', beadSizeMm: null, notes: '' }],
      colors: [],
      inventory: [],
    }))
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: /颜色换算/ }))
    fireEvent.click(within(container.querySelector('.match-config .segmented')).getByText('我的色卡'))

    const empty = await waitFor(() => {
      const el = container.querySelector('.my-beads-empty-action')
      expect(el).toBeTruthy()
      return el
    })
    expect(empty.textContent).toContain('你的色卡里还没有颜色')
    expect(within(empty).getByText('去管理这张色卡')).toBeTruthy()
  })

  it('切到「我的色卡」但一张都没有时,给创建入口而不是「色卡没颜色」', async () => {
    // 移动端常见路径:用户还没建过个人色卡,直接来匹配页点「我的色卡」。
    // 此前会显示「你的色卡里还没有颜色」+「去管理这张色卡」,
    // 但根本没有色卡可管理,下一步是死路。
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('.my-beads-inner')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: /颜色换算/ }))
    fireEvent.click(within(container.querySelector('.match-config .segmented')).getByText('我的色卡'))

    const empty = await waitFor(() => {
      const el = container.querySelector('.my-beads-empty-action')
      expect(el).toBeTruthy()
      return el
    })
    expect(empty.textContent).toContain('你还没有个人色卡')
    expect(within(empty).getByText('复制品牌色卡')).toBeTruthy()
    expect(within(empty).getByText('新建自定义色卡')).toBeTruthy()
  })
})
