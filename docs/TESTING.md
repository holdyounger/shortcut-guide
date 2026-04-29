# 📚 KeySense 测试文档

> 本文件是项目测试体系的权威文档，所有测试用例、脚本和流程均在此集中管理。

---

## 🧪 测试体系概览

| 类型 | 目录 | 说明 |
|------|------|------|
| **单元测试** | `test/unit/` | 测试核心逻辑函数（边框检测、应用识别、计时器等） |
| **E2E 测试** | `test/e2e/` | 使用 Spectron 模拟用户操作，验证完整流程 |
| **手动测试** | `test/manual/` | QA 和用户验证流程，含检查清单 |
| **性能监控** | `test/performance/` | 性能指标定义与测试脚本 |
| **故障场景** | `test/fault-scenarios.md` | 常见问题、根本原因与修复方案 |

---

## 🚀 如何运行测试

### 1. 单元测试

```bash
# 运行所有单元测试
npm test

# 或
mocha test/unit/unit-tests.js
```

### 2. E2E 测试

```bash
# 运行端到端测试（需 Electron 启动）
npm run test:e2e

# 查看 Spectron 配置
# test/e2e/spectron.config.js
```

### 3. 性能测试

```bash
# 启动启动时间测试
node test/performance/benchmark-startup.js

# 启动内存泄漏测试
node test/performance/memory-leak-check.js

# 启动 CPU 延迟测试
node test/performance/cpu-delay.js
```

### 4. 手动测试

> 建议在真实设备上执行：

1. 启动应用：`npm start`
2. 打开 `test/manual/manual-test-checklist.md`
3. 按照清单逐一验证
4. 填写 `测试报告模板` 并提交

---

## 📊 测试覆盖率目标

| 类别 | 目标覆盖率 | 说明 |
|------|------------|------|
| 单元测试 | ≥ 90% | 所有核心函数必须被覆盖 |
| E2E 测试 | 100% P0 | 所有 P0 功能必须通过 |
| 手动测试 | 100% | 每次发布前必须执行 |

> 使用 `nyc` 工具监控单元测试覆盖率（可选）：
> ```bash
> npm install nyc --save-dev
> nyc mocha test/unit/unit-tests.js
> ```

---

## 🛠️ 测试环境配置

### 必需依赖

```bash
npm install --save-dev spectron mocha chai jest
```

### 环境变量（可选）

```bash
export ELECTRON_DISABLE_SECURITY_WARNINGS=1
export DEBUG=KeySense:*  # 启用调试日志
```

---

## 📝 交付物要求

每次提交或发布前，必须满足：

- [ ] 单元测试通过（`npm test`）
- [ ] E2E 测试通过（`npm run test:e2e`）
- [ ] 手动测试清单完成并签字
- [ ] 性能指标达标（见 `performance-metrics.md`）
- [ ] 故障场景文档已更新

---

## 🔁 持续集成（CI）建议

在 `.github/workflows/test.yml` 中添加：

```yaml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      - run: npm run test:e2e
      - run: node test/performance/benchmark-startup.js
```

---

## 💡 附加建议

- **版本控制**：所有测试文件都应纳入 Git，与代码同版本
- **更新通知**：任何功能变更必须同步更新测试文档
- **归档历史**：每次发布时，将测试报告存档至 `docs/test-reports/YYYY-MM-DD.md`
- **用户反馈**：将用户报告的故障添加至 `fault-scenarios.md`

---

> 🐾 **爪爪提醒**：测试不是负担，是信任的基石。写得好，用户才敢用。