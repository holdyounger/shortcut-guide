# KeySense - 快捷键感知器

> 鼠标滑到屏幕边缘 → 自动弹出当前应用快捷键指南

**目录名**: `shortcut-guide` | **项目名**: `KeySense` | v1.1.0

---

## ✨ 功能特点

- 🖱️ **边缘触发**：鼠标靠近屏幕右边缘，窗口自动弹出
- 🎯 **活动应用检测**：自动识别当前前台窗口，显示对应快捷键
- 🔍 **快捷键搜索**：实时搜索，快速定位
- 📌 **固定模式**：点击固定按钮，防止窗口自动消失
- ⏱️ **自动隐藏倒计时**：鼠标离开后倒计时消失，可配置时长（3s / 5s / 10s / 15s / 30s）
- 🌈 **透明度可调**：30% / 50% / 70% / 90% / 100%，通过托盘菜单调整
- 🎨 **首次启动欢迎页**：新用户友好引导
- 🪟 **系统托盘**：最小化运行，托盘菜单控制
- 🌍 **跨平台**：Windows / macOS / Linux
- 🧩 **可扩展快捷键库**：通过 JSON 配置添加新应用

---

## 🎬 运行效果

<details>
  <summary>📸 运行截图（点击展开）</summary>
  <blockquote>✨ 系统三大核心界面一览</blockquote>
  <p><strong>1️⃣ 首次启动 · 欢迎页</strong></p>
  <img src="README/image-20260429091437506.png" alt="首次启动欢迎页" />
  <p><strong>2️⃣ Visual Studio Code</strong></p>
  <img src="README/image-20260429091029515.png" alt="VS Code" />
  <p><strong>3️⃣ Windows 资源管理器</strong></p>
  <img src="README/image-20260429091106001.png" alt="资源管理器" />
</details>


---

## 🚀 快速开始

### 环境要求

- Node.js ≥ 18（含 node-abi 兼容）
- npm ≥ 9

推荐使用 [Volta](https://volta.sh/) 自动管理 Node 版本（项目已内置 `volta.node = 18.20.8`）

### 安装依赖

```bash
cd shortcut-guide
npm install
```

### 启动开发版本

```bash
npm start
```

### 构建生产版本

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

构建产物输出到 `build/` 目录。

---

## 📖 使用说明

### 基础操作

| 操作 | 方式 |
|------|------|
| **唤出指南** | 鼠标靠近屏幕**右边缘** |
| **隐藏指南** | 鼠标移出窗口，计时结束自动消失 |
| **切换显示/隐藏** | `Ctrl+Shift+K`（全局快捷键） |
| **固定窗口** | 点击窗口标题栏右侧 📌 图标 |
| **退出应用** | 右键托盘图标 → **退出** |

### 托盘菜单

右键点击托盘图标可访问：

- **显示/隐藏** — 切换窗口
- **透明度** — 30% / 50% / 70% / 90% / 100%
- **自动隐藏倒计时** — 3s / 5s / 10s / 15s / 30s
- **退出** — 关闭应用

---

## 📂 项目结构

```
shortcut-guide/
├── data/
│   └── apps/                    # 快捷键数据库（JSON）
│       ├── development.json     # 开发工具：VS Code、Chrome、WinDbg 等
│       ├── office.json          # 办公软件
│       ├── communication.json   # 通讯工具
│       ├── media.json           # 媒体工具
│       └── system.json          # 系统工具：Explorer、Notepad++
├── src/
│   ├── main/
│   │   ├── index.js             # Electron 主进程入口
│   │   ├── data-manager.js      # 快捷键数据加载与匹配
│   │   ├── window-detector.js   # 活动窗口检测（active-win）
│   │   ├── edge-detector.js     # 屏幕边缘触发逻辑
│   │   └── config-store.js      # 用户配置持久化（electron-store）
│   └── renderer/
│       ├── index.html           # 渲染进程 UI
│       ├── main.css             # 样式
│       ├── main.js              # 前端逻辑
│       ├── preload.js           # 安全桥接（contextBridge）
│       └── icon.png             # 托盘图标
├── build/
│   └── icon.png                 # 构建图标（Windows / Linux）
├── scripts/
│   ├── start.bat                # Windows 一键启动
│   └── start.sh                 # Linux/macOS 一键启动
├── test/
│   ├── unit/                    # 单元测试（Mocha + Chai）
│   ├── e2e/                     # 端到端测试（Spectron）
│   ├── manual/                  # 手动测试检查清单
│   ├── fault-scenarios.md       # 故障场景测试文档
│   └── performance-metrics.md   # 性能指标文档
├── docs/
│   └── test-reports/            # 测试报告
├── README.md
├── README_EN.md                 # English version
└── package.json
```

---

## 🛠️ 技术栈

| 组件 | 用途 |
|------|------|
| **Electron 28** | 跨平台桌面应用框架 |
| **active-win** | 检测当前活动窗口进程名 |
| **electron-store** | 用户配置持久化存储 |
| **robotjs** | 系统级输入模拟（可选） |
| **electron-builder** | 打包为可执行文件 |

### IPC 通信架构

```
渲染进程（renderer）  ←→  contextBridge (preload.js)  ←→  主进程（main）
     │                                                            │
     ├── get-current-app        ←  活动应用检测 + 数据匹配          │
     ├── get-shortcuts          ←  按分类获取快捷键列表              │
     ├── get-all-apps           ←  获取所有应用列表                  │
     ├── set-pinned             →  设置固定模式                      │
     ├── mouse-enter            →  鼠标进入窗口                      │
     ├── mouse-leave            →  鼠标离开窗口 → 开始倒计时          │
     └── get-countdown          ←  获取倒计时剩余时间                 │
```

---

## 🔧 自定义配置

### 添加新应用的快捷键

在 `data/apps/` 下新建或编辑 JSON 文件，例如在 `development.json` 中添加：

```json
"myapp": {
  "name": "My App",
  "processNames": ["myapp.exe"],
  "platforms": ["windows"],
  "shortcuts": [
    { "key": "Ctrl+S", "action": "保存", "category": "文件" },
    { "key": "Ctrl+N", "action": "新建", "category": "文件" }
  ],
  "type": "development"
}
```

字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 应用显示名称 |
| `processNames` | ✅ | 进程名（用于匹配活动窗口） |
| `platforms` | ✅ | 支持平台：`windows` / `macos` / `linux` |
| `shortcuts` | ✅ | 快捷键列表 |
| `type` | ✅ | 分类：`development` / `office` / `communication` / `media` / `system` |

### 修改全局快捷键

编辑 `src/main/index.js` 中的快捷键注册：

```javascript
// 将 CommandOrControl+Shift+K 改为你想要的快捷键
const ret = globalShortcut.register('CommandOrControl+Shift+K', () => {
  this.edgeDetector.toggle();
});
```

> **跨平台注意**：使用 `CommandOrControl` 可同时覆盖 macOS（Command）和 Windows/Linux（Control）。

### 修改默认透明度 / 倒计时

编辑 `src/main/config-store.js`，或通过托盘菜单实时调整（自动持久化）。

---

## 🧪 测试

```bash
# 单元测试
npm test

# 端到端测试
npm run test:e2e

# 手动测试（参考清单）
npm run test:manual
```

---

## ⚙️ 已知问题与注意事项

| 问题 | 说明 | 解决方案 |
|------|------|----------|
| **Linux 托盘图标** | 部分发行版需要 `libappindicator` | 安装对应系统包 |
| **macOS 辅助功能权限** | 全局快捷键需要辅助功能权限 | 系统设置 → 隐私与安全 → 辅助功能 |
| **Windows 高 DPI** | 托盘图标在某些缩放比例下模糊 | 推荐使用 16×16 PNG |
| **robotjs 编译** | native 模块需重新编译 | `npm rebuild` 或重新 `npm install` |

---

## 📝 开发计划

- [ ] 支持当前应用自动检测，动态显示对应快捷键（✅ 已在 v1.1 实现）
- [ ] 支持用户自定义快捷键配置文件
- [ ] 支持多语言（中文 / 英文）
- [x] 快捷键搜索功能（✅ 已在 v1.1 实现）
- [x] 固定窗口模式（✅ 已在 v1.1 实现）
- [ ] 支持导入 / 导出配置
- [ ] 支持快捷键分类折叠 / 展开

---

## 📜 许可证

MIT License

## 👥 作者

小M & 爪爪 🐾