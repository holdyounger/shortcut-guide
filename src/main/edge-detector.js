/**
 * edge-detector.js - 边缘悬停检测模块
 *
 * 功能：
 * - 检测鼠标是否靠近屏幕右边缘（5px 区域）
 * - 鼠标靠近时显示窗口
 * - 鼠标离开窗口 5 秒后自动隐藏到屏幕边缘
 * - 支持拖拽窗口到任意位置
 * - 隐藏时自动贴边
 * - 窗口重新显示时恢复用户拖拽的 Y 轴位置
 * - 向渲染进程暴露隐藏倒计时剩余时间
 */

const { screen } = require('electron');

class EdgeDetector {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.intervalId = null;
    this.hideTimerId = null;
    this.isActive = false;
    this.isWindowVisible = false;
    this.edgeWidth = 5;
    this.hideDelay = 5000;
    this.checkInterval = 100;
    this.isPinned = false;
    this._lastIsOverPanel = false;
    /** 用户拖拽后的窗口位置（X会被贴边覆盖，Y始终保留用户意图）*/
    this._lastDraggedPos = null;
    /** 隐藏前窗口的实际 X 位置（仅用于贴边记忆）*/
    this._hiddenAtPos = null;
    this._preferredSnapEdge = 'right';
    /** 隐藏计时器截止时间戳（ms）*/
    this._hideDeadline = null;
    /** 是否正在倒计时中（计时器运行且未固定）*/
    this.isCountingDown = false;
    /** 欢迎页是否已关闭（关闭前不启动隐藏倒计时）*/
    this._welcomeDismissed = false;
    /** 淡出动画的 interval ID */
    this._fadeIntervalId = null;
    /** 是否正在淡出动画中（淡出期间忽略鼠标事件）*/
    this._isFadingOut = false;
  }

  /**
   * 启动边缘检测
   */
  start() {
    if (this.isActive) return;

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const bounds = this.mainWindow.getBounds();
      if (bounds) {
        this._lastDraggedPos = { x: bounds.x, y: bounds.y };
        console.log(`[EdgeDetector] 初始化拖拽位置: (${bounds.x}, ${bounds.y})`);
      }
    }

    this.isActive = true;
    this.intervalId = setInterval(() => {
      this._checkMousePosition();
    }, this.checkInterval);

    this.mainWindow.webContents.on('did-finish-load', () => {
      console.log('[EdgeDetector] 窗口加载完成');
    });

    console.log('[EdgeDetector] 启动边缘检测');
  }

  onMouseEnter() {
    if (this.isPinned) return;
    if (this._isFadingOut) return; // 淡出期间忽略鼠标事件
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
  }

  onMouseLeave() {
    if (this.isPinned) return;
    if (this._isFadingOut) return; // 淡出期间忽略鼠标事件
    if (this.isWindowVisible) {
      this._startHideTimer();
    }
  }

  stop() {
    if (!this.isActive) return;
    clearInterval(this.intervalId);
    this.isActive = false;
    this._cancelHideTimer();
    console.log('[EdgeDetector] 停止边缘检测');
  }

  _checkMousePosition() {
    if (this._isFadingOut) return; // 淡出期间跳过鼠标检测
    try {
      const point = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(point);
      const { width } = display.workAreaSize;
      const { x: displayX } = display.workArea;

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
   * 显示窗口（直接显示，不使用动画）
   * @param {Display} display
   * @private
   */
  _showWindow(display) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    // 取消正在进行的淡出动画
    this._cancelFadeAnimation();

    const { width, height } = display.workAreaSize;
    const windowWidth = 300;
    const windowHeight = Math.min(600, height);

    let targetX;
    let targetY;
    if (this._hiddenAtPos) {
      targetX = this._hiddenAtPos.x;
      targetY = this._hiddenAtPos.y;
    } else if (this._lastDraggedPos) {
      targetX = this._lastDraggedPos.x;
      targetY = this._lastDraggedPos.y;
    } else {
      targetX = display.workArea.x + width - windowWidth;
      targetY = display.workArea.y;
    }

    /*
      let targetY;
      if (this._lastDraggedPos && this._lastDraggedPos.y !== null) {
        targetY = this._lastDraggedPos.y;
      } else {
        targetY = display.workArea.y;
      }
    */

    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    if (!this.mainWindow.isVisible()) {
      this.mainWindow.show();
    }
    this.mainWindow.setOpacity(1);
    this.mainWindow.setPosition(Math.round(targetX), Math.round(targetY));
    this.mainWindow.setSize(windowWidth, windowHeight);
    this.isWindowVisible = true;
    this._notifyRendererCountdown();
    console.log(`[EdgeDetector] 显示窗口 (x=${targetX}, y=${targetY})`);
  }

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
   * 隐藏窗口（带淡出 + 滑动动画）
   * 使用 ease-out cubic 缓动，60fps 流畅动画
   * @private
   */
  _hideWindow() {
    if (this.isPinned) {
      console.log('[EdgeDetector] _hideWindow: 已固定，拒绝隐藏');
      return;
    }
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const currentBounds = this.mainWindow.getBounds();
    this._hiddenAtPos = { x: currentBounds.x, y: currentBounds.y };

    const targetEdge = this._getNearestEdge();
    const display = screen.getDisplayNearestPoint({ x: currentBounds.x, y: currentBounds.y });
    const snapX = targetEdge === 'right'
      ? display.workArea.x + display.workAreaSize.width - currentBounds.width
      : display.workArea.x;

    // 动画参数
    const duration = 300;           // 动画总时长 300ms
    const frameInterval = 16;       // ~60fps
    const startOpacity = this.mainWindow.getOpacity();
    const startX = currentBounds.x;
    const deltaX = snapX - startX;  // 滑动距离
    const startTime = Date.now();

    // 取消之前的动画
    this._cancelFadeAnimation();

    // 标记正在淡出，忽略鼠标事件
    this._isFadingOut = true;

    this._fadeIntervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // ease-out cubic: 1 - (1 - t)^3 — 先快后慢，更自然
      const eased = 1 - Math.pow(1 - progress, 3);

      // 同步更新透明度和位置
      this.mainWindow.setOpacity(startOpacity * (1 - eased));
      this.mainWindow.setPosition(Math.round(startX + deltaX * eased), currentBounds.y);

      if (progress >= 1) {
        clearInterval(this._fadeIntervalId);
        this._fadeIntervalId = null;
        this._isFadingOut = false;
        this.mainWindow.hide();
        this.isWindowVisible = false;
        this._preferredSnapEdge = targetEdge;
        this._notifyRendererCountdown();
        console.log(`[EdgeDetector] 隐藏窗口（贴边: ${targetEdge}）`);
      }
    }, frameInterval);

    console.log(`[EdgeDetector] 启动淡出动画 (时长: ${duration}ms)`);
  }

  _startHideTimer() {
    if (this.isPinned) return;
    if (this.hideTimerId) return;
    if (this._lastIsOverPanel) return;
    if (!this._welcomeDismissed) return; // 欢迎页未关闭，不启动倒计时

    const deadline = Date.now() + this.hideDelay;
    this._hideDeadline = deadline;
    this.isCountingDown = true;
    this._notifyRendererCountdown();

    this.hideTimerId = setTimeout(() => {
      if (this.isPinned) {
        this.hideTimerId = null;
        this._hideDeadline = null;
        this.isCountingDown = false;
        return;
      }
      this._hideWindow();
      this.hideTimerId = null;
      this._hideDeadline = null;
      this.isCountingDown = false;
      this._notifyRendererCountdown();
    }, this.hideDelay);

    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.getOpacity() !== 0.9) {
      this.mainWindow.setOpacity(0.9);
    }

    console.log(`[EdgeDetector] 启动隐藏计时器 (${this.hideDelay}ms)`);
  }

  /**
   * 向渲染进程通知倒计时状态变化
   * @private
   */
  _notifyRendererCountdown() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send('countdown-update', {
      isCountingDown: this.isCountingDown,
      remainingMs: this.isCountingDown && this._hideDeadline
        ? Math.max(0, this._hideDeadline - Date.now())
        : null,
    });
  }

  setPinned(pinned) {
    this.isPinned = pinned;
    if (pinned) {
      this._cancelHideTimer();
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (!this.mainWindow.isVisible()) this.mainWindow.show();
        if (this.mainWindow.getOpacity() < 1) this.mainWindow.setOpacity(1);
      }
      console.log('[EdgeDetector] 已固定');
    } else {
      if (!this._lastIsOverPanel) {
        this._startHideTimer();
      }
      console.log('[EdgeDetector] 已取消固定');
    }
  }

  /**
   * 更新窗口位置（渲染进程拖拽触发）
   * @param {number} x
   * @param {number} y
   */
  updateDraggedPosition(x, y) {
    const currentY = this._lastDraggedPos ? this._lastDraggedPos.y : y;
    this._lastDraggedPos = { x, y: y !== undefined ? y : currentY };
    console.log(`[EdgeDetector] 记录拖拽位置: (${x}, ${y})`);
  }

  _cancelHideTimer() {
    if (this.hideTimerId) {
      clearTimeout(this.hideTimerId);
      this.hideTimerId = null;
      this._hideDeadline = null;
      this.isCountingDown = false;
      this._notifyRendererCountdown();
    }
    // 同时取消淡出动画
    this._cancelFadeAnimation();
  }

  /**
   * 取消正在进行的淡出动画，恢复窗口透明度
   * @private
   */
  _cancelFadeAnimation() {
    if (this._fadeIntervalId) {
      clearInterval(this._fadeIntervalId);
      this._fadeIntervalId = null;
      this._isFadingOut = false;
      // 恢复窗口透明度
      if (this.mainWindow && !this.mainWindow.isDestroyed() && this.isWindowVisible) {
        this.mainWindow.setOpacity(1);
      }
      console.log('[EdgeDetector] 淡出动画已取消');
    }
  }

  /**
   * 获取倒计时剩余时间（毫秒），供 IPC 调用
   * @returns {{isCountingDown: boolean, remainingMs: number|null}}
   */
  getCountdown() {
    return {
      isCountingDown: this.isCountingDown,
      remainingMs: this.isCountingDown && this._hideDeadline
        ? Math.max(0, this._hideDeadline - Date.now())
        : null,
    };
  }

  forceShow(display = null) {
    if (!display) {
      const point = screen.getCursorScreenPoint();
      display = screen.getDisplayNearestPoint(point);
    }
    this._cancelHideTimer();
    this._showWindow(display);
  }

  forceHide() {
    this._cancelHideTimer();
    this._hideWindow();
  }

  toggle() {
    if (this.isWindowVisible) {
      this.forceHide();
    } else {
      this.forceShow();
    }
  }

  /**
   * 标记欢迎页已关闭（允许启动隐藏倒计时）
   */
  setWelcomeDismissed() {
    this._welcomeDismissed = true;
    console.log('[EdgeDetector] 欢迎页已关闭，启动隐藏倒计时');
  }

  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * 设置隐藏倒计时时间（毫秒）
   * @param {number} delay
   */
  setHideDelay(delay) {
    this.hideDelay = Math.max(1000, Math.min(30000, delay));
    console.log(`[EdgeDetector] 隐藏倒计时更新为: ${this.hideDelay / 1000}秒`);
  }

  /**
   * 启动时立即显示窗口（让欢迎页可见）
   */
  showWelcome() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.setOpacity(1);
    this.isWindowVisible = true;
    console.log('[EdgeDetector] 启动时显示窗口（欢迎页）');
  }
}

module.exports = EdgeDetector;