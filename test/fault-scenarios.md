# KeySense 常见故障场景与应对方案

## 🚨 故障响应矩阵

| 故障现象 | 影响范围 | 严重程度 | 用户感知 | 恢复时间目标 |
|----------|----------|----------|----------|--------------|
| 快捷键无响应 | 核心功能 | P0 | 完全无法唤出 | < 5 分钟 |
| 窗口不更新内容 | 核心功能 | P0 | 快捷键不匹配当前应用 | < 10 分钟 |
| 自动隐藏失效 | 主要功能 | P1 | 窗口常驻遮挡视线 | < 30 分钟 |
| 多显示器错位 | 扩展功能 | P2 | 位置偏移 | < 1 小时 |
| 性能问题 | 体验 | P1/P2 | 卡顿、发热 | < 2 小时 |
| 托盘图标丢失 | 功能受限 | P2 | 无法通过托盘控制 | < 2 小时 |

---

## 🔧 常见场景 1：快捷键无响应

### 现象
- 按 `Ctrl+Shift+G` 无任何反应
- 无错误提示（在后台静默失败）
- 其他应用正常响应快捷键

### 可能原因

| 序号 | 原因 | 排查步骤 | 修复方案 |
|------|------|----------|----------|
| 1 | **快捷键已被占用** | `globalShortcut.isRegistered('Control+Shift+G')` → false | 修改为其他组合键 |
| 2 | **权限不足（macOS）** | 检查"辅助功能"权限是否授予 | 前往系统设置 → 隐私与安全性 → 辅助功能 → 添加应用 |
| 3 | **主进程未运行** | 检查进程是否存在 `node .` | 重启应用 |
| 4 | **Electron 版本 Bug** | Electron 28+ 在某些系统上全局快捷键问题 | 升级到 Electron 29+ 或降级到 27 |
| 5 | **Windows 权限冲突** | 以管理员身份运行 Test | 普通用户权限运行（避免 UAC 阻断） |

### 诊断命令

```javascript
// 调试模式下运行
const { app, globalShortcut } = require('electron');

app.whenReady().then(() => {
  console.log('尝试注册快捷键...');
  const success = globalShortcut.register('Control+Shift+G', () => {
    console.log('快捷键触发!');
  });
  console.log('注册结果:', success); // true/false

  if (!success) {
    console.error('注册失败，可能被占用');
  }
});
```

### 临时解决方案
1. 修改 `src/main/index.js` 中的快捷键组合
2. 重启应用
3. 用户备用方案：使用托盘图标控制

---

## 🔧 常见场景 2：应用切换时快捷键不更新

### 现象
- 切换应用（如 Chrome → Word）后，提示窗内容未变
- 仍显示上一个应用的快捷键

### 可能原因

| 序号 | 原因 | 排查步骤 | 修复方案 |
|------|------|----------|----------|
| 1 | **应用检测逻辑缺失** | 检查代码中是否有 `app.getFocusedWindow()` 或 `active-window` 监听 | 添加 `win.on('focus')` 事件监听 |
| 2 | **进程名映射表不完整** | 查看是否有 Word/WPS 映射 | 扩展 `processMap` 配置 |
| 3 | **检测频率过高导致延迟** | 检查 `setInterval` 间隔 | 调整为 500ms 或 1000ms |
| 4 | **Electron active-window 包兼容性** | `active-window` 在 Linux 上可能返回 null | 使用 `robotjs` 或原生模块替代 |

### 实现建议

```javascript
// src/main/app-detection.js
const activeWindow = require('active-window');

function getActiveAppName() {
  const appName = activeWindow.getAppName(); // 返回 "chrome", "winword", "WPS"
  return appName.toLowerCase();
}

// 主循环检测
setInterval(() => {
  const currentApp = getActiveAppName();
  if (currentApp !== lastApp) {
    lastApp = currentApp;
    updateShortcutsForApp(currentApp); // 通知渲染进程更新
  }
}, 1000); // 1秒检测一次
```

---

## 🔧 常见场景 3：鼠标悬停不弹出窗口

### 现象
- 窗口隐藏时，鼠标移至边框无反应
- 仅在特定边框（如右侧）有效，其他方向无效

### 可能原因

| 序号 | 原因 | 排查步骤 | 修复方案 |
|------|------|----------|----------|
| 1 | **边框区域计算错误** | 打印当前鼠标坐标和屏幕边界 | 重新计算 borderWidth 和 display.bounds |
| 2 | **多显示器下主屏识别错误** | 打印 `screen.getAllDisplays()` | 使用 `screen.getDisplayNearestPoint({x, y})` |
| 3 | **事件监听器丢失** | 检查 `mainWindow.webContents.on('mouse-enter')` 是否绑定 | 确保 HTML 中的 JS 绑定正确 |
| 4 | **透明度设置问题** | 检查窗口是否 absolutely 且 pointer-events: auto | 检查 CSS 透明度与点击事件正确性 |

### 调试代码

```javascript
// 在渲染进程中添加调试
document.addEventListener('mousemove', (e) => {
  console.log(`鼠标坐标: (${e.clientX}, ${e.clientY})`);
});

const borders = { top: 50, right: 50, bottom: 50, left: 50 };
function checkIfInBorder(x, y, display) {
  console.log(`屏幕边界: ${JSON.stringify(display.bounds)}`);
  console.log(`检测结果: ${x} < ${borders.left} || ${x} > ${display.bounds.width - borders.right}`);
}
```

---

## 🔧 常见场景 4：自动隐藏延迟不准确

### 现象
- 鼠标离开后立即隐藏，或超过 5 秒才隐藏
- 计时器重复触发导致频繁显示/隐藏

### 可能原因

| 序号 | 原因 | 排查步骤 | 修复方案 |
|------|------|----------|----------|
| 1 | **计时器未清除** | 检查 `clearTimeout` 是否在鼠标重新进入时调用 | 在 `mouseenter` 时 `clearTimeout(hideTimer)` |
| 2 | **多个计时器并存** | 检查是否每次 `mouseleave` 都创建新计时器 | 确保 singleTimer 模式，覆盖旧 ID |
| 3 | **配置延迟值读取错误** | 打印 `store.get('hideDelay')` | 确认配置读取正确，默认 5000ms |
| 4 | **窗口显示状态检查缺失** | 隐藏时可能为 false，但仍触发逻辑 | 增加 `if (mainWindow.isVisible())` 判断 |

### 推荐实现

```javascript
let hideTimer = null;

window.addEventListener('mouseleave', () => {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    mainWindow.hide();
    mainWindow.setOpacity(0.1);
  }, store.get('hideDelay', 5000));
});

window.addEventListener('mouseenter', () => {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
});
```

---

## 🔧 常见场景 5：多显示器布局错误

### 现象
- 窗口显示在错误的显示器上
- 分辨率变化时窗口位置丢失
- 边框检测仅响应主屏，副屏不触发

### 可能原因

| 序号 | 原因 | 排查步骤 | 修复方案 |
|------|------|----------|----------|
| 1 | **固定使用 `getPrimaryDisplay()`** | 检查是否硬编码主屏 | 改用 `screen.getDisplayNearestPoint(mouse)` |
| 2 | **未处理显示器热插拔** | 插拔副屏后窗口位置错误 | 监听 `display-added` 和 `display-removed` |
| 3 | **窗口位置保存为绝对坐标** | 重启后窗口不在屏幕内 | 保存相对位置或重新计算边界 |
| 4 | **边框检测逻辑未考虑多屏** | 仅检查主屏边界 | 遍历所有 display，检测每个 border 区域 |

### 正确实现

```javascript
function getBorderDisplay(mousePoint) {
  // 获取鼠标所在的显示器
  return screen.getDisplayNearestPoint(mousePoint);
}

function checkBorderOnAllDisplays(x, y) {
  const displays = screen.getAllDisplays();
  for (const display of displays) {
    const { x: dx, y: dy, width, height } = display.bounds;
    const borderWidth = 50;

    const inBorder =
      (y >= dy && y <= dy + borderWidth) || // 上
      (y >= dy + height - borderWidth) || // 下
      (x >= dx + width - borderWidth) || // 右
      (x >= dx && x <= dx + borderWidth); // 左

    if (inBorder) {
      return display;
    }
  }
  return null;
}
```

---

## 🔧 常见场景 6：性能问题

### 现象
- CPU 占用持续 10% 以上
- 内存持续增长（每小时 > 10MB）
- 切换应用时卡顿

### 可能原因与修复

#### A. CPU 占用高

| 原因 | 症状 | 修复 |
|------|------|-----|
| 边框检测频率过高 | `setInterval` < 10ms | 调至 50-100ms |
| 渲染进程频繁重绘 | CSS 动画或 JS 密集计算 | 优化渲染逻辑，减少重绘 |
| 配置热加载 | 每次隐藏/显示都读 store | 缓存配置，只在变更时读取 |

**诊断**:
```bash
# Linux
top -p $(pgrep -f "shortcut-guide")

# Windows
perfmon /sys /compname:"快捷键提示器"
```

#### B. 内存泄漏

| 原因 | 排查 | 修复 |
|------|------|-----|
| 未清理的定时器 | Heap snapshot 显示大量 `Timeout` | `clearInterval` 在窗口销毁时 |
| 事件监听器未移除 | `EventEmitter` 监听器持续增长 | 使用 `once` 或在退出时 `removeAllListeners` |
| 渲染进程 DOM 累积 | 每个显示都创建新元素 | 复用 DOM，避免重复 append |

**诊断流程**:
1. 启动 Chrome DevTools → Memory
2. 模拟 1 小时运行
3. 对比 Heap snapshot
4. 查找 detached DOM tree 或 growing objects

#### C. 启动慢

| 原因 | 修复 |
|------|------|
| electron-store 同步初始化 | 改用异步 `store.get` |
| 大文件加载 | 懒加载快捷键 JSON |
| 图标资源过大 | 压缩 icon.png (target < 100KB) |

---

## 🔧 常见场景 7：边界场景

### 场景 1：任务栏遮挡
**问题**: 任务栏在顶部/右侧，窗口显示时被遮挡。

**修复**:
```javascript
const { screen, Tray } = require('electron');

function getSafePosition(display, windowSize, preferredPosition) {
  const workArea = screen.getDisplayNearestPoint({ x: 0, y: 0 }).workArea;
  // 使用 workArea 避开任务栏/Dock
  if (preferredPosition === 'top') {
    return { x: display.bounds.width - windowSize.width, y: workArea.y };
  }
}
```

### 场景 2：全屏应用下边框检测失效
**问题**: 在全屏浏览器/游戏中，鼠标无法触发悬停。

**原因**: Electron 应用在全屏时，全局快捷键正常，但鼠标事件可能被捕获。

**修复**: 降低期望，或提供专门的全局快捷键作为回退方案。

### 场景 3：系统睡眠后唤醒
**问题**: 唤醒后快捷键失灵或窗口位置错乱。

**修复**:
```javascript
app.on('resume', () => {
  // 重新注册快捷键
  globalShortcut.unregisterAll();
  registerGlobalHotkey();
  // 重新计算窗口位置
  repositionWindow();
});
```

---

## 📊 故障排查流程图

```
启动应用失败
    ↓
检查进程是否存在 (ps / 任务管理器)
    ↓ 否
重启应用 npm start
    ↓ 是
查看控制台日志
    ↓ ERROR: "Failed to register shortcut"
可能被占用 → 更换快捷键
    ↓
功能异常
    ↓
打开 DevTools 控制台
    ↓
查看 console.error
    ↓
对应模块添加 console.log 调试
    ↓
定位到具体函数
    ↓
修复代码 → test → 提交
```

---

## 🛠️ 调试工具集

### 1. 启用调试模式

```javascript
// 在 index.js 开头添加
process.env.DEBUG = 'shortcut-guide:*';
const debug = require('debug')('shortcut-guide');

debug('注册快捷键: %s', accelerator);
debug('当前窗口状态: %s', mainWindow.isVisible() ? 'visible' : 'hidden');
```

### 2. 性能分析

```bash
# 生成 CPU profile
node --prof src/main/index.js
node --prof-process isolate-0x*.log > processed.txt

# 生成内存快照
# 在 DevTools → Memory → Take snapshot
```

### 3. 日志收集 (生产环境)

```javascript
const log = require('electron-log');
log.transports.file.level = 'debug';
log.info('应用启动');
log.error('快捷键注册失败:', err);
```

---

## ✅ 故障自检清单

**用户遇到问题时，按顺序排查**:

1. [ ] 重启应用（最简单）
2. [ ] 检查快捷键是否冲突（关闭其他占用 Ctrl+Shift+G 的应用）
3. [ ] 检查是否在系统托盘中（右下角/右上角）
4. [ ] 尝试点击托盘图标
5. [ ] 检查应用是否在后台运行（任务管理器）
6. [ ] 查看 `%APPDATA%/shortcut-guide/logs/` 是否有错误日志
7. [ ] 更新到最新版本
8. [ ] 在 GitHub Issues 搜索类似问题
9. [ ] 提交 Issue，附上：操作系统版本、Electron 版本、错误日志、复现步骤

---

## 🧪 回归测试

每个 Bug 修复后，需执行：

1. 新增对应的单元测试到 `test/unit/`
2. 更新 E2E 用例 `test/e2e/test-runner.js`
3. 补充到 `manual-test-checklist.md` 的边界场景
4. 验证性能指标未下降

---

## 📞 支持渠道

- **GitHub Issues**: https://github.com/openclaw/shortcut-guide/issues
- **文档**: `/docs/` 目录
- **日志路径**: 
  - Windows: `%APPDATA%/shortcut-guide/logs/`
  - macOS: `~/Library/Logs/shortcut-guide/`
  - Linux: `~/.config/shortcut-guide/logs/`

---

> **维护原则**: 每个故障必须记录到故障数据库（或 Issues），并给出根本原因（Root Cause）和预防措施。