# CURRENT_ARCHITECTURE.md — Pindou Studio 现状架构

> Phase 0 审计产物。基线 commit: `850a4bf`。生成时间: 2026-09-23。

---

## 1. 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 构建 | Vite | ^6.4.3 |
| UI | React | ^18.2.0 |
| 路由 | react-router-dom | ^7.18.2 |
| CSS | Tailwind v4 (@tailwindcss/postcss) | ^4.2.2 |
| i18n | i18next + react-i18next | ^26.0.5 / ^17.0.3 |
| Auth | @supabase/supabase-js | ^2.112.0 |
| 测试 | Vitest + @testing-library/react | ^4.1.8 / ^16.3.2 |
| 字体 | @fontsource/noto-sans-sc, lxgw-wenkai-webfont | ^5.3.0 / ^1.7.0 |
| 部署 | Vercel (push-triggered) | — |
| CI | GitHub Actions (.github/workflows/ci.yml) | — |

## 2. 目录结构

```
src/
├── main.jsx                    # BrowserRouter + HelmetProvider + 桌面端字体动态导入
├── App.jsx                     # ★ 核心状态中心 (881 行) — canvas/palette/tool/modal 全在此
├── components/
│   ├── Canvas.jsx              # 网格渲染 + pan/zoom
│   ├── ColorPalette/           # 桌面端色板
│   ├── Tools/                  # 桌面端工具栏
│   ├── ImageQuantizer/         # 图片转拼豆模态框 (lazy)
│   ├── ExportPanel.jsx         # 导出面板 (侧栏 + 模态双模式)
│   ├── Gallery.jsx             # ★ 图库 (1518 行, 单文件巨型组件)
│   ├── AdminPanel.jsx          # ★ 后台管理 (1402 行, 单文件巨型组件)
│   ├── AuthPage.jsx            # 登录/注册页 (路由化)
│   ├── AdminLoginPage.jsx      # 管理员登录页 (路由化)
│   ├── ProfileMenu.jsx         # 用户菜单
│   ├── UserManager.jsx         # 管理员用户管理
│   ├── LegalPages.jsx          # 隐私政策/服务条款
│   ├── Tutorials.jsx           # 教程页 (lazy)
│   ├── Toast.jsx               # 通知
│   └── ...
├── hooks/
│   ├── useHistory.js           # canvas 撤销/重做 (useReducer)
│   ├── useCanvasPainter.js     # 双层 canvas 绘制 (base + overlay)
│   ├── useImageQuantizer.js    # Web Worker 桥接
│   ├── useAuth.js              # Supabase Auth 封装
│   ├── useSavedWorks.js        # 双模式作品保存 (Supabase + localStorage)
│   ├── useCloudTemplates.js    # 云端模板库
│   ├── useCustomTemplates.js   # localStorage 自定义模板
│   ├── useResponsive.js        # 断点检测 (<640 / 640-1024 / ≥1024)
│   └── useKeyboardSafe.js      # iOS 键盘安全
├── workers/
│   └── imageQuantizer.worker.js  # ★ 核心量化算法 (951 行)
├── services/
│   ├── BeadPatternExporter.js  # ★ PNG/SVG 导出引擎 (753 行)
│   ├── colorUtils.js           # 颜色工具 (resolveToHex, hexToRgb)
│   ├── supabase.js             # Supabase 客户端
│   └── db.js                   # Dexie (未使用, 死代码)
├── data/
│   ├── palettes/index.js       # 6 品牌色板 + CIEDE2000 匹配
│   ├── templates.js            # 内置模板 + normalizeCustomTemplate
│   └── tutorials.{zh,en,ja,ko}.js  # 4 语言教程
├── i18n/
│   ├── index.js                # i18next 初始化 + 语言持久化
│   └── locales/                # zh-CN / en-US / ja-JP / ko-KR
└── utils/
    ├── colorDiff.js            # CIEDE2000 + rgbToLab + findClosestColorCIEDE2000
    └── historyUtils.js         # pushHistory / undoHistory / redoHistory
```

## 3. 路由

| 路径 | 组件 | 加载方式 | 说明 |
|---|---|---|---|
| `/` | Canvas + Tools + ColorPalette | 同步 | 画布主页 |
| `/login` | AuthPage | 同步 | 登录/注册 |
| `/gallery` | Gallery | lazy | 图库 |
| `/tutorials` | Tutorials | lazy | 教程 |
| `/admin/login` | AdminLoginPage | 同步 | 管理员登录 |
| `/admin` | AdminPanel | 同步 | 后台管理 |
| `/privacy` / `/privacy/:versionId` | PrivacyPolicy | 同步 | 隐私政策 |
| `/terms` / `/terms/:versionId` | TermsOfService | 同步 | 服务条款 |
| `*` | Navigate → `/` | — | 兜底 |

**Modal（非路由）：** ImageQuantizer、ExportPanel（移动端）、SaveDialog — 均在 App.jsx 中通过 useState 控制。

## 4. 核心模块现状

### 4.1 Image Quantizer (worker)

| 能力 | 现状 |
|---|---|
| 颜色空间 | CIELAB + CIEDE2000（**非 OKLab**） |
| 调色板选择 | K-means++ 初始化 + CIEDE76 迭代 + CIEDE2000 映射到真实色板 |
| 区域采样 | Linear RGB 平均 + 边缘感知双聚类（方差 > 阈值时 2-means） |
| 抖动 | Floyd-Steinberg 蛇形 / Bayer 4×4 有序 / 无（默认） |
| 空间优化 | ICM（短边 ≤120 触发，2-4 轮） |
| 后处理 | **无**孤立豆清理、**无**棋盘抑制 |
| 显著性 | **无** |
| 颜色预算 | **无** |
| 图片类型识别 | **无** |
| 背景移除 | 有（边缘检测 + 泛洪填充） |
| 锐化 | Unsharp Mask（scaleRatio > 3 时） |
| Transferable | 是（Uint16Array buffer） |

### 4.2 Export Engine

| 能力 | 现状 |
|---|---|
| 统一文档模型 | **无** PatternDocument — PNG/SVG 各自独立渲染 |
| PNG 超采样 | 固定 3x（桌面）/ 移动端面积预算 80M px 降级 |
| DPI 策略 | **无** — 不基于物理尺寸计算 |
| 大图 Tile | **无** — 单 canvas 一次性分配 |
| 珠子风格 | realistic（径向渐变）/ professional（平面 + 编号） |
| 颜色分层 | 4 层（major/minor/accent/trace） |
| SVG | 独立 rect/circle/text 逻辑，与 PNG 不共享数据源 |
| 文字对齐 | **无** snap-to-pixel |
| 取消机制 | AbortSignal + rAF 分帧 |

### 4.3 Gallery

| 能力 | 现状 |
|---|---|
| 信息架构 | 分类列表 + 搜索 + 难度筛选 |
| 内容类型 | 仅 Pattern（无 Theme/Collection） |
| URL 状态 | **无** — 筛选条件仅存于 useState |
| 内容发现 | 无精选/热门/主题入口 |
| 数据源 | 云端（Supabase）/ 本地（localStorage）双模式 |
| 收藏 | localStorage |
| 品牌转换 | convertTemplateToBrand（CIEDE2000 重映射） |
| 文件大小 | 1518 行单文件 |

### 4.4 Admin

| 能力 | 现状 |
|---|---|
| 结构 | 单文件 1402 行，Tab 切换（模板/分类/用户/消息） |
| 模板 CRUD | 云端 Supabase /  localStorage 双模式 |
| 用户管理 | UserManager 子组件，admin_list_users RPC |
| JSON 导入 | 有（normalizeCustomTemplate） |
| 统计概览 | 有（仪表盘卡片） |

### 4.5 Auth

| 能力 | 现状 |
|---|---|
| 方式 | Supabase OTP + username+security key |
| 路由 | /login（AuthPage）、/admin/login（AdminLoginPage） |
| 角色 | profiles.role = 'admin' |
| 头像 | AvatarCropper + Supabase Storage |
| 作品同步 | 登录时一次性 localStorage → cloud 迁移 |

### 4.6 i18n

| 能力 | 现状 |
|---|---|
| 语言 | zh-CN / en-US / ja-JP / ko-KR |
| 检查 | node scripts/check-i18n.js（CI 门禁） |
| 存储 | localStorage `bead_studio_settings` |
| URL 支持 | `?lang=` 参数（SEO hreflang） |

### 4.7 响应式 / 移动端

| 能力 | 现状 |
|---|---|
| 断点 | <640 mobile / 640-1024 tablet / ≥1024 desktop |
| 组件 | MobileToolbar / MobileColorPalette / MobileCanvasInfoBar |
| 键盘 | useKeyboardSafe（visualViewport + focusin/out） |
| Safe Area | **无**统一处理 |
| 滚动策略 | **无**统一层级 |
| VisualViewport | **无**统一 Manager |

## 5. 数据模型

### canvasData

```js
canvasData[y][x] = '#F0B08A'  // filled cell (hex string)
canvasData[y][x] = null        // empty cell
```

### Grid State

- `gridSize` — max dimension (square grids)
- `gridWidth` / `gridHeight` — actual dimensions (`null` = use `gridSize`)
- `cols = gridWidth || gridSize`, `rows = gridHeight || gridSize`

### Supabase 表

| 表 | 用途 | RLS |
|---|---|---|
| profiles | 用户资料（nickname/avatar_url/role） | anon read, own-row write |
| works | 用户作品 | own-row RLS |
| templates | 云端模板库 | anon read, admin write |
| categories | 云端分类 | anon read, admin write |

### localStorage Keys

| Key | 用途 |
|---|---|
| saved-works | 本地作品（仅 local mode） |
| bead_studio_settings | 语言设置 |
| gallery-favorites | 收藏 |
| tutorial-progress | 教程进度 |
| custom-templates | 自定义模板 |
| custom-categories | 自定义分类 |
| bead-studio-behavior | 移动端行为记录 |
| cloud-works-mirror | 云端作品数镜像（登出后显示） |

## 6. CI/CD

```yaml
# .github/workflows/ci.yml
触发: push/PR → main/dev
步骤:
  1. npm run test:run
  2. npm run check-i18n
  3. npm run build
  4. git diff --exit-code (fonts-all.css 检查)
部署: Vercel 自动部署（push to main）
域名: tangnotes.site (pindou-studio.vercel.app 301 重定向)
```

## 7. 已知技术债务

1. **无 PatternDocument** — PNG/SVG 导出各自独立渲染，结构可能漂移
2. **无 OKLab** — 量化使用 CIEDE2000 而非 OKLab，感知均匀性不足
3. **无 Feature Flag** — 新旧路径无法并存
4. **无 VisualViewport Manager** — iOS 键盘处理分散
5. **Gallery 1518 行 / AdminPanel 1402 行** — 巨型组件，难以维护
6. **无统一滚动策略** — scrollIntoView 级联问题
7. **无 Tile Rendering** — 大图导出可能 OOM
8. **无 DPI 策略** — 导出分辨率固定 3x，不基于物理尺寸
9. **无孤立豆清理 / 棋盘抑制** — 量化后处理缺失
10. **无显著性 / 颜色预算** — 调色板分配不区分主体/背景

---

*本文档为 Phase 0 基线审计产物，后续 Phase 以本文件为参照进行增量改造。*
