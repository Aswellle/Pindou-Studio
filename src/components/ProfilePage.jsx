/**
 * ProfilePage — /profile 个人中心独立页面
 *
 * 定位:账号自助管理 + 个人资产总览的统一入口。
 *
 * 形态约束:
 *   · 不继承站点导航 —— App 已把 /profile 归入独立页(隐藏 Header 与画布工具栏),
 *     本页自带返回与标题,页面内不出现图库/画布/登录等其他页面的控件;
 *   · 未登录不做「本页登录」按钮:个人中心没有可管理的内容,直接回独立登录页;
 *   · 桌面端为「左身份/分区导航 + 右主内容」两列,≤900px 收成单栏。
 *
 * 数据来源:
 *   · 身份 —— useAuth 的标准化 user(见 utils/normalizeAuthUser);
 *   · 作品 —— App 传入的 useSavedWorks 结果(不在此新建实例);
 *   · 拼豆资产 —— App 传入的 useUserPalettes 结果(同上)。
 *
 * 本文件只做编排:分区状态、登录门禁、消息条、退出确认。具体区块在
 * components/profile/ 下,每个分区消费同一份 summary。
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, UserRound, ShieldCheck, Boxes, Settings2, LayoutGrid, Heart,
} from 'lucide-react'
import BackButton from './BackButton'
import { useScrollLock } from '../hooks/useScrollLock'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { buildProfileSummary } from './profile/profileSummary'
import ProfileOverview from './profile/ProfileOverview'
import ProfileInfoSection from './profile/ProfileInfoSection'
import ProfileSecuritySection from './profile/ProfileSecuritySection'
import ProfileAssetsSection from './profile/ProfileAssetsSection'
import ProfileWorksSection from './profile/ProfileWorksSection'
import ProfileFavoritesSection from './profile/ProfileFavoritesSection'
import ProfilePreferencesSection from './profile/ProfilePreferencesSection'
import LoadingScreen from './LoadingScreen'
import './profile/ProfilePage.css'

const SECTIONS = [
  { id: 'overview', icon: LayoutDashboard, labelKey: 'profile.center.sectionOverview' },
  { id: 'works', icon: LayoutGrid, labelKey: 'profile.center.sectionWorks' },
  { id: 'favorites', icon: Heart, labelKey: 'profile.center.sectionFavorites' },
  { id: 'info', icon: UserRound, labelKey: 'profile.center.sectionInfo' },
  { id: 'security', icon: ShieldCheck, labelKey: 'profile.center.sectionSecurity' },
  { id: 'assets', icon: Boxes, labelKey: 'profile.center.sectionAssets' },
  { id: 'preferences', icon: Settings2, labelKey: 'profile.center.sectionPreferences' },
]

export default function ProfilePage({
  user,
  authLoading,
  onLogout,
  onUpdateProfile,
  onChangePassword,
  // 资产(App 持有的同一份实例)
  works,
  worksLoading,
  worksError,
  cloudMirrorCount,
  beadStore,
  onRetryWorks,
  onRetryBeads,
  // 作品操作(与图库时期同一套回调,由 App 传入)
  onLoadWork,
  onDeleteWork,
  onShowVersions,
  // 收藏:图库卡片上的心形按钮与这里共用 useGalleryFavorites
  favorites,
  isFavorite,
  removeFavorite,
  cloudStore,
  onLoadTemplate,
  // 账号安全扩展能力
  onSendOtp,
  onSetPasswordWithOtp,
  onChangeEmail,
  onVerifyPassword,
  onSetSecurityKey,
  // 自动保存开关(App 持有同一份状态:个人中心改完立刻作用于正在运行的自动保存)
  autoSaveEnabled,
  onToggleAutoSave,
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [section, setSection] = useState('overview')
  const [message, setMessage] = useState(null) // { text, tone: 'success' | 'error' }
  const [confirmLogout, setConfirmLogout] = useState(false)

  useScrollLock(confirmLogout)

  const { ref: confirmRef, dialogProps: confirmDialogProps } = useDialogA11y({
    open: confirmLogout,
    onClose: () => setConfirmLogout(false),
    label: t('profile.confirmLogoutTitle'),
    role: 'alertdialog',
  })

  // 消息条 4 秒后自动收起;出错时保留更久,避免用户还没读完就消失
  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(() => setMessage(null), message.tone === 'error' ? 6000 : 3500)
    return () => clearTimeout(timer)
  }, [message])

  // 切换分区时把页面滚回顶部 —— 否则从长表单切到概览会停在半空
  // biome-ignore lint/correctness/useExhaustiveDependencies: section 只作为「切换」信号,不参与计算
  useEffect(() => {
    document.querySelector('.profile-page')?.scrollTo?.({ top: 0 })
  }, [section])

  const summary = useMemo(
    () => buildProfileSummary({ works, worksLoading, worksError, beadStore }),
    [works, worksLoading, worksError, beadStore],
  )

  const pushMessage = (text, tone = 'success') => setMessage({ text, tone })

  // 会话解析中:此时 user 仍为 null,不能据此判定未登录(否则已登录用户会被踢到登录页)
  if (authLoading) {
    return (
      <div className="profile-page">
        <LoadingScreen />
      </div>
    )
  }

  // 未登录:本页不提供登录入口(登录是 /login 的职责)
  if (!user) return <Navigate to="/login" replace />

  // 返回上一页;深链接直达(无浏览历史)时兜底回首页
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  const sectionProps = {
    user,
    summary,
    onMessage: pushMessage,
    onRetryWorks,
    onRetryBeads,
    onGotoSection: setSection,
  }

  return (
    <div className="profile-page">
      <div className="profile-page-inner">
        <header className="profile-page-bar">
          <BackButton size="lg" onClick={handleBack} />
          <div className="profile-page-title">
            <h1>{t('profile.center.title')}</h1>
            <p>{t('profile.center.subtitle')}</p>
          </div>
          <button
            type="button"
            className="profile-create-btn"
            onClick={() => navigate('/')}
          >
            {t('profile.center.backToCreate')}
          </button>
        </header>

        {message ? (
          <div
            className={`profile-toast tone-${message.tone}`}
            role={message.tone === 'error' ? 'alert' : 'status'}
          >
            <span>{message.text}</span>
            <button
              type="button"
              className="profile-toast-close"
              onClick={() => setMessage(null)}
              aria-label={t('common.close')}
            >
              ×
            </button>
          </div>
        ) : null}

        <div className="pf-layout">
          {/* ── 左:身份摘要 + 分区导航 ─────────────────────── */}
          <aside className="pf-rail">
            <nav className="pf-nav" aria-label={t('profile.center.navLabel')}>
              {SECTIONS.map(({ id, icon: Icon, labelKey }) => (
                <button
                  key={id}
                  type="button"
                  className={`pf-nav-item${section === id ? ' active' : ''}`}
                  aria-current={section === id ? 'page' : undefined}
                  onClick={() => setSection(id)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{t(labelKey)}</span>
                </button>
              ))}
            </nav>

            <div className="pf-rail-footer">
              <button
                type="button"
                className="pf-btn danger block"
                onClick={() => setConfirmLogout(true)}
              >
                {t('auth.logout')}
              </button>
            </div>
          </aside>

          {/* ── 右:分区内容 ─────────────────────────────────── */}
          <main className="pf-main">
            {section === 'overview' ? <ProfileOverview {...sectionProps} /> : null}
            {section === 'works' ? (
              <ProfileWorksSection
                works={works}
                worksLoading={worksLoading}
                worksError={worksError}
                onRetry={onRetryWorks}
                onLoadWork={onLoadWork}
                onDeleteWork={onDeleteWork}
                onShowVersions={onShowVersions}
                cloudMirrorCount={cloudMirrorCount}
                onOpenGallery={() => navigate('/gallery')}
              />
            ) : null}
            {section === 'favorites' ? (
              <ProfileFavoritesSection
                cloudStore={cloudStore}
                favorites={favorites || []}
                isFavorite={isFavorite}
                removeFavorite={removeFavorite}
                onLoadTemplate={onLoadTemplate}
                onOpenGallery={() => navigate('/gallery')}
              />
            ) : null}
            {section === 'info' ? (
              <ProfileInfoSection
                user={user}
                onUpdateProfile={onUpdateProfile}
                onMessage={pushMessage}
              />
            ) : null}
            {section === 'security' ? (
              <ProfileSecuritySection
                user={user}
                onChangePassword={onChangePassword}
                onSendOtp={onSendOtp}
                onSetPassword={onSetPasswordWithOtp}
                onChangeEmail={onChangeEmail}
                onVerifyPassword={onVerifyPassword}
                onSetSecurityKey={onSetSecurityKey}
                onMessage={pushMessage}
              />
            ) : null}
            {section === 'assets' ? (
              <ProfileAssetsSection
                summary={summary}
                onRetryWorks={onRetryWorks}
                onRetryBeads={onRetryBeads}
                onGotoSection={setSection}
              />
            ) : null}
            {section === 'preferences' ? (
              <ProfilePreferencesSection
                autoSaveEnabled={autoSaveEnabled}
                onToggleAutoSave={onToggleAutoSave}
              />
            ) : null}
          </main>
        </div>
      </div>

      {/* 退出登录确认(防误触)—— portal 到 body,复用共享浮层契约 */}
      {confirmLogout && createPortal(
        <div className="profile-confirm-overlay" onClick={() => setConfirmLogout(false)}>
          <div className="modal-content confirm-box" ref={confirmRef} {...confirmDialogProps} onClick={(e) => e.stopPropagation()}>
            <h3>{t('profile.confirmLogoutTitle')}</h3>
            <p>{t('profile.confirmLogoutBody')}</p>
            <div className="confirm-actions">
              <button type="button" className="pf-btn ghost" onClick={() => setConfirmLogout(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="pf-btn danger" onClick={() => { setConfirmLogout(false); onLogout() }}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
