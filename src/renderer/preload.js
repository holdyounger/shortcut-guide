/**
 * preload.js - 渲染进程预加载脚本
 * 
 * 通过 contextBridge 暴露安全的 API 给渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

// 暴露 API 到渲染进程
contextBridge.exposeInMainWorld('keySenseAPI', {
  /**
   * 获取当前活动应用数据
   * @returns {Promise<Object|null>}
   */
  getCurrentApp: () => ipcRenderer.invoke('get-current-app'),

  /**
   * 获取指定应用的快捷键（按分类分组）
   * @param {string} appId
   * @returns {Promise<Object>}
   */
  getShortcuts: (appId) => ipcRenderer.invoke('get-shortcuts', appId),

  /**
   * 获取所有已注册的应用列表
   * @returns {Promise<Array>}
   */
  getAllApps: () => ipcRenderer.invoke('get-all-apps'),

  /**
   * 监听应用变化事件
   * @param {Function} callback - 回调函数 (event, data) => {}
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
   * @param {boolean} pinned - 是否固定
   * @returns {Promise<boolean>} 是否设置成功
   */
  setPinned: (pinned) => {
    try {
      // 使用 invoke 代替 send，确保消息送达且有错误反馈
      const result = ipcRenderer.invoke('set-pinned', pinned);
      // 异步验证：确保主进程状态已更新
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
   * @param {Function} callback - 回调函数 () => {}
   */
  onMouseEnter: (callback) => {
    ipcRenderer.on('mouse-enter', () => callback());
  },

  /**
   * 监听鼠标离开窗口事件
   * @param {Function} callback - 回调函数 () => {}
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
   * 向主进程报告鼠标进入窗口（用于 Bug 4）
   */
  mouseEnter: () => {
    ipcRenderer.send('mouse-enter');
  },

  /**
   * 向主进程报告鼠标离开窗口（用于 Bug 4）
   */
  mouseLeave: () => {
    ipcRenderer.send('mouse-leave');
  },

  /**
   * 验证主进程固定状态（调试用）
   * @returns {Promise<boolean>}
   */
  verifyPinned: () => ipcRenderer.invoke('verify-pinned'),

  /**
   * 获取窗口位置和尺寸（用于拖拽）
   * @returns {Promise<{x:number,y:number,width:number,height:number}|null>}
   */
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),

  /**
   * 更新窗口拖拽位置
   * @param {number} x
   * @param {number} y
   * @returns {Promise<boolean>}
   */
  updateDraggedPosition: (x, y) => ipcRenderer.invoke('update-dragged-position', x, y),
});

console.log('[Preload] API 已暴露');
