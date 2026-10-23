/**
 * ProfilePreferencesSection — 个人中心「偏好设置」分区。
 *
 * 个人中心是独立页,全站 Header 不渲染,因此语言切换只能在这里提供。
 * 直接复用 Header/LanguageSelector(自带 PC/平板/手机三种形态 +
 * switchLanguage 懒加载),不另写一套语言状态。
 *
 * 编辑器偏好(填充空白格 / 导出后扣库存)仍留在创作页 —— 不在这里重复一份,
 * 避免出现第二个设置源。这里只做说明与跳转。
 *
 * 例外是**自动保存开关**:它没有对应的创作页入口(草稿是后台行为,
 * 挂在工具条上会变成噪音),而「要不要让浏览器偷偷存东西」属于用户该
 * 自己决定的事,必须有个能找到的地方 —— 放在这里。
 */

import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowRight, Globe, HardDriveDownload } from 'lucide-react'
import LanguageSelector from '../Header/LanguageSelector'
import { useAutoSaveEnabled } from '../../hooks/useAutoSave'

export default function ProfilePreferencesSection({
  // 由 App 持有并下传:开关必须作用于正在运行的那个自动保存实例。
  // 若在这里自己 useState,关掉之后创作页仍然照写草稿 —— 表面关了,实际没关。
  autoSaveEnabled,
  onToggleAutoSave,
}) {
  const { t } = useTranslation()

  // 兜底:本分区被单独渲染时(独立路由 / 测试)仍可工作。
  // 从 ProfilePage 进来时 props 齐全,这个实例不参与渲染。
  const [localEnabled, localToggle] = useAutoSaveEnabled()
  const enabled = autoSaveEnabled ?? localEnabled
  const toggle = onToggleAutoSave ?? localToggle

  return (
    <div className="pf-section-stack">
      <section className="pf-card">
        <div className="pf-card-head">
          <h3>
            <Globe size={16} aria-hidden="true" /> {t('profile.center.languageTitle')}
          </h3>
        </div>
        <p className="pf-hint">{t('profile.center.languageHint')}</p>
        <div className="pf-language-row">
          <LanguageSelector />
        </div>
      </section>

      <section className="pf-card">
        <div className="pf-card-head">
          <h3>
            <HardDriveDownload size={16} aria-hidden="true" /> {t('autosave.toggleLabel')}
          </h3>
        </div>
        <p className="pf-hint">{t('autosave.toggleHint')}</p>
        <label className="pf-switch-row">
          <input
            type="checkbox"
            checked={Boolean(enabled)}
            onChange={(e) => toggle(e.target.checked)}
          />
          <span>{t('autosave.toggleLabel')}</span>
        </label>
      </section>

      <section className="pf-card">
        <div className="pf-card-head">
          <h3>{t('profile.center.editorPrefsTitle')}</h3>
        </div>
        <p className="pf-hint">{t('profile.center.editorPrefsHint')}</p>
        <Link className="pf-inline-link" to="/">
          {t('profile.center.backToCanvas')}
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </section>
    </div>
  )
}
