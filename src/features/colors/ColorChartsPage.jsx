/**
 * 品牌色卡对照页(/colors 与 /colors/:brand)。
 *
 * 数据全部来自本地色卡(PALETTE_LIST),不联网、不依赖 Supabase ——
 * 六个品牌页在构建期就被预渲染成完整静态 HTML(含全部色号表格),
 * React 挂载后是同一份内容,只是多了搜索框与站内跳转。
 *
 * 字体对色号、色值、名称三类信息并排列出:照着图纸备料时,
 * 用户通常手里只有一个色号,需要同时找到色值(校色)与名字(买货时对货)。
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BackButton from '../../components/BackButton'
import { PALETTE_LIST } from '../../data/palettes'
import {
  BRAND_INTROS,
  colorBrands,
  colorChartPath,
  colorGroups,
  groupLabel,
  resolveColorBrand,
} from './colorCharts'
// 复用内容页的排版(content-page / content-title / content-related 等)
import '../gallery/gallery.css'
import './colors.css'
// 备料系列共用:站内链接下划线标识与页脚胶囊行(.tools-links / .tools-link-chip)
import '../tools/tools.css'

/** 只接受 CSS 颜色形状的 hex,畸形值不进 style */
const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i

/** 色卡表:色号 / 颜色 / 名称 / HEX / RGB */
function ColorTable({ palette, groups, query }) {
  const { t } = useTranslation()
  const nameOf = (color) =>
    t(`palette.colorNames.${palette.id}.${color.id}`, color.nameZh || color.name || color.id)

  const needle = query.trim().toLowerCase()
  const visible = groups
    .map((group) => ({
      ...group,
      colors: needle
        ? group.colors.filter((color) => {
          const name = nameOf(color)
          return (
            color.id.toLowerCase().includes(needle) ||
            String(name).toLowerCase().includes(needle) ||
            String(color.hex).toLowerCase().includes(needle)
          )
        })
        : group.colors,
    }))
    .filter((group) => group.colors.length > 0)

  if (visible.length === 0) {
    return <p className="content-desc" role="status">{t('colorsPage.searchEmpty')}</p>
  }

  return (
    <table className="color-chart-table">
      <thead>
        <tr>
          <th scope="col">{t('colorsPage.tableCode')}</th>
          <th scope="col">{t('colorsPage.tableColor')}</th>
          <th scope="col">{t('colorsPage.tableName')}</th>
          <th scope="col">{t('colorsPage.tableHex')}</th>
          <th scope="col">{t('colorsPage.tableRgb')}</th>
        </tr>
      </thead>
      <tbody>
        {visible.map((group) => [
          group.key ? (
            <tr key={`g-${group.key}`} className="color-group-row">
              <th scope="colgroup" colSpan={5}>
                {t('colorsPage.groupTitle', {
                  label: t(`palette.groupNames.${palette.id}.${group.key}`, groupLabel(palette, group.key)),
                  n: group.colors.length,
                })}
              </th>
            </tr>
          ) : null,
          ...group.colors.map((color) => {
            const name = nameOf(color)
            return (
              <tr key={color.id}>
                <td className="color-code"><code>{color.id}</code></td>
                <td>
                  <span
                    className="color-swatch"
                    style={{ backgroundColor: HEX_COLOR_RE.test(color.hex) ? color.hex : undefined }}
                    aria-hidden="true"
                  />
                </td>
                <td>{name}</td>
                <td className="color-hex"><code>{color.hex}</code></td>
                <td className="color-rgb">{color.rgb.r}, {color.rgb.g}, {color.rgb.b}</td>
              </tr>
            )
          }),
        ])}
      </tbody>
    </table>
  )
}

/** 品牌总览:对比表 + 各品牌入口 */
function BrandOverview() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const brands = colorBrands()

  return (
    <div className="content-page color-chart-page">
      <div className="content-page-head">
        <BackButton size="md" onClick={() => navigate('/gallery')} />
        <span className="content-kicker">{t('colorsPage.kicker')}</span>
        <h1 className="content-title">{t('colorsPage.title')}</h1>
        <p className="content-desc">{t('colorsPage.lead')}</p>
      </div>

      <section className="color-brand-grid" aria-label={t('colorsPage.allBrands')}>
        {brands.map(({ palette, id, colorCount }) => (
          <Link key={id} className="color-brand-card" to={colorChartPath(id)}>
            <span className="color-brand-name">{t(`palette.brand.${id}`)}</span>
            <span className="color-brand-meta">
              {t('colorsPage.brandCount', { n: colorCount })} · {t(`palette.beadSize.${id}`)}
            </span>
            <span className="color-brand-origin">{t(`palette.origin.${id}`)}</span>
            <span className="color-brand-swatch-strip" aria-hidden="true">
              {palette.colors.slice(0, 12).map((color) => (
                <span
                  key={color.id}
                  className="color-brand-dot"
                  style={{ backgroundColor: HEX_COLOR_RE.test(color.hex) ? color.hex : undefined }}
                />
              ))}
            </span>
          </Link>
        ))}
      </section>

      {/* 中文正文只在中文界面展示:其余语言下塞中文段落会让页面语言混杂 */}
      {i18n.language?.startsWith('zh') && (
        <section className="color-chart-hub-note">
          <h2>{t('colorsPage.hubTitle')}</h2>
          <p className="content-desc">{t('colorsPage.hubBody')}</p>
        </section>
      )}

      <nav className="tools-links color-chart-links" aria-label={t('colorsPage.relatedLinks')}>
        <Link className="tools-link-chip" to="/create/image">{t('colorsPage.openInTool')}</Link>
        <Link className="tools-link-chip" to="/gallery">{t('colorsPage.browsePatterns')}</Link>
        <Link className="tools-link-chip" to="/tutorials">{t('colorsPage.learnColors')}</Link>
      </nav>
    </div>
  )
}

/** 单个品牌:事实 + 搜索 + 完整色表 */
function BrandChart({ palette, slug }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const brand = t(`palette.brand.${palette.id}`)
  const groups = useMemo(() => colorGroups(palette), [palette])

  return (
    <div className="content-page color-chart-page">
      <div className="content-page-head">
        <BackButton size="md" onClick={() => navigate('/colors')} />
        <span className="content-kicker">{t('colorsPage.kicker')}</span>
        <h1 className="content-title">
          {t('colorsPage.titleWithBrand', { brand })}
        </h1>
        {i18n.language?.startsWith('zh') && BRAND_INTROS[palette.id] ? (
          <p className="content-desc">{BRAND_INTROS[palette.id]}</p>
        ) : null}
      </div>

      <dl className="color-facts">
        <div>
          <dt>{t('colorsPage.factColors')}</dt>
          <dd>{t('colorsPage.brandCount', { n: palette.colors.length })}</dd>
        </div>
        <div>
          <dt>{t('colorsPage.factBeadSize')}</dt>
          <dd>{palette.beadSize ? `${palette.beadSize}mm` : t(`palette.beadSize.${palette.id}`)}</dd>
        </div>
        <div>
          <dt>{t('colorsPage.factOrigin')}</dt>
          <dd>{t(`palette.origin.${palette.id}`)}</dd>
        </div>
        <div>
          <dt>{t('colorsPage.factGroups')}</dt>
          <dd>{groups.filter((g) => g.key).length || '—'}</dd>
        </div>
      </dl>

      <label className="color-chart-search">
        <span className="sr-only">{t('colorsPage.searchPlaceholder')}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('colorsPage.searchPlaceholder')}
          aria-label={t('colorsPage.searchPlaceholder')}
        />
      </label>

      <ColorTable palette={palette} groups={groups} query={query} />

      <p className="content-desc color-chart-hint">{t('colorsPage.useBody')}</p>

      <section className="content-related" aria-label={t('colorsPage.otherBrands')}>
        <h2 className="content-related-title">{t('colorsPage.otherBrands')}</h2>
        <div className="content-related-rail">
          {PALETTE_LIST.filter((item) => item.id !== slug).map((item) => (
            <Link key={item.id} className="content-related-card" to={colorChartPath(item.id)}>
              <span className="content-related-name">{t(`palette.brand.${item.id}`)}</span>
              <span className="content-related-desc">
                {t('colorsPage.brandCount', { n: item.colors.length })}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <nav className="tools-links color-chart-links" aria-label={t('colorsPage.relatedLinks')}>
        <Link className="tools-link-chip" to="/colors">{t('colorsPage.allBrands')}</Link>
        <Link className="tools-link-chip" to="/create/image">{t('colorsPage.openInTool')}</Link>
      </nav>
    </div>
  )
}

export default function ColorChartsPage() {
  const { t } = useTranslation()
  const { brand } = useParams()
  if (!brand) return <BrandOverview />
  const palette = resolveColorBrand(brand)
  if (!palette) {
    return (
      <div className="content-page">
        <p className="content-desc" role="status">{t('colorsPage.notFound')}</p>
      </div>
    )
  }
  return <BrandChart palette={palette} slug={brand} />
}
