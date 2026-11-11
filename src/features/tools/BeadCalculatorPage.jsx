/**
 * 豆子数量计算器(/bead-calculator)。
 *
 * 纯前端计算,输入不发往服务器。结果明确标注为估算:图案非空格数才是真值,
 * 页面给出查看图纸详情的入口。
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BackButton from '../../components/BackButton'
import { beadEstimate, beadPresetRows } from './beadCalculator'
import '../gallery/gallery.css'
import './tools.css'

export default function BeadCalculatorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [width, setWidth] = useState('29')
  const [height, setHeight] = useState('29')
  const [fillPct, setFillPct] = useState(80)
  const [colors, setColors] = useState('')

  const estimate = useMemo(
    () => beadEstimate({ width, height, fillRatio: fillPct / 100, colorCount: colors }),
    [width, height, fillPct, colors]
  )
  const presets = useMemo(() => beadPresetRows(), [])

  const numberToText = (value) => Number(value).toLocaleString()

  return (
    <div className="content-page tools-page">
      <div className="content-page-head">
        <BackButton size="md" onClick={() => navigate('/gallery')} />
        <span className="content-kicker">{t('calculator.kicker')}</span>
        <h1 className="content-title">{t('calculator.title')}</h1>
        <p className="content-desc">{t('calculator.lead')}</p>
      </div>

      <div className="calc-form">
        <label className="calc-field">
          <span>{t('calculator.widthLabel')}</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="500"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
        </label>
        <label className="calc-field">
          <span>{t('calculator.heightLabel')}</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="500"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </label>
        <label className="calc-field calc-field-range">
          <span>
            {t('calculator.fillLabel')} <strong>{fillPct}%</strong>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={fillPct}
            onChange={(e) => setFillPct(Number(e.target.value))}
          />
        </label>
        <label className="calc-field">
          <span>{t('calculator.colorsLabel')}</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            placeholder={t('calculator.colorsPlaceholder')}
            value={colors}
            onChange={(e) => setColors(e.target.value)}
          />
        </label>
      </div>

      {estimate ? (
        <dl className="calc-results" aria-live="polite">
          <div>
            <dt>{t('calculator.cellsLabel')}</dt>
            <dd>{numberToText(estimate.cells)}</dd>
          </div>
          <div className="calc-result-primary">
            <dt>{t('calculator.beadsLabel')}</dt>
            <dd>
              {numberToText(estimate.beads)}
              <span className="calc-unit">{t('calculator.unitBeads')}</span>
            </dd>
          </div>
          {estimate.perColor != null && (
            <div>
              <dt>{t('calculator.perColorLabel')}</dt>
              <dd>
                {numberToText(estimate.perColor)}
                <span className="calc-unit">{t('calculator.unitBeads')}</span>
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="calc-invalid" role="status">{t('calculator.invalidHint')}</p>
      )}

      <section className="tools-section">
        <h2>{t('calculator.presetsTitle')}</h2>
        <table className="tools-table">
          <caption className="sr-only">{t('calculator.presetCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('calculator.presetSize')}</th>
              <th scope="col">{t('calculator.presetCells')}</th>
              <th scope="col">{t('calculator.preset80')}</th>
              <th scope="col">{t('calculator.preset60')}</th>
            </tr>
          </thead>
          <tbody>
            {presets.map((row) => (
              <tr key={row.size}>
                <td>{row.size} × {row.size}</td>
                <td>{numberToText(row.cells)}</td>
                <td>{numberToText(row.filled80)}</td>
                <td>{numberToText(row.filled60)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="tools-section">
        <h2>{t('calculator.formulaTitle')}</h2>
        <p>{t('calculator.formulaBody')}</p>
      </section>

      <p className="tools-links">
        <Link to="/create/image">{t('calculator.openTool')}</Link>
        {' · '}
        <Link to="/gallery">{t('calculator.browsePatterns')}</Link>
        {' · '}
        <Link to="/colors">{t('calculator.colorCharts')}</Link>
      </p>
    </div>
  )
}
