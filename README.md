# 🎨 拼豆Studio · Bead Studio

> **把灵感一颗一颗烫进珠子里。** 专业的在线拼豆图纸设计工具 —— 从像素到实物,一站式创作。

[![CI](https://github.com/Aswellle/Pindou-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/Aswellle/Pindou-Studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-BaaS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![i18n](https://img.shields.io/badge/i18n-4%20Languages-4A9B8E)](https://www.i18next.com)

**三个品牌色卡 · 四种语言 · 十八篇教程 · 云端账号体系 · 71+ 测试全绿**

拼豆Studio 是一款开箱即用的拼豆图纸在线设计工具:自由绘制、图片智能转图纸、专业图纸导出、云端模板库与账号体系一应俱全。无论是第一次拿起 Pegboard 的新手,还是追求精致作品的进阶玩家,都能在这里找到属于自己的创作节奏。

---

## ✨ 亮点速览

| | 数字背后的故事 |
|---|---|
| 🎨 | **236 种品牌色** —— Perler(80)/ Hama(56)/ Artkal(100),CIEDE2000 感知均匀配色 |
| 🌐 | **4 种语言** —— 简体中文 / English / 日本語 / 한국어,自动检测浏览器语言,`?lang=` 直达 |
| 📖 | **18 篇图文教程** × 4 语言 —— 从入门到防变形,连"翻车急救手册"都有 |
| 🧪 | **71 个测试用例** —— CIEDE2000 含 CIE 官方 10 组参考值,颜色科学级严谨 |

---

## 🖊️ 核心功能

### 画布绘制
- **四种工具** — 铅笔 / 橡皮 / 填色桶 / 抓手,拖拽连续绘制零延迟
- **灵活尺寸** — 方形 29–170、矩形预设、自定义 9–200 任意边长
- **平移 / 缩放** — PC 滚轮缩放 + 拖拽平移;移动端双指捏合 + 单指惯性平移
- **撤销 / 重做** — 50 步操作历史,笔画粒度入栈
- **双层 Canvas 渲染机制** — 提交层 + 覆盖层分离,拖拽绘制绕过 React 状态直达画布

### 🖼️ 图片转图纸(颜色科学级)
- **K-means++ 取色** — Lab 色彩空间聚类,7×7 px/格源采样,最大 3000px 输入
- **CIEDE2000 匹配** — 感知均匀色差,蓝/紫色系尤其准确
- **双抖动** — Floyd-Steinberg 蛇形 / Bayer 4×4 有序(作用于 L 通道)
- **ICM 精炼** — 小图额外迭代优化颜色映射
- **零拷贝传输** — Web Worker + Transferable ArrayBuffer,不阻塞主线程

### 🎨 三大品牌色卡
| 品牌 | 色号范围 | 颜色数 | 特点 |
|------|---------|--------|------|
| Perler | P01 – P80 | 80 | 颜色最全,入门首选 |
| Hama | H01 – H56 | 56 | 北欧柔和风格 |
| Artkal | C01 – C100 | 100 | 金属色 / 荧光色丰富 |

### 📄 图纸导出(带确认流程)
- **快速三件套** — PNG 位图 / SVG 矢量 / 文本色号索引
- **专业两风格** — 专业图纸(平色方块 + 品牌色号标注,制作参考)/ 展示图纸(拟真立体珠子,分享展示)
- **导出确认框** — 空画布拦截提示;有内容时展示完整设置(格式/说明/风格)后确认
- **成品级信息** — 行列坐标、颜色清单(主色/辅色/点缀色/微量色四档分组)、总珠数统计,3 倍超采样高清渲染

### ☁️ 账号体系(真实云端)
- **邮箱验证码验证** — 注册/登录/找回密码全程验证码,国内网络无需打开外部链接
- **个人资料** — 头像上传 + 圆形裁剪(自研裁剪器,拖动/滚轮/双指缩放)、昵称、旧密码验证改密
- **管理员后台** — 模板库 CRUD(模态框操作)、JSON 导入、用户仪表盘(注册统计 + 搜索分页,只读合规)

### 📚 图库 · 教程 · 国际化
- **云端模板库** — 内置 8 模板 + 管理员上传模板全设备统一,公开只读、管理员写入(RLS)
- **18 篇图文教程** × 4 语言 — 入门指南、熨烫全解、防变形、配色设计、进阶技巧、作品保护
- **i18n 全覆盖** — 浏览器语言自动检测,手动选择持久化,`?lang=en` URL 直达语言页

---

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm 9+

### 安装与开发

```bash
git clone https://github.com/Aswellle/Pindou-Studio.git
cd Pindou-Studio/bead-studio
npm install
npm run dev
```

开发服务器启动在 **http://localhost:5280**(局域网可通过 `http://<本机IP>:5280` 访问)。

### 常用命令

```bash
npm run dev            # 开发服务器(热更新)
npm run build          # 生产构建(含子页面静态 HTML)
npm run preview        # 本地预览构建产物
npm run test           # 测试(watch 模式)
npm run test:run       # 测试(单次,CI 模式)
npm run check-i18n     # 验证 4 个语言文件键名一致性
```

> 云端功能(Supabase)需要配置环境变量,详见 [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)(该文档本地留存,未纳入版本控制)。

---

## 🏗️ 技术栈

| 层 | 技术 |
|----|------|
| 框架 | React 18 + Vite 5 + React Router 7(路径路由) |
| 样式 | Tailwind CSS v4 + 手作暖调设计令牌(CSS 变量) |
| 云端 | Supabase(PostgreSQL + Auth + Storage + 邮件 OTP) |
| 国际化 | react-i18next,4 语言全量覆盖(UI + 教程 + 导出件) |
| 颜色科学 | CIEDE2000(Lab 空间)+ K-means++(Web Worker) |
| 状态管理 | React `useState` / `useReducer`(无全局 store) |
| 测试 | Vitest + @testing-library/react,71 用例 |
| 部署 | Vercel(push 到 main 自动部署)+ Supabase |

---

## 🔬 图片量化流程

```
用户上传图片
    ↓
useImageQuantizer.js(Transferable ArrayBuffer 零拷贝,缩放 7×7 px/格)
    ↓
imageQuantizer.worker.js(Web Worker,不阻塞 UI)
  1. K-means++ 在 Lab 空间选取调色板
  2. CIEDE2000 近邻色匹配
  3. 边缘感知区域采样(高方差格子双均值分析)
  4. Floyd-Steinberg 蛇形 / Bayer 4×4 抖动(L 通道)
  5. ICM 空间精炼(outW ≤ 120)
    ↓
handleQuantizerApply:品牌 ID('P18')→ resolveToHex() → hex('#F0B08A') → canvasData
```

> **铁律**:`canvasData` 只存储 hex 字符串,不存储品牌 ID(`ctx.fillStyle = 'P18'` 会渲染黑块)。

---

## 🧪 测试

```bash
npm run test:run
```

当前 **71 个用例 / 6 个文件**,覆盖:

| 文件 | 覆盖 |
|------|------|
| `colorDiff.test.js` | CIEDE2000(含 CIE 官方 10 组参考值)、rgbToLab、findClosestColorCIEDE2000 |
| `colorUtils.test.js` | resolveToHex 边界、hexToRgb、rgbToHex、getTextColor |
| `historyUtils.test.js` | pushHistory 上限截断、undo/redo 往返一致 |
| `useCanvasPainter.test.js` | 双层 Canvas 绘制、attach 时重绘、overlay 增删 |
| `templates.test.js` | 模板 JSON 校验 12 例(颜色归一化/矩形/错误分支) |
| `Canvas.test.jsx` | 组件级:网格渲染、点击填色、pinch 不误填色回归 |

---

## 🗂 数据存储

| 键 / 表 | 内容 |
|---------|------|
| `saved-works`(localStorage) | 作品数组(画布数据/尺寸/调色板/时间),约 5MB 上限,4MB 预警 |
| `bead_studio_settings`(localStorage) | `{ language }` 语言偏好 |
| `gallery-favorites`(localStorage) | 收藏模板 ID |
| `tutorial-progress`(localStorage) | 已读教程 ID |
| `custom-templates` / `custom-categories`(localStorage) | 本地模式自定义模板(云端未配置时的回退) |
| Supabase `profiles` | 云端:角色 / 昵称 / 头像 |
| Supabase `templates` / `categories` | 云端模板库(公开读,管理员写) |

---

## 🚢 部署

1. **Supabase**:创建项目 → 执行 `supabase/migrations/*.sql` → 配置 SMTP 与中文邮件模板(详见 `docs/SUPABASE_SETUP.md`)
2. **环境变量**:`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`(Vercel + 本地 `.env.local`)
3. **Vercel**:推送 `main` 自动部署(SPA 路由已配置 rewrite)

---

## 🤝 贡献指南

1. Fork 本仓库
2. 创建功能分支:`git checkout -b feat/your-feature`
3. 提交前验证:
   ```bash
   npm run test:run && npm run check-i18n && npm run build
   ```
4. Push 并发起 Pull Request

新增 UI 文本请同步更新 `src/i18n/locales/` 下全部四个语言文件(zh-CN 为基准,`check-i18n` 校验键集一致)。新增教程内容请同时维护四语言数据文件(`src/data/tutorials.{zh,en,ja,ko}.js`)。

---

## 📄 License

[MIT](LICENSE) © 2026 Aswellle

---

*从第一颗珠子到第一百颗,愿你每一次拼贴都落子无悔。*
