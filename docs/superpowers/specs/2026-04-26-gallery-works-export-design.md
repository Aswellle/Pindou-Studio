# Gallery 改版 · My Works · 模板导出 — 设计文档

**日期：** 2026-04-26  
**范围：** `Gallery.jsx`、`App.jsx`、`Header.jsx`  
**不新增文件，不引入新依赖**

---

## 一、3 列网格布局

### Templates 区域
- `.templates-grid` 的 `grid-template-columns` 从 `repeat(auto-fill, minmax(220px, 1fr))` 改为 `repeat(3, 1fr)`

### My Works 区域
- `.works-grid` 同样改为 `repeat(3, 1fr)`
- **修复现有 bug**：缩略图渲染循环目前只使用 `work.gridSize`，矩形作品渲染错误。改为用 `gridWidth || gridSize`（列）× `gridHeight || gridSize`（行）

### 响应式
- 不加移动端断点（移动端走 MobileToolbar 路径，不渲染 Gallery 页）
- 容器保持 `max-width: 1200px`，三列约 360px/列

---

## 二、My Works 保存流

### 数据格式升级

localStorage key `saved-works` 元素从：
```js
{ canvasData, gridSize, paletteId }
```
升级为：
```js
{
  id: number,           // Date.now()
  name: string,         // 用户输入的作品名称
  canvasData: array,    // 2D hex 数组（null = 空格）
  gridSize: number,
  gridWidth: number | null,   // 新增，支持矩形网格
  gridHeight: number | null,  // 新增
  paletteId: string,
  savedAt: string       // ISO 时间戳
}
```
旧格式数据向后兼容：加载时对缺失字段取默认值（`id` 用 index，`name` 用 `'作品 N'`，`gridWidth/gridHeight` 用 `null`）。

### Header 保存按钮（Header.jsx）
- 新增 `onSave` prop
- 只在 `currentPage === 'canvas'` 时渲染「保存作品」按钮，放在右侧 auth 区域左侧
- 样式：icon（存档图标）+ 文字「保存作品」，与其他 Header 按钮风格一致
- 点击调用 `onSave()`，触发 App.jsx 中的保存对话框

### 保存对话框（App.jsx）
- 新增 `showSaveDialog: boolean` state
- 弹出 modal：
  - 标题「保存作品」
  - 输入框，默认值为当前 `designName`（「拼豆图案」）
  - 「确认保存」/ 「取消」按钮
- 确认后：
  1. 构造新 work 对象（含全部字段）
  2. 追加到 `savedWorks`，写入 localStorage
  3. 关闭对话框
  4. 显示 1.5s 顶部 toast 提示「已保存到我的作品」
- 新增 `saveToast: boolean` state 控制 toast 显示

### 作品卡片展示升级（Gallery.jsx）
- 标题：显示 `work.name`（取代 `'作品 N'`）
- 副标题：显示 `gridWidth || gridSize` × `gridHeight || gridSize` 尺寸 + `savedAt` 日期（`YYYY-MM-DD`）
- 向后兼容：`work.name` 缺失时 fallback 到 `t('gallery.workName') + ' ' + (index + 1)`

### 加载作品修复（App.jsx）
新增 `handleLoadWork(work)` 函数，正确还原矩形网格状态：
```js
const handleLoadWork = (work) => {
  setGridSize(work.gridSize)
  setGridWidth(work.gridWidth ?? null)
  setGridHeight(work.gridHeight ?? null)
  setCanvasData(work.canvasData)
  setCurrentPalette(work.paletteId || 'perler')
  setCurrentPage('canvas')
}
```
Gallery 的作品卡片「加载」按钮调用 `onLoadWork(work)`（新 prop），不再复用 `onLoadTemplate`。

---

## 三、模板导出拼豆图纸

### 模板卡片 UI（Gallery.jsx）
- 在 `.template-thumbnail` 右下角新增「导出」图标按钮（下载图标）
- 位置：右下角，与左上角收藏心形对称
- 点击后在卡片内展示小浮层菜单（绝对定位，`z-index` 覆盖卡片）：
  - 「专业模式（方格 + 色号）」
  - 「展示模式（拟真珠子）」
- 导出期间：按钮替换为旋转 loading 图标，菜单关闭
- 导出完成后：loading 消失，恢复下载按钮
- 点击菜单外部（document click 事件）关闭菜单

### Gallery 内部状态
```js
const [exportMenuId, setExportMenuId] = useState(null)     // 当前打开菜单的 template.id
const [exportingId, setExportingId] = useState(null)       // 正在导出的 template.id
```

### 导出调用
```js
import { exportAsPNG } from '../services/BeadPatternExporter'
import { getPalette } from '../data/palettes'

await exportAsPNG(
  template.pattern,
  template.size,
  'perler',
  t(`templates.names.${template.nameKey}`),
  getPalette('perler'),
  { beadStyle: 'professional' | 'realistic', gridWidth: null, gridHeight: null }
)
```
模板 pattern 已存储 hex 字符串，无需 brand ID 解析。

---

## 文件改动一览

| 文件 | 改动 |
|------|------|
| `src/components/Gallery.jsx` | 3列网格；works 缩略图矩形修复；导出菜单状态+UI；作品卡展示升级；新增 `onLoadWork` prop |
| `src/App.jsx` | 保存对话框 state + modal；`handleLoadWork`；`handleSaveWork` 写入新格式；向 Header 传 `onSave`；toast state |
| `src/components/Header.jsx` | 新增 `onSave` prop；`currentPage === 'canvas'` 时显示「保存作品」按钮 |

---

## 向后兼容说明

localStorage 中已存在的旧格式 `saved-works` 数据在加载时逐项补全缺失字段，不清除旧数据，不迁移写入（惰性兼容）。

---

## 四、教程系统改造

### 4-1 数据结构重设计（`src/data/tutorials.js`）

现有 `content` 字段是纯字符串（只能 `split('\n\n')` 渲染段落），改为富文本 **Block 数组**：

```js
blocks: [
  { type: 'paragraph',     text: '...' },
  { type: 'heading2',      text: '...' },
  { type: 'heading3',      text: '...' },
  { type: 'callout',       variant: 'tip|warning|danger|info', title: '...', text: '...' },
  { type: 'bulletList',    items: ['...'] },
  { type: 'numberedList',  items: ['...'] },
  { type: 'table',         headers: ['...'], rows: [['...', '...']] },
  { type: 'divider' },
  { type: 'svgDiagram',   id: 'ironing-motion', caption: '...' },
  { type: 'keyPoint',     text: '...' },   // 高亮重点框
]
```

**向后兼容**：`tips` 单字符串字段保留，旧教程仍可正常渲染；新教程全部使用 `blocks`，`tips` 置空字符串。渲染侧优先读 `blocks`，`blocks` 为空/缺失时降级到旧 `content` + `tips` 渲染路径。

### 4-2 新章节结构（6 章 · 15 篇）

| 章节 | 文章（id） | 核心痛点 |
|------|-----------|---------|
| 第一章 入门指南 | `brands-guide` / `tools-checklist` / `first-project` | 新手不知道买哪品牌、工具买多买少 |
| 第二章 熨烫全解 | `ironing-temperature` / `double-sided-ironing` / `ironing-rescue` | 最高频翻车原因：温度、时间、手势全错 |
| 第三章 防变形 | `why-warping` / `weight-pressing` / `tape-method` | 作品变形是仅次于熨烫的第一投诉 |
| 第四章 配色设计 | `color-principles` / `shadow-highlight` / `image-to-pattern` | 想做好看的但不懂配色 |
| 第五章 进阶技巧 | `large-grid-joining` / `gradient-technique` / `multi-brand-mix` | 进阶玩家的真实卡点 |
| 第六章 作品保护 | `cooling-shaping` / `display-storage` | 花时间做的作品变黄/褪色/碎裂 |

### 4-3 SVG 示意图（内联，不引入图片文件）

在 `Tutorials.jsx` 中维护一个 `SVG_DIAGRAMS` map，key 为 `svgDiagram.id`，value 为 JSX SVG 元素。渲染时按 id 查找并内联渲染，避免额外网络请求。初期只需实现以下两张：

| id | 用途 |
|----|------|
| `ironing-motion` | 熨烫手势：同心圆 + 箭头，示意画圆弧轨迹 |
| `pressing-stack` | 压重定型：书本/重物叠放示意图 |

### 4-4 渲染组件（`Tutorials.jsx`）

新增 `BlockRenderer` 组件，根据 `block.type` 分发渲染：

- `paragraph` → `<p>`
- `heading2` / `heading3` → `<h2>` / `<h3>`，带左侧色块装饰
- `callout` → 带左侧色条的卡片，`variant` 决定配色（tip=绿、warning=黄、danger=红、info=蓝）
- `bulletList` / `numberedList` → `<ul>` / `<ol>`
- `table` → 响应式 `<table>`，表头加底色
- `divider` → `<hr>`
- `svgDiagram` → 从 `SVG_DIAGRAMS` 查找并渲染，下方显示 `caption`
- `keyPoint` → 带背景色的重点框，左侧加粗竖线

### 4-5 localStorage

新增 `tutorial-progress` key（已在 CLAUDE.md 中记录）：
```js
'tutorial-progress': string[]   // 已读教程 id 数组
```

### 4-6 文件改动一览

| 文件 | 改动 |
|------|------|
| `src/data/tutorials.js` | 重写全部章节数据为 blocks 格式；新增 6 章 15 篇内容 |
| `src/components/Tutorials.jsx` | 新增 `BlockRenderer`；新增 `SVG_DIAGRAMS` map；渲染侧兼容旧 content/tips 路径 |
| i18n 四个 locale | 新增所有教程 id 对应的 `tutorials.chapters.*` 和 `tutorials.articles.*` i18n key（文章标题国际化） |
