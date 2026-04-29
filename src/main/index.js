/**
 * index.js - Electron 主进程入口
 *
 * KeySense（快捷键感知器）主进程
 *
 * 功能：
 * - 创建无边框、透明、始终置顶的主窗口
 * - 注册全局快捷键 Ctrl+Shift+K 切换显示/隐藏
 * - 系统托盘：退出、透明度调节
 * - 协调窗口检测、边缘检测和数据管理模块
 */

const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const DataManager = require('./data-manager');
const WindowDetector = require('./window-detector');
const EdgeDetector = require('./edge-detector');
const ConfigStore = require('./config-store');

class KeySenseApp {
  constructor() {
    /** @type {BrowserWindow|null} 主窗口 */
    this.mainWindow = null;
    /** @type {DataManager} 数据管理器 */
    this.dataManager = new DataManager();
    /** @type {WindowDetector|null} 窗口检测器 */
    this.windowDetector = null;
    /** @type {EdgeDetector|null} 边缘检测器 */
    this.edgeDetector = null;
    /** @type {Tray|null} 系统托盘 */
    this.tray = null;
    /** @type {ConfigStore} 用户配置存储 */
    this.configStore = new ConfigStore();
    /** @type {string} overlay 状态机: 'hidden' | 'counting_down' | 'overlay_visible' */
    this._overlayState = 'hidden';
    /** @type {number|null} 快速轮询定时器 ID（overlay 可见时，300ms） */
    this._fastIntervalId = null;
    /** @type {number|null} 慢速轮询定时器 ID（overlay 隐藏时，5000ms） */
    this._slowIntervalId = null;
    /** @type {number} 窗口透明度 (0.0 ~ 1.0) */
    this.windowOpacity = this.configStore.getOpacity();
    /** @type {number} 隐藏倒计时时间（毫秒） */
    this.hideDelay = this.configStore.getHideDelay();
  }

  /**
   * 创建主窗口
   */
  createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const windowWidth = 300;

    this.mainWindow = new BrowserWindow({
      width: windowWidth,
      height: 400, // 初始高度，后续自适应
      x: width - windowWidth, // 定位到屏幕右边缘
      y: 0,
      frame: false, // 无边框
      transparent: true, // 透明背景
      alwaysOnTop: true, // 始终置顶
      resizable: false, // 禁止调整大小
      minimizable: false, // 禁止最小化（防止右键菜单最小化后无法恢复）
      skipTaskbar: true, // 不显示在任务栏
      show: false, // 初始隐藏
      opacity: this.windowOpacity,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../renderer/preload.js'),
      },
    });

    // 加载渲染进程页面
    this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // 初始显示（立即可见，欢迎页随之弹出）
    this.mainWindow.show();

    // 开发模式下打开 DevTools
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // 窗口关闭事件
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // 安全网：防止通过系统菜单（Alt+Space等）最小化窗口
    this.mainWindow.on('minimize', (e) => {
      e.preventDefault();
      this.mainWindow.restore();
      console.log('[Main] 阻止窗口最小化，已恢复');
    });

    // 防止窗口失去焦点时隐藏（由边缘检测器控制）
    this.mainWindow.on('blur', () => {
      // 可选：失去焦点时的行为
    });

    console.log('[Main] 主窗口创建完成');
  }

  /**
   * 初始化数据管理器
   */
  initDataManager() {
    this.dataManager.init();
  }

  /**
   * 初始化窗口检测器
   */
  initWindowDetector() {
    this.windowDetector = new WindowDetector(this.dataManager);
    this.windowDetector.start();
  }

  /**
   * 初始化边缘检测器
   */
  initEdgeDetector() {
    this.edgeDetector = new EdgeDetector(this.mainWindow);
    this.edgeDetector.start();
    // 立即显示窗口，让欢迎页可见
    this.edgeDetector.showWelcome();
  }

  /**
   * 注册全局快捷键
   */
  registerGlobalShortcut() {
    const ret = globalShortcut.register('CommandOrControl+Shift+K', () => {
      console.log('[Main] 全局快捷键触发：Ctrl+Shift+K');
      this.edgeDetector.toggle();
    });

    if (!ret) {
      console.error('[Main] 全局快捷键注册失败');
    } else {
      console.log('[Main] 全局快捷键注册成功：Ctrl+Shift+K');
    }
  }

  /**
   * 设置 IPC 通信
   */
  setupIPC() {
    // 渲染进程请求当前应用数据（触发立即检测，不等待轮询）
    ipcMain.handle('get-current-app', async () => {
      // 立即触发一次检测（不等待 200ms 轮询），确保首次返回有效数据
      await this.windowDetector.detect();
      const processName = this.windowDetector.getCurrentProcess();
      if (!processName) return null;
      const appData = this.dataManager.matchAppOrSynthesize(processName);
      return appData;
    });

    // 渲染进程请求指定应用的快捷键
    ipcMain.handle('get-shortcuts', async (event, appId) => {
      return this.dataManager.getShortcutsByCategory(appId);
    });

    // 渲染进程请求所有应用列表
    ipcMain.handle('get-all-apps', async () => {
      return this.dataManager.getAllApps();
    });

    // 渲染进程设置固定状态（使用 handle 支持 Promise）
    ipcMain.handle('set-pinned', (event, pinned) => {
      console.log(`[Main] 收到 set-pinned: ${pinned}`);
      this.edgeDetector.setPinned(pinned);
      return true; // 确认成功
    });

    // 验证固定状态（调试用）
    ipcMain.handle('verify-pinned', () => {
      return this.edgeDetector.isPinned;
    });

    // 欢迎页已关闭，允许启动隐藏倒计时
    ipcMain.on('welcome-dismissed', () => {
      this.edgeDetector.setWelcomeDismissed();
    });

    // 渲染进程获取隐藏倒计时剩余时间
    ipcMain.handle('get-countdown', () => {
      return this.edgeDetector.getCountdown();
    });

    // 渲染进程获取窗口位置（用于拖拽）
    ipcMain.handle('get-window-bounds', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        return this.mainWindow.getBounds();
      }
      return null;
    });

    // 渲染进程更新拖拽后的窗口位置
    ipcMain.handle('update-dragged-position', (event, x, y) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.setPosition(Math.round(x), Math.round(y));
      }
      this.edgeDetector.updateDraggedPosition(Math.round(x), Math.round(y));
      return true;
    });

    // 鼠标进入/离开窗口事件
    ipcMain.on('mouse-enter', () => {
      this.edgeDetector.onMouseEnter();
      // 鼠标进入自身窗口 → overlay 显示 → 慢速检测（1000ms）
      this._setOverlayState('overlay_visible');
    });

    ipcMain.on('mouse-leave', () => {
      this.edgeDetector.onMouseLeave();
      // 鼠标离开自身窗口 → 开始倒计时消失 → 快速检测（200ms）
      this._setOverlayState('counting_down');
    });


    // 启动动态轮询（默认 hidden 状态，极低频率 3000ms）
    this._startHiddenInterval();

    console.log('[Main] IPC 通信设置完成');
  }

  /**
   * 初始化系统托盘
   */
  initTray() {
    // 托盘图标路径
    const iconPath = path.join(__dirname, '../renderer/icon.png');
    let trayIcon;
    try {
      trayIcon = nativeImage.createFromPath(iconPath);
      // Windows 托盘图标推荐 16x16，缩放处理
      if (process.platform === 'win32') {
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
      }
    } catch (err) {
      console.error(`[Main] 加载托盘图标失败: ${err.message}`);
      trayIcon = nativeImage.createEmpty();
    }

    this.tray = new Tray(trayIcon);
    this.tray.setToolTip('快捷键提示器 - Ctrl+Shift+K 切换显示');

    this._buildTrayMenu();

    // 点击托盘图标切换窗口显示
    this.tray.on('click', () => {
      this.edgeDetector.toggle();
    });

    console.log('[Main] 系统托盘初始化完成');
  }

  /**
   * 构建托盘右键菜单
   * @private
   */
  _buildTrayMenu() {
    // 透明度选项
    const opacityOptions = [
      { label: '30%', value: 0.3 },
      { label: '50%', value: 0.5 },
      { label: '70%', value: 0.7 },
      { label: '90%', value: 0.9 },
      { label: '100%（不透明）', value: 1.0 },
    ];

    const opacitySubmenu = opacityOptions.map(opt => ({
      label: opt.label,
      type: 'radio',
      checked: Math.abs(this.windowOpacity - opt.value) < 0.01,
      click: () => {
        this.setOpacity(opt.value);
        this._buildTrayMenu();
      },
    }));

    // 倒计时选项
    const hideDelayOptions = [
      { label: '3 秒', value: 3000 },
      { label: '5 秒', value: 5000 },
      { label: '10 秒', value: 10000 },
      { label: '15 秒', value: 15000 },
      { label: '30 秒', value: 30000 },
    ];

    const hideDelaySubmenu = hideDelayOptions.map(opt => ({
      label: opt.label,
      type: 'radio',
      checked: this.hideDelay === opt.value,
      click: () => {
        this.setHideDelay(opt.value);
        this._buildTrayMenu();
      },
    }));

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示/隐藏',
        click: () => {
          this.edgeDetector.toggle();
        },
      },
      { type: 'separator' },
      {
        label: '透明度',
        submenu: opacitySubmenu,
      },
      {
        label: '自动隐藏倒计时',
        submenu: hideDelaySubmenu,
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /**
   * 向渲染进程发送当前活动窗口数据（内部使用）
   * @private
   */
  _sendCurrentAppInfo() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    // 自身窗口有焦点：不显示覆盖层
    if (this.mainWindow.webContents.isFocused()) return;
    const { processName, appData } = this.windowDetector.getLastMatchedInfo();
    if (processName) {
      this.mainWindow.webContents.send('app-changed', { processName, appData });
    }
  }

  /**
   * 启动快速轮询（overlay 可见时，每 300ms 同步一次）
   * @private
   */
  _startFastInterval() {
    if (this._fastIntervalId !== null) return; // 已在运行
    this._fastIntervalId = setInterval(() => {
      this._sendCurrentAppInfo();
    }, 1000);
    // console.log('[Main] 启动快速轮询: 300ms');
  }

  /**
   * 停止快速轮询
   * @private
   */
  _stopFastInterval() {
    if (this._fastIntervalId !== null) {
      clearInterval(this._fastIntervalId);
      this._fastIntervalId = null;
    }
  }

  /**
   * 启动慢速轮询（overlay 隐藏时，每 5000ms 同步一次，降低 CPU 占用）
   * @private
   */
  _startSlowInterval() {
    if (this._slowIntervalId !== null) return; // 已在运行
    this._slowIntervalId = setInterval(() => {
      this._sendCurrentAppInfo();
    }, 3000);
    // console.log('[Main] 启动慢速轮询: 5000ms');
  }

  /**
   * 停止慢速轮询
   * @private
   */
  _stopSlowInterval() {
    if (this._slowIntervalId !== null) {
      clearInterval(this._slowIntervalId);
      this._slowIntervalId = null;
    }
  }

  /**
   * 切换 overlay 可见性，并相应调整轮询间隔
   * 同时通知 WindowDetector 调整检测频率（可见时 200ms，隐藏时 2000ms）
   * @param {boolean} visible
   */
  /**
   * 设置 overlay 状态机（3 个状态）
   * @param {'hidden'|'counting_down'|'overlay_visible'} state
   */
  _setOverlayState(state) {
    if (this._overlayState === state) return; // 无需切换

    const prevState = this._overlayState;
    this._overlayState = state;
    console.log(`[Main] overlay 状态: ${prevState} → ${state}`);

    // 先停止所有轮询
    this._stopFastInterval();
    this._stopSlowInterval();

    switch (state) {
      case 'counting_down':
        // mouse-leave 后，overlay 倒计时消失中 → 快速检测（200ms）尽快捕获外部窗口
        this._startFastInterval(); // 200ms
        if (this.windowDetector) this.windowDetector.setOverlayInterval(200);
        break;

      case 'overlay_visible':
        // mouse-enter（overlay 显示）→ 慢速检测（1000ms），用户与 app 交互中
        this._startOverlayVisibleInterval(); // 1000ms
        if (this.windowDetector) this.windowDetector.setOverlayInterval(1000);
        // 立即发送一次当前 app 数据
        this._sendCurrentAppInfo();
        break;

      case 'hidden':
        // overlay 已完全隐藏 → 极低频率（3000ms）
        this._startHiddenInterval(); // 3000ms
        if (this.windowDetector) this.windowDetector.setOverlayInterval(2000);
        break;
    }
  }

  /**
   * overlay 可见时专用轮询（1000ms）
   * @private
   */
  _startOverlayVisibleInterval() {
    if (this._fastIntervalId !== null) return;
    this._fastIntervalId = setInterval(() => {
      this._sendCurrentAppInfo();
    }, 1000);
  }

  /**
   * overlay 隐藏时专用轮询（3000ms）
   * @private
   */
  _startHiddenInterval() {
    if (this._slowIntervalId !== null) return;
    this._slowIntervalId = setInterval(() => {
      this._sendCurrentAppInfo();
    }, 3000);
  }

  /**
   * 设置窗口透明度（同时持久化到配置）
   * @param {number} opacity - 透明度值 (0.0 ~ 1.0)
   */
  setOpacity(opacity) {
    this.windowOpacity = Math.max(0.1, Math.min(1.0, opacity));
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setOpacity(this.windowOpacity);
    }
    this.configStore.setOpacity(this.windowOpacity);
    console.log(`[Main] 窗口透明度设置为: ${Math.round(this.windowOpacity * 100)}%`);
  }

  /**
   * 设置隐藏倒计时时间（同时持久化到配置并更新边缘检测器）
   * @param {number} delay - 倒计时时间（毫秒）
   */
  setHideDelay(delay) {
    this.hideDelay = Math.max(1000, Math.min(30000, delay));
    if (this.edgeDetector) {
      this.edgeDetector.setHideDelay(this.hideDelay);
    }
    this.configStore.setHideDelay(this.hideDelay);
    console.log(`[Main] 隐藏倒计时设置为: ${this.hideDelay / 1000}秒`);
  }

  /**
   * 应用初始化
   */
  async init() {
    // 初始化数据管理器
    this.initDataManager();

    // 创建窗口
    this.createWindow();

    // 初始化检测器
    this.initWindowDetector();
    this.initEdgeDetector();
    // overlay 隐藏时通知主进程切换到极低频率（3000ms）
    this.edgeDetector.setOnHidden(() => {
      this._setOverlayState('hidden');
    });

    // 传递配置给边缘检测器
    this.edgeDetector.setHideDelay(this.hideDelay);

    // 初始化系统托盘
    this.initTray();

    // 注册全局快捷键
    this.registerGlobalShortcut();

    // 设置 IPC 通信
    this.setupIPC();

    console.log('[Main] KeySense 初始化完成');
  }

  /**
   * 清理资源
   */
  cleanup() {
    // 注销全局快捷键
    globalShortcut.unregisterAll();

    // 停止检测器
    if (this.windowDetector) {
      this.windowDetector.stop();
    }
    if (this.edgeDetector) {
      this.edgeDetector.stop();
    }

    // 销毁托盘
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }

    // 关闭窗口
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close();
    }

    console.log('[Main] 资源清理完成');
  }
}

// 创建应用实例
const keySenseApp = new KeySenseApp();

// Electron 准备就绪
app.whenReady().then(async () => {
  await keySenseApp.init();
});

// 所有窗口关闭时不退出（保持托盘运行）
app.on('window-all-closed', () => {
  // 有托盘时不退出，用户通过托盘菜单退出
});

// macOS 激活应用时重新创建窗口
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    keySenseApp.createWindow();
  }
});

// 应用退出前清理
app.on('before-quit', () => {
  keySenseApp.cleanup();
});

// 导出供测试使用
module.exports = KeySenseApp;
