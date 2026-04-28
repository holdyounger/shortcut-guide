/**
 * index.js - Electron 主进程入口
 * 
 * KeySense（快捷键感知器）主进程
 * 
 * 功能：
 * - 创建无边框、透明、始终置顶的主窗口
 * - 注册全局快捷键 Ctrl+Shift+K 切换显示/隐藏
 * - 协调窗口检测、边缘检测和数据管理模块
 */

const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const DataManager = require('./data-manager');
const WindowDetector = require('./window-detector');
const EdgeDetector = require('./edge-detector');

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
      skipTaskbar: true, // 不显示在任务栏
      show: false, // 初始隐藏
      opacity: 0.1, // 初始透明度
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
      const appData = this.dataManager.matchApp(processName);
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

    // 鼠标进入/离开窗口事件（用于 Bug 4：进入窗口即触发显示）
    ipcMain.on('mouse-enter', () => {
      this.edgeDetector.onMouseEnter();
    });

    ipcMain.on('mouse-leave', () => {
      this.edgeDetector.onMouseLeave();
    });

    // 窗口检测器检测到窗口变化时，通知渲染进程
    // 使用 getLastMatchedInfo 读取 windowDetector 缓存的匹配数据，避免重复匹配
    setInterval(() => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const { processName, appData } = this.windowDetector.getLastMatchedInfo();
        if (processName) {
          this.mainWindow.webContents.send('app-changed', {
            processName,
            appData,
          });
        }
      }
    }, 1000); // 每 1000ms 同步一次

    console.log('[Main] IPC 通信设置完成');
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

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
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
