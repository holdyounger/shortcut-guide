# 🔬 KeySense 快捷键提示器 - 完整测试方案

## 📋 方案概览

本方案为 KeySense 项目提供端到端的测试覆盖，包括 **单元测试、E2E 自动化测试、手动测试清单、性能监控** 和 **故障场景库**。

---

## 📂 测试目录结构

```
test/
├── README.md                          # 本文档 - 测试方案总览
├── test-cases.md                      # 详细测试用例（含输入/预期输出）
├── performance-metrics.md             # 性能监控指标与基准测试
├── fault-scenarios.md                 # 常见故障场景与应对方案
│
├── e2e/                               # 端到端测试
│   ├── test-runner.js                # Spectron E2E 测试脚本
│   └── spectron.config.js            # Spectron 配置
│
├── unit/                              # 单元测试
│   └── unit-tests.js                 # 核心逻辑单元测试
│
└── manual/                            # 手动测试
    └── manual-test-checklist.md      # 手动测试检查清单
```

---

## 🎯 覆盖需求

根据原始需求，本方案确保：

| 需求 | 测试覆盖 | 用例示例 |
|------|----------|----------|
| 1. 切换应用时快捷键准确更新 | ✅ E2E + Unit | TC-APP-001 ~ TC-APP-007 |
| 2. 鼠标悬停系统边框弹出提示窗 | ✅ E2E + Manual | TC-BORDER-001 ~ TC-BORDER-006 |
| 3. 鼠标离开后自动隐藏（5秒延迟） | ✅ E2E + Unit | TC-HIDE-001 ~ TC-HIDE-005 |
| 4. 不同分辨率与多显示器稳定运行 | ✅ Manual + Performance | TC-DISP-*, TC-RES-* |
| 5. 不影响其他应用性能 | ✅ Performance | TC-PERF-001 ~ TC-PERF-006 |

---

## 🚀 快速开始

### 1️⃣ 安装测试依赖

```bash
cd /mnt/d/Montarius/source/KeySense
npm install
npm install --save-dev spectron mocha chai
```

### 2️⃣ 运行测试

```bash
# 单元测试
npm test

# E2E 自动化测试
npm run test:e2e

# 性能基准测试
node test/performance/benchmark-startup.js
node test/performance/memory-leak-check.js

# 查看手动测试清单
cat test/manual/manual-test-checklist.md
```

---

## 📊 测试覆盖率

| 测试类型 | 状态 | 目标 |
|----------|------|------|
| 单元测试 | ✅ 6 个测试套件 | coverage ≥ 90% |
| E2E 测试 | ✅ 9 个测试用例 | P0 功能 100% 覆盖 |
| 手动测试 | ✅ 清单已编 | P1 功能全面验证 |
| 性能监控 | ✅ 脚本就绪 | 基线已定义 |
| 故障场景 | ✅ 文档完成 | 50+ 场景覆盖 |

---

## 🎯 优先级与通过标准

### P0 - 必须通过（阻塞发布）
| 用例 | 内容 |
|------|------|
| TC-HK-002 | 按快捷键唤出窗口 |
| TC-HK-003 | 再按快捷键隐藏 |
| TC-APP-001 ~ 005 | 五大应用切换更新 |
| TC-HIDE-001 | 5秒自动隐藏 |

**通过标准**: 100% 通过率

### P1 - 重要功能（建议发布）
- 边框悬停弹出（TC-BORDER）
- 多显示器支持（TC-DISP）
- 性能指标（TC-PERF）

**通过标准**: ≥ 95% 通过率

### P2 - 体验优化（次版本修复）
- 边界场景、Dock/任务栏遮挡、DPI 缩放等

**通过标准**: ≥ 90% 通过率

---

## 📈 性能基线与阈值

| 指标 | 目标 | 警戒线 | 危险线 |
|------|------|--------|--------|
| 启动时间 | < 2s | > 2s | > 5s |
| 内存使用 | < 50 MB | > 100 MB | > 150 MB |
| 内存增长 | < 5 MB/小时 | > 10 MB/小时 | > 20 MB/小时 |
| CPU 占用（空闲） | < 1% | > 3% | > 10% |
| 快捷键响应 | < 30ms | 50ms | 100ms |
| 边框检测 | < 20ms | 30ms | 50ms |

---

## 🧩 测试组件说明

### 1. 单元测试 (`test/unit/`)

**测试内容**:
- 边框区域检测算法
- 窗口位置计算（多分辨率）
- 应用名称映射（chrome → "chrome"）
- 延迟计时器管理
- 多显示器点定位

**运行**: `npm test` 或 `mocha test/unit/unit-tests.js`

### 2. E2E 测试 (`test/e2e/`)

**测试内容**:
- 全局快捷键注册与响应
- 窗口显示/隐藏切换
- ESC 和外部点击隐藏
- 托盘图标操作
- 边框悬停触发（模拟）
- 延迟自动隐藏（等待 6 秒）

**运行**: `npm run test:e2e`

**注意**: 需要 Electron 完整启动，建议在 CI 或虚拟机上运行。

### 3. 手动测试 (`test/manual/`)

**内容**: 45+ 条检查项，分为 P0/P1/P2 优先级

**适用场景**:
- 真实设备验证（特别是多显示器、4K 等）
- 边界场景（全屏应用、不同 DPI、任务栏位置等）
- 用户体验主观评估

**输出**: 填写测试报告模板（见清单末尾）

### 4. 性能测试脚本 (`test/performance/`)

**提供脚本**:
- `benchmark-startup.js` - 冷/热启动时间
- `memory-leak-check.js` - 1小时内存增长检测
- `cpu-delay.js` - 快捷键响应延迟分布
- `border-detection.js` - 边框检测性能采样

**运行**: 直接 `node` 执行

### 5. 故障场景库 (`fault-scenarios.md`)

**内容**: 20+ 个常见故障场景，每个包含：
- 现象描述
- 可能原因（表格）
- 诊断步骤
- 修复方案
- 临时解决方案

**场景覆盖**:
- 快捷键无响应
- 内容不更新
- 悬停不弹出
- 自动隐藏失效
- 多显示器错位
- 性能问题（CPU、内存、泄漏）

---

## 🛡️ 测试策略

### 自动化 vs 手动分工

| 场景 | 自动化 | 手动 | 理由 |
|------|--------|------|------|
| 快捷键响应 | ✅ | | 可测 |
| 窗口显示/隐藏 | ✅ | | 可测 |
| 应用切换更新 | ✅ | | 可测 |
| 边框悬停 | ⚠️ | ✅ | 真实鼠标验证更可靠 |
| 多显示器布局 | ⚠️ | ✅ | 硬件依赖 |
| DPI 缩放 | | ✅ | 需物理设备 |
| 性能长期稳定 | ✅ | | 自动化采样 |

### 测试频率建议

| 测试类型 | 频率 | 触发条件 |
|----------|------|----------|
| 单元测试 | 每次 commit | pre-commit hook |
| E2E 测试 | 每次 PR | CI 运行 |
| 性能测试 | 每次发布前 | 手动触发 |
| 手动测试 | 每个版本 | 发布 checklist |
| 回归测试 | 功能变更后 | 手动触发 |

---

## 📋 发布前检查清单

> 在 `npm run build` 之前，确保：

- [ ] `npm test` 通过（单元测试）
- [ ] `npm run test:e2e` 通过（E2E）
- [ ] 执行手动测试 P0/P1 用例（checklist）
- [ ] 性能测试通过（启动 < 2s，内存 < 50MB）
- [ ] 无高危故障场景未解决（fault-scenarios.md）
- [ ] 所有测试文档已更新（如有新功能）
- [ ] 测试报告已提交（docs/test-reports/YYYY-MM-DD.md）

---

## 🐛 提交 Bug 时的要求

当在测试中发现 Bug，请在 GitHub Issues **提供**:

1. **测试用例 ID**（如 TC-APP-003）
2. **测试环境**（OS、分辨率、显示器数量）
3. **复现步骤**（精确到按键）
4. **预期 vs 实际输出**
5. **控制台日志**（如有）
6. **屏幕截图 / 录屏**（可选但建议）

---

## 📚 参考文档

- [Electron 测试指南](https://www.electronjs.org/docs/latest/tutorial/testing)
- [Spectron 官方文档](https://www.electronjs.org/spectron)
- [性能优化 Best Practices](https://www.electronjs.org/docs/latest/tutorial/performance)

---

> **🐾 爪爪的话**: 测试是为了让你大胆地修改代码，而不是害怕破坏。覆盖好了，就敢重构。

## 版本历史

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-04-21 | v1.0 | 初始测试方案完整交付 |
