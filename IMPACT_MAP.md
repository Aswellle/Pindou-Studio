# IMPACT_MAP.md — Pindou Studio 改造影响范围

> Phase 0 审计产物。基线 commit: `850a4bf`。生成时间: 2026-09-23。

---

## 1. 改造目标总览

```
                    Pindou Studio 2.0
                         │
         ┌───────────────┼───────────────┐
         ↓               ↓               ↓
      Discover         Create         Manage
         │               │               │
         ↓               ↓               ↓
      Gallery          Editor         Profile
         │               │               │
     ┌───┼───┐           ↓               ↓
     ↓   ↓   ↓      Image → Pattern   Admin V2
   Theme Collection Pattern              │
                         │               ↓
                         ↓            User Mgmt
                 Quantization Engine      │
                         │               ↓
                         ↓            Settings
                  PatternDocument         │
                         │               ↓
            ┌────────────┼────────────┐  │
            ↓            ↓            ↓  │
           PNG          SVG          PDF │
         Raster        Vector       Vector│
                                          │
                              Unified Responsive Shell
```

## 2. Phase 路线与影响范围

### PHASE 0 — 安全基线与回归基线

| 产物 | 路径 | 影响 |
|---|---|---|
| CURRENT_ARCHITECTURE.md | 项目根目录 | 无代码影响 |
| IMPACT_MAP.md | 项目根目录 | 无代码影响 |
| BASELINE_REPORT.md | 项目根目录 | 无代码影响 |

**风险: 无** — 仅文档产物。

---

### PHASE A — 图片量化算法升级

**目标:** 将 CIELAB+CIEDE2000 升级为 OKLab 感知匹配 + 空间优化

| 子阶段 | 影响文件 | 影响范围 | 风险 | 回归区域 | 回滚策略 |
|---|---|---|---|---|---|
| A1: OKLab 颜色空间 | `src/workers/imageQuantizer.worker.js` | Worker 内部函数 | P1 | 所有图片转换结果 | 保留 srgbToLab/rgbToLab，新增 oklab 函数，通过参数切换 |
| A2: 感知下采样 | `src/workers/imageQuantizer.worker.js` | computeEdgeAwareAreaColors | P1 | 大图片采样质量 | 保留原逻辑为 fallback |
| A3: 拼豆色板预计算 | `src/workers/imageQuantizer.worker.js` | getPaletteLabs | P2 | 色板匹配速度 | 无破坏，仅缓存优化 |
| A4: Weighted K-Means | `src/workers/imageQuantizer.worker.js` | kmeansSelectPalette | P1 | 调色板选择质量 | 保留原 K-means 路径 |
| A5: 边缘/显著性权重 | `src/workers/imageQuantizer.worker.js` | spatialRefinement | P1 | 空间优化效果 | 新增权重参数，默认 0 = 原行为 |
| A6: 孤立豆清理 | `src/workers/imageQuantizer.worker.js` | 新增 cleanupIsolatedBeads | P2 | 量化后处理 | 新增后处理步骤，可开关 |
| A7: 棋盘抑制 | `src/workers/imageQuantizer.worker.js` | 新增 suppressCheckerboard | P2 | 高频纹理区域 | 新增后处理步骤，可开关 |
| A8: 质量评价 | `scripts/verify-export.mjs` | 新增质量指标输出 | P2 | 无 | 仅新增脚本 |

**关键约束:**
- Worker 通过 `useImageQuantizer.js` 桥接，接口不变
- `handleQuantizerApply` 在 App.jsx 中消费结果，数据格式不变（Uint16Array → hex）
- 所有新增算法步骤必须可通过参数关闭，默认行为与现有一致
- 必须保留 CIEDE2000 路径作为 fallback

---

### PHASE 1 — PatternDocument / Export Engine V2

**目标:** 建立统一内部模型，PNG/SVG 共享同一数据源

| 子阶段 | 影响文件 | 影响范围 | 风险 | 回归区域 | 回滚策略 |
|---|---|---|---|---|---|
| 1.1: PatternDocument | `src/services/export/PatternDocument.js` | 新增 | P2 | 无 | 新增文件 |
| 1.2: PatternLayout | `src/services/export/PatternLayout.js` | 新增 | P2 | 无 | 新增文件 |
| 1.3: RasterRenderer | `src/services/export/RasterRenderer.js` | 新增 | P1 | PNG 导出 | 保留 BeadPatternExporter 原路径 |
| 1.4: VectorRenderer | `src/services/export/VectorRenderer.js` | 新增 | P1 | SVG 导出 | 保留原 exportAsSVG |
| 1.5: ExportPanel 适配 | `src/components/ExportPanel.jsx` | 新增渲染路径选择 | P1 | 导出 UI | Feature Flag 控制 |
| 1.6: Golden Test | `scripts/golden-test.mjs` | 新增 | P2 | 无 | 新增脚本 |

**关键约束:**
- `BeadPatternExporter.js` 必须保持可用（不删除、不破坏接口）
- 新渲染路径通过 Feature Flag 切换
- PNG/SVG 必须共享 PatternDocument → 结构一致性

---

### PHASE 2 — Print-grade PNG

**目标:** DPI 策略替代固定 3x，Tile Rendering 支持大图

| 子阶段 | 影响文件 | 影响范围 | 风险 | 回归区域 | 回滚策略 |
|---|---|---|---|---|---|
| 2.1: DPI 策略 | `src/services/export/RasterRenderer.js` | 分辨率计算 | P1 | 所有 PNG 导出 | 保留 createScaledCanvas fallback |
| 2.2: Tile Rendering | `src/services/export/RasterRenderer.js` | 分块渲染 | P0 | 大图导出 | 小图(<200)走原路径 |
| 2.3: 物理尺寸 | `src/services/export/PatternLayout.js` | mm/inch 计算 | P2 | 无 | 新增 |

---

### PHASE 3 — Professional SVG

**目标:** SVG 由 PatternDocument → VectorRenderer 生成

| 子阶段 | 影响文件 | 影响范围 | 风险 | 回归区域 | 回滚策略 |
|---|---|---|---|---|---|
| 3.1: VectorRenderer | `src/services/export/VectorRenderer.js` | 矢量渲染 | P1 | SVG 导出 | 保留原 exportAsSVG |
| 3.2: 语义验证 | `scripts/golden-test.mjs` | 结构一致性 | P2 | 无 | 新增 |

---

### PHASE 4 — Gallery V2

**目标:** 从「分类器」升级为「内容发现中心」

| 子阶段 | 影响文件 | 影响范围 | 风险 | 回归区域 | 回滚策略 |
|---|---|---|---|---|---|
| 4.1: GalleryPage | `src/features/gallery/GalleryPage.jsx` | 新增 | P1 | Gallery 路由 | 保留 V1 Gallery.jsx |
| 4.2: 路由化 | `src/App.jsx` | 新增子路由 | P1 | Gallery 页面 | Feature Flag `/gallery-v2` |
| 4.3: URL 状态 | `src/features/gallery/hooks/useGalleryQuery.js` | 新增 | P2 | 筛选/搜索 | 新增 |
| 4.4: 数据层 | `src/features/gallery/services/galleryService.js` | 新增 | P2 | 数据获取 | 新增 |

**关键约束:**
- Gallery V1 必须保持可用
- 新路由 `/gallery-v2` 通过 Feature Flag 控制
- 切换 `/gallery` → V2 前必须完整验证

---

### PHASE 5 — 核心页面路由化

**目标:** Profile / Converter / Admin 成为独立路由

| 子阶段 | 影响文件 | 影响范围 | 风险 | 回归区域 | 回滚策略 |
|---|---|---|---|---|---|
| 5.1: /profile | `src/App.jsx` | 新增路由 | P1 | Profile 菜单 | 保留 Modal 路径 |
| 5.2: /create/image | `src/App.jsx` | 新增路由 | P1 | ImageQuantizer | 保留 Modal 路径 |
| 5.3: Admin 子路由 | `src/components/AdminPanel.jsx` | 拆分 | P1 | 管理后台 | 保留 Tab 切换 |

---

### PHASE 6 — Modal Reduction

**目标:** 减少不必要 Modal，保留必要确认

| 子阶段 | 影响文件 | 影响范围 | 风险 | 回归区域 | 回滚策略 |
|---|---|---|---|---|---|
| 6.1: Bottom Sheet | `src/components/` | 移动端设置面板 | P2 | 移动端交互 | CSS 改造 |
| 6.2: 确认 Modal | `src/components/` | 保留删除/导出确认 | P2 | 无 | 保留 |

---

### PHASE 7 — Responsive / iOS / VisualViewport

**目标:** 统一 Responsive Shell + VisualViewport Manager

| 子阶段 | 影响文件 | 影响范围 | 风险 | 回归区域 | 回滚策略 |
|---|---|---|---|---|---|
| 7.1: VisualViewport Manager | `src/hooks/useVisualViewport.js` | 新增 | P1 | iOS 键盘 | 保留 useKeyboardSafe |
| 7.2: Keyboard-aware Focus | `src/hooks/useKeyboardAwareFocus.js` | 新增 | P2 | 输入框 | 新增 |
| 7.3: Scroll Policy | `src/index.css` + 组件 | 统一滚动层级 | P1 | 全站滚动 | CSS 改造 |
| 7.4: Safe Area | `src/index.css` | env(safe-area-inset-*) | P2 | 移动端固定 UI | CSS 改造 |
| 7.5: Responsive Shell | `src/hooks/useResponsiveShell.js` | 新增 | P1 | 全站布局 | 保留 useResponsive |

---

### PHASE 8 — 全链路回归 + 生产部署验证

**目标:** 端到端验证所有改造，确认可部署

| 子阶段 | 影响文件 | 影响范围 | 风险 | 回归区域 | 回滚策略 |
|---|---|---|---|---|---|
| 8.1: 回归测试 | `src/` 各测试文件 | 新增测试 | P2 | 无 | 新增 |
| 8.2: 性能 Benchmark | `scripts/benchmark.mjs` | 新增 | P2 | 无 | 新增 |
| 8.3: 生产验证 | — | Smoke test | P0 | 全部 | 回滚 commit |

---

## 3. 风险等级汇总

| 等级 | 定义 | 涉及 Phase |
|---|---|---|
| **P0** | 白屏 / 数据丢失 / 核心功能失效 | Phase 2 (Tile Rendering) |
| **P1** | 核心功能异常 / 重要流程失败 / 移动端主要功能失败 / 导出错误 / 性能严重下降 | Phase A, 1, 2, 3, 4, 5, 7 |
| **P2** | 视觉问题 / 体验问题 / 局部重构 / 非核心优化 | Phase A6/A7, 1.6, 4.3, 6, 7.2/7.4 |

## 4. 兼容性策略

| 维度 | 策略 |
|---|---|
| 旧数据 | canvasData 格式不变（hex/null），所有 localStorage key 不变 |
| 旧路由 | 保留所有现有路由，新增路由并行 |
| 旧 API | useAuth / useHistory / useImageQuantizer 接口不变 |
| 旧测试 | 不删除任何测试，新增测试覆盖新行为 |
| 旧导出 | BeadPatternExporter.js 保持可用，不删除 |
| 旧 Gallery | Gallery.jsx 保持可用，V2 通过 Feature Flag 切换 |

## 5. Feature Flag 策略

```js
// 建议的 Feature Flag 命名
const FEATURE_FLAGS = {
  QUANTIZER_V2: false,    // Phase A — 新量化算法
  EXPORT_V2: false,       // Phase 1 — PatternDocument 渲染
  PRINT_PNG_V2: false,    // Phase 2 — DPI + Tile
  SVG_V2: false,          // Phase 3 — VectorRenderer
  GALLERY_V2: false,      // Phase 4 — Gallery V2
  ROUTES_V2: false,       // Phase 5 — 页面路由化
  RESPONSIVE_SHELL_V2: false, // Phase 7 — 响应式
}
```

每个 Flag 默认 `false`，通过验证后逐步开启。

---

*本文档为 Phase 0 影响范围分析，每个 Phase 实施前必须更新对应行的状态。*
