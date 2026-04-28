/**
 * window-detector.js - 活动窗口检测模块（active-win 实现）
 *
 * 持续检测当前活动窗口的进程名，每 200ms 检测一次
 * 使用 active-win npm 包获取鼠标悬停/活动窗口的进程信息
 * 支持 Windows / macOS / Linux 跨平台
 */

let activeWin;
let initError = null;

/**
 * 初始化 active-win 模块（延迟加载）
 */
function ensureInitialized() {
  if (activeWin !== undefined) return !initError;

  try {
    activeWin = require('active-win');
    console.log('[WindowDetector] active-win 模块加载成功');
    return true;
  } catch (err) {
    initError = err;
    console.error('[WindowDetector] active-win 模块加载失败: ' + err.message);
    return false;
  }
}

/**
 * 检测鼠标指针下的窗口进程名
 * 使用 active-win 获取当前活动窗口（focused window）的进程名
 * @returns {Promise<string|null>} 活动窗口的进程名，如 'chrome.exe'，失败时返回 null
 */
async function getActiveProcess() {
  if (!ensureInitialized()) {
    return null;
  }

  try {
    // active-win 返回当前前台窗口的信息
    const result = await activeWin();

    if (!result) {
      return null;
    }

    // result.owner.name 是进程名（不含路径），如 'chrome.exe', 'Code.exe'
    if (result.owner && result.owner.name) {
      return result.owner.name;
    }

    // 备选：从 title 获取进程名（某些情况下可能包含进程信息）
    if (result.title) {
      return null; // title 不够精确，返回 null 让系统显示"未知"
    }

    return null;

  } catch (error) {
    // 静默处理常见错误
    if (error.message && error.message.includes('ENOENT')) {
      console.warn('[WindowDetector] 窗口检测不可用（无活动窗口）');
    } else {
      console.warn('[WindowDetector] 检测窗口进程时发生错误: ' + error.message);
    }
    return null;
  }
}

/**
 * 活动窗口检测器类
 */
class WindowDetector {
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.lastProcess = null;
    this.currentProcess = null;
    this.intervalId = null;
    this.isActive = false;
  }

  /**
   * 启动检测（每 200ms 检查一次）
   */
  start() {
    if (this.isActive) return;

    this.isActive = true;
    this.intervalId = setInterval(async () => {
      try {
        const processName = await getActiveProcess();
        this.currentProcess = processName;

        if (processName && processName !== this.lastProcess) {
          console.log('[WindowDetector] 检测到窗口变化: ' + processName);
          this.lastProcess = processName;
          this._notifyMain(processName);
        }
      } catch (err) {
        console.error('[WindowDetector] 检测错误: ' + err.message);
      }
    }, 200);

    console.log('[WindowDetector] 启动检测（active-win 实现）');
  }

  /**
   * 停止检测
   */
  stop() {
    if (!this.isActive) return;
    clearInterval(this.intervalId);
    this.isActive = false;
    console.log('[WindowDetector] 停止检测');
  }

  /**
   * 通知主进程当前活动窗口
   * @private
   * @param {string} processName
   */
  _notifyMain(processName) {
    const matchedApp = this.dataManager.matchApp(processName);
    console.log('[WindowDetector] 匹配到应用: ' + (matchedApp ? matchedApp.name : '未知'));
  }

  /**
   * 获取当前检测到的进程名
   * @returns {string|null}
   */
  getCurrentProcess() {
    return this.currentProcess;
  }
}

module.exports = WindowDetector;