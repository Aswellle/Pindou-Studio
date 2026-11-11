/**
 * 图纸详情页的大图预览。
 *
 * 优先用构建期生成的 <img>(/pattern-img/<id>-<hash>.png):图片搜索只认
 * 真实图片,canvas 对它是透明的。图不存在时(构建后新发布的模板、本地模式
 * 的内置模板)自动退回 canvas 缩略图 —— 视觉上是同一张图,用户不会看到破图。
 */

import { useMemo, useState } from 'react'
import ThumbnailCanvas from '../../../components/ThumbnailCanvas'
import { patternImageAlt, patternImageFor } from '../patternImage'

export default function PatternPreview({ template, name, width, height, beads = 0 }) {
  const [failed, setFailed] = useState(false)
  const image = useMemo(() => patternImageFor(template), [template])

  if (!template?.pattern) return null

  if (!image || failed) {
    return (
      <ThumbnailCanvas
        pattern={template.pattern}
        size={template.size}
        gridWidth={width}
        gridHeight={height}
      />
    )
  }

  return (
    <img
      className="detail-preview-img"
      src={image.src}
      width={image.width}
      height={image.height}
      alt={patternImageAlt(name, width, height, beads)}
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
