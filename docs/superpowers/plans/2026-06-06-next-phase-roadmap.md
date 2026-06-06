# 下一阶段路线图

基于综合代码审查报告（`.full-review/05-final-report.md`），按优先级分三个迭代规划。

---

## Sprint 1 · 性能 + 架构清理（约 1–2 天）

### 1A. 渲染性能：Canvas 分离 hover 与数据重绘
**问题**：Canvas.jsx 的 `useEffect` 把 `hoverCell` 与 `canvasData` 混在同一依赖数组，鼠标移动时对 170×170 画布触发 28,900 次 `fillRect`。
**方案**：拆成两个 effect：
- Effect 1：只在 `canvasData / cols / rows` 变化时全量重绘
- Effect 2：只在 `hoverCell / tool` 变化时在顶层叠加层（overlay canvas）画高亮框

**收益**：鼠标移动帧率从 <30fps 恢复到 60fps（大画布场景）。

### 1B. 渲染性能：ColorStatsBar + ExportPanel 颜色统计 useMemo
**问题**：两个组件的 O(W×H) 颜色统计循环在每次 App 重渲染时都执行，包括鼠标移动。
**方案**：
```jsx
const colorStats = useMemo(() => {
  /* ... counting loop ... */
}, [canvasData, paletteId])
```

### 1C. 架构清理：删除死代码
- 删除 `src/stores/canvasStore.js`、`uiStore.js`、`settingsStore.js`（与 App.jsx 完全断开，误导开发者）
- 在 `src/hooks/useGestures.js` 顶部加 `// UNUSED: Canvas.jsx has its own pan/zoom implementation`，或直接删除

### 1D. 统一 resolveToHex
- `App.jsx`、`ExportPanel.jsx`、`ColorStatsBar.jsx` 中的 3 处本地实现改为 import `colorUtils.js` 的规范版本

---

## Sprint 2 · 用户体验提升（约 2–3 天）

### 2A. 桌面端添加重做按钮
**当前状态**：桌面 `Tools.jsx` 只有撤销（Undo），重做只在移动端 `MobileToolbar.jsx` 有。
**方案**：在 `Tools.jsx` 的快捷操作区添加 Redo 按钮，`App.jsx` 传入 `onRedo` prop。

### 2B. 导出错误用户反馈
**当前状态**：导出失败只打印 `console.error`，用户看不到任何提示。
**方案**：在 `ExportPanel` 中添加错误状态，显示红色提示条：
```jsx
const [exportError, setExportError] = useState(null)
// catch (err) → setExportError('导出失败，请重试')
```

### 2C. 保存作品：存储空间接近上限提醒
**当前状态**：只有存满才报错（QuotaExceededError）。
**方案**：每次保存前计算当前 `saved-works` 占用量，在 >4MB 时显示黄色警告：
```
当前已使用 4.1MB / 约5MB，建议删除部分旧作品后再保存。
```

### 2D. ColorStatsBar 显示品牌色号
**当前状态**：只显示 hex 字符串（如 `#F0B08A`），对用户无意义。
**方案**：解析到品牌色号时显示色号 + 中文名（如 `P18 橙色 × 234`），找不到时回退到 hex 缩略。

### 2E. 大画布自动适应提示
**当前状态**：应用大尺寸量化结果后，fitToScreen 静默执行，用户不知道可以"适应屏幕"。
**方案**：量化结果应用后在 Canvas 信息栏显示 1.5s 的提示：`已自动适应屏幕，双击可重置`。

### 2F. 键盘快捷键提示
在 Tools.jsx 中为 Undo/Clear 按钮的 `title` 属性补充快捷键说明：
- 撤销：`Ctrl+Z`
- 重做：`Ctrl+Y` 或 `Ctrl+Shift+Z`（目前重做只通过 App.jsx keydown 处理）

---

## Sprint 3 · 代码结构重构（约 3–5 天）

### 3A. 提取 useHistory hook（修复 stale closure bug）
**当前状态**：history useEffect 有 stale closure bug；history 逻辑散布在 App.jsx。
**方案**：将 `historyUtils.js`（已建立）升级为 `useHistory` hook：
```js
// src/hooks/useHistory.js
export function useHistory() {
  const [state, dispatch] = useReducer(historyReducer, initialState)
  return {
    canvasData: state.canvasData,
    canUndo: state.historyIndex > 0,
    canRedo: state.historyIndex < state.history.length - 1,
    pushCanvas: (data) => dispatch({ type: 'PUSH', data }),
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
  }
}
```

### 3B. 提取 useSavedWorks hook
将 `savedWorks` state + `handleConfirmSave` + `handleSaveWork` + localStorage 同步逻辑提取出 App.jsx：
```js
// src/hooks/useSavedWorks.js
export function useSavedWorks() {
  /* localStorage 读写 + QuotaExceededError 处理 */
}
```

### 3C. 代码分割：懒加载非核心页面
```jsx
const Gallery   = lazy(() => import('./components/Gallery'))
const Tutorials = lazy(() => import('./components/Tutorials'))
const ImageQuantizer = lazy(() => import('./components/ImageQuantizer/ImageQuantizer'))
```
Canvas 页面的首次加载时间预计减少 30–40%。

### 3D. CI/CD：GitHub Actions 基础流水线
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run test:run
      - run: npm run build
      - run: npm run check-i18n
```

---

## 已完成（本次会话）

| 项目 | 状态 |
|------|------|
| Canvas getBounds 公式修复（大画布无法拖拽） | ✅ |
| 侧边栏滚动修复 | ✅ |
| ExportPanel 宽度 + overflow 修复 | ✅ |
| ColorStatsBar 显示全部颜色 | ✅ |
| 7 项 Quick Wins（安全、数据、逻辑修复） | ✅ |
| vitest 基础设施 + 51 个测试用例 | ✅ |
| colorDiff.js CIEDE2000 k2 系数 bug 修复 | ✅（测试发现） |

---

*文档创建：2026-06-06 · 基于 `.full-review/05-final-report.md`*
