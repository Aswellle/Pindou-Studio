# Supabase 云端部署指南(模板库 + 账号体系)

本文档指导把站点从纯本地模式升级为「云端共享模板库 + 真实账号体系」。
完成后:游客免登录浏览云端模板库(公开只读);管理员用邮箱+密码跨设备登录,
进入后台管理(RLS 在服务端强制仅 admin 可写);TLS 加密 + 密码哈希 + JWT 会话。

> 预计耗时:15–30 分钟。需要:`supabase.com` 账号 + 你的管理员邮箱。

---

## 1. 创建 Supabase 项目

1. 打开 https://supabase.com → Sign in → **New project**
2. 填项目名(如 `bead-studio`)、**数据库密码**(记下)、区域(选 `Singapore` 或 `Northeast Asia`,
   越近越快),点击 **Create new project**,等待 1–2 分钟初始化。

## 2. 建表 + 行级权限(一次性)

1. 项目控制台左侧 **SQL Editor** → **New query**
2. 粘贴 `supabase/migrations/0001_init.sql` 的完整内容 → **Run**
3. 看到绿色成功即可。该脚本创建 `templates` / `categories` / `profiles` 三张表,
   启用 RLS,并设置:模板与分类**任何人可读、仅 admin 可写**,profile 本人可读。

## 3. 配置邮件(邮箱验证需要)

1. 控制台 **Authentication → Providers → Email** → 确保 **Enable Sign up** 开启
2. 建议 **Confirm email** 保持开启(本站采用邮箱验证流程)
3. 邮件默认用 Supabase 内置服务(免费额度含发送量,速率受限)。如需更专业的
   发信,可在 **Authentication → Emails → SMTP Settings** 配置自己的 SMTP。

## 4. 获取密钥并配置到前端

1. 控制台 **Project Settings → API**:
   - **Project URL**(形如 `https://xxxx.supabase.co`)→ 记为 `VITE_SUPABASE_URL`
   - **anon public key**(`sb_publishable_...`)→ 记为 `VITE_SUPABASE_ANON_KEY`
   - ⚠️ **service_role key 严禁配置到前端/公开仓库**,它拥有全部权限
2. 本地开发:在 `bead-studio/.env.local` 写入:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxx
   ```
3. 线上部署(Vercel):项目设置 → **Environment Variables** 添加同名两个变量 →
   推送新代码触发重新部署(或手动 Redeploy)。

## 5. 开通管理员账号

1. 站点上线后,手机/电脑打开站点 → 「后台管理」→ 点 **登录 / 注册** → 选「注册」,
   用**你的管理员邮箱**注册(密码 ≥ 6 位)
2. 到邮箱点击 **Confirm your signup** 验证链接
3. 回 Supabase 控制台 **SQL Editor** 执行(把邮箱换成你的):
   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = '你的邮箱' limit 1);
   ```
4. 回到站点后台页,已登录状态下刷新 → 即可看到管理界面(任何设备登录同一账号均可)

## 6. 迁移本地模板到云端

管理员登录后台 → 「模板管理」页顶部「**迁移本地数据到云端**」卡片 → 点 **开始迁移**:
把内置 8 个模板 + 当前设备 localStorage 里的自定义模板/分类一次性写入云端
(按 `(source, name)` 幂等,重复执行不会产生重复)。迁移完成后,所有设备的
图库展示完全一致的云端模板库。

## 7. 验证清单

- [ ] 游客打开站点 → 图库正常展示云端模板(无需登录)
- [ ] 未登录访问「后台管理」→ 显示登录提示
- [ ] 用管理员账号登录 → 进入后台,可增删改模板/分类
- [ ] 普通注册账号登录后台 → 显示「无管理员权限」
- [ ] 手机与电脑登录同一管理员账号 → 后台数据一致(云端共享)
- [ ] 「修改密码」→ 邮箱收到重置邮件,可重置

## 安全模型

| 层 | 机制 |
|----|------|
| 传输 | HTTPS(TLS)— Vercel 与 Supabase 默认提供 |
| 密码 | Supabase Auth 内置 bcrypt 哈希,不存明文 |
| 会话 | JWT + refresh token,自动续期 |
| 权限 | PostgreSQL RLS:`templates`/`categories` 匿名只读、admin 写;`profiles` 本人读 |
| 越权防护 | 前端不接触 service_role key;所有写操作在服务端按 RLS 校验 |
| 邮箱验证 | 注册后需点击验证链接才能登录;密码重置走邮件 |

## 常见问题

- **图库显示「云端模板库为空」**:管理员登录后台 → 模板管理 → 执行迁移。
- **注册后无法登录**:未点击邮件验证链接;或 Check `Authentication → Users` 确认状态。
- **后台提示「云端未配置」**:环境变量未生效 → 检查 `.env.local` / Vercel 变量后重新部署。
- **想关闭邮箱验证**:Authentication → Providers → Email → 关闭 Confirm email。
- **费用**:免费额度(500MB 数据库、5 万月活用户)对本站规模足够;超限再考虑付费。
