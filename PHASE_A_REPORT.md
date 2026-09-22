# PHASE_A_REPORT.md — 图片量化算法升级

> Phase: A
> Status: PASS
> Goal: 将 CIELAB+CIEDE2000 升级为 OKLab 感知匹配 + 空间优化 + 后处理

## Summary

将图片转拼豆的量化算法从 CIELAB+CIEDE2000 升级为 OKLab 感知颜色空间，并添加孤立豆清理和棋盘抑制后处理。所有改动通过 `colorSpace` 参数控制，默认 `'lab'` 保持原有行为，`'oklab'` 启用新算法。

## Changed Files

| File | Changes |
|---|---|
| `src/workers/imageQuantizer.worker.js` | +278 行：OKLab 颜色空间函数、Weighted K-Means++、孤立豆清理、棋盘抑制 |
| `src/workers/imageQuantizer.quality.test.js` | 新增：12 个质量基准测试 |
| `CURRENT_ARCHITECTURE.md` | Phase 0 架构审计 |
| `IMPACT_MAP.md` | Phase 0 影响范围 |
| `BASELINE_REPORT.md` | Phase 0 基线报告 |

## Architecture Changes

### 新增 OKLab 颜色空间管线

```
sRGB → Linear RGB → LMS → OKLab → OKLCH → 加权色差
```

- `rgbToOklab(r, g, b)` — sRGB → OKLab 完整转换
- `oklabToRgb(L, a, b)` — OKLab → sRGB 反转换
- `labToOklab(lab)` — CIELAB → OKLab（用于 nearestColor 输入转换）
- `deltaEOKLab(lab1, lab2)` — OKLab 欧氏距离
- `deltaEOKLabWeighted(lab1, lab2)` — OKLCH 加权色差（wL=1.30, wC=0.85, wH=1.00）

### 算法升级

| 模块 | 原实现 | 新实现 |
|---|---|---|
| 调色板选择 | K-means++ (CIEDE76) | K-means++ (OKLab) + CIEDE2000 映射 |
| 颜色匹配 | CIEDE2000 | OKLab 加权色差 |
| ICM 空间优化 | CIEDE2000 + CIEDE76 | OKLab 加权 + OKLab 欧氏 |
| 后处理 | 无 | 孤立豆清理 + 棋盘抑制 |

### 安全策略

- 所有新算法通过 `colorSpace` 参数控制，默认 `'lab'` = 原行为
- `getPaletteLabs` 同时缓存 Lab 和 OKLab 表示
- 孤立豆清理阈值：OKLab 0.08 / CIEDE2000 8
- 棋盘抑制阈值：OKLab 0.10 / CIEDE2000 10
- 清理后重新计算颜色统计

## Behavior Changes

- 默认行为不变（`colorSpace = 'lab'`）
- 启用 OKLab 后，颜色匹配更符合人眼感知，明度结构更准确
- 孤立豆清理减少量化噪点（单像素孤岛）
- 棋盘抑制减少 ABAB/BABA 高频交替伪影

## Tests

| File | Tests | Status |
|---|---|---|
| `src/workers/imageQuantizer.quality.test.js` | 12 | PASS |
| 原有 7 个测试文件 | 75 | PASS |
| **总计** | **87** | **PASS** |

## Build

```
✓ built in 5.61s
```

## Production Preview

待 Phase 1 完成后统一验证。

## Manual Verification

- [x] OKLab 转换函数正确性（对称性、零距离、有限值）
- [x] 加权色差对明度更敏感
- [x] 孤立豆清理不破坏真实细节
- [x] 棋盘抑制仅在高频交替区域触发
- [x] 性能基准（10000 次计算 < 100ms）

## Performance

| 指标 | 值 |
|---|---|
| OKLab 色差（10000 次） | < 100ms |
| CIEDE76 色差（10000 次） | < 100ms |
| OKLab 转换（10000 次） | < 100ms |

## Known Risks

- OKLab 色距尺度与 CIEDE2000 不同，阈值需要分别调优
- 孤立豆清理可能误清理真实细节（如眼睛瞳孔），需要谨慎调整阈值
- 棋盘抑制可能影响真实的棋盘图案（如衣服格子）

## Rollback Commit

`8414bf6` (Phase 0 docs) → `eac6796` (A1 OKLab) → `49320ef` (A6 cleanup) → `33529ef` (A7 checkerboard) → `0228f32` (A8 quality)

回滚方式：将 `colorSpace` 默认值改为 `'lab'`（当前已是默认值）

## Next Phase

Phase 1 — PatternDocument / Export Engine V2：建立统一内部模型，PNG/SVG 共享同一数据源。

---

*Phase A 完成。87 测试全部通过，构建通过。*
