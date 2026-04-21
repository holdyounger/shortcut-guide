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
});

console.log('[Preload] API 已暴露');
