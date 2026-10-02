/**
 * AdminDashboardPage — /admin/dashboard 管理概览
 *
 * 后台首页:一屏看清「谁在用(用户增长/活跃/冻结)」「内容库什么状态(规模/分布/
 * 热门/健康检查)」「有什么待办(未回复留言)」,并能一键跳到对应标签页处理。
 *
 * 文案直接用中文:后台只有管理员使用,不做 i18n —— 否则每加一项统计都要在 4 个
 * locale 文件里同步键(scripts/check-i18n.js 强制键集一致),维护成本远高于收益。
 *
 * 数据源:
 *   · admin_overview() RPC        —— 用户口径 + 14 天注册趋势 + 留言待办聚合
 *   · admin_list_registrations()  —— 最近注册名单
 *   · cloudStore(templates/categories) —— 内容库统计与健康检查(纯函数计算)
 * 门禁:与 /admin 共用 AdminGate(未登录/非管理员不可见)。
 */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import AdminGate from './AdminGate'
import ThumbnailCanvas from './ThumbnailCanvas'
import useAdminOverview, { OVERVIEW_ERROR_TIMEOUT } from '../hooks/useAdminOverview'
import { buildTrend, computeLibraryStats, checkContentHealth, TREND_WINDOW_DAYS } from '../utils/adminOverview'
import { PALETTES } from '../data/palettes/index.js'
import { CATEGORIES } from '../data/templates'

const VALID_PALETTE_IDS = Object.keys(PALETTES)
const TREND_DAYS = TREND_WINDOW_DAYS

const PALETTE_NAMES = {
  coco: 'COCO', mard: 'MARD', mard291: 'MARD 291', perler: 'Perler', hama: 'Hama', artkal: 'Artkal',
}
const BUILTIN_CATEGORY_NAMES = {
  animal: '动物', food: '食物', icon: '图标', holiday: '节日',
}
const DIFFICULTY_NAMES = { easy: '简单', medium: '中等', hard: '困难' }

// 健康检查项 → 修复入口(后台标签页)
const ISSUE_TAB = {
  invalidPattern: 'templates',
  thinColors: 'templates',
  sizeMismatch: 'templates',
  missingNameZh: 'templates',
  unknownPalette: 'templates',
  duplicateName: 'templates',
  emptyCategory: 'categories',
  orphanCategory: 'categories',
}

const ISSUE_LABELS = {
  invalidPattern: '图案缺失或无效',
  thinColors: '仅有单一颜色',
  sizeMismatch: '尺寸与图案不一致',
  missingNameZh: '缺少中文名',
  unknownPalette: '色卡品牌无效',
  duplicateName: '模板重名',
  emptyCategory: '分类下没有模板',
  orphanCategory: '分类不存在',
}

const formatDateTime = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function StatCard({ value, label, hint, tone }) {
  return (
    <div className={`adash-kpi${tone ? ` ${tone}` : ''}`}>
      <span className="adash-kpi-value">{value ?? '—'}</span>
      <span className="adash-kpi-label">{label}</span>
      {hint ? <span className="adash-kpi-hint">{hint}</span> : null}
    </div>
  )
}

function Section({ title, extra, children }) {
  return (
    <section className="adash-card">
      <div className="adash-card-head">
        <h2>{title}</h2>
        {extra || null}
      </div>
      {children}
    </section>
  )
}

/** 趋势图 tooltip:日期 + 两种注册方式 + 合计(默认 tooltip 只有数值,不够直观) */
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const pick = (key) => payload.find((item) => item.dataKey === key)?.value || 0
  const email = pick('email')
  const username = pick('username')
  return (
    <div className="adash-tip">
      <span className="adash-tip-date">{label}</span>
      <span className="adash-tip-row"><i className="email" />邮箱注册<b>{email}</b></span>
      <span className="adash-tip-row"><i className="username" />用户名注册<b>{username}</b></span>
      <span className="adash-tip-row total">合计<b>{email + username}</b></span>
    </div>
  )
}

/** 分布条列表:一行 = 标签 + 数量 + 占比条 */
function Distribution({ rows, labelOf, emptyText }) {
  if (!rows.length) return <p className="adash-empty">{emptyText}</p>
  return (
    <ul className="adash-dist">
      {rows.map((row) => (
        <li key={row.id}>
          <span className="adash-dist-label" title={labelOf(row.id)}>{labelOf(row.id)}</span>
          <span className="adash-dist-track">
            <span className="adash-dist-fill" style={{ width: `${Math.round(row.share * 1000) / 10}%` }} />
          </span>
          <span className="adash-dist-count">{row.count}</span>
        </li>
      ))}
    </ul>
  )
}

export default function AdminDashboardPage({ cloudStore, user, isAdmin, authLoading, onLogin, onLogout }) {
  const navigate = useNavigate()
  const cloudEnabled = !!cloudStore?.enabled
  const authorized = cloudEnabled && !authLoading && !!user && !!isAdmin

  const { loading, error, overview, registrations, loadedAt, reload } = useAdminOverview({ enabled: authorized })
  const templates = cloudStore?.templates
  const cloudCategories = cloudStore?.categories

  const trend = useMemo(() => buildTrend(overview?.registrations, { days: TREND_DAYS }), [overview])
  const library = useMemo(() => computeLibraryStats(templates, cloudCategories), [templates, cloudCategories])
  const health = useMemo(
    () => checkContentHealth(templates, cloudCategories, { validPaletteIds: VALID_PALETTE_IDS }),
    [templates, cloudCategories],
  )

  const users = overview?.users
  const contact = overview?.contact
  const pendingList = Array.isArray(contact?.pendingList) ? contact.pendingList : []

  const categoryLabel = (id) => {
    const custom = cloudCategories?.find((cat) => cat.id === id)
    return custom?.label || BUILTIN_CATEGORY_NAMES[id] || id
  }
  const paletteLabel = (id) => PALETTE_NAMES[id] || id
  const difficultyLabel = (id) => DIFFICULTY_NAMES[id] || id

  const refreshAll = () => {
    reload()
    cloudStore?.refresh?.()
  }
  const openPanel = (tab) => navigate(tab ? `/admin?tab=${tab}` : '/admin')

  return (
    <AdminGate
      cloudEnabled={cloudEnabled}
      authLoading={authLoading}
      user={user}
      isAdmin={isAdmin}
      onLogin={onLogin}
      onLogout={onLogout}
    >
      {() => (
      <div className="adash">
        <header className="adash-header">
          <div className="adash-header-main">
            <h1>管理概览</h1>
            <p>
              用户增长、内容库与待办一屏总览
              {loadedAt ? ` · 更新于 ${formatDateTime(loadedAt)}` : ''}
            </p>
          </div>
          <div className="adash-header-actions">
            <button type="button" className="adash-btn" onClick={refreshAll} disabled={loading}>
              {loading ? '刷新中…' : '刷新数据'}
            </button>
            <button type="button" className="adash-btn ghost" onClick={() => openPanel()}>
              返回后台
            </button>
          </div>
        </header>

        {error ? (
          <div className="adash-alert" role="alert">
            <span>
              {error === OVERVIEW_ERROR_TIMEOUT
                ? '加载超时:网络较慢或会话刷新中,请重试'
                : '概览数据加载失败,请重试'}
            </span>
            <button type="button" className="adash-btn small" onClick={reload}>重试</button>
          </div>
        ) : null}

        {/* ── 用户与增长 ─────────────────────────────────────── */}
        <Section title="用户与增长">
          <div className="adash-kpis">
            <StatCard
              value={users?.total}
              label="注册用户"
              hint={`已验证 ${users?.verified ?? 0} · 未验证 ${users?.unverified ?? 0}`}
              tone="accent"
            />
            <StatCard value={users?.new7d} label="近 7 天新增" hint={`近 30 天 ${users?.new30d ?? 0}`} />
            <StatCard value={users?.active7d} label="近 7 天活跃" hint={`从未登录 ${users?.neverSignedIn ?? 0}`} tone="ok" />
            <StatCard value={users?.admins} label="管理员" />
            <StatCard value={users?.usernameAccounts} label="用户名账号" />
            <StatCard value={users?.banned} label="冻结中" tone={users?.banned ? 'warn' : undefined} />
          </div>
        </Section>

        <div className="adash-grid-2">
          {/* ── 近 14 天注册趋势 ─────────────────────────────── */}
          <Section title={`近 ${TREND_DAYS} 天注册趋势`} extra={<span className="adash-total">合计 {trend.windowTotal}</span>}>
            {/* 图表恒常渲染:即使窗口内全为 0,坐标轴与 14 天刻度也在,便于确认「确实没有新注册」 */}
            <div className="adash-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend.bars} margin={{ top: 6, right: 6, bottom: 0, left: -16 }} barCategoryGap="24%">
                  <CartesianGrid vertical={false} stroke="var(--border-color)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => value.slice(5)}
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border-color)' }}
                    minTickGap={14}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    // 全零时 recharts 默认量程会到 4,留白过大;此时钉在 [0,1]
                    domain={[0, trend.peak > 0 ? 'auto' : 1]}
                  />
                  <Tooltip content={<TrendTooltip />} cursor={{ fill: 'var(--accent-soft)', fillOpacity: 0.35 }} />
                  <Legend
                    verticalAlign="bottom"
                    height={24}
                    iconType="square"
                    iconSize={9}
                    formatter={(value) => <span className="adash-chart-legend">{value}</span>}
                  />
                  <Bar dataKey="email" stackId="reg" name="邮箱注册" fill="var(--accent)" />
                  <Bar dataKey="username" stackId="reg" name="用户名注册" fill="var(--secondary-accent)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="adash-legend">
              <span className="adash-legend-item">单日峰值 {trend.peak}</span>
              {trend.hasData
                ? <span className="adash-legend-item">邮箱 {trend.emailTotal} · 用户名 {trend.usernameTotal}</span>
                : <span className="adash-legend-item muted">该时间段内暂无新注册</span>}
            </div>
          </Section>

          {/* ── 最近注册 ─────────────────────────────────────── */}
          <Section
            title="最近注册"
            extra={<button type="button" className="adash-link" onClick={() => openPanel('users')}>全部用户</button>}
          >
            {registrations.length ? (
              <ul className="adash-list">
                {registrations.map((row) => (
                  <li key={row.id}>
                    <span className={`adash-badge ${row.method === 'username' ? 'username' : 'email'}`}>
                      {row.method === 'username' ? '用户名' : '邮箱'}
                    </span>
                    <span className="adash-list-main">{row.nickname || row.email || '—'}</span>
                    <span className="adash-list-time">{formatDateTime(row.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adash-empty">{loading ? '加载中…' : '暂无注册记录'}</p>
            )}
          </Section>
        </div>

        {/* ── 内容库 ─────────────────────────────────────────── */}
        <Section
          title="内容库"
          extra={<button type="button" className="adash-link" onClick={() => openPanel('templates')}>管理模板</button>}
        >
          {cloudStore?.loading ? (
            <p className="adash-empty">云端模板库加载中…</p>
          ) : (
            <>
              <div className="adash-kpis">
                <StatCard value={library.total} label="模板总数" tone="accent" />
                <StatCard value={library.builtin} label="内置模板" tone="ok" />
                <StatCard value={library.custom} label="自定义模板" />
                <StatCard value={library.byCategory.length} label="分类数" />
                <StatCard
                  value={library.downloads.toLocaleString()}
                  label="累计下载"
                  hint={`平均 ${library.avgDownloads} 次/模板`}
                />
              </div>
              <div className="adash-grid-2">
                <div>
                  <h3 className="adash-subtitle">按分类</h3>
                  <Distribution rows={library.byCategory} labelOf={categoryLabel} emptyText="暂无数据" />
                </div>
                <div>
                  <h3 className="adash-subtitle">按难度</h3>
                  <Distribution rows={library.byDifficulty} labelOf={difficultyLabel} emptyText="暂无数据" />
                </div>
              </div>
            </>
          )}
        </Section>

        <div className="adash-grid-2">
          {/* ── 热门模板 ─────────────────────────────────────── */}
          <Section title="热门模板(按下载量)">
            {library.hasDownloads ? (
              <ul className="adash-tops">
                {library.topDownloaded.map((tpl) => (
                  <li key={tpl.id}>
                    <span className="adash-thumb">
                      <ThumbnailCanvas pattern={tpl.pattern} size={tpl.size} />
                    </span>
                    <span className="adash-top-main">
                      <span className="adash-top-name">{tpl.nameZh || tpl.name}</span>
                      <span className="adash-top-meta">{paletteLabel(tpl.paletteId || 'perler')} · 尺寸 {tpl.size}</span>
                    </span>
                    <span className="adash-top-count">{tpl.downloadCount || 0} 次</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adash-empty">暂无下载记录</p>
            )}
          </Section>

          {/* ── 留言待办 ─────────────────────────────────────── */}
          <Section
            title="留言待办"
            extra={<button type="button" className="adash-link" onClick={() => openPanel('contact')}>打开消息</button>}
          >
            <div className="adash-kpis compact">
              <StatCard value={contact?.pending} label="待回复" tone={contact?.pending ? 'warn' : 'ok'} />
              <StatCard value={contact?.threads} label="会话数" />
              <StatCard value={contact?.messages} label="消息总数" />
            </div>
            {pendingList.length ? (
              <ul className="adash-list">
                {pendingList.map((row) => (
                  <li key={row.participantId}>
                    <span className="adash-badge warn">未回复</span>
                    <span className="adash-list-main">{row.message}</span>
                    <span className="adash-list-time">{formatDateTime(row.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adash-empty">所有留言均已回复</p>
            )}
          </Section>
        </div>

        {/* ── 内容健康检查 ──────────────────────────────────── */}
        <Section title="内容健康检查" extra={<span className="adash-total">已扫描 {library.total} 个模板</span>}>
          {cloudStore?.loading ? (
            <p className="adash-empty">云端模板库加载中…</p>
          ) : health.ok ? (
            <p className="adash-ok">未发现异常:命名、色卡、图案与分类引用均正常</p>
          ) : (
            <ul className="adash-issues">
              {health.issues.map((issue) => (
                <li key={issue.code} className={issue.severity}>
                  <span className="adash-issue-main">
                    <span className="adash-issue-name">{ISSUE_LABELS[issue.code] || issue.code}</span>
                    {issue.samples.length ? <span className="adash-issue-samples">{issue.samples.join('、')}</span> : null}
                  </span>
                  <span className="adash-issue-count">{issue.count}</span>
                  <button type="button" className="adash-link" onClick={() => openPanel(ISSUE_TAB[issue.code] || 'templates')}>
                    去处理
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── 快捷入口 ──────────────────────────────────────── */}
        <Section title="快捷入口">
          <div className="adash-quick">
            <button type="button" className="adash-quick-item primary" onClick={() => openPanel('templates')}>模板管理</button>
            <button type="button" className="adash-quick-item" onClick={() => openPanel('import')}>JSON 导入</button>
            <button type="button" className="adash-quick-item" onClick={() => openPanel('categories')}>分类管理</button>
            <button type="button" className="adash-quick-item" onClick={() => openPanel('users')}>用户管理</button>
            <button type="button" className="adash-quick-item" onClick={() => openPanel('contact')}>联系消息</button>
          </div>
        </Section>
      </div>
      )}
    </AdminGate>
  )
}
