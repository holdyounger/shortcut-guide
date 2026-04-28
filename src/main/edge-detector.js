/**
 * edge-detector.js - 边缘悬停检测模块
 * 
 * 功能：
 * - 检测鼠标是否靠近屏幕右边缘（5px 区域）
 * - 鼠标靠近时显示窗口（opacity 0.9）
 * - 鼠标离开窗口 5 秒后自动隐藏（opacity 0.1）
 */

const { screen } = require('electron');

class EdgeDetector {
  constructor(mainWindow) {
    /** @type {BrowserWindow} 主窗口引用 */
    this.mainWindow = mainWindow;
    /** @type {number|null} 检测定时器 ID */
    this.intervalId = null;
    /** @type {number|null} 自动隐藏定时器 ID */
    this.hideTimerId = null;
    /** @type {boolean} 是否正在检测 */
    this.isActive = false;
    /** @type {boolean} 窗口是否可见 */
    this.isWindowVisible = false;
    /** @type {number} 边缘触发区域宽度 (px) */
    this.edgeWidth = 5;
    /** @type {number} 自动隐藏延迟 (ms) */
    this.hideDelay = 5000;
    /** @type {number} 检测间隔 (ms) */
    this.checkInterval = 100;
    /** @type {boolean} 固定状态（固定时不自动隐藏） */
    this.isPinned = false;
    /** @type {boolean} 上次检测时鼠标是否在面板上 */
    this._lastIsOverPanel = false;
  }

  /**
   * 启动边缘检测
   */
  start() {
    if (this.isActive) return;

    this.isActive = true;
    this.intervalId = setInterval(() => {
      this._checkMousePosition();
    }, this.checkInterval);

    console.log('[EdgeDetector] 启动边缘检测');
  }

  /**
   * 停止边缘检测
   */
  stop() {
    if (!this.isActive) return;

    clearInterval(this.intervalId);
    this.isActive = false;
    this._cancelHideTimer();
    console.log('[EdgeDetector] 停止边缘检测');
  }

  /**
   * 检查鼠标位置，判断是否触发显示
   * @private
   */
  _checkMousePosition() {
    try {
      const point = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(point);
      const { width, height } = display.workAreaSize;
      const { x: displayX, y: displayY } = display.workArea;

      // 计算鼠标相对于屏幕右边缘的距离
      const rightEdge = displayX + width;
      const distanceFromRight = rightEdge - point.x;

      // 检查鼠标是否在窗口内部
      const windowBounds = this.mainWindow.getBounds();
      const isOverPanel = (
        point.x >= windowBounds.x &&
        point.x <= windowBounds.x + windowBounds.width &&
        point.y >= windowBounds.y &&
        point.y <= windowBounds.y + windowBounds.height
      );

      // 鼠标在右边缘区域（5px 内）
      if (distanceFromRight <= this.edgeWidth && distanceFromRight >= 0) {
        // 取消隐藏计时器
        this._cancelHideTimer();

        // 显示窗口
        if (!this.isWindowVisible) {
          this._showWindow(display);
        }
      }
      // 鼠标不在边缘区域
      else if (this.isWindowVisible) {
        // 记录鼠标位置状态，用于取消固定后判断是否需要重启计时器
        this._lastIsOverPanel = isOverPanel;
        // 只有当鼠标不在面板上时，才启动隐藏计时器
        if (!isOverPanel) {
          this._startHideTimer();
        } else {
          // 鼠标在面板上：确保没有残留的计时器
          this._cancelHideTimer();
        }
      }
    } catch (err) {
      console.error(`[EdgeDetector] 检测错误: ${err.message}`);
    }
  }

  /**
   * 显示窗口
   * @private
   * @param {Display} display - 目标显示器
   */
  _showWindow(display) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const { width, height } = display.workAreaSize;
    const { x: displayX, y: displayY } = display.workArea;
    const windowWidth = 300;

    // 定位到屏幕右边缘
    this.mainWindow.setPosition(
      displayX + width - windowWidth,
      displayY
    );

    // 设置高度自适应（初始高度）
    this.mainWindow.setSize(windowWidth, Math.min(600, height));

    // 显示并设置透明度
    this.mainWindow.setOpacity(0.9);
    this.mainWindow.show();

    this.isWindowVisible = true;
    console.log('[EdgeDetector] 显示窗口');
  }

  /**
   * 隐藏窗口（降低透明度）
   * @private
   */
  _hideWindow() {
    // 第四重保险：隐藏前最后检查固定状态
    if (this.isPinned) {
      console.log('[EdgeDetector] _hideWindow: 已固定，拒绝隐藏');
      return;
    }
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    this.mainWindow.setOpacity(0.1);
    this.isWindowVisible = false;
    console.log('[EdgeDetector] 隐藏窗口');
  }

  /**
   * 启动自动隐藏计时器
   * @private
   */
  _startHideTimer() {
    // 第一重保险：固定状态直接跳过
    if (this.isPinned) {
      console.log('[EdgeDetector] _startHideTimer: 已固定，跳过');
      return;
    }
    // 第二重保险：已有计时器不重复创建
    if (this.hideTimerId) {
      return;
    }
    // 第三重保险：鼠标在面板上时不启动
    if (this._lastIsOverPanel) {
      return;
    }

    this.hideTimerId = setTimeout(() => {
      // 计时器触发时再次检查（三重保险）
      if (this.isPinned) {
        console.log('[EdgeDetector] 计时器触发时已固定，取消隐藏');
        this.hideTimerId = null;
        return;
      }
      this._hideWindow();
      this.hideTimerId = null;
    }, this.hideDelay);
    console.log(`[EdgeDetector] 启动隐藏计时器 (${this.hideDelay}ms)`);
  }

  /**
   * 设置固定状态
   * @param {boolean} pinned - 是否固定
   */
  setPinned(pinned) {
    this.isPinned = pinned;
    if (pinned) {
      // 固定模式：取消待执行的隐藏计时器
      this._cancelHideTimer();
      console.log('[EdgeDetector] 已固定，取消隐藏计时器');
    } else {
      // 取消固定：根据鼠标位置决定是否重启计时器
      if (!this._lastIsOverPanel) {
        this._startHideTimer();
      }
      console.log('[EdgeDetector] 已取消固定');
    }
  }

  /**
   * 取消自动隐藏计时器
   * @private
   */
  _cancelHideTimer() {
    if (this.hideTimerId) {
      clearTimeout(this.hideTimerId);
      this.hideTimerId = null;
    }
  }

  /**
   * 强制显示窗口（用于全局快捷键切换）
   */
  forceShow(display = null) {
    if (!display) {
      const point = screen.getCursorScreenPoint();
      display = screen.getDisplayNearestPoint(point);
    }
    this._cancelHideTimer();
    this._showWindow(display);
  }

  /**
   * 强制隐藏窗口
   */
  forceHide() {
    this._cancelHideTimer();
    this._hideWindow();
  }

  /**
   * 切换显示/隐藏
   */
  toggle() {
    if (this.isWindowVisible) {
      this.forceHide();
    } else {
      this.forceShow();
    }
  }

  /**
   * 更新主窗口引用
   * @param {BrowserWindow} mainWindow
   */
  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }
}

module.exports = EdgeDetector;
