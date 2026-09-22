/**
 * useKeyboardAwareFocus — 统一键盘感知聚焦管理
 *
 * 处理 focus / blur / keyboard / visualViewport / scroll 的联动，
 * 避免每个组件自己计算一套键盘逻辑。
 *
 * 适用于：搜索框、输入框、textarea、后台表单、图库搜索。
 *
 * @param {Object} options
 * @param {React.RefObject} options.ref - 输入框 ref
 * @param {Function} options.onFocus - 聚焦回调（可选）
 * @param {Function} options.onBlur - 失焦回调（可选）
 */
export function useKeyboardAwareFocus({ ref, onFocus, onBlur } = {}) {
  const handleFocus = (e) => {
    // 聚焦时滚动到可视区域（仅滚动最近祖先容器，避免级联滚动）
    if (ref?.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    onFocus?.(e)
  }

  const handleBlur = (e) => {
    onBlur?.(e)
  }

  return {
    focusProps: {
      onFocus: handleFocus,
      onBlur: handleBlur,
    },
  }
}
