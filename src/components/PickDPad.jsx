import { useTranslation } from 'react-i18next'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Plus, Minus } from 'lucide-react'
import './PickDPad.css'

/**
 * PickDPad — 点选工具的方向盘(仅移动端、仅 pick 工具显示)。
 *
 * 手指在网格上点选时,拇指会挡住目标格;相邻格容易被手指宽度「误触」到
 * 隔壁格。方向盘把「移动光标」与「toggle 当前格」拆成两个动作:四向按钮
 * 以 1 格步进移动橙色光标,中央按钮 toggle 光标所在格 —— 指哪打哪且永远
 * 能看清自己选的是哪格。
 *
 * 定位:fixed 悬浮在移动端工具栏上方(工具栏高度走 --mobile-toolbar-h
 * CSS 变量,MobileToolbar 折叠/换行时自动跟随),portal 到 body,
 * 不受画布 overflow 裁剪。
 *
 * 触控目标全部 ≥40px(WCAG 2.1 target-size 下限 24px,这里取更大的
 * 手指友好值);按钮用 aria-label 而不是依赖 title(触屏无 hover)。
 */
export default function PickDPad({
  cursor,
  selected,
  onMove,
  onToggle,
}) {
  const { t } = useTranslation()

  return (
    <div className="pick-dpad" role="group" aria-label={t('pick.dpad.label')}>
      <div className="pick-dpad-left">
        <button
          type="button"
          className="pick-dpad-btn"
          aria-label={t('pick.dpad.left')}
          onClick={() => onMove(-1, 0)}
        >
          <ChevronLeft size={22} />
        </button>
        <button
          type="button"
          className="pick-dpad-btn"
          aria-label={t('pick.dpad.up')}
          onClick={() => onMove(0, -1)}
        >
          <ChevronUp size={22} />
        </button>
        <button
          type="button"
          className="pick-dpad-btn"
          aria-label={t('pick.dpad.down')}
          onClick={() => onMove(0, 1)}
        >
          <ChevronDown size={22} />
        </button>
        <button
          type="button"
          className="pick-dpad-btn"
          aria-label={t('pick.dpad.right')}
          onClick={() => onMove(1, 0)}
        >
          <ChevronRight size={22} />
        </button>
      </div>
      <button
        type="button"
        className={`pick-dpad-toggle${selected ? ' active' : ''}`}
        aria-label={selected ? t('pick.dpad.remove') : t('pick.dpad.add')}
        onClick={onToggle}
      >
        {selected ? <Minus size={22} /> : <Plus size={22} />}
        <span className="pick-dpad-toggle-label">
          {selected ? t('pick.dpad.remove') : t('pick.dpad.add')}
        </span>
      </button>
    </div>
  )
}
