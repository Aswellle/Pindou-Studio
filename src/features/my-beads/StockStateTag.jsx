/**
 * 库存状态标签(重构规格 §2.3 / §8.2)。
 *
 * 状态一律用文字表达,颜色只是辅助 —— 绿勾红叉不足以让色觉障碍用户分辨
 * 「未记录」「数量未知」「数量不足」「缺货」四件事。
 */

import { useTranslation } from 'react-i18next'
import { STOCK_STATE, STOCK_STATE_LABEL_KEY } from './inventoryStatus'

const TONE = {
  [STOCK_STATE.UNRECORDED]: 'unrecorded',
  [STOCK_STATE.OWNED_UNKNOWN]: 'owned',
  [STOCK_STATE.OWNED_QTY]: 'owned',
  [STOCK_STATE.LOW]: 'low',
  [STOCK_STATE.OUT]: 'out',
}

export default function StockStateTag({ state, quantity, className = '' }) {
  const { t } = useTranslation()
  const key = STOCK_STATE_LABEL_KEY[state] || STOCK_STATE_LABEL_KEY[STOCK_STATE.UNRECORDED]
  // 「有库存 · N 颗」需要数量;其余状态文案不含插值
  const text = state === STOCK_STATE.OWNED_QTY
    ? t(key, { n: quantity ?? 0 })
    : t(key)
  return (
    <span className={`stock-state-tag ${TONE[state] || 'unrecorded'} ${className}`.trim()}>
      {text}
    </span>
  )
}
