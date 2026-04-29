/**
 * config-store.js - 用户配置持久化存储模块
 *
 * 使用 electron-store 管理用户配置：
 * - 窗口透明度
 * - 隐藏倒计时时间
 * - 程序启动时自动加载上次配置
 */

const Store = require('electron-store');

const defaults = {
  /** 窗口透明度 (0.1 ~ 1.0) */
  opacity: 0.9,
  /** 隐藏倒计时时间（毫秒） */
  hideDelay: 5000,
};

const schema = {
  opacity: {
    type: 'number',
    minimum: 0.1,
    maximum: 1.0,
    default: defaults.opacity,
  },
  hideDelay: {
    type: 'number',
    minimum: 1000,
    maximum: 30000,
    default: defaults.hideDelay,
  },
};

class ConfigStore {
  constructor() {
    /** @type {Store} electron-store 实例 */
    this.store = new Store({
      name: 'keysense-config',
      schema,
      defaults,
    });
  }

  /**
   * 获取窗口透明度
   * @returns {number}
   */
  getOpacity() {
    return this.store.get('opacity', defaults.opacity);
  }

  /**
   * 设置窗口透明度
   * @param {number} value
   */
  setOpacity(value) {
    this.store.set('opacity', Math.max(0.1, Math.min(1.0, value)));
  }

  /**
   * 获取隐藏倒计时时间（毫秒）
   * @returns {number}
   */
  getHideDelay() {
    return this.store.get('hideDelay', defaults.hideDelay);
  }

  /**
   * 设置隐藏倒计时时间（毫秒）
   * @param {number} value
   */
  setHideDelay(value) {
    this.store.set('hideDelay', Math.max(1000, Math.min(30000, value)));
  }

  /**
   * 获取所有配置
   * @returns {{opacity: number, hideDelay: number}}
   */
  getAll() {
    return {
      opacity: this.getOpacity(),
      hideDelay: this.getHideDelay(),
    };
  }
}

module.exports = ConfigStore;