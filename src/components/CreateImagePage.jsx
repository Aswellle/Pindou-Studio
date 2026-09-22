/**
 * CreateImagePage — /create/image 独立路由页面
 *
 * 从 ImageQuantizer Modal 迁移而来，功能完全一致：
 * 上传图片 → 网格设置 → 色卡选择 → 预览 → 生成拼豆图案
 *
 * 保留原 ImageQuantizer Modal 路径不变。
 */

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import ImageQuantizer from './ImageQuantizer/ImageQuantizer'

export default function CreateImagePage({ onApply }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const handleClose = () => navigate(-1)

  return (
    <div className="create-image-page">
      <div className="create-image-page-header">
        <button className="btn btn-ghost" onClick={handleClose}>
          ← {t('common.back', '返回')}
        </button>
        <h2>{t('nav.createImage', '图片转拼豆')}</h2>
      </div>
      <div className="create-image-page-body">
        <ImageQuantizer
          onApply={onApply}
          onClose={handleClose}
        />
      </div>
    </div>
  )
}
