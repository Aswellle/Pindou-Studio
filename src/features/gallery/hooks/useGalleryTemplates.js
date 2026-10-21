/**
 * useGalleryTemplates — 图库页与详情页共用的模板来源选择。
 *
 * 规则与 Gallery V2 原有实现一致:
 *   - 云端启用且拉取成功 → 只用云端模板(RLS 公开只读);
 *   - 云端拉取失败且没有缓存 → 回退到「自定义 + 内置」,顶部保留故障提示;
 *   - 云端未配置 → 本地模式(自定义在前,内置在后)。
 *
 * 抽出的目的:主题页/合集页/详情页需要与图库首页看到同一份模板,
 * 避免各自复制这段降级逻辑后出现「首页有、详情页没有」的不一致。
 */

import { useMemo } from 'react'
import { TEMPLATES } from '../../../data/templates'
import useCustomTemplates from '../../../hooks/useCustomTemplates'

export function useGalleryTemplates(cloudStore) {
  const localStore = useCustomTemplates()
  const cloudEnabled = !!cloudStore?.enabled

  const localTemplates = useMemo(
    () => [...localStore.templates, ...TEMPLATES],
    [localStore.templates]
  )

  // 云端拉取失败(弱网 / supabase 域名在该网络下不可达):回退到本地 + 内置模板,
  // 让图库仍然可用;顶部保留故障横幅与重试入口 —— 降级,但不静默吞掉故障。
  const cloudDown = cloudEnabled
    && !!cloudStore?.error
    && (cloudStore?.templates?.length || 0) === 0

  const allTemplates = useMemo(
    () => (cloudEnabled && !cloudDown) ? (cloudStore?.templates || []) : localTemplates,
    [cloudEnabled, cloudDown, cloudStore, localTemplates]
  )

  // 模板是否仍在首次加载。
  // 云端已降级(cloudDown)时不算加载中 —— 此时用的是本地模板,可以立即渲染。
  // 主题页/合集页/详情页需要它:模板未到时关联列表必然为空,
  // 若直接按空处理,页面会先闪一下「没有匹配的图纸」再变成真实列表。
  const templatesLoading = cloudEnabled && !cloudDown && !!cloudStore?.loading

  const customCategories = cloudEnabled ? (cloudStore?.categories || []) : localStore.categories

  return {
    cloudEnabled,
    cloudDown,
    templatesLoading,
    localStore,
    allTemplates,
    customCategories,
  }
}

export default useGalleryTemplates
