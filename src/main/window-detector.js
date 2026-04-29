/**
 * window-detector.js - 活动窗口检测模块（active-win 实现）
 *
 * 持续检测当前活动窗口的进程名，每 200ms 检测一次
 * 使用 active-win npm 包获取鼠标悬停/活动窗口的进程信息
 * 通过 processId 查询系统获取确定性的进程名
 * 支持 Windows / macOS / Linux 跨平台
 */

const { execFile } = require('child_process');

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
 * 通过进程 PID 获取实际的进程名（确定性，不依赖窗口标题）
 * @param {number} pid - 进程 ID
 * @returns {Promise<string|null>} 进程名，如 'chrome.exe'
 */
function getProcessNameByPid(pid) {
  return new Promise((resolve) => {
    // Windows: 使用 tasklist 获取进程名（最稳定的方案）
    execFile(
      'tasklist',
      ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
      { encoding: 'utf8', timeout: 1000, windowsHide: true },
      (error, stdout) => {
        if (error || !stdout || !stdout.trim()) {
          resolve(null);
          return;
        }
        // 输出格式: "Image Name","PID","Session Name","Session#","Mem Usage"
        // 示例: "\"chrome.exe\",\"12345\",\"Console\",\"1\",\"102400 K\""
        const firstLine = stdout.split('\n')[0];
        // 第一个字段是进程名，两端有引号包裹
        const match = firstLine.match(/"([^"]+)"/);
        if (match && match[1]) {
          resolve(match[1]); // 如 'chrome.exe'
        } else {
          resolve(null);
        }
      }
    );
  });
}

/**
 * 检测鼠标指针下的窗口进程名
 * 使用 active-win 获取当前活动窗口的进程名
 * 通过 processId + tasklist 查询获取确定性进程名（不依赖 owner.name）
 * @returns {Promise<string|null>} 活动窗口的进程名，如 'chrome.exe'，失败时返回 null
 */
async function getActiveProcess() {
  if (!ensureInitialized()) {
    return null;
  }

  try {
    // active-win 返回当前前台窗口的信息
    const result = await activeWin();

    if (!result || !result.owner) {
      return null;
    }

    // 优先使用 processId + tasklist 获取真实进程名（确定性）
    if (result.owner.processId) {
      const processName = await getProcessNameByPid(result.owner.processId);
      if (processName) {
        return processName; // 如 'chrome.exe', 'explorer.exe', 'Code.exe'
      }
    }

    // 降级方案：直接使用 owner.name
    if (result.owner.name) {
      return result.owner.name;
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
    this._selfProcessNames = [
      'electron',
      'electron.exe',
      'KeySense',
      'KeySense.exe',
    ];
    this._selfTitles = [
      '快捷键提示器',
      'KeySense',
      'KeySense',
    ];
  }

  /**
   * 检查给定的进程名或窗口标题是否属于 KeySense 自身窗口
   * @param {string|null} processName
   * @returns {boolean}
   */
  _isKeySenseWindow(processName) {
    if (!processName) return false;
    const lower = processName.toLowerCase();
    if (this._selfProcessNames.some((name) => lower === name.toLowerCase())) {
      return true;
    }
    return false;
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

        // 屏蔽 KeySense 自身窗口：保留上一个有效窗口不变
        if (this._isKeySenseWindow(processName)) {
          // currentProcess 保持为上一个有效值（即 null 时也保留）
          return; // 静默忽略本次检测，不更新状态，不触发通知
        }

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

    console.log('[WindowDetector] 启动检测（active-win + tasklist 实现）');
  }

  /**
   * 立即检测一次（不等待轮询，用于 get-current-app IPC 快速返回）
   * @returns {Promise<string|null>} 当前检测到的进程名
   */
  async detect() {
    try {
      const processName = await getActiveProcess();
      if (this._isKeySenseWindow(processName)) {
        return this.currentProcess; // 保留上一个有效值
      }
      this.currentProcess = processName;
      return processName;
    } catch (err) {
      return this.currentProcess; // 出错时返回缓存值
    }
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
    const matchedApp = this.dataManager.matchAppOrSynthesize(processName);
    console.log('[WindowDetector] 匹配到应用: ' + matchedApp.name + (matchedApp.adapted ? '' : '（未适配）'));
    // 将 appData 写入共享存储，供 setupIPC 读取并通过 IPC 发送
    this._lastMatchedApp = matchedApp;
  }

  /**
   * 获取最近一次匹配到的应用数据（供主进程 IPC 轮询使用）
   * @returns {{ processName: string|null, appData: Object|null }}
   */
  getLastMatchedInfo() {
    return {
      processName: this.currentProcess,
      appData: this._lastMatchedApp || null,
    };
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