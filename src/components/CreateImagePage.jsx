/**
 * CreateImagePage — /create/image「图片转拼豆」独立页面
 *
 * 原实现是模态浮层:窄屏下模态宽度受限会把步骤条/预览裁掉,iOS 键盘 + 浮层滚动
 * 也容易出白板。现在作为普通页面渲染 —— 量化器自带头部返回按钮(内含未保存确认)。
 *
 * 返回策略:正常从工具栏进入时历史里已有上一页,回退即可;直接以深链打开时
 * React Router 的首个 location.key 为 'default',此时用 replace 兜底到画布页,
 * 避免把用户带出站点。
 */

import { useLocation, useNavigate } from 'react-router-dom'
import ImageQuantizer from './ImageQuantizer/ImageQuantizer'

export default function CreateImagePage({ onApply }) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleClose = () => {
    if (location.key !== 'default') navigate(-1)
    else navigate('/', { replace: true })
  }

  return <ImageQuantizer onApply={onApply} onClose={handleClose} />
}
