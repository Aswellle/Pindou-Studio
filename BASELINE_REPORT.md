# BASELINE_REPORT.md — Pindou Studio 基线报告

> Phase 0 审计产物。基线 commit: `850a4bf`。生成时间: 2026-09-23。

---

## 1. 环境基线

| 项 | 值 |
|---|---|
| Node | v24.19.0 |
| npm | 11.17.0 |
| OS | Windows 11 (x64) |
| Git Branch | main |
| Git Commit | 850a4bf |
| Git Status | clean (仅有 untracked 临时文件) |

## 2. 构建基线

| 检查项 | 结果 | 耗时 |
|---|---|---|
| `npm run test:run` | ✅ 7 files / 75 tests passed | 65s |
| `npm run build` | ✅ built + 5 prerendered pages | 50s |
| `node scripts/check-i18n.js` | ✅ 所有 i18n 键同步一致 | 0.4s |

## 3. 代码规模基线

| 文件 | 行数 | 角色 |
|---|---|---|
| `src/App.jsx` | 881 | 核心状态中心 |
| `src/workers/imageQuantizer.worker.js` | 951 | 量化算法 |
| `src/services/BeadPatternExporter.js` | 753 | 导出引擎 |
| `src/components/Gallery.jsx` | 1518 | 图库 |
| `src/components/AdminPanel.jsx` | 1402 | 后台管理 |
| `src/components/ExportPanel.jsx` | 727 | 导出面板 |
| `src/components/AuthPage.jsx` | ~800 | 登录/注册 |
| `src/components/Tutorials.jsx` | ~750 | 教程 |
| `src/index.css` | ~500 | 全局样式 |
| `src/styles/fonts-all.css` | 616KB | 字体 CSS (generated) |

**总源码:** ~50 个文件，~10,000+ 行（含测试）

## 4. 路由基线

| 路由 | 组件 | 加载方式 |
|---|---|---|
| `/` | Canvas + Tools + ColorPalette | 同步 |
| `/login` | AuthPage | 同步 |
| `/gallery` | Gallery | lazy |
| `/tutorials` | Tutorials | lazy |
| `/admin/login` | AdminLoginPage | 同步 |
| `/admin` | AdminPanel | 同步 |
| `/privacy` | PrivacyPolicy | 同步 |
| `/terms` | TermsOfService | 同步 |

## 5. 核心流程基线

### 5.1 画布绘制

```
用户操作 → Canvas.jsx → useCanvasPainter → base layer (committed) + overlay layer (stroke)
                                                    ↓
                                              onCanvasChange → setCanvas → PUSH dispatch
```

### 5.2 图片转拼豆

```
上传图片 → ImageQuantizer.jsx → useImageQuantizer → Worker (K-means++ + CIEDE2000 + ICM)
                                                        ↓
                                              handleQuantizerApply → resolveToHex → canvasData
```

### 5.3 导出

```
ExportPanel → BeadPatternExporter.generateBeadPatternSheet()
  → createScaledCanvas (3x supersampling)
  → drawBead (realistic/professional)
  → color legend (4-tier grouping)
  → canvas.toBlob → download
```

### 5.4 Gallery

```
Gallery.jsx → useCloudTemplates / useCustomTemplates → allTemplates
  → search + category + difficulty filter → template cards
  → favorite (localStorage) → download count (Supabase)
```

## 6. 量化算法基线

| 能力 | 现状 | 备注 |
|---|---|---|
| 颜色空间 | CIELAB | 非 OKLab |
| 色差公式 | CIEDE2000 | 10 reference pairs 测试通过 |
| 调色板选择 | K-means++ | Lab 空间，8-16 迭代 |
| 区域采样 | Linear RGB 平均 | 边缘感知双聚类 |
| 抖动 | FS / Ordered / None | 默认 None |
| 空间优化 | ICM | 短边 ≤120 触发 |
| 后处理 | 无 | 无孤立豆清理 |
| 显著性 | 无 | — |
| 性能 | Transferable ArrayBuffer | 零拷贝传输 |

## 7. 导出质量基线

| 指标 | 现状 |
|---|---|
| PNG 超采样 | 固定 3x (桌面) / 移动端降级 |
| 最大 PNG 尺寸 | 200×200 grid → 11760×11760 px (3x) |
| 移动端面积预算 | 80M px (~320MB) |
| SVG | 独立 rect/circle/text 渲染 |
| 颜色分层 | 4 层 (major/minor/accent/trace) |
| 珠子风格 | realistic / professional |

## 8. 测试基线

| 测试文件 | 测试数 | 覆盖 |
|---|---|---|
| `src/utils/colorDiff.test.js` | ~15 | CIEDE2000, rgbToLab, findClosestColorCIEDE2000 |
| `src/services/colorUtils.test.js` | ~12 | resolveToHex, hexToRgb, rgbToHex, getTextColor |
| `src/utils/historyUtils.test.js` | ~8 | pushHistory, undoHistory, redoHistory |
| `src/hooks/useCanvasPainter.test.js` | ~10 | Base/overlay painting, grid lines |
| `src/data/templates.test.js` | ~15 | normalizeCustomTemplate, rectangular patterns |
| `src/components/Canvas.test.jsx` | ~10 | Grid rendering, click-to-fill, pinch regression |
| `src/App.test.jsx` | ~5 | App smoke test (full tree render) |

**总计: 7 files, 75 tests, all passing**

## 9. 已知限制

1. **无 OKLab** — 使用 CIEDE2000，感知均匀性不如 OKLab
2. **无孤立豆清理** — 量化结果可能有噪点
3. **无 Tile Rendering** — 大图导出可能 OOM
4. **无 DPI 策略** — 导出分辨率不基于物理尺寸
5. **Gallery/Admin 巨型组件** — 1500+ 行单文件
6. **无 Feature Flag** — 新旧路径无法并存
7. **无统一 VisualViewport** — iOS 键盘处理分散

## 10. 回滚点

| 场景 | 回滚方式 |
|---|---|
| Phase A 失败 | Worker 参数切回原算法 |
| Phase 1 失败 | Feature Flag 关闭，用原 BeadPatternExporter |
| Phase 2 失败 | 保留 createScaledCanvas 原路径 |
| Phase 4 失败 | Gallery V1 保持可用 |
| Phase 5 失败 | 保留 Modal 路径 |
| Phase 7 失败 | 保留 useKeyboardSafe 原逻辑 |
| 全部失败 | Git rollback 至 commit `850a4bf` |

---

*本文档为 Phase 0 基线报告。每个 Phase 结束后需更新本文件对应章节。*
