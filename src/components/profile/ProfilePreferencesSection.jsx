/**
 * ProfilePreferencesSection — 个人中心「偏好设置」分区。
 *
 * 个人中心是独立页,全站 Header 不渲染,因此语言切换只能在这里提供。
 * 直接复用 Header/LanguageSelector(自带 PC/平板/手机三种形态 +
 * switchLanguage 懒加载),不另写一套语言状态。
 *
 * 编辑器偏好(填充空白格 / 导出后扣库存)仍留在创作页 —— 不在这里重复一份,
 * 避免出现第二个设置源。这里只做说明与跳转。
 */

import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowRight, Globe } from 'lucide-react'
import LanguageSelector from '../Header/LanguageSelector'

export default function ProfilePreferencesSection() {
  const { t } = useTranslation()

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
