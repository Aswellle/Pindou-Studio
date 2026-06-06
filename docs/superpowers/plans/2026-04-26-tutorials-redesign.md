# 教程系统改造 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) to implement task-by-task.

**Goal:** 将教程从纯文本改为富文本 Block 数组，新增 6 章 15 篇内容（覆盖熨烫、防变形、配色、进阶、保护等核心主题），添加 `BlockRenderer` + `SVG_DIAGRAMS`。

**Architecture:** `tutorials.js` 升级为 blocks 格式（向后兼容旧 `content`/`steps`/`tips`）；`Tutorials.jsx` 新增 `BlockRenderer` 组件 + `SVG_DIAGRAMS` map；渲染侧优先读 `blocks`，无 blocks 时降级旧路径。

---

## 文件改动一览

| 文件 | 改动 |
|------|------|
| `src/data/tutorials.js` | 完全重写 TUTORIALS 数据，4+6 共 10 个章节，15 篇新文章，全部使用 blocks 格式 |
| `src/components/Tutorials.jsx` | 新增 BlockRenderer、SVG_DIAGRAMS；渲染侧优先读 blocks，兼容旧格式 |
| `src/i18n/locales/zh-CN.json` | 新增 tutorials.chapters 和 tutorials.articles i18n key |
| `src/i18n/locales/en-US.json` | 同上英文 |
| `src/i18n/locales/ja-JP.json` | 同上日文 |
| `src/i18n/locales/ko-KR.json` | 同上韩文 |

---

## Task 1: tutorials.js — blocks 数据结构 + 15 篇新内容

**文件：** `src/data/tutorials.js`

### blocks 格式说明

```js
[
  { type: 'paragraph',     text: '...' },
  { type: 'heading2',    text: '...' },
  { type: 'heading3',    text: '...' },
  { type: 'callout',     variant: 'tip|warning|danger|info', title: '...', text: '...' },
  { type: 'bulletList',  items: ['...'] },
  { type: 'numberedList', items: ['...'] },
  { type: 'table',       headers: ['...'], rows: [['...', '...']] },
  { type: 'divider' },
  { type: 'svgDiagram',  id: 'ironing-motion', caption: '...' },
  { type: 'keyPoint',    text: '...' },
]
```

向后兼容：保留 `content`（纯文本）、`steps`（数组）、`tips`（字符串）字段，供降级路径使用。新教程 `blocks` 必填，`content`/`steps`/`tips` 置空字符串或空数组。

### 章节结构

**第一章 入门指南**（保留，只改格式）：
- `getting-started` → `what-is-bead`：什么是拼豆
- `basic-tools` → `tools-checklist`：基础工具清单
- `first-project-heart` → `first-project`：第一个作品

**第二章 熨烫全解**（新增）：
- `ironing-temperature`：`brands-guide`（品牌全解析）→ 熨烫温度指南
- `ironing-technique`：`tools-checklist` 改 → 温度与手法
- `double-sided-ironing`：`double-sided-ironing` 熨烫标准流程
- `ironing-rescue`：`ironing-rescue` 翻车急救手册

**第三章 防变形**（新增）：
- `why-warping`：why-warping` 为什么会翘曲
- `weight-pressing`：`weight-pressing` 压重定型法
- `tape-method`：`tape-method` 大图胶带法

**第四章 配色设计**（新增）：
- `color-principles`：`color-principles` 颜色选择原则
- `shadow-highlight`：`shadow-highlight` 阴影与高光
- `image-to-pattern`：`image-to-pattern` 图片转图纸

**第五章 进阶技巧**（新增）：
- `large-grid-joining`：`large-grid-joining` 大图分区拼接
- `gradient-technique`：`gradient-technique` 渐变实现
- `multi-brand-mix`：`multi-brand-mix` 多品牌混用

**第六章 作品保护**（新增）：
- `cooling-shaping`：`cooling-shaping` 冷却定型流程
- `display-storage`：`display-storage` 展示与保存

### 新内容文本要求

每篇文章 300–600 字，包含 `paragraph`/`heading2`/`callout`/`bulletList`/`numberedList` 等多种 block 组合。内容要真实有用，基于拼豆工艺的实操经验。

### 完成后

```bash
git add src/data/tutorials.js
git commit -m "feat: tutorials data restructure — blocks format, 6 chapters 15 articles"
```

---

## Task 2: Tutorials.jsx — BlockRenderer + SVG_DIAGRAMS + 兼容渲染

**文件：** `src/components/Tutorials.jsx`

### 步骤 1：添加 SVG_DIAGRAMS map

在 `Tutorials.jsx` 顶部（import 之后，组件定义之前），添加：

```js
// Inline SVG 图示，不引入图片文件
const SVG_DIAGRAMS = {
  'ironing-motion': (
    <svg width="280" height="180" viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="280" height="180" rx="12" fill="#f5f5f5"/>
      {/* pegboard grid hint */}
      {Array.from({length: 6}).map((_, i) =>
        Array.from({length: 9}).map((_, j) => (
          <circle key={`${i}-${j}`} cx={28 + j*28} cy={28 + i*28} r={6} fill="#e0e0e0"/>
        ))
      )}
      {/* concentric arcs showing circular ironing motion */}
      <path d="M80 120 Q140 40 200 120" stroke="#1976D2" strokeWidth="3" fill="none" strokeDasharray="6 4"/>
      <path d="M60 120 Q140 10 220 120" stroke="#1976D2" strokeWidth="2" fill="none" strokeDasharray="6 4" opacity="0.5"/>
      <path d="M40 120 Q140 -20 240 120" stroke="#1976D2" strokeWidth="1.5" fill="none" strokeDasharray="6 4" opacity="0.25"/>
      {/* arrow heads */}
      <polygon points="200,116 208,122 202,124" fill="#1976D2"/>
      <polygon points="220,116 228,122 222,124" fill="#1976D2" opacity="0.5"/>
      {/* iron icon */}
      <rect x="100" y="125" width="80" height="40" rx="8" fill="#607D8B"/>
      <rect x="140" y="125" width="45" height="40" rx="4" fill="#78909C"/>
      <rect x="100" y="128" width="80" height="6" rx="3" fill="#90A4AE"/>
      {/* label */}
      <text x="140" y="175" textAnchor="middle" fontSize="12" fill="#9E9E9E">画圆弧熨烫，从中心向外</text>
    </svg>
  ),
  'pressing-stack': (
    <svg width="280" height="180" viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="280" height="180" rx="12" fill="#f5f5f5"/>
      {/* bead pattern hint */}
      <rect x="60" y="40" width="160" height="100" rx="8" fill="#FFECB3" stroke="#FFC107" strokeWidth="2"/>
      {/* multiple books stacked on top */}
      <rect x="50" y="90" width="180" height="18" rx="3" fill="#8D6E63"/>
      <rect x="50" y="108" width="180" height="18" rx="3" fill="#795548"/>
      <rect x="50" y="126" width="180" height="18" rx="3" fill="#6D4C41"/>
      {/* downward arrows */}
      <path d="M140 30 L140 38" stroke="#E53935" strokeWidth="3"/>
      <polygon points="136,38 144,38 140,45" fill="#E53935"/>
      <path d="M100 30 L100 38" stroke="#E53935" strokeWidth="3"/>
      <polygon points="96,38 104,38 100,45" fill="#E53935"/>
      <path d="M180 30 L180 38" stroke="#E53935" strokeWidth="3"/>
      <polygon points="176,38 184,38 180,45" fill="#E53935"/>
      {/* weight label */}
      <text x="140" y="160" textAnchor="middle" fontSize="12" fill="#9E9E9E">书本/重物压住，冷却 ≥30 分钟</text>
    </svg>
  ),
}
```

### 步骤 2：添加 BlockRenderer 组件

在 `SVG_DIAGRAMS` 定义**之后**，添加：

```jsx
// 富文本 block 渲染器
function BlockRenderer({ blocks = [] }) {
  if (!blocks || blocks.length === 0) return null
  return (
    <div className="block-renderer">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'paragraph':
            return <p key={i} className="block-paragraph">{block.text}</p>
          case 'heading2':
            return <h2 key={i} className="block-h2">{block.text}</h2>
          case 'heading3':
            return <h3 key={i} className="block-h3">{block.text}</h3>
          case 'callout': {
            const variantColors = {
              tip:     { bg: '#E8F5E9', border: '#4CAF50', title: '#2E7D32' },
              warning: { bg: '#FFF8E1', border: '#FFC107', title: '#F57F17' },
              danger:  { bg: '#FFEBEE', border: '#E53935', title: '#C62828' },
              info:    { bg: '#E3F2FD', border: '#1976D2', title: '#1565C0' },
            }
            const c = variantColors[block.variant] || variantColors.info
            return (
              <div key={i} className="block-callout" style={{ background: c.bg, borderLeft: `4px solid ${c.border}` }}>
                {block.title && <div className="callout-title" style={{ color: c.title }}>{block.title}</div>}
                <div className="callout-text">{block.text}</div>
              </div>
            )
          }
          case 'bulletList':
            return (
              <ul key={i} className="block-bullet-list">
                {block.items.map((item, j) => <li key={j}>{item}</li>)}
              </ul>
            )
          case 'numberedList':
            return (
              <ol key={i} className="block-numbered-list">
                {block.items.map((item, j) => <li key={j}>{item}</li>)}
              </ol>
            )
          case 'table':
            return (
              <div key={i} className="block-table-wrap">
                <table className="block-table">
                  <thead>
                    <tr>{block.headers.map((h, j) => <th key={j}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j}>{row.map((cell, k) => <td key={k}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'divider':
            return <hr key={i} className="block-divider"/>
          case 'svgDiagram': {
            const diagram = SVG_DIAGRAMS[block.id]
            return diagram ? (
              <figure key={i} className="block-svg-diagram">
                {diagram}
                {block.caption && <figcaption className="svg-caption">{block.caption}</figcaption>}
              </figure>
            ) : null
          }
          case 'keyPoint':
            return (
              <div key={i} className="block-key-point">
                <span className="key-point-bar"/>
                <span className="key-point-text">{block.text}</span>
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
```

### 步骤 3：替换内容渲染区域

在 `Tutorials.jsx` 中找到：

```jsx
<div className="content-body">
  {/* 教程正文 */}
  <div className="tutorial-content">
    {selectedTutorial.content.split('\n\n').map((paragraph, index) => (
      <p key={index}>{paragraph}</p>
    ))}
  </div>

  {/* 步骤列表 */}
  {selectedTutorial.steps && (
    ...
  )}

  {/* 提示框 */}
  {selectedTutorial.tips && (
    ...
  )}

  {/* 图片占位 */}
  <div className="image-placeholder">
    ...
  </div>
</div>
```

替换为：

```jsx
<div className="content-body">
  {/* 优先读 blocks，新教程用 blocks；旧教程降级到 content/steps/tips */}
  {selectedTutorial.blocks && selectedTutorial.blocks.length > 0 ? (
    <BlockRenderer blocks={selectedTutorial.blocks} />
  ) : (
    <>
      {/* 降级路径：旧 content */}
      {selectedTutorial.content && (
        <div className="tutorial-content">
          {selectedTutorial.content.split('\n\n').map((paragraph, index) => (
            <p key={index} className="block-paragraph">{paragraph}</p>
          ))}
        </div>
      )}
      {/* 降级路径：旧 steps */}
      {selectedTutorial.steps && selectedTutorial.steps.length > 0 && (
        <div className="steps-section">
          <h3 className="steps-title">{t('tutorials.steps')}</h3>
          <ol className="steps-list">
            {selectedTutorial.steps.map((step, index) => (
              <li key={index} className="step-item">
                <span className="step-number">{index + 1}</span>
                <span className="step-text">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {/* 降级路径：旧 tips */}
      {selectedTutorial.tips && (
        <div className="tips-box">
          <div className="tips-header">{t('tutorials.tips')}</div>
          <p className="tips-content">{selectedTutorial.tips}</p>
        </div>
      )}
    </>
  )}
  {/* 分节导航（prev/next） */}
  <div className="content-footer">
    <NavigationButtons currentTutorial={selectedTutorial} onSelect={selectTutorial} />
  </div>
</div>
```

### 步骤 4：添加 block 渲染 CSS

在现有的 `<style>{``}</style>` 块末尾（`}</style>` 之前），添加：

```css
/* Block Renderer */
.block-renderer {
  margin-bottom: 32px;
}
.block-paragraph {
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-secondary);
  margin-bottom: 16px;
}
.block-h2 {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 32px 0 16px;
  padding-left: 12px;
  border-left: 4px solid var(--accent);
}
.block-h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 24px 0 12px;
}
.block-callout {
  border-radius: 0 8px 8px 0;
  padding: 14px 18px;
  margin-bottom: 16px;
}
.callout-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 6px;
}
.callout-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.block-bullet-list,
.block-numbered-list {
  padding-left: 20px;
  margin-bottom: 16px;
}
.block-bullet-list li,
.block-numbered-list li {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.block-table-wrap {
  overflow-x: auto;
  margin-bottom: 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}
.block-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.block-table th {
  background: var(--bg-secondary);
  padding: 10px 14px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border-color);
}
.block-table td {
  padding: 9px 14px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}
.block-table tr:last-child td {
  border-bottom: none;
}
.block-divider {
  border: none;
  border-top: 2px solid var(--border-color);
  margin: 28px 0;
}
.block-svg-diagram {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 24px 0;
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.07);
}
.svg-caption {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 8px;
  text-align: center;
}
.block-key-point {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: #FFF8E1;
  border-left: 4px solid #FF8F00;
  border-radius: 0 8px 8px 0;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.key-point-bar {
  width: 4px;
  min-height: 20px;
  background: #FF8F00;
  border-radius: 2px;
  flex-shrink: 0;
  margin-top: 2px;
}
.key-point-text {
  font-size: 14px;
  line-height: 1.6;
  color: #E65100;
  font-weight: 500;
}
```

### 完成后

```bash
git add src/components/Tutorials.jsx
git commit -m "feat: tutorials BlockRenderer + SVG_DIAGRAMS + backward compat"
```

---

## Task 3: i18n — 章节和文章标题国际化 key

**文件：** 4 个 locale 文件

### 添加的 key 结构

在 `"tutorials"` 对象内添加 `chapters` 和 `articles`：

**zh-CN.json 追加：**
```json
"chapters": {
  "getting-started": "入门指南",
  "ironing-guide": "熨烫全解",
  "anti-warp": "防变形",
  "color-design": "配色设计",
  "advanced-skills": "进阶技巧",
  "protection": "作品保护"
},
"articles": {
  "what-is-bead": "什么是拼豆",
  "basic-tools": "基础工具介绍",
  "first-project": "第一个作品：制作爱心",
  "brands-guide": "品牌全解析",
  "ironing-technique": "温度与手法",
  "double-sided-ironing": "双面烫标准流程",
  "ironing-rescue": "翻车急救手册",
  "why-warping": "为什么会翘曲",
  "weight-pressing": "压重定型法",
  "tape-method": "大图胶带法",
  "color-principles": "颜色选择原则",
  "shadow-highlight": "阴影与高光",
  "image-to-pattern": "图片转图纸",
  "large-grid-joining": "大图分区拼接",
  "gradient-technique": "渐变实现",
  "multi-brand-mix": "多品牌混用",
  "cooling-shaping": "冷却定型流程",
  "display-storage": "展示与保存"
}
```

**en-US.json 追加：**
```json
"chapters": {
  "getting-started": "Getting Started",
  "ironing-guide": "Ironing Guide",
  "anti-warp": "Anti-Warping",
  "color-design": "Color Design",
  "advanced-skills": "Advanced Skills",
  "protection": "Protection"
},
"articles": {
  "what-is-bead": "What Are Perler Beads",
  "basic-tools": "Basic Tools",
  "first-project": "Your First Project: Heart",
  "brands-guide": "Bead Brand Guide",
  "ironing-technique": "Temperature & Technique",
  "double-sided-ironing": "Double-Sided Ironing",
  "ironing-rescue": "Ironing Rescue Guide",
  "why-warping": "Why Warping Happens",
  "weight-pressing": "Weight Pressing Method",
  "tape-method": "Tape Method for Large Projects",
  "color-principles": "Color Selection Principles",
  "shadow-highlight": "Shadow & Highlight",
  "image-to-pattern": "Image to Pattern",
  "large-grid-joining": "Large Grid Joining",
  "gradient-technique": "Gradient Technique",
  "multi-brand-mix": "Mixing Bead Brands",
  "cooling-shaping": "Cooling & Shaping",
  "display-storage": "Display & Storage"
}
```

**ja-JP.json 追加：**
```json
"chapters": {
  "getting-started": "入門ガイド",
  "ironing-guide": "アイロン攻略",
  "anti-warp": "反り防止",
  "color-design": "配色デザイン",
  "advanced-skills": "上達スキル",
  "protection": "作品保護"
},
"articles": {
  "what-is-bead": "拼豆とは",
  "basic-tools": "基本ツール紹介",
  "first-project": "最初の作品：ハートを作る",
  "brands-guide": "ブランド全解説",
  "ironing-technique": "温度と手法",
  "double-sided-ironing": "両面アイロン標準流程",
  "ironing-rescue": "アイロン失敗急救手册",
  "why-warping": "反りの原因",
  "weight-pressing": "加重プレス法",
  "tape-method": "大型作品テープ法",
  "color-principles": "色選択の原則",
  "shadow-highlight": "影とハイライト",
  "image-to-pattern": "画像から图纸へ",
  "large-grid-joining": "大型グリッド接合",
  "gradient-technique": "グラデーション技法",
  "multi-brand-mix": "複数ブランド混用",
  "cooling-shaping": "冷却定型流程",
  "display-storage": "展示と保存"
}
```

**ko-KR.json 追加：**
```json
"chapters": {
  "getting-started": "입문 가이드",
  "ironing-guide": "다림질 완전 해부",
  "anti-warp": "뒤틀림 방지",
  "color-design": "색상 설계",
  "advanced-skills": "응용 기법",
  "protection": "작품 보호"
},
"articles": {
  "what-is-bead": "비드란 무엇인가",
  "basic-tools": "기본 도구 소개",
  "first-project": "첫 번째 작품: 하트 만들기",
  "brands-guide": "비드 브랜드 완전 해부",
  "ironing-technique": "온도와 다림질手法",
  "double-sided-ironing": "양면 다림질 표준 과정",
  "ironing-rescue": "다림질 실패 응급 처치",
  "why-warping": "뒤틀림이 생기는 이유",
  "weight-pressing": "무게 눌러 고정법",
  "tape-method": "대형 작품 테이프법",
  "color-principles": "색상 선택 원칙",
  "shadow-highlight": "그림자와 하이라이트",
  "image-to-pattern": "이미지를图纸으로",
  "large-grid-joining": "대형 그리드 연결",
  "gradient-technique": "그라데이션 구현",
  "multi-brand-mix": "복수 브랜드 혼용",
  "cooling-shaping": "냉각 성형 과정",
  "display-storage": "전시와 보관"
}
```

验证：`node scripts/check-i18n.js`

```bash
git add src/i18n/locales/
git commit -m "i18n: add tutorials chapter/article name keys to all 4 locales"
```

---

## Task 4: Tutorials.jsx — 章节导航使用 i18n 标题

**文件：** `src/components/Tutorials.jsx`

在 `<span className="section-title">{section.title}</span>` 和 `<span className="tutorial-title">{tutorial.title}</span>` 处，替换为：

- 章节标题：优先读 `t('tutorials.chapters.${section.id}')`（降级到 `section.title`）
- 文章标题：优先读 `t('tutorials.articles.${tutorial.id}')`（降级到 `tutorial.title`）

替换示例：
```jsx
<span className="section-title">
  {t(`tutorials.chapters.${section.id}`, section.title)}
</span>
```
```jsx
<span className="tutorial-title">
  {t(`tutorials.articles.${tutorial.id}`, tutorial.title)}
</span>
```

同时更新 breadcrumb 区域的文章标题：
```jsx
<span className="current">{t(`tutorials.articles.${selectedTutorial.id}`, selectedTutorial.title)}</span>
```

```bash
git add src/components/Tutorials.jsx
git commit -m "feat: tutorial nav uses i18n titles with fallback"
```

---

## Self-Review Checklist

**Task 1 — 数据：**
- [ ] 15 篇新文章全部有 blocks 数组（非空）
- [ ] blocks 包含 3+ 种不同 type（段落、列表、callout 等）
- [ ] 所有 6 个新章节都有 2–3 篇文章
- [ ] 旧 4 章节保留 content/steps/tips 向后兼容

**Task 2 — BlockRenderer：**
- [ ] 9 种 block type 全部有对应渲染逻辑
- [ ] svgDiagram 正确查找 SVG_DIAGRAMS[id]
- [ ] 降级路径：selectedTutorial.blocks 为空时渲染旧 content/steps/tips
- [ ] CSS 类名不与现有样式冲突

**Task 3 — i18n：**
- [ ] 6 个章节 + 18 篇文章共 24 个 key 在 4 个 locale 中全部存在
- [ ] check-i18n.js 通过

**Task 4 — 导航 i18n：**
- [ ] 侧边栏章节标题读 i18n key，降级到 section.title
- [ ] 侧边栏文章标题读 i18n key，降级到 tutorial.title
- [ ] 正文 breadcrumb 读 i18n key
