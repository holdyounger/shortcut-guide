# KeySense 性能监控指标

## 📈 关键性能指标 (KPI)

| 类别 | 指标 | 目标阈值 | 测量方法 | 监控频率 |
|------|------|----------|----------|----------|
| 启动性能 | 冷启动时间 | < 2s | Electron `app.whenReady()` 计时 | 每次启动 |
| 启动性能 | 首屏渲染时间 | < 1.5s | `loadFile()` 到 DOM ready | 每次启动 |
| 内存 | 常驻内存 (RSS) | < 50 MB | `process.memoryUsage().rss` | 持续 |
| 内存 | 堆内存 (Heap) | < 30 MB | `process.memoryUsage().heapUsed` | 持续 |
| 内存 | 内存泄漏 | < 5 MB/小时 | 对比 1h/24h 内存增长 | 稳定性测试 |
| CPU | 空闲 CPU 占用 | < 1% (单核) | `process.cpuUsage()` 平均值 | 持续 |
| CPU | 快捷键响应 | < 30ms | 按键到 `show/hide` 执行时间 | 每次按键 |
| CPU | 边框检测轮询 | < 0.5% | `setInterval` 执行时间 | 持续 |
| 延迟 | 窗口显示延迟 | < 300ms | 触发到 `show()` 执行 | 悬停/快捷键 |
| I/O | 配置读写时间 | < 50ms | `electron-store` 操作 | 每次配置变更 |
| 网络 | 无网络依赖 | N/A | 确认不访问外部 API | 持续 |

---

## 🔬 性能测试脚本

### 启动时间测试

```javascript
// test/performance/benchmark-startup.js
const { app, BrowserWindow } = require('electron');
const { performance } = require('perf_hooks');

const startTime = performance.now();

app.whenReady().then(() => {
  const readyTime = performance.now();
  const win = new BrowserWindow({ show: false });
  win.loadFile('src/renderer/index.html');

  win.once('ready-to-show', () => {
    const renderTime = performance.now();
    console.log('总启动时间:', renderTime - startTime, 'ms');
    console.log('Electron 就绪时间:', readyTime - startTime, 'ms');
    console.log('页面渲染时间:', renderTime - readyTime, 'ms');

    // 判定
    if (renderTime - startTime > 2000) {
      console.error('❌ 启动时间超过 2 秒');
      process.exit(1);
    } else {
      console.log('✅ 启动性能达标');
      process.exit(0);
    }
  });
});
```

运行:
```bash
node test/performance/benchmark-startup.js
```

---

### 内存泄漏测试

```javascript
// test/performance/memory-leak-check.js
const { app, BrowserWindow } = require('electron');
const { performance } = require('perf_hooks');

let memorySamples = [];
const SAMPLE_INTERVAL = 5000; // 5秒采样一次
const TEST_DURATION = 3600000; // 1小时测试

function takeMemorySample() {
  const mem = process.memoryUsage();
  memorySamples.push({
    rss: mem.rss / 1024 / 1024, // MB
    heapUsed: mem.heapUsed / 1024 / 1024,
    heapTotal: mem.heapTotal / 1024 / 1024,
    timestamp: performance.now()
  });
}

function analyzeMemory() {
  if (memorySamples.length < 2) return;

  const first = memorySamples[0];
  const last = memorySamples[memorySamples.length - 1];
  const durationMs = last.timestamp - first.timestamp;
  const rssGrowth = last.rss - first.rss;
  const heapGrowth = last.heapUsed - first.heapUsed;

  console.log(`内存追踪时长: ${(durationMs / 1000 / 60).toFixed(1)} 分钟`);
  console.log(`RSS 增长: ${rssGrowth.toFixed(2)} MB`);
  console.log(`Heap 增长: ${heapGrowth.toFixed(2)} MB`);

  const growthPerHour = (rssGrowth / durationMs) * 3600000;

  if (growthPerHour > 5) {
    console.error(`⚠️ 内存泄漏警告: ${growthPerHour.toFixed(2)} MB/小时`);
  } else {
    console.log('✅ 内存使用正常');
  }
}

app.whenReady().then(() => {
  const win = new BrowserWindow({ show: false });
  win.loadFile('src/renderer/index.html');

  // 启动定时采样
  const sampler = setInterval(takeMemorySample, SAMPLE_INTERVAL);

  // 定时结束分析
  setTimeout(() => {
    clearInterval(sampler);
    analyzeMemory();
    app.quit();
  }, TEST_DURATION);
});
```

---

### CPU 延迟测试

```javascript
// test/performance/cpu-delay.js
const { app, globalShortcut, BrowserWindow } = require('electron');
const { performance } = require('perf_hooks');

let mainWindow;
let delays = [];

function registerHotkey() {
  globalShortcut.register('CommandOrControl+Shift+G', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
}

function measureDelay() {
  return new Promise(resolve => {
    const before = performance.now();

    globalShortcut.emit('accelerator', { accelerator: 'CommandOrControl+Shift+G' });

    // 简单测量：检查窗口可见状态变化
    const check = setInterval(() => {
      after PerformCheck();
    }, 10);

    function afterPerformCheck() {
      const after = performance.now();
      clearInterval(check);
      resolve(after - before);
    }
  });
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({ show: false });
  mainWindow.loadFile('src/renderer/index.html');

  registerHotkey();

  // 测量 100 次
  (async () => {
    for (let i = 0; i < 100; i++) {
      // 先隐藏
      mainWindow.hide();
      await new Promise(r => setTimeout(r, 100));

      const delay = await measureDelay();
      delays.push(delay);

      await new Promise(r => setTimeout(r, 100));
    }

    const max = Math.max(...delays);
    const avg = delays.reduce((a, b) => a + b) / delays.length;
    const p95 = delays.sort((a, b) => a - b)[Math.floor(delays.length * 0.95)];

    console.log(`平均延迟: ${avg.toFixed(2)} ms`);
    console.log(`95% 延迟: ${p95.toFixed(2)} ms`);
    console.log(`最大延迟: ${max.toFixed(2)} ms`);

    if (p95 > 30) {
      console.error('❌ 快捷键响应超过 30ms 阈值');
    } else {
      console.log('✅ 快捷键响应性能达标');
    }

    app.quit();
  })();
});
```

---

### 边框检测性能测试

```javascript
// test/performance/border-detection.js
// 模拟边框检测循环
const { app, screen, BrowserWindow } = require('electron');
const { performance } = require('perf_hooks');

let mainWindow;
let cpuSamples = [];

function startDebugLoop() {
  const displays = screen.getAllDisplays();
  const primaryDisplay = displays[0];
  const borderWidth = 50;

  function detectBorder() {
    const mousePos = require('electron').screen.getCursorScreenPoint();
    const { x, y, width, height } = primaryDisplay.bounds;

    let inBorder = false;

    // 检测四个边
    if (mousePos.y <= borderWidth) inBorder = true; // 顶
    if (mousePos.x >= width - borderWidth) inBorder = true; // 右
    if (mousePos.y >= height - borderWidth) inBorder = true; // 底
    if (mousePos.x <= borderWidth) inBorder = true; // 左

    return inBorder;
  }

  let lastTime = performance.now();

  setInterval(() => {
    const now = performance.now();
    const loopTime = now - lastTime;

    if (loopTime > 16) {
      cpuSamples.push(loopTime);
    }

    detectBorder();
    lastTime = now;
  }, 10); // 100Hz 检测
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({ show: false });

  startDebugLoop();

  // 采样 30 秒
  setTimeout(() => {
    const avg = cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length;
    const max = Math.max(...cpuSamples);

    console.log(`边框检测平均间隔: ${avg.toFixed(2)} ms`);
    console.log(`最大间隔: ${max.toFixed(2)} ms`);

    // 假设 100Hz 目标为 10ms/次
    if (max > 20) {
      console.warn('⚠️ 部分检测间隔超过 20ms，可能导致闪烁');
    } else {
      console.log('✅ 边框检测性能正常');
    }

    app.quit();
  }, 30000);
});
```

---

## 🛠️ 性能监控工具集成

### 建议的运行时监控方案

#### 1. 内置性能数据收集（收集到本地 JSON）

```javascript
// src/main/performance-monitor.js
const fs = require('fs');
const path = require('path');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      startup: null,
      memory: [],
      shortcuts: [],
      borders: []
    };
    this.startTime = null;
  }

  markStartupStart() {
    this.startTime = Date.now();
  }

  markStartupEnd(endEvent) {
    this.metrics.startup = {
      total: Date.now() - this.startTime,
      endEvent
    };
    this.saveMetrics();
  }

  recordMemorySnapshot() {
    const mem = process.memoryUsage();
    this.metrics.memory.push({
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      timestamp: Date.now()
    });
    this.saveMetrics();
  }

  recordShortcutResponse(delay) {
    this.metrics.shortcuts.push({
      delay,
      timestamp: Date.now()
    });
    this.saveMetrics();
  }

  recordBorderDetection(duration) {
    this.metrics.borders.push({
      duration,
      timestamp: Date.now()
    });
    this.saveMetrics();
  }

  saveMetrics() {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
    fs.writeFileSync(
      path.join(logsDir, 'performance.json'),
      JSON.stringify(this.metrics, null, 2)
    );
  }

  getReport() {
    // 生成报告
    if (this.metrics.startup) {
      console.log(`🚀 启动时间: ${this.metrics.startup.total}ms`);
    }

    if (this.metrics.memory.length > 0) {
      const last = this.metrics.memory[this.metrics.memory.length - 1];
      console.log(`💾 当前内存: ${(last.rss / 1024 / 1024).toFixed(2)} MB`);
    }

    return this.metrics;
  }
}

module.exports = PerformanceMonitor;
```

---

### 2. 第三方工具建议

| 工具 | 用途 | 适用阶段 |
|------|------|----------|
| Chrome DevTools | CPU/内存分析 | 开发调试 |
| Spectron E2E | 自动化性能测试 | CI/CD |
| nprof | Node.js 性能剖析 | 深度调试 |
| systemd-cgtop | 系统级资源监控 | 稳定性测试 |

---

## ⚠️ 性能警戒线

| 指标 | 警戒 | 危险 | 告警频率 |
|------|------|------|----------|
| 内存增长 | > 2 MB/小时 | > 5 MB/小时 | 每小时 |
| 启动时间 | > 2s | > 5s | 每次启动 |
| CPU 占用 | > 3% | > 10% | 每分钟 |
| 快捷键延迟 | 30-50ms | > 100ms | 每次触发 |
| 边框检测延迟 | > 20ms | > 50ms | 实时 |

> 🔴 危险指标需立即修复
> 🟡 警戒指标需优化
> 🟢 健康指标可接受

---

## 📊 性能测试清单

- [ ] 冷启动时间 < 2s
- [ ] 内存占用 < 50 MB
- [ ] 内存泄漏 < 5 MB/小时
- [ ] 空闲 CPU < 1%
- [ ] 快捷键响应 < 30ms
- [ ] 窗口显示延迟 < 300ms
- [ ] 边框检测响应 < 20ms
- [ ] 多显示器切换无卡顿
- [ ] 高 DPI 缩放无性能损失
- [ ] 长时间运行（24h）无性能退化

---