/**
 * 个人色卡 / 库存的云端仓库(Supabase,migration 0021)。
 *
 * 与 localBeadStore 同接口,useUserPalettes 按登录态切换。
 * 所有访问都经过 RLS(auth.uid() = user_id),这里不做"客户端权限判断"
 * 之外的任何安全假设 —— 前端隐藏按钮不是安全控制。
 */

import { supabase } from '../supabase'
import { normalizePaletteInput, normalizeColorInput } from './personalPalette'

function fail(errors) {
  return { ok: false, errors }
}

function fromDbError(error) {
  return fail([{ code: 'cloud', detail: error?.message || String(error) }])
}

const rowToPalette = (row) => ({
  id: row.id,
  name: row.name,
  brandName: row.brand_name || '',
  seriesName: row.series_name || '',
  beadSizeMm: row.bead_size_mm === null || row.bead_size_mm === undefined ? null : Number(row.bead_size_mm),
  notes: row.notes || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const rowToColor = (row) => ({
  id: row.id,
  paletteId: row.palette_id,
  code: row.code,
  name: row.name || '',
  hex: row.hex,
  notes: row.notes || '',
  sortOrder: row.sort_order || 0,
  source: row.source || 'factory',
})

const rowToInventory = (row) => ({
  id: row.id,
  paletteKey: row.palette_key,
  paletteColorId: row.palette_color_id || null,
  quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
  status: row.status || 'owned',
  notes: row.notes || '',
  updatedAt: row.updated_at,
})

/**
 * @param {object} client - Supabase client(默认用全局实例,测试可注入桩)
 * @param {string} userId - 当前登录用户 id。插入行必须显式带 user_id:
 *   `user_palettes` / `user_palette_colors` / `user_bead_inventory` 的 user_id
 *   是 not null 且无默认值,RLS 的 with check 也会校验它等于 auth.uid()。
 */
export function createCloudBeadStore(client = supabase, userId = null) {
  if (!client) {
    return {
      mode: 'cloud',
      async load() { return { palettes: [], colors: [], inventory: [] } },
      async createPalette() { return fail([{ code: 'cloudNotConfigured' }]) },
      async createPaletteWithColors() { return fail([{ code: 'cloudNotConfigured' }]) },
      async updatePalette() { return fail([{ code: 'cloudNotConfigured' }]) },
      async deletePalette() { return fail([{ code: 'cloudNotConfigured' }]) },
      async addColor() { return fail([{ code: 'cloudNotConfigured' }]) },
      async addColors() { return fail([{ code: 'cloudNotConfigured' }]) },
      async updateColor() { return fail([{ code: 'cloudNotConfigured' }]) },
      async deleteColor() { return fail([{ code: 'cloudNotConfigured' }]) },
      async setInventory() { return fail([{ code: 'cloudNotConfigured' }]) },
      async removeInventory() { return fail([{ code: 'cloudNotConfigured' }]) },
      takeError() { return null },
    }
  }

  let lastError = null
  const remember = (e) => { lastError = e; return e }

  return {
    mode: 'cloud',
    takeError() {
      const e = lastError
      lastError = null
      return e
    },

    async load() {
      // 三表并行拉取;失败直接抛出,由 hook 决定回退策略(不静默当空数据)
      const [pRes, cRes, iRes] = await Promise.all([
        client.from('user_palettes').select('*').order('created_at', { ascending: true }),
        client.from('user_palette_colors').select('*').order('sort_order', { ascending: true }),
        client.from('user_bead_inventory').select('*'),
      ])
      const err = pRes.error || cRes.error || iRes.error
      if (err) {
        remember({ code: 'cloud', detail: err.message })
        throw err
      }
      return {
        palettes: (pRes.data || []).map(rowToPalette),
        colors: (cRes.data || []).map(rowToColor),
        inventory: (iRes.data || []).map(rowToInventory),
      }
    },

    async createPalette(input) {
      const res = normalizePaletteInput(input)
      if (!res.ok) return res
      const { data, error } = await client
        .from('user_palettes')
        .insert({
          user_id: userId,
          name: res.palette.name,
          brand_name: res.palette.brandName || null,
          series_name: res.palette.seriesName || null,
          bead_size_mm: res.palette.beadSizeMm,
          notes: res.palette.notes || null,
        })
        .select()
        .single()
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true, palette: rowToPalette(data) }
    },

    async updatePalette(id, patch) {
      const res = normalizePaletteInput(patch)
      if (!res.ok) return res
      const { data, error } = await client
        .from('user_palettes')
        .update({
          name: res.palette.name,
          brand_name: res.palette.brandName || null,
          series_name: res.palette.seriesName || null,
          bead_size_mm: res.palette.beadSizeMm,
          notes: res.palette.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true, palette: rowToPalette(data) }
    },

    async deletePalette(id) {
      // 级联删除由迁移里的 on delete cascade 完成(颜色 + 库存)
      const { error } = await client.from('user_palettes').delete().eq('id', id)
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true }
    },

    async addColor(paletteId, input, existingColors = []) {
      const res = normalizeColorInput(input, { existingColors })
      if (!res.ok) return res
      const { data, error } = await client
        .from('user_palette_colors')
        .insert({
          user_id: userId,
          palette_id: paletteId,
          code: res.color.code,
          name: res.color.name || null,
          hex: res.color.hex,
          notes: res.color.notes || null,
          sort_order: res.color.sortOrder,
          source: res.color.source,
        })
        .select()
        .single()
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true, color: rowToColor(data) }
    },

    /**
     * 批量添加颜色(CSV/JSON 导入用)。单次 insert,任何一行不合法则整体拒绝。
     */
    async addColors(paletteId, inputs = [], existingColors = []) {
      const accepted = [...existingColors]
      const colors = []
      for (let i = 0; i < inputs.length; i++) {
        const res = normalizeColorInput(inputs[i], { existingColors: accepted })
        if (!res.ok) return { ok: false, errors: res.errors.map((e) => ({ ...e, index: i })) }
        colors.push(res.color)
        accepted.push({ id: `__draft_${i}`, code: res.color.code })
      }
      if (colors.length === 0) return { ok: true, colors: [] }
      const { data, error } = await client
        .from('user_palette_colors')
        .insert(colors.map((c, i) => ({
          user_id: userId,
          palette_id: paletteId,
          code: c.code,
          name: c.name || null,
          hex: c.hex,
          notes: c.notes || null,
          sort_order: existingColors.length + i,
          source: c.source,
        })))
        .select()
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true, colors: (data || []).map(rowToColor) }
    },

    /**
     * 一次性创建色卡 + 全部颜色(复制内置色卡用)。
     * 先建色卡,再单次批量 insert 颜色;颜色失败时回滚删除刚建的色卡,
     * 避免留下一个空壳色卡(云端没有跨请求事务,这里做补偿删除)。
     */
    async createPaletteWithColors(input, colorInputs = []) {
      const res = normalizePaletteInput(input)
      if (!res.ok) return res
      const colors = []
      for (let i = 0; i < colorInputs.length; i++) {
        const c = normalizeColorInput(colorInputs[i], { existingColors: colors })
        if (!c.ok) return { ok: false, errors: c.errors.map((e) => ({ ...e, index: i })) }
        colors.push(c.color)
      }
      const { data: paletteRow, error: pErr } = await client
        .from('user_palettes')
        .insert({
          user_id: userId,
          name: res.palette.name,
          brand_name: res.palette.brandName || null,
          series_name: res.palette.seriesName || null,
          bead_size_mm: res.palette.beadSizeMm,
          notes: res.palette.notes || null,
        })
        .select()
        .single()
      if (pErr) { remember({ code: 'cloud', detail: pErr.message }); return fromDbError(pErr) }

      if (colors.length === 0) {
        return { ok: true, palette: rowToPalette(paletteRow), colors: [] }
      }
      const { data: colorRows, error: cErr } = await client
        .from('user_palette_colors')
        .insert(colors.map((c, i) => ({
          user_id: userId,
          palette_id: paletteRow.id,
          code: c.code,
          name: c.name || null,
          hex: c.hex,
          notes: c.notes || null,
          sort_order: Number.isFinite(Number(colorInputs[i].sortOrder)) ? Number(colorInputs[i].sortOrder) : i,
          source: c.source,
        })))
        .select()
      if (cErr) {
        // 补偿删除:不留半成品色卡
        await client.from('user_palettes').delete().eq('id', paletteRow.id)
        remember({ code: 'cloud', detail: cErr.message })
        return fromDbError(cErr)
      }
      return {
        ok: true,
        palette: rowToPalette(paletteRow),
        colors: (colorRows || []).map(rowToColor),
      }
    },

    async updateColor(id, patch, existingColors = []) {
      const res = normalizeColorInput(patch, { existingColors, ignoreId: id })
      if (!res.ok) return res
      const { data, error } = await client
        .from('user_palette_colors')
        .update({
          code: res.color.code,
          name: res.color.name || null,
          hex: res.color.hex,
          notes: res.color.notes || null,
          sort_order: res.color.sortOrder,
          source: res.color.source,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true, color: rowToColor(data) }
    },

    async deleteColor(id) {
      const { error } = await client.from('user_palette_colors').delete().eq('id', id)
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true }
    },

    async setInventory({ paletteKey, paletteColorId = null, quantity = null, status = 'owned', notes = '' }) {
      if (!paletteKey) return fail([{ code: 'notFound' }])
      let qty = null
      if (quantity !== null && quantity !== undefined && String(quantity).trim() !== '') {
        const n = Number(quantity)
        if (!Number.isFinite(n) || n < 0) return fail([{ code: 'invalidQuantity' }])
        qty = Math.trunc(n)
      }
      const allowed = ['owned', 'low', 'out_of_stock']
      const st = allowed.includes(status) ? status : 'owned'
      const { data, error } = await client
        .from('user_bead_inventory')
        .upsert({
          user_id: userId,
          palette_key: paletteKey,
          palette_color_id: paletteColorId,
          quantity: qty,
          status: st,
          notes: typeof notes === 'string' ? notes.slice(0, 500) : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,palette_key' })
        .select()
        .single()
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true, record: rowToInventory(data) }
    },

    async removeInventory(paletteKey) {
      const { error } = await client.from('user_bead_inventory').delete().eq('palette_key', paletteKey)
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true }
    },
  }
}
