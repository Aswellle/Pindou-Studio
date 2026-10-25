# 🎨 拼豆Studio · Bead Studio

> **把灵感一颗一颗烫进珠子里。** 专业的在线拼豆图纸设计工具 —— 从像素到实物,一站式创作。

[![CI](https://github.com/Aswellle/Pindou-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/Aswellle/Pindou-Studio/actions/workflows/ci.yml)
[![XERJ Corpus Hub contributor](https://hub.xerj.org/contributors/Aswellle/badge.svg)](https://hub.xerj.org/contributors/Aswellle)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-BaaS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![i18n](https://img.shields.io/badge/i18n-4%20Languages-4A9B8E)](https://www.i18next.com)
[![Tests](https://img.shields.io/badge/tests-1891%20passing-4A9B8E)](https://github.com/Aswellle/Pindou-Studio/actions/workflows/ci.yml)

**中文** · [English](README.en.md)

**六大品牌色卡 · 1039 种颜色 · 四种语言 · 24 篇教程 · 云端账号与个人色卡**

拼豆Studio 是一款开箱即用的在线拼豆图纸工具。它不只画得出来,还把「从一张照片 / 一张别人的图纸 / 一个念头」到「手里能照着拼的成品图纸」之间每一步都接上了:自由绘制、图片转图纸、截图识图、品牌换色、个人色卡与库存、专业导出、云端模板库与作品版本历史。

**不用注册就能用。** 绘制、转图、识图、导出全部离线可用;账号只在你想要跨设备同步作品、管理个人色卡时才需要。

⭐ **如果这个项目对你有帮助,欢迎点个 [Star](https://github.com/Aswellle/Pindou-Studio) 支持一下 —— 你的每一颗星都是继续打磨的动力。**

---

## ✨ 亮点速览

| | 功能亮点与应用价值 |
|---|---|
| 🖼️ | **图片一键转图纸** — 上传照片秒变拼豆图纸,自动匹配网格与配色数;`lab`(CIEDE2000)与 `oklab` 两种色彩空间可选,支持 PNG / JPEG / WebP / GIF / AVIF / **HEIC** / **PDF** |
| 📐 | **已有图纸截图直接识别** — 拍一张别人的成品或扫描图纸,自动检测行列网格,支持**四点透视校正**,识别错了可以逐格手动修正 |
| 📄 | **专业图纸导出** — 品牌色号标注 + 颜色清单四档分组 + 行列坐标尺 + 物理尺寸 DPI,直接对照贴珠 |
| 🎨 | **六大品牌色卡(1039 种颜色)** — COCO / MARD / MARD 291 / Perler / Hama / Artkal,支持品牌间 CIEDE2000 近邻重映射 |
| 🧺 | **个人色卡与库存** — 自建色卡、批量导入 CSV/JSON、逐色登记拥有数量、图纸按你的库存匹配、导出成功后自动扣减 |
| ☁️ | **云端账号体系** — 邮箱验证码 / 自定义账号(用户名+安全密钥)两种注册,头像裁剪上传、作品跨设备同步、**作品版本历史可回滚** |
| 🌐 | **4 种语言** — 自动检测浏览器语言,`?lang=` 直达,1708 条界面文案 / 教程 / 导出件全量覆盖 |
| 📖 | **24 篇图文教程 × 4 语言** — 六大门类,从「什么是拼豆」到「翻车急救」,内容按官方资料核对过 |
| 🛠️ | **管理后台** — 模板库 CRUD + JSON 导入 + 分类管理 + **主题/合集策展** + 首页区块编排 + 用户仪表盘 + 留言处理 |
| 📱 | **移动端优先** — 双指捏合缩放、单指惯性平移、选区命令带文字标签自动换行,手机平板一样顺手 |

---

## 🖊️ 核心功能

### 画布绘制

- **七种工具** — 铅笔 / 橡皮 / 填色桶 / 抓手 / 取色器 / **矩形选区** / **自由套索**
- **灵活尺寸** — 方形预设 29 / 57 / 87 / 114 / 140 / 170;横竖矩形预设;自定义 9–200 任意边长
- **平移 / 缩放** — PC 滚轮缩放(以光标为中心)+ 拖拽平移;移动端双指捏合 + 单指惯性平移;缩放 0.3×–5×
- **撤销 / 重做** — 50 步操作历史,笔画粒度入栈(`Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`,Mac 用 `Cmd`)
- **双层 Canvas 渲染** — 提交层 + 覆盖层分离,拖拽绘制绕过 React 状态直达画布,快拖不堆积重绘
- **自动保存草稿** — 停止操作 2 秒后写入 IndexedDB,刷新或误关页面后回到画布会提示恢复
- **品牌切换预览** — 切换色卡时先看逐色映射与影响面,可选「只改色号」或「转换颜色并切换」

### 🎯 选区编辑(矩形 + 套索)

- **两种选区** — 矩形拖框,或自由套索圈出任意形状;套索按位图掩码处理,凹多边形、带洞形状都贴合
- **拖动移动** — 在选区内按住拖动即可搬走内容,松手提交一条历史;越界**钳制**而非裁剪,内容不会掉出画布
- **八个 resize 手柄** — 四角 + 四边中点,对角锚点不动;手柄命中区按指针类型给(触屏 24px / 鼠标 10px)
- **复制拖动** — 桌面 `Alt`/`Option` + 拖动,或操作条上的「拖动复制」开关(触屏没有修饰键)
- **编辑命令** — 填充 / 擦除 / 复制 / 剪切 / 粘贴 / 水平镜像 / 垂直镜像 / 顺时针旋转 / 逆时针旋转 / 取消选区
- **长按菜单** — 移动端长按选区内容弹出上下文菜单(500ms,移动超过 10px 取消)
- **边缘吸附(默认关)** — 靠近已有珠子边界时自动贴边;因会「抢手感」默认关闭,需要精确贴边时手动打开
- **实时跟随预览** — 拖选时虚线框逐帧跟手,落定后虚线缓慢流动;线宽与虚线按缩放补偿,任何缩放级别观感一致

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
- **HEIC / PDF 直读** — iPhone 原生照片与图纸 PDF 不必先转换;两个解码器(heic-vendor 约 3.2MB、pdf-vendor 约 0.5MB)按需动态加载、单独分包,不进主包
- **零拷贝** — Web Worker + Transferable ArrayBuffer,量化全程不阻塞主线程

### 📐 图纸导入(`/import`)

两种输入走**两条不同的管线**,不混用:

- **项目文件** — `.pindou.json` 项目文件或模板 JSON:校验 → 预览 → 保存为私有作品或直接载入画布。失败时不动画布、不写存储,只给分类错误
- **图纸截图** — 已有拼豆格子的照片/扫描件:自动检测行列数与边界 → **四点透视校正**消除拍摄畸变 → 可改行列、拖框重设边界、切换色卡、开关空白识别 → 逐格点选人工修正 → 载入或保存
- **跨会话恢复** — 识图的人工修正会记住,误关页面后重新打开可以接着改

### 🎨 六大品牌色卡

| 品牌 | 色号范围 | 颜色数 | 特点 |
|------|---------|--------|------|
| COCO | A–Z 色系编号 | 291 | 2.6mm 迷你珠,A–Z 分组 |
| MARD | 9 大官方色系 | 221 | 5mm,国内图纸生态默认标准 |
| MARD 291 | 标准 221 + 扩展 | 291 | 5mm,系列更全 |
| Perler | P01 – P80 | 80 | 颜色最全,入门首选 |
| Hama | H01 – H56 | 56 | 北欧柔和风格 |
| Artkal | C01 – C100 | 100 | 金属色 / 荧光色丰富 |

模板颜色可在各品牌色卡间按 CIEDE2000 近邻重映射(图库卡片上的品牌徽标即转换入口);绘制、图库、导出均按当前所选品牌配色。

### 🧺 个人色卡与库存(`/my/beads`)

三个工作区,数据在登录时落 Supabase(RLS 仅本人可读写),未登录时落本机:

- **我的色卡** — 新建 / 复制内置色卡 / 颜色 CRUD;可标注颜色来源(官方 / 自测 / 目测)
- **我的库存** — 逐色登记「有没有」与「有多少」,草稿 + 提交,不打断当前编辑
- **图纸匹配** — 选目标色卡 → 按库存给出匹配结果 → 临时预览 → 确认应用;缺色与不足量都会标出来
- **批量导入** — CSV / JSON,提供模板下载;导入前列出「可导入 N 个 / 有问题的行」,全部合法才一次性写入
- **备份与恢复** — 导出/导入个人色卡与库存备份;导入是**合并**而非覆盖,同 id 跳过,不合法整体拒绝
- **导出记账** — 可选开关(默认关):导出成功后按图纸实际颗数扣减库存,扣到 0 自动标记缺货

> **画布只存 HEX。** 删除个人色卡不会让已保存的图纸变黑。

### 📄 图纸导出

- **新导出引擎(V2,默认开启)** — 统一 `PatternDocument` 文档模型 → PNG 光栅 / SVG 矢量渲染器,颜色、坐标、编号、图例、布局语义完全一致;面板内可一键切回旧引擎
- **两种风格** — 专业图纸(平色方块 + 品牌色号标注,制作参考)/ 展示图纸(拟真立体珠子,分享展示)
- **成品级信息** — 标题栏(尺寸 / 总珠数 / 用色数 / 色卡 / 日期)、左右两侧行号尺 + 顶部列号尺、颜色清单(主色 / 辅色 / 点缀色 / 微量色四档,微量色带 ⚠ 采购提醒)、品牌标识
- **质量预设** — 屏幕 300 DPI / 高清 432 DPI / 印刷 576 DPI,真正驱动超采样倍率并回报实际倍率
- **五种出口** — 图纸 PNG / 图纸 SVG / 快速 PNG / 快速 SVG / 文本色号索引,另可导出 `.pindou.json` 项目文件继续编辑
- **高清输出** — 逻辑像素 3× 超采样(按设备与画布面积自动降级),`toBlob` 编码避免内存翻倍,面板显示实际导出分辨率
- **长任务友好** — 按 2000 颗豆分批渲染并回报进度,关闭面板即中止导出(AbortSignal)

### ☁️ 账号 · 个人中心 · 管理后台

- **两种注册方式** — 邮箱验证码(注册 / 登录 / 找回全程 6 位验证码,国内网络无需外链);自定义账号(用户名 + 密码 + 可选安全密钥找回)
- **作品跨设备同步** — 登录后作品存 Supabase `works` 表,未登录存本机 IndexedDB;首次登录自动把本地作品迁入云端并提示同步数量
- **作品版本历史** — **一次显式保存 = 一个版本**,最多保留 20 个;可对比差异、回滚,回滚本身也产生一条历史(否则回滚错了就再也回不去)
- **个人中心**(`/profile`)— 三个分区:概览(统计与快捷入口)/ 我的作品(网格 + 搜索 + 版本历史 + 删除)/ 我的收藏
- **头像** — 自研圆形裁剪器(拖动 / 滚轮 / 双指缩放,输出 240×240 webp),上传到 Supabase Storage
- **管理后台**(`/admin`)— 六个页签:模板库 CRUD、JSON 导入、分类管理、**内容运营**(主题/合集策展 + 首页区块编排 + 内容健康检查)、用户仪表盘、留言会话回复
- **管理概览**(`/admin/dashboard`)— 用户增长 KPI、近 14 天注册趋势图、内容库规模与分布、热门模板、留言待办、内容健康检查与快捷入口
- **统一门禁** — `AdminGate` 处理「云端未配置 / 会话检查中 / 未登录 / 非管理员」四态;标签页支持 `/admin?tab=users` 等深链

### 📚 图库 · 教程 · 国际化

- **图库**(`/gallery`)— 只做模板库:搜索 / 分类 / 难度 / **按用色数**筛选(URL 同步)、收藏、下载计数、品牌徽标与转换、导出菜单、云端不可用时降级横幅与重试
- **策展内容** — 主题页(`/gallery/theme/:slug`)、合集页(`/gallery/collection/:slug`)、图纸详情页(`/gallery/pattern/:id`);主题支持**两层嵌套**(子主题 + 相关合集),避免无限层级
- **首页可编排** — 后台可决定图库首页展示哪些区块、顺序、每块数量与自定义标题,也可以把某个主题或合集单独拎出来做一块
- **24 篇图文教程 × 4 语言** — 六个门类:入门指南 / 熨烫全解 / 防变形 / 配色设计 / 进阶技巧 / 作品保护
- **i18n 全覆盖** — 1708 条界面文案 × 4 语言;仅 `zh-CN` 内联打包,`en/ja/ko` 按需懒加载;教程数据亦按语言分包

### 🔐 安全与合规

- **行级安全(RLS)** — 模板/分类匿名只读、作品本人可读写、头像本人可写、个人色卡与库存本人可读写、管理员可写
- **函数级门禁** — 所有管理类 RPC 均为 `security definer` 且内部校验 `is_admin()`
- **登录即凭证** — 认证走 Supabase Auth(OTP / 自定义账号);留言支持 Turnstile 会话信任 + 频率限制
- **管理员双判据** — `is_admin()` 要求「角色为 `admin` **且** 在白名单 `admin_allowlist` 内」;白名单无任何客户端策略(仅 service_role 可维护,附原子授予助手 `admin_grant_by_email` / `admin_revoke_by_email`)。**单纯改动 `profiles.role` 不再等于拿到管理员权限**
- **管理员两步验证** — `/admin/login` 支持 TOTP:已绑定因子则必须通过 aal2 校验才进入后台;绑定完成后可将 `security_settings.admin_require_mfa` 置为 `true`,由**服务端**强制每个后台请求都必须是 aal2 会话
- **安全审计** — 角色变更与白名单增删由数据库触发器在服务端落库(`admin_audit_log`,客户端无法伪造),管理员可经 `admin_list_audit()` 读取
- **只读元数据** — 用户仪表盘仅展示运营所需字段(邮箱 / 昵称 / 角色 / 验证状态 / 注册与登录时间),不含敏感信息
- **越权验证脚本** — `scripts/verify-rls.mjs` 真跑 Supabase,验证跨用户读写、匿名拒绝与管理员 RPC 边界

---

## 🚀 快速开始

### 环境要求

- Node.js 22+(见 `.nvmrc`,CI 锁定 22.x)
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
npm run build            # 生产构建(字体 CSS → 打包 → 子页面预渲染 → 分享卡片快照)
npm run preview          # 本地预览构建产物

npm run test             # 测试(watch 模式)
npm run test:run         # 测试(单次,CI 模式)
npm run test:ui          # Vitest 浏览器 UI

npm run check-i18n       # 校验 4 个语言文件键集与插值变量一致
npm run check-migrations # 校验 Supabase 迁移:版本号唯一 + $$ 配对
npm run lint             # Biome 静态检查

npx vitest run src/utils/imageGuard.test.js   # 运行单个测试文件
```

### 云端配置(可选)

不配置环境变量时,站点自动运行在**纯本地模式**(内置模板 + IndexedDB + localStorage),画布、导出、教程、导入全部可用;配置后启用账号体系、云端模板库与个人色卡:

```bash
# .env.local
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_TURNSTILE_SITE_KEY=<optional-turnstile-site-key>
```

数据库结构由 `supabase/migrations/` 下的 **27 个迁移文件**定义(可重复执行)。管理员账号**不要直接改 `profiles.role`**——请用 `select public.admin_grant_by_email('你的邮箱')` 原子授予(同时写入白名单与审计日志)。

---

## 🏗️ 技术栈

| 层 | 技术 |
|----|------|
| 框架 | React 18 + Vite 6 + React Router 7(路径路由,桌面/移动两套布局) |
| 样式 | Tailwind CSS v4(`@tailwindcss/postcss`)+ 手作暖调设计令牌(CSS 变量) |
| 云端 | Supabase(PostgreSQL + Auth + Storage + RLS + security definer RPC) |
| 国际化 | react-i18next 17 / i18next 26,4 语言(zh-CN 内联,其余懒加载) |
| 颜色科学 | CIEDE2000 / OKLab(K-means++ 与色差均在 Web Worker 内) |
| 图像解码 | libheif-js(HEIC)+ pdfjs-dist(PDF),按需动态加载、单独分包 |
| 数据可视化 | Recharts 3(管理概览注册趋势图,按需分包) |
| 状态管理 | React `useState` / `useReducer`(无全局 store;撤销栈用 reducer) |
| 本地存储 | IndexedDB 主存(作品 / 草稿 / 版本)+ localStorage 兼容层与偏好 |
| 图标 / 字体 | lucide-react;Noto Sans SC + LXGW WenKai(仅桌面端动态加载) |
| 测试 | Vitest 4 + @testing-library/react(jsdom),**1891 用例 / 115 文件** |
| 静态检查 | Biome 2 |
| 监控 | Vercel Analytics + Speed Insights |
| 部署 | Vercel(push 到 `main` 自动部署)+ Supabase |

---

## 🔬 图片量化流程

```
用户上传图片
    ↓ 选图门控(类型 / 30MB / 4000 万像素;PNG IHDR · JPEG SOF 文件头判定,解码前拦截)
    ↓ HEIC / PDF 先栅格化成 PNG(动态 import,不进主包)
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

### 图纸识别流程(`/import` 的截图模式)

```
图纸照片 / 扫描件
    ↓ imageGuard 门控 + HEIC/PDF 规范化
    ↓ 四点透视校正(消除拍摄角度造成的梯形畸变,可手动拖四点重设)
    ↓ 网格检测(列数 / 行数 / 边界;端点修剪,避免少一行一列)
    ↓ 逐格采样 → 就近色卡匹配(可切换目标色卡)
    ↓ 人工修正(点格改色 / 标记空白 / 拖框重设边界),修正跨会话保留
    ↓ 载入画布 或 保存为我的作品
```

---

## 🧪 测试

```bash
npm run test:run   # 1891 用例 / 115 文件
```

测试按「**契约**」组织,而不是按覆盖率堆数字 —— 很多文件锁的是「不该退化的行为」,而不是实现细节:

| 类别 | 覆盖举例 |
|------|---------|
| 颜色科学 | CIEDE2000 与 Sharma 34 组基准、rgbToLab、品牌间近邻重映射、导出统计口径一致性 |
| 图像处理 | worker 管线回归(调色板子集 / 色彩统计 / 透明像素 / 矩形输出)、质量基准(OKLab 数学 / 孤立豆清理 / 性能预算)、选图门控头解析(伪造头 / 截断 / 段长非法) |
| 图纸识别 | 网格检测、逐格采样、指针映射、透视变换、HEIC/PDF 转换端到端 |
| 选区 | 矩形与套索几何、掩码命令(填充/镜像/旋转/复制/剪切/移动/粘贴)、resize 手柄、边缘吸附、选框绘制与拖动预览 |
| 项目与存储 | 项目模型校验、导入导出往返、版本历史语义、本地仓储(IndexedDB + localStorage 兼容层)与云端同步 |
| 个人色卡 | 色卡/颜色校验、库存匹配与扣减、CSV/JSON 导入、备份合并语义 |
| 图库 | 卡片版式契约、滚动容器契约、发现区块、OG 快照、下载计数、内容页加载时序 |
| 界面契约 | 浮层可访问性(Esc 关闭 / 焦点归还 / IME 组合态)、移动端遮罩点击拦截、头像圆形契约、导入页契约 |
| 页面级 | `App.test.jsx` 冒烟测试渲染整棵树 —— 捕捉「漏 import → ReferenceError」的生产白屏 |

CI(`.github/workflows/ci.yml`)在 push / PR 到 `main` 时依次运行:`test:run` → `check-i18n` → `check-migrations` → `build` → 校验生成的字体 CSS 无差异。

---

## 🗂 数据存储

**本机(IndexedDB 主存,localStorage 兼容与偏好)**:

| 键 / 库 | 内容 |
|-----|------|
| IndexedDB `works` | 未登录时的作品;登录后迁入云端并清空本机副本(首次运行自动把 localStorage 旧数据搬过来) |
| IndexedDB `drafts` | 自动保存草稿,2 秒防抖;**不进撤销栈、不触发云端写入** |
| IndexedDB `versions` | 作品版本快照,每个作品最多 20 个 |
| `cloud-works-mirror` | `{ count }`,登出后仍能提示"作品在云端,登录查看" |
| `bead_studio_settings` | `{ language }` 语言偏好 |
| `gallery-favorites` | 收藏的模板 ID |
| `tutorial-progress` | 已读教程 ID |
| `bead-studio-behavior` | `{ sessions, guideShown, quantizerVisited }`,驱动移动端首次使用引导 |
| `custom-templates` / `custom-categories` | 本地模式下的自定义模板与分类(云端未配置时的回退) |

---

## 🚀 部署

- **推送即部署** — 仓库连接 Vercel 的 GitHub 集成,推送 `main` 自动构建与发布
- **规范域名** — 生产环境绑定自定义域名;`vercel.json` 将旧域名永久重定向到当前域名
- **静态预渲染** — 构建时为 `gallery` / `tutorials` / `privacy` / `terms` / `admin` 生成静态 HTML(各带独立 title / description / canonical / hreflang / OG),`admin` 标记 `noindex`
- **动态内容快照** — 构建时从 Supabase 拉已发布内容,为每个主题 / 合集 / 图纸生成静态 HTML 与 **1200×630 分享卡片**;新发布的内容未命中快照时仍走 SPA 兜底,不会 404
- **缓存策略** — 带哈希的 `/assets/*` 一年不可变缓存,其余 no-cache

---

## 🤝 贡献指南

1. Fork 本仓库
2. 创建功能分支:`git checkout -b feat/your-feature`
3. 提交前验证:
   ```bash
   npm run test:run && npm run check-i18n && npm run check-migrations && npm run build
   ```
4. Push 并发起 Pull Request

### 代码风格

**既有代码风格是事实标准。** 任何工具的默认风格与之冲突时,一律以既有代码为准:

- 不对既有文件执行全仓库格式化改写,不产生改动整个仓库的机械性大提交
- 新增/修改文件时模仿该文件及同目录既有写法(缩进、引号、分号、换行、注释密度)
- linter 自动修复只接受语义等价且改动可枚举的小项,且提交前逐条审查 diff

### 约定

- **新增界面文案**必须同步 `src/i18n/locales/` 下全部四个语言文件(以 `zh-CN` 为基准,`check-i18n` 校验键集与插值变量一致);**管理后台**文案为中文硬编码,不需要国际化
- **新增教程内容**请同时维护四语言数据文件(`src/data/tutorials.{zh,en,ja,ko}.js`)
- **新增迁移**文件名版本号必须唯一(重复会让 `supabase db push` 因主键冲突失败,`check-migrations` 会提前拦截)
- **改动字体会影响构建** — 触碰字体后必须运行 `node scripts/generate-fonts-css.js` 并提交生成的 `src/styles/fonts-all.css`,CI 会校验两者一致

---

## 📄 License

[MIT](LICENSE) © 2026 Aswellle

---

## 📝 更新日志

面向用户的变更记录见 [CHANGELOG.md](CHANGELOG.md)。

近期最需要注意的是**选区填充默认不再填充空白格** —— 如需一键铺满整个选区,
请打开选区操作条上的「含空白」开关。

---

*从第一颗珠子到第一百颗,愿你每一次拼贴都落子无悔。*
