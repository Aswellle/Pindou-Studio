# 搜索引擎收录验证指南

> 站点：`tangnotes.site` | 最后更新：2026-07-31

---

## 第 1 步：百度站长平台（ziyuan.baidu.com）

百度是国内搜索引擎的主导者，收录百度是获取国内流量的关键。

### 1.1 添加站点

1. 打开 [ziyuan.baidu.com](https://ziyuan.baidu.com) → 登录百度账号
2. 左侧菜单 **站点管理** → **添加网站**
3. 输入域名：`tangnotes.site`
4. 选择验证方式（推荐 **CNAME 验证**，一步到位）

### 1.2 验证方式

#### 方式 A：CNAME 验证（推荐）

百度会给你一条 CNAME 记录，格式类似：

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|--------|
| CNAME | `xxxxx`（百度提供的子域名） | `zz.baidu.com` |

**操作**：登录 [阿里云 DNS 控制台](https://dc.console.aliyun.com/) → `tangnotes.site` → 解析设置 → 添加上述 CNAME 记录。

验证通过后，百度会自动识别 `tangnotes.site` 的所有权。

#### 方式 B：文件验证

1. 百度会给你一个验证文件，如 `baidu_verify_xxxxx.html`
2. 下载该文件，放到本仓库的 `public/` 目录下
3. 推送部署到 Vercel
4. 确保 `https://tangnotes.site/baidu_verify_xxxxx.html` 可访问
5. 回到百度点击"完成验证"

#### 方式 C：HTML 标签验证

在 `index.html` 的 `<head>` 中添加百度给的 meta 标签：

```html
<meta name="baidu-site-verification" content="xxxxx" />
```

### 1.3 提交 Sitemap

验证通过后：

1. 左侧菜单 **数据引入** → **链接提交** → **sitemap**
2. 提交：`https://tangnotes.site/sitemap.xml`
3. 百度会定期抓取 sitemap 中的页面

### 1.4 提升收录的建议

- **主动推送**：在 **数据引入** → **API推送** 中，将新页面 URL 主动推送给百度
- **robots.txt**：已配置，确保 `Sitemap: https://tangnotes.site/sitemap.xml` 存在
- **内容更新**：保持定期更新内容，百度偏好活跃站点

---

## 第 2 步：Google Search Console（search.google.com/search-console）

Google 是海外搜索的主要渠道，同时有助于全球可见性。

### 2.1 添加资源

1. 打开 [search.google.com/search-console](https://search.google.com/search-console)
2. 登录 Google 账号
3. 点击 **添加资源** → 选择 **域名** 前缀
4. 输入：`https://tangnotes.site`
5. 选择验证方式（推荐 **DNS 验证**）

### 2.2 DNS TXT 验证（推荐）

Google 会给你一条 TXT 记录，格式类似：

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|--------|
| TXT | `@` | `google-site-verification=xxxxxxxxxxxxxxxx` |

**操作**：登录 [阿里云 DNS 控制台](https://dc.console.aliyun.com/) → `tangnotes.site` → 解析设置 → 添加上述 TXT 记录。

> DNS 传播通常需要 5 分钟到 24 小时。验证可能需要等待一段时间。

### 2.3 提交 Sitemap

验证通过后：

1. 左侧菜单 **Sitemaps** → **添加新的网站地图**
2. 输入：`sitemap.xml`
3. 点击 **提交**

Google 会定期抓取并报告索引状态。

### 2.4 国际定位

- 由于站点支持 4 种语言（zh/en/ja/ko），hreflang 标签已配置
- Google 会自动将用户引导至对应语言版本
- 可在 **国际定位** 报告中查看各语言表现

---

## 当前 DNS 记录汇总

以下是 `tangnotes.site` 当前应存在的 DNS 记录：

| 记录类型 | 主机记录 | 记录值 | 用途 |
|---------|---------|--------|------|
| A | `@` | `76.76.21.21` | 根域名指向 Vercel |
| CNAME | `www` | `cname.vercel-dns.com` | www 子域名 |
| CNAME | `（百度提供）` | `zz.baidu.com` | 百度验证（待添加） |
| TXT | `@` | `google-site-verification=...` | Google 验证（待添加） |

---

## 验证完成检查清单

- [ ] 百度站长平台：站点添加 + 验证通过
- [ ] 百度站长平台：sitemap 提交成功
- [ ] Google Search Console：资源添加 + 验证通过
- [ ] Google Search Console：sitemap 提交成功
- [ ] DNS 记录全部生效（可用 `nslookup -type=ANY tangnotes.site` 验证）
