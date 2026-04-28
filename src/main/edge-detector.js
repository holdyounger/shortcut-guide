/**
 * edge-detector.js - 边缘悬停检测模块
 *
 * 功能：
 * - 检测鼠标是否靠近屏幕右边缘（5px 区域）
 * - 鼠标靠近时显示窗口
 * - 鼠标离开窗口 5 秒后自动隐藏到屏幕边缘（完全不可见，不遮挡其他窗口）
 * - 支持拖拽窗口到任意位置
 * - 隐藏时自动贴边（滑动到最近的屏幕边缘）
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
    /** @type {{x: number, y: number}|null} 用户拖拽后的窗口位置（用于恢复） */
    this._lastDraggedPos = null;
    /** @type {{x: number, y: number}|null} 隐藏前窗口的实际显示位置（用于恢复） */
    this._hiddenAtPos = null;
    /** @type {string} 隐藏时倾向的贴边方向 */
    this._preferredSnapEdge = 'right';
    /** @type {number|null} 滑动动画的 interval ID */
    this._slideTimerId = null;
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

    this.mainWindow.webContents.on('did-finish-load', () => {
      console.log('[EdgeDetector] 窗口加载完成，mouseenter/leave 监听就绪');
    });

    console.log('[EdgeDetector] 启动边缘检测');
  }

  /**
   * 鼠标进入窗口（由渲染进程通过 IPC 触发）
   */
  onMouseEnter() {
    if (this.isPinned) return;

    if (!this.isWindowVisible) {
      try {
        const point = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(point);
        this._showWindow(display);
      } catch (err) {
        this._showWindow();
      }
    }
    this._cancelHideTimer();
    console.log('[EdgeDetector] 鼠标进入窗口，显示并取消隐藏');
  }

  /**
   * 鼠标离开窗口（由渲染进程通过 IPC 触发）
   */
  onMouseLeave() {
    if (this.isPinned) return;

    if (this.isWindowVisible) {
      this._startHideTimer();
    }
    console.log('[EdgeDetector] 鼠标离开窗口，启动隐藏计时器');
  }

  /**
   * 停止边缘检测
   */
  stop() {
    if (!this.isActive) return;

    clearInterval(this.intervalId);
    this.isActive = false;
    this._cancelHideTimer();
    this._cancelSlideTimer();
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

      const rightEdge = displayX + width;
      const distanceFromRight = rightEdge - point.x;

      const windowBounds = this.mainWindow.getBounds();
      const isOverPanel = (
        point.x >= windowBounds.x &&
        point.x <= windowBounds.x + windowBounds.width &&
        point.y >= windowBounds.y &&
        point.y <= windowBounds.y + windowBounds.height
      );

      if (distanceFromRight <= this.edgeWidth && distanceFromRight >= 0) {
        this._cancelHideTimer();
        this._cancelSlideTimer();

        if (!this.isWindowVisible) {
          this._showWindow(display);
        }
      } else if (this.isWindowVisible) {
        this._lastIsOverPanel = isOverPanel;
        if (!isOverPanel) {
          this._startHideTimer();
        } else {
          this._cancelHideTimer();
        }
      }
    } catch (err) {
      console.error(`[EdgeDetector] 检测错误: ${err.message}`);
    }
  }

  /**
   * 显示窗口（从隐藏位置恢复）
   * @param {Display} display - 目标显示器
   * @private
   */
  _showWindow(display) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const { width, height } = display.workAreaSize;
    const { x: displayX, y: displayY } = display.workArea;
    const windowWidth = 300;
    const windowHeight = Math.min(600, height);

    let targetX;
    if (this._hiddenAtPos) {
      // 从隐藏位置恢复到上次显示位置
      targetX = this._hiddenAtPos.x;
    } else if (this._lastDraggedPos) {
      targetX = this._lastDraggedPos.x;
    } else {
      targetX = displayX + width - windowWidth;
    }

    // 如果窗口之前被完全隐藏（off-screen），需要先 show()
    if (!this.mainWindow.isVisible()) {
      this.mainWindow.show();
    }
    // 确保透明度恢复正常
    if (this.mainWindow.getOpacity() < 1) {
      this.mainWindow.setOpacity(1);
    }

    this.mainWindow.setPosition(targetX, displayY);
    this.mainWindow.setSize(windowWidth, windowHeight);
    this.isWindowVisible = true;
    console.log(`[EdgeDetector] 显示窗口 (x=${targetX})`);
  }

  /**
   * 计算离窗口最近的屏幕边缘
   * @returns {'left'|'right'} 边缘方向
   * @private
   */
  _getNearestEdge() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return 'right';
    const bounds = this.mainWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
    const { x: dx, width: dw } = display.workArea;

    const centerX = bounds.x + bounds.width / 2;
    const distLeft = centerX - dx;
    const distRight = (dx + dw) - centerX;

    return distLeft <= distRight ? 'left' : 'right';
  }

  /**
   * 隐藏窗口（完全隐藏到屏幕边缘，不透明度保持 1）
   * @private
   */
  _hideWindow() {
    // 固定状态下不隐藏
    if (this.isPinned) {
      console.log('[EdgeDetector] _hideWindow: 已固定，拒绝隐藏');
      return;
    }
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    this._cancelSlideTimer();

    // 记录当前显示位置（恢复时使用）
    const currentBounds = this.mainWindow.getBounds();
    this._hiddenAtPos = { x: currentBounds.x, y: currentBounds.y };

    const targetEdge = this._getNearestEdge();
    const display = screen.getDisplayNearestPoint({ x: currentBounds.x, y: currentBounds.y });
    const targetX = targetEdge === 'right'
      ? display.workArea.x + display.workAreaSize.width - currentBounds.width
      : display.workArea.x;

    // 如果已经在目标贴边位置，直接完全隐藏
    if (Math.abs(currentBounds.x - targetX) < 5) {
      this.mainWindow.setOpacity(1);
      this.mainWindow.hide();
      this.isWindowVisible = false;
      this._preferredSnapEdge = targetEdge;
      console.log(`[EdgeDetector] 完全隐藏窗口（已贴边: ${targetEdge}）`);
      return;
    }

    // 滑动动画：200ms 内分步移动到边缘，然后完全隐藏
    const steps = 8;
    const interval = 25;
    const deltaX = (targetX - currentBounds.x) / steps;
    let step = 0;

    this._slideTimerId = setInterval(() => {
      step++;
      if (step >= steps) {
        clearInterval(this._slideTimerId);
        this._slideTimerId = null;
        this.mainWindow.setPosition(targetX, currentBounds.y);
        this.mainWindow.setOpacity(1);
        this.mainWindow.hide();
        this.isWindowVisible = false;
        this._preferredSnapEdge = targetEdge;
        console.log(`[EdgeDetector] 完全隐藏窗口（贴边动画: ${targetEdge}）`);
      } else {
        const newX = Math.round(currentBounds.x + deltaX * step);
        this.mainWindow.setPosition(newX, currentBounds.y);
      }
    }, interval);
  }

  /**
   * 启动自动隐藏计时器
   * @private
   */
  _startHideTimer() {
    if (this.isPinned) {
      console.log('[EdgeDetector] _startHideTimer: 已固定，跳过');
      return;
    }
    if (this.hideTimerId) {
      return;
    }
    if (this._lastIsOverPanel) {
      return;
    }

    this.hideTimerId = setTimeout(() => {
      if (this.isPinned) {
        console.log('[EdgeDetector] 计时器触发时已固定，取消隐藏');
        this.hideTimerId = null;
        return;
      }
      this._hideWindow();
      this.hideTimerId = null;
    }, this.hideDelay);

    // 计时器启动时将透明度降为 0.9，提示用户即将隐藏
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.getOpacity() !== 0.9) {
      this.mainWindow.setOpacity(0.9);
    }

    console.log(`[EdgeDetector] 启动隐藏计时器 (${this.hideDelay}ms)`);
  }

  /**
   * 设置固定状态
   * @param {boolean} pinned - 是否固定
   */
  setPinned(pinned) {
    this.isPinned = pinned;
    if (pinned) {
      this._cancelHideTimer();
      this._cancelSlideTimer();
      // 固定模式下确保窗口完全可见
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (!this.mainWindow.isVisible()) this.mainWindow.show();
        if (this.mainWindow.getOpacity() < 1) this.mainWindow.setOpacity(1);
      }
      console.log('[EdgeDetector] 已固定，取消隐藏计时器');
    } else {
      if (!this._lastIsOverPanel) {
        this._startHideTimer();
      }
      console.log('[EdgeDetector] 已取消固定');
    }
  }

  /**
   * 更新窗口位置（用户拖拽结束后调用）
   * @param {number} x - 窗口 x 坐标
   * @param {number} y - 窗口 y 坐标
   */
  updateDraggedPosition(x, y) {
    const currentY = this._lastDraggedPos ? this._lastDraggedPos.y : y;
    this._lastDraggedPos = { x, y: y !== undefined ? y : currentY };
    console.log(`[EdgeDetector] 记录拖拽位置: (${x}, ${y})`);
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
   * 取消滑动动画
   * @private
   */
  _cancelSlideTimer() {
    if (this._slideTimerId) {
      clearInterval(this._slideTimerId);
      this._slideTimerId = null;
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
    this._cancelSlideTimer();
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