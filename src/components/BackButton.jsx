/**
 * BackButton — 全站统一的返回按钮:只有箭头图标,不带文字。
 *
 * 为什么抽成组件而不是各页各写一份:
 *   此前 7 处返回按钮分别写着「← 返回」/ 内联 SVG + 文字,尺寸有 34 / 38 / 40px
 *   三种,边框圆角与悬停反馈也各不相同。同一功能在不同页面长得不一样,用户
 *   每换一页都要重新认一次。
 *
 * 尺寸用 size 档位而不是固定值:返回按钮所在的行高差异很大 ——
 *   顶部大标题栏(个人中心、图片转拼豆)需要 40px 才不显小;
 *   紧凑工具栏(联系我们、导入页、我的色卡)34px 才与相邻控件齐平。
 *   硬套一个尺寸会让某一类页面明显失衡,所以保留三档,由调用方按实际版面选。
 *
 * 无障碍:图标按钮没有可见文字,必须给 aria-label(读屏)与 title(悬停提示)。
 * 两者都默认取 common.back,调用方可覆盖。
 */

import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import './BackButton.css'

export default function BackButton({
  onClick,
  size = 'md',
  label,
  className = '',
  ...rest
}) {
  const { t } = useTranslation()
  const text = label || t('common.back')
  return (
    <button
      type="button"
      className={`back-btn back-btn-${size}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label={text}
      title={text}
      {...rest}
    >
      <ArrowLeft aria-hidden="true" />
    </button>
  )
}
