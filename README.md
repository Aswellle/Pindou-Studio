# 🎨 拼豆Studio · Bead Studio

> **把灵感一颗一颗烫进珠子里。** 专业的在线拼豆图纸设计工具 —— 从像素到实物,一站式创作。

[![CI](https://github.com/Aswellle/Pindou-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/Aswellle/Pindou-Studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-BaaS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![i18n](https://img.shields.io/badge/i18n-4%20Languages-4A9B8E)](https://www.i18next.com)

**中文** · [English](README.en.md)

**六个品牌色卡 · 千余种配色 · 四种语言 · 十八篇教程 · 云端账号体系**

拼豆Studio 是一款开箱即用的拼豆图纸在线设计工具:自由绘制、图片智能转图纸、专业图纸导出、云端模板库与账号体系一应俱全。无论是第一次拿起 Pegboard 的新手,还是追求精致作品的进阶玩家,都能在这里找到属于自己的创作节奏。

⭐ **如果这个项目对你有帮助,欢迎点个 [Star](https://github.com/Aswellle/Pindou-Studio) 支持一下 —— 你的每一颗星都是继续打磨的动力。**

---

## ✨ 亮点速览

| | 功能亮点与应用价值 |
|---|---|
| 🖼️ | **图片一键转图纸** — 上传照片秒变拼豆图纸,自动匹配网格与配色,Lab/OKLab 色彩空间可选 |
| 📄 | **专业图纸导出** — 品牌色号标注 + 颜色清单四档分组 + 行列坐标尺,直接对照贴珠 |
| 🎨 | **六大品牌色卡(1039 种颜色)** — COCO / MARD / MARD 291 / Perler / Hama / Artkal,支持品牌间 CIEDE2000 近邻重映射 |
| ☁️ | **云端账号体系** — 邮箱验证码 / 自定义账号(用户名+安全密钥)两种注册,头像裁剪上传、作品跨设备同步 |
| 🌐 | **4 种语言** — 自动检测浏览器语言,`?lang=` 直达,UI 911 条文案 / 教程 / 导出件全量覆盖 |
| 📖 | **18 篇图文教程 × 4 语言** — 从入门到进阶,连"翻车急救手册"都有 |
| 🛠️ | **管理后台** — 模板库 CRUD + JSON 导入 + 分类管理 + 用户仪表盘 + 留言处理 + 管理概览(增长趋势/内容健康检查) |
| 📱 | **移动端优先** — 双指捏合缩放、单指惯性平移,手机平板一样顺手 |

---

## 🖊️ 核心功能

### 画布绘制
- **四种工具** — 铅笔 / 橡皮 / 填色桶 / 抓手,拖拽连续绘制零延迟
- **灵活尺寸** — 方形预设 29 / 57 / 87 / 114 / 140 / 170;横竖矩形预设;自定义 9–200 任意边长
- **平移 / 缩放** — PC 滚轮缩放(以光标为中心)+ 拖拽平移;移动端双指捏合 + 单指惯性平移
- **撤销 / 重做** — 50 步操作历史,笔画粒度入栈(`Ctrl+Z` / `Ctrl+Y`,Mac 用 `Cmd`)
- **双层 Canvas 渲染** — 提交层 + 覆盖层分离,拖拽绘制绕过 React 状态直达画布,快拖不堆积重绘

### 🖼️ 图片转图纸(颜色科学级)
- **自动网格** — 分析图片内容(边缘密度 + 唯一色比例)推荐 57 / 87 / 114 / 140 长边,并按源图分辨率封顶(每颗豆至少约 2 源像素)
- **自动配色数** — 按网格长边推荐 12 / 24 / 36 / 48 / 64 色,随尺寸联动
- **图片类型自适应** — 识别 logo / 插画 / 人像 / 风景,自动调整颜色预算与细节过渡(抖动)策略
- **色彩空间可选** — `lab`(CIEDE2000 感知色差,默认)或 `oklab`(OKLab 欧氏距离)
- **K-means++ 取色** — 支持边缘/显著性加权的调色板采样;区域采样 7×7 px/格,输入上限 3000px
- **能量函数保护** — 边缘强度 + 显著性生成保护图,作用于调色板采样、ICM 保真度权重与误差扩散门控
- **抖动** — Floyd-Steinberg 蛇形 / Bayer 4×4 有序,默认由图片类型决定
- **空间精炼** — 短边 ≤120 时启用 ICM 迭代优化;另含孤立豆清理与棋盘抑制
- **选图门控** — 类型 + 30MB + 4000 万像素三重校验,像素数由 PNG IHDR / JPEG SOF **文件头在解码前**判定(专挡"文件很小但像素极多"的纯色像素画),超限时给出可见提示
- **零拷贝** — Web Worker + Transferable ArrayBuffer,量化全程不阻塞主线程

### 🎨 六大品牌色卡

| 品牌 | 色号范围 | 颜色数 | 特点 |
|------|---------|--------|------|
| COCO | A–Z 色系编号 | 291 | 2.6mm 迷你珠,A–Z 分组 |
| MARD | 9 大官方色系 | 221 | 5mm,标准系列 |
| MARD 291 | 标准 221 + 扩展 | 291 | 5mm,系列更全 |
| Perler | P01 – P80 | 80 | 颜色最全,入门首选 |
| Hama | H01 – H56 | 56 | 北欧柔和风格 |
| Artkal | C01 – C100 | 100 | 金属色 / 荧光色丰富 |

模板颜色可在各品牌色卡间按 CIEDE2000 近邻重映射(图库卡片上的品牌徽标即转换入口);绘制、图库、导出均按当前所选品牌配色。

### 📄 图纸导出
- **新导出引擎(V2,默认开启)** — 统一 `PatternDocument` 文档模型 → PNG 光栅 / SVG 矢量渲染器;面板内可一键切回旧引擎
- **两种风格** — 专业图纸(平色方块 + 品牌色号标注,制作参考)/ 展示图纸(拟真立体珠子,分享展示)
- **成品级信息** — 标题栏(尺寸 / 总珠数 / 用色数 / 色卡 / 日期)、左右两侧行号尺 + 顶部列号尺、颜色清单(主色 / 辅色 / 点缀色 / 微量色四档,微量色带 ⚠ 采购提醒)、拼豆Studio 品牌标识
- **快速三件套** — PNG 位图 / SVG 矢量 / 文本色号索引
- **高清输出** — 逻辑像素 3× 超采样(按设备与画布面积自动降级),`toBlob` 编码避免内存翻倍,面板显示实际导出分辨率;可选物理尺寸 DPI 标注
- **长任务友好** — 按 2000 颗豆分批渲染并回报进度,关闭面板即中止导出(AbortSignal)

### ☁️ 账号 · 个人资料 · 管理后台
- **两种注册方式** — 邮箱验证码(注册 / 登录 / 找回全程 6 位验证码,国内网络无需外链);自定义账号(用户名 + 密码 + 可选安全密钥找回)
- **作品跨设备同步** — 登录后作品存 Supabase `works` 表,未登录存本地浏览器;首次登录自动把本地作品迁入云端并提示同步数量
- **个人资料独立页**(`/profile`)— 自带页面顶栏与双栏版面,不继承站点导航:头像上传 + 自研圆形裁剪器(拖动 / 滚轮 / 双指缩放,输出 240×240 webp)、昵称、旧密码验证改密、退出登录
- **管理后台**(`/admin`)— 模板库 CRUD、统一协议 JSON 导入、分类管理、用户仪表盘(`admin_list_users` RPC:注册方式 / 最近登录 / 冻结与删除)、留言会话回复、管理概览(`/admin/dashboard`:用户增长 KPI、近 14 天注册趋势图、内容库规模与分布、热门模板、留言待办、内容健康检查与快捷入口)
- **统一门禁** — `AdminGate` 处理「云端未配置 / 会话检查中 / 未登录 / 非管理员」四态;标签页支持 `/admin?tab=users` 等深链

### 📚 图库 · 教程 · 国际化
- **图库 V2**(`/gallery`)— 收藏、我的作品、云端 / 本地双模式、下载计数、品牌徽标与转换、导出菜单、搜索与筛选(URL 同步)、云端不可用时降级横幅与重试
- **云端模板库** — 匿名公开只读、管理员写入(RLS 强制);模板含尺寸 / 难度 / 品牌色卡 / 下载量
- **18 篇图文教程 × 4 语言** — 入门指南、熨烫全解、防变形、配色设计、进阶技巧、作品保护与"翻车急救"
- **i18n 全覆盖** — 911 条界面文案 × 4 语言;仅 `zh-CN` 内联打包,`en/ja/ko` 按需懒加载;教程数据亦按语言分包

### 🔐 安全与合规
- **行级安全(RLS)** — 模板/分类匿名只读、作品本人可读写、头像本人可写、管理员可写
- **函数级门禁** — 所有管理类 RPC 均为 `security definer` 且内部校验 `is_admin()`
- **登录即凭证** — 认证走 Supabase Auth(OTP / 自定义账号);留言支持 Turnstile 会话信任 + 频率限制
- **只读元数据** — 用户仪表盘仅展示运营所需字段(邮箱 / 昵称 / 角色 / 验证状态 / 注册与登录时间),不含敏感信息

---

## 🗺️ 页面路由

| 路径 | 页面 |
|---|---|
| `/` | 画布(默认页) |
| `/gallery` | 图库 V2(模板库 + 我的作品) |
| `/create/image` | 图片转拼豆(独立功能页) |
| `/tutorials` | 图文教程 |
| `/profile` | 个人资料(独立页) |
| `/login` · `/admin/login` | 用户登录 · 管理员登录(独立页) |
| `/admin` · `/admin/dashboard` | 管理后台(模板/导入/分类/用户/留言)· 管理概览 |
| `/privacy` · `/privacy/:versionId` · `/terms` · `/terms/:versionId` | 隐私政策 · 服务条款(含历史版本) |
| `*` | 重定向回 `/` |

除画布页外,`/login` `/admin/login` `/privacy` `/terms` `/create/image` `/profile` 均为**独立页**:不渲染站点顶部导航,页面自带返回与操作层。

---

## 🚀 快速开始

### 环境要求
- Node.js 22+(见 `.nvmrc`)
- npm 10+

### 安装与开发

```bash
git clone https://github.com/Aswellle/Pindou-Studio.git
cd Pindou-Studio
npm install
npm run dev
```

开发服务器启动在 **http://localhost:5280**(局域网可通过 `http://<本机IP>:5280` 访问)。

### 常用命令

```bash
npm run dev              # 开发服务器(热更新)
npm run build            # 生产构建(生成字体 CSS → 打包 → 输出子页面静态 HTML)
npm run preview          # 本地预览构建产物
npm run test             # 测试(watch 模式)
npm run test:run         # 测试(单次,CI 模式)
npm run test:ui          # Vitest 浏览器 UI
npm run check-i18n       # 校验 4 个语言文件键集与插值变量一致
npm run check-migrations # 校验 Supabase 迁移:版本号唯一 + $$ 配对

npx vitest run src/utils/imageGuard.test.js   # 运行单个测试文件
```

### 云端配置(可选)

不配置环境变量时,站点自动运行在**纯本地模式**(内置模板 + localStorage),图库、画布、导出、教程全部可用;配置后启用账号体系与云端模板库:

```bash
# .env.local
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

数据库结构由 `supabase/migrations/` 下的 18 个迁移文件定义(可重复执行)。生产环境要求管理员账号:将 `profiles.role` 置为 `admin`。

---

## 🏗️ 技术栈

| 层 | 技术 |
|----|------|
| 框架 | React 18 + Vite 6 + React Router 7(路径路由,两套桌面/移动布局) |
| 样式 | Tailwind CSS v4(`@tailwindcss/postcss`)+ 手作暖调设计令牌(CSS 变量) |
| 云端 | Supabase(PostgreSQL + Auth + Storage + RLS + security definer RPC) |
| 国际化 | react-i18next 26,4 语言(zh-CN 内联,其余懒加载) |
| 颜色科学 | CIEDE2000 / OKLab(K-means++ 与色差均在 Web Worker 内) |
| 数据可视化 | Recharts 3(管理概览注册趋势图,按需分包) |
| 状态管理 | React `useState` / `useReducer`(无全局 store;撤销栈用 reducer) |
| 图标 / 字体 | lucide-react;Noto Sans SC + LXGW WenKai(仅桌面端动态加载) |
| 测试 | Vitest 4 + @testing-library/react(jsdom),319 用例 / 22 文件 |
| 监控 | Vercel Analytics + Speed Insights |
| 部署 | Vercel(push 到 `main` 自动部署)+ Supabase |

---

## 🔬 图片量化流程

```
用户上传图片
    ↓ 选图门控(类型 / 30MB / 4000 万像素;PNG IHDR · JPEG SOF 文件头判定,解码前拦截)
    ↓
useImageQuantizer.js(主线程降采样 ≤3000px,Transferable ArrayBuffer 零拷贝)
    ↓
imageQuantizer.worker.js(Web Worker,不阻塞 UI)
  1. 提取图像特征(唯一色 / 平坦度 / 饱和度 / 肤色占比 / 边缘密度)→ 类型分类
  2. K-means++ 选取调色板(Lab;边缘与显著性加权采样,颜色预算按类型调整)
  3. 区域均值色(Lab)+ 感知色差匹配(CIEDE2000 或 OKLab ΔE)
  4. 能量函数:边缘/显著性保护图 → 保真度权重 + 误差扩散门控
  5. 抖动:Floyd-Steinberg 蛇形 / Bayer 4×4(默认由类型决定)
  6. ICM 空间精炼(短边 ≤120)+ 孤立豆清理 + 棋盘抑制
    ↓
handleQuantizerApply:品牌 ID('P18')→ resolveToHex() → hex('#F0B08A') → canvasData
```

> **铁律**:`canvasData` 只存储 hex 字符串,不存储品牌 ID(`ctx.fillStyle = 'P18'` 会渲染黑块)。

---

## 🧪 测试

```bash
npm run test:run   # 319 用例 / 22 文件
```

| 文件 | 覆盖 |
|------|------|
| `utils/colorDiff.test.js` | CIEDE2000(含 Sharma 34 组基准,与 worker 实现同源锁定)、rgbToLab、findClosestColorCIEDE2000 |
| `utils/imageGuard.test.js` | 选图门控:类型/字节/像素边界、PNG IHDR 与 JPEG SOF 头解析(伪造头/截断/段长非法)、未解析格式放行、错误码与 i18n 键一一对应 |
| `utils/autoGrid.test.js` | 自动网格推荐与网格→配色数表 |
| `utils/historyUtils.test.js` | pushHistory 上限截断、undo/redo 往返一致 |
| `utils/adminOverview.test.js` | 概览纯计算:趋势归一化、模板库统计、内容健康检查规则 |
| `services/colorUtils.test.js` | resolveToHex 边界、hexToRgb、rgbToHex、getTextColor |
| `services/storageUrl.test.js` | Supabase 存储基址解析(同源 `/sb` 代理、头像 URL 归一化) |
| `services/export/PatternDocument.test.js` | PatternDocument → PNG/SVG 渲染一致性(网格/坐标/图例/色号) |
| `hooks/useCanvasPainter.test.js` | 双层 Canvas 绘制、attach 时重绘、overlay 增删 |
| `workers/imageQuantizer.worker.test.js` | worker 管线回归:调色板子集、色彩统计、透明像素、矩形输出 |
| `workers/imageQuantizer.quality.test.js` | 质量基准:OKLab 数学、加权色差、孤立豆清理、棋盘抑制、性能预算 |
| `data/templates.test.js` | 模板 JSON 校验(normalizeCustomTemplate:颜色归一化/矩形/错误分支) |
| `data/tutorials.test.js` | 教程数据加载器:语言回退、结构、幂等、flatten |
| `features/gallery/GalleryPage.test.jsx` | 图库 V2:卡片渲染、搜索筛选、收藏持久化、作品视图、云端降级与重试 |
| `features/gallery/hooks/useDownloadCounts.test.js` | 下载计数:本地持久化、云端 max+乐观增量、RPC 失败保留 |
| `components/Canvas.test.jsx` | 组件级:网格渲染、点击填色、pinch 不误填色回归 |
| `components/ProfilePage.test.jsx` | 独立页形态与约束:无站点导航/登录按钮、双栏、昵称脏值门控与异步同步、未登录跳转 |
| `components/Tutorials.test.jsx` | 教程页异步加载流程:加载态 → 数据到达后渲染 |
| `components/AdminPanel.test.jsx` | 后台门禁回归:未登录不得读取 `user` 字段、非管理员/检查中/云端未配置 |
| `components/AdminDashboardPage.test.jsx` | 概览页:门禁四态、KPI/趋势图/健康检查/待办、快捷入口深链、失败重试 |
| `components/Header/LanguageSelector.test.jsx` | 语言选择器:切换与持久化 |
| `App.test.jsx` | App 冒烟测试:完整组件树渲染(MemoryRouter + HelmetProvider,canvas/matchMedia mock)——捕捉"漏 import → ReferenceError"的生产白屏 |

CI(`.github/workflows/ci.yml`)在 push / PR 到 `main` 时依次运行:`test:run` → `check-i18n` → `check-migrations` → `build` → 校验生成的字体 CSS 无差异。

---

## 🗂 数据存储

**本地(localStorage)**:

| 键 | 内容 |
|-----|------|
| `saved-works` | 未登录时的本地作品数组;登录后迁入云端并清空该键(约 5MB 上限、4MB 预警) |
| `cloud-works-mirror` | `{ count }`,登出后仍能提示"作品在云端,登录查看" |
| `bead_studio_settings` | `{ language }` 语言偏好 |
| `gallery-favorites` | 收藏的模板 ID |
| `tutorial-progress` | 已读教程 ID |
| `bead-studio-behavior` | `{ sessions, guideShown, quantizerVisited }`,驱动移动端首次使用引导 |
| `custom-templates` / `custom-categories` | 本地模式下的自定义模板与分类(云端未配置时的回退) |

**云端(Supabase,18 个迁移文件定义)**:

| 对象 | 内容 |
|----|------|
| `profiles` | 昵称、头像、`role`(admin);自定义账号的 `security_key_hash` |
| `templates` / `categories` | 云端模板库与分类(`source` / `palette_id` / `download_count`);匿名只读、管理员写入 |
| `works` | 登录用户作品(`user_id` + `saved_at` + `name` 唯一),RLS 本人可读写 |
| `contact_messages` | 线程式留言(参与者 = 登录用户或访客 UUID,含 `author` 区分用户/管理员) |
| `registration_notifications` | 新用户注册流水(仅管理员可读,驱动概览的注册趋势) |
| `removed_accounts` | 删除账号的墓碑记录 |
| `avatars`(Storage) | 头像文件,公开读、本人写 |
| RPC | `increment_template_download`、`admin_overview`、`admin_user_stats`、`admin_list_users`、`admin_list_registrations`、`admin_list_contact_messages`、`admin_reply_contact`、`get_contact_thread`、`ensure_contact_nickname`、`user_account_status`、`admin_lock_user` / `admin_unlock_user` / `admin_delete_user`、`resolve_auth_email`、`username_exists`、`set_security_key`、`reset_password_custom` |

---

## 🚀 部署

- **推送即部署** — 仓库连接 Vercel 的 GitHub 集成,推送 `main` 自动构建与发布
- **规范域名** — 生产域名为 **https://tangnotes.site**;`vercel.json` 将旧域名 `pindou-studio.vercel.app/*` 永久重定向到新域名
- **静态预渲染** — 构建时生成 `index` 与 `gallery` / `tutorials` / `privacy` / `terms` / `admin` 的静态 HTML(`/gallery` 等路径经 rewrite 指向对应文件),`admin` 标记 `noindex`
- **缓存策略** — 带哈希的 `/assets/*` 一年不可变缓存,其余 no-cache
- **SEO** — 每页独立 `<Helmet>` 元信息与 canonical、`hreflang` 四语言互链、Open Graph / Twitter 卡片、JSON-LD 结构化数据,`sitemap.xml` / `robots.txt` / `llms.txt` 随仓库发布

---

## 🤝 贡献指南

1. Fork 本仓库
2. 创建功能分支:`git checkout -b feat/your-feature`
3. 提交前验证:
   ```bash
   npm run test:run && npm run check-i18n && npm run check-migrations && npm run build
   ```
4. Push 并发起 Pull Request

约定:
- **新增界面文案**必须同步 `src/i18n/locales/` 下全部四个语言文件(以 `zh-CN` 为基准,`check-i18n` 校验键集与插值变量一致);**管理后台**文案为中文硬编码,不需要国际化
- **新增教程内容**请同时维护四语言数据文件(`src/data/tutorials.{zh,en,ja,ko}.js`)
- **新增页面**若是独立页(不继承站点导航),需同时在 `App.jsx` 的 `currentPage` 推导与 `isStandalonePage` 两处登记
- **新增迁移**文件名版本号必须唯一(重复会让 `supabase db push` 因主键冲突失败,`check-migrations` 会提前拦截)
- 提交信息不添加任何 AI 协作署名

---

## 📄 License

[MIT](LICENSE) © 2026 Aswellle

---

*从第一颗珠子到第一百颗,愿你每一次拼贴都落子无悔。*
