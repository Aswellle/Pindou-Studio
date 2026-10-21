/**
 * 主题页 / 合集页的加载骨架。
 *
 * 为什么需要:
 *   这两个页面的内容来自两次独立请求(主题/合集元数据 + 模板库)。数据到达前
 *   关联模板列表必然为空,若直接按「空」渲染,用户会先看到一屏
 *   「该范围内没有匹配的图纸」,随后卡片突然出现 —— 语义上是错的(不是没有,
 *   而是还没到),视觉上也会抖一下。
 *
 * 拆成两个组件而不是一个整页骨架:
 *   - 页头部分(.content-page-head)在真实页面里**始终存在**(返回按钮要在加载中
 *     也能点),所以只能替换它的**内容**,不能替换整个容器;
 *   - 筛选栏与网格可以整体替换。
 *   两个组件都直接复用真实容器的类名(.content-page-head / .content-filters /
 *   .templates-grid),间距与版式自动一致,内容到达时不跳动。
 *
 * 其他原则:
 *   - 不画假内容:只有灰块,不放任何看起来像真数据的文字或图片。
 *   - 无障碍:状态文案放 .sr-only,骨架块 aria-hidden。
 *   - 尊重 prefers-reduced-motion:关闭 shimmer 动画(见 gallery.css)。
 */

import { useTranslation } from 'react-i18next'

/** 页头占位:放在页面已有的 .content-page-head 内部(返回按钮之后) */
export function PageHeadSkeleton({ kind = 'theme' }) {
  return (
    <span className="skeleton-head-group" aria-hidden="true">
      <span className="skeleton-bar skeleton-kicker" />
      <span className="skeleton-bar skeleton-heading" />
      <span className="skeleton-bar skeleton-line skeleton-desc-line" />
      {/* 合集比主题多一行「策展说明」 */}
      {kind === 'collection' && <span className="skeleton-bar skeleton-note-block" />}
      <span className="skeleton-bar skeleton-count" />
    </span>
  )
}

/** 占位卡片:与真实 .template-card 同一套三段式版式 */
function SkeletonCard() {
  return (
    <div className="skeleton-card-template" aria-hidden="true">
      <div className="skeleton-thumb-square">
        <span className="skeleton-bar skeleton-fill" />
      </div>
      <div className="skeleton-info">
        <span className="skeleton-bar skeleton-line skeleton-title-line" />
        <span className="skeleton-bar skeleton-line skeleton-meta-line" />
        <span className="skeleton-bar skeleton-line skeleton-category-line" />
      </div>
      <div className="skeleton-footer">
        <span className="skeleton-bar skeleton-dot" />
        <span className="skeleton-bar skeleton-dot" />
        <span className="skeleton-bar skeleton-dot" />
      </div>
    </div>
  )
}

/**
 * 筛选栏 + 卡片网格的占位,与真实内容同级渲染。
 *
 * @param {object} props
 * @param {number} [props.cardCount] - 占位卡片数量
 */
export default function ContentPageSkeleton({ cardCount = 8 }) {
  const { t } = useTranslation()

  return (
    <>
      <span className="sr-only" role="status">{t('gallery.cloudLoading')}</span>

      {/* 筛选栏:复用 .content-filters 的 flex 布局与间距。
          真实下拉是「label + select」两行(合计 59px),只画一行 36px 的块
          会让下方网格上移 23px。 */}
      <div className="content-filters" aria-hidden="true">
        <span className="skeleton-bar skeleton-search" />
        {[0, 1, 2].map((i) => (
          <span key={i} className="skeleton-select-group">
            <span className="skeleton-bar skeleton-select-label" />
            <span className="skeleton-bar skeleton-select" />
          </span>
        ))}
      </div>

      {/* 卡片网格:与 .templates-grid 同列数与间距 */}
      <div className="templates-grid" aria-hidden="true">
        {Array.from({ length: cardCount }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </>
  )
}
