/**
 * preload.js - 渲染进程预加载脚本
 *
 * 通过 contextBridge 暴露安全的 API 给渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keySenseAPI', {
  /**
   * 获取当前活动应用数据
   */
  getCurrentApp: () => ipcRenderer.invoke('get-current-app'),

  /**
   * 获取指定应用的快捷键
   */
  getShortcuts: (appId) => ipcRenderer.invoke('get-shortcuts', appId),

  /**
   * 获取所有已注册的应用列表
   */
  getAllApps: () => ipcRenderer.invoke('get-all-apps'),

  /**
   * 监听应用变化事件
   */
  onAppChanged: (callback) => {
    ipcRenderer.on('app-changed', (event, data) => callback(data));
  },

  /**
   * 移除应用变化监听
   */
  removeAppChangedListener: () => {
    ipcRenderer.removeAllListeners('app-changed');
  },

  /**
   * 设置窗口固定状态
   */
  setPinned: (pinned) => {
    try {
      const result = ipcRenderer.invoke('set-pinned', pinned);
      result.then(success => {
        if (success) {
          console.log(`[Preload] setPinned(${pinned}) 确认成功`);
        } else {
          console.error(`[Preload] setPinned(${pinned}) 主进程返回失败`);
        }
      }).catch(err => {
        console.error(`[Preload] setPinned(${pinned}) 失败:`, err);
      });
      return result;
    } catch (err) {
      console.error('[Preload] setPinned 例外:', err);
      return Promise.reject(err);
    }
  },

  /**
   * 监听鼠标进入窗口事件
   */
  onMouseEnter: (callback) => {
    ipcRenderer.on('mouse-enter', () => callback());
  },

  /**
   * 监听鼠标离开窗口事件
   */
  onMouseLeave: (callback) => {
    ipcRenderer.on('mouse-leave', () => callback());
  },

  /**
   * 移除鼠标事件监听
   */
  removeMouseListeners: () => {
    ipcRenderer.removeAllListeners('mouse-enter');
    ipcRenderer.removeAllListeners('mouse-leave');
  },

  /**
   * 向主进程报告鼠标进入窗口
   */
  mouseEnter: () => {
    ipcRenderer.send('mouse-enter');
  },

  /**
   * 向主进程报告鼠标离开窗口
   */
  mouseLeave: () => {
    ipcRenderer.send('mouse-leave');
  },

  /**
   * 验证主进程固定状态（调试用）
   */
  verifyPinned: () => ipcRenderer.invoke('verify-pinned'),

  /**
   * 获取窗口位置和尺寸
   */
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),

  /**
   * 更新窗口拖拽位置
   */
  updateDraggedPosition: (x, y) => ipcRenderer.invoke('update-dragged-position', x, y),

  /**
   * 监听隐藏倒计时更新事件
   * @param {Function} callback - (data: {isCountingDown, remainingMs}) => {}
   */
  onCountdownUpdate: (callback) => {
    ipcRenderer.on('countdown-update', (event, data) => callback(data));
  },

  /**
   * 获取当前倒计时状态（主动查询）
   * @returns {Promise<{isCountingDown: boolean, remainingMs: number|null}>}
   */
  getCountdown: () => ipcRenderer.invoke('get-countdown'),

  /**
   * 通知主进程欢迎页已关闭，允许启动隐藏倒计时
   */
  welcomeDismissed: () => {
    ipcRenderer.send('welcome-dismissed');
  },
});

console.log('[Preload] API 已暴露');