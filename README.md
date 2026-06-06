# 🎨 拼豆 Studio

> 专业的拼豆图纸在线设计工具，支持 Perler、Hama、Artkal 三大品牌色卡

[![CI](https://github.com/Aswellle/Pin-Bead-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/Aswellle/Pin-Bead-Studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)](https://vitejs.dev)

一款功能完整的拼豆图案设计工具，提供网格绘画、图片转图纸、多格式导出和教程系统。支持中文、英文、日文、韩文四种语言，桌面和移动端均可使用。

---

## ✨ 核心功能

### 🖊️ 画布绘制
- **网格绘画** — 铅笔、橡皮、填色桶、抓手四种工具
- **灵活尺寸** — 方形预设（29×29 至 170×170），矩形预设，自定义（9–200 任意边长）
- **平移 / 缩放** — 鼠标滚轮缩放 + 拖拽平移，移动端双指捏合缩放 + 单指平移（带惯性）
- **撤销 / 重做** — 完整操作历史（上限 50 步），桌面和移动端均支持

### 🖼️ 图片量化
- **一键转图纸** — 上传任意图片，自动转换为拼豆图案
- **K-means++ 取色** — 在 Lab 色彩空间选取最优调色板
- **CIEDE2000 色彩匹配** — 感知均匀的颜色差异算法，蓝/紫色系尤其准确
- **抖动选项** — Floyd-Steinberg 蛇形抖动 or Bayer 4×4 有序抖动
- **ICM 空间优化** — 小尺寸图纸额外做迭代颜色映射优化
- **零拷贝传输** — 使用 Transferable ArrayBuffer，图片处理不阻塞主线程

### 🎨 三大品牌色卡
| 品牌 | 色号范围 | 颜色数 |
|------|---------|--------|
| Perler | P01 – P77 | 77 色 |
| Hama | H01 – H56 | 56 色 |
| Artkal | C01 – C72 | 72 色 |

### 📄 图纸导出
两种导出风格，均支持 PNG 和 SVG：

| 风格 | 效果 | 适用场景 |
|------|------|---------|
| **专业模式** | 方形格 + 品牌色号标注 | 对照图纸贴珠 |
| **展示模式** | 径向渐变拟真珠子效果 | 预览、分享、相册 |

导出文件包含：行列坐标、颜色清单（按用量分主色/辅色/点缀色/微量色分组）、总珠数统计。

### 🌐 多语言
- 简体中文（默认）
- English
- 日本語
- 한국어

---

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm 9+

### 安装

```bash
git clone https://github.com/Aswellle/Pin-Bead-Studio.git
cd Pin-Bead-Studio/bead-studio
npm install
npm run dev
```

开发服务器启动在 **http://localhost:5280**（局域网可通过 `http://<本机IP>:5280` 访问）

### 生产构建

```bash
npm run build    # 输出到 dist/
npm run preview  # 本地预览构建产物
```

---

## 🛠️ 常用命令

```bash
npm run dev          # 开发服务器（热更新）
npm run build        # 生产构建
npm run test         # 运行测试（watch 模式）
npm run test:run     # 单次运行测试
npm run check-i18n   # 验证 4 个语言文件键名一致性
```

---

## 🧪 测试

使用 [Vitest](https://vitest.dev) + [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/)。

```bash
npm run test:run
```

当前共 **51 个测试用例**，覆盖：

| 文件 | 测试内容 |
|------|---------|
| `src/utils/colorDiff.test.js` | CIEDE2000 算法（含 CIE 官方 10 组参考值），rgbToLab，findClosestColorCIEDE2000 |
| `src/services/colorUtils.test.js` | resolveToHex（8 种边界情况），hexToRgb，rgbToHex，getTextColor |
| `src/utils/historyUtils.test.js` | pushHistory（含上限截断），undoHistory，redoHistory（往返一致性） |

---

## 🏗️ 技术栈

| 层 | 技术 |
|----|------|
| 框架 | React 18 + Vite 5 |
| 样式 | Tailwind CSS v4（CSS `@theme` 配置方式） |
| 国际化 | react-i18next |
| 图片处理 | Web Worker + Transferable ArrayBuffer |
| 颜色科学 | CIEDE2000（Lab 色彩空间） |
| 状态管理 | React `useState` / `useReducer`（主状态）|
| 数据持久化 | localStorage（作品存储） |
| 测试 | Vitest + @testing-library/react |
| CI/CD | GitHub Actions |

---

## 📁 项目结构

```
bead-studio/
├── src/
│   ├── App.jsx                          # 应用根组件（网格/工具/页面路由状态）
│   ├── components/
│   │   ├── Canvas.jsx                   # 网格画布：绘制 + CSS transform 平移缩放
│   │   ├── ColorPalette.jsx             # 桌面色板选择器
│   │   ├── ColorStatsBar.jsx            # 侧边栏颜色统计（品牌色号 + 用量）
│   │   ├── ExportPanel.jsx              # 导出面板（PNG / SVG / 文本）
│   │   ├── Gallery.jsx                  # 模板浏览器 + 已保存作品
│   │   ├── Header.jsx                   # 顶部导航栏
│   │   ├── Tools.jsx                    # 左侧工具栏（可折叠）
│   │   ├── Tutorials.jsx                # 教程页面
│   │   ├── ImageQuantizer/
│   │   │   └── ImageQuantizer.jsx       # 图片量化对话框
│   │   ├── ColorPalette/
│   │   │   └── MobileColorPalette.jsx   # 移动端色板
│   │   └── Tools/
│   │       └── MobileToolbar.jsx        # 移动端工具栏
│   ├── hooks/
│   │   ├── useHistory.js                # 撤销/重做（useReducer，无 stale closure）
│   │   ├── useSavedWorks.js             # 作品 localStorage 读写（含 quota 保护）
│   │   ├── useAuth.js                   # 本地认证（localStorage，无后端）
│   │   ├── useImageQuantizer.js         # Web Worker 桥接
│   │   └── useResponsive.js             # 响应式断点检测
│   ├── workers/
│   │   └── imageQuantizer.worker.js     # 量化算法（K-means++, CIEDE2000, 抖动）
│   ├── data/
│   │   ├── palettes/                    # Perler / Hama / Artkal 色卡数据
│   │   ├── templates.js                 # 内置模板图案
│   │   └── tutorials.js                 # 教程内容定义
│   ├── services/
│   │   ├── BeadPatternExporter.js       # PNG/SVG 导出（专业/展示双模式）
│   │   └── colorUtils.js                # 颜色工具函数（resolveToHex 等）
│   ├── utils/
│   │   ├── colorDiff.js                 # 独立 CIEDE2000 实现
│   │   └── historyUtils.js              # 纯函数历史操作（pushHistory 等）
│   └── i18n/
│       ├── index.js                     # i18next 配置
│       └── locales/                     # zh-CN / en-US / ja-JP / ko-KR
├── scripts/
│   └── check-i18n.js                    # i18n 键名一致性校验
├── .github/
│   └── workflows/ci.yml                 # CI：测试 + i18n 校验 + 构建
├── docs/superpowers/                    # 设计规范与开发计划文档
└── vite.config.js                       # Vite 配置（端口 5280，测试环境 jsdom）
```

---

## 🔬 量化流程

```
用户上传图片
    ↓
useImageQuantizer.js
  Transferable ArrayBuffer 零拷贝传输，缩放至 7×7 px/格，最大 3000px 输入
    ↓
imageQuantizer.worker.js（Web Worker，不阻塞 UI）
  1. K-means++ 在 Lab 空间选取最优调色板
  2. CIEDE2000 近邻色匹配（感知均匀，蓝/紫色系准确）
  3. 边缘感知区域采样（高方差格子用 2-均值分析）
  4. Floyd-Steinberg 蛇形 or Bayer 4×4 有序抖动（作用于 L 通道）
  5. ICM 空间精炼（outW ≤ 120 时启用）
    ↓
handleQuantizerApply
  品牌 ID（如 'P18'）→ resolveToHex() → hex 字符串（如 '#F0B08A'）→ canvasData
    ↓
Canvas / ExportPanel / Gallery
  ctx.fillStyle = '#F0B08A'  ✓
```

> **注意**：`canvasData` 只存储 hex 字符串，不存储品牌 ID。

---

## 🗂 localStorage 数据格式

| 键 | 内容 |
|----|------|
| `saved-works` | `Array<{ id, name, canvasData, gridSize, gridWidth, gridHeight, paletteId, savedAt }>` |
| `bead_studio_settings` | `{ language }` |
| `bead_studio_auth` | `{ id, email, name, createdAt }`（本地 Profile，无服务端验证） |
| `gallery-favorites` | `Array<number>`（已收藏模板 ID） |
| `tutorial-progress` | `Array<string>`（已读教程 ID） |

> **存储上限**：localStorage 约 5MB。保存大尺寸作品时，超过 4MB 会弹出提示。

---

## 🤝 贡献指南

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feat/your-feature`
3. 提交前运行测试和 i18n 校验：
   ```bash
   npm run test:run && npm run check-i18n
   ```
4. Push 并发起 Pull Request

新增 UI 文本请同时更新 `src/i18n/locales/` 下的全部四个语言文件，可用 `npm run check-i18n` 验证。

---

## 📄 License

[MIT](LICENSE) © 2024 Aswellle
