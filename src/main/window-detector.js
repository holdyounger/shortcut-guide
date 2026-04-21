/**
 * window-detector.js - 活动窗口检测模块（PowerShell CLI 实现）
 *
 * 持续检测当前活动窗口的进程名，每 200ms 检测一次
 * 使用 PowerShell CLI 调用 Windows API，避免 ffi-napi 的兼容性问题
 * 支持 Windows 平台（核心目标）
 *
 * 技术方案：
 *   PowerShell 脚本调用 WinAPI（WindowFromPoint, GetWindowThreadProcessId, Get-Process）
 *   通过 child_process.execFile 调用 powershell.exe
 */

const { execFile } = require('child_process');
const path = require('path');

// ─── PowerShell 脚本（缓存为常量，避免重复拼接） ───────────────────
const POWER_SHELL_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
  [DllImport("user32.dll")]
  public static extern IntPtr WindowFromPoint(int x, int y);
  [DllImport("user32.dll")]
  public static extern IntPtr GetParent(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);
  [DllImport("user32.dll")]
  public static extern bool GetCursorPos(out POINT lpPoint);
}
public struct POINT { public int X; public int Y; }
"@;

$point = New-Object POINT
[WinAPI]::GetCursorPos([ref]$point) | Out-Null
$hwnd = [WinAPI]::WindowFromPoint($point.X, $point.Y)
while ([WinAPI]::GetParent($hwnd) -ne 0) { $hwnd = [WinAPI]::GetParent($hwnd) }
$pid = 0
[WinAPI]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
if ($pid -gt 0) {
  try {
    (Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName
  } catch {
    # 静默处理进程不存在的情况
  }
}
`.trim();

// ─── 初始化状态 ───────────────────────────────────────────────────
let initialized = false;
let initError = null;

/**
 * 确保初始化完成（PowerShell CLI 不需要复杂初始化，但保留状态检查）
 */
function ensureInitialized() {
  if (initialized) return !initError;

  try {
    // 验证 PowerShell 是否可用
    const testResult = execFileSync('powershell.exe', ['-Command', 'echo "test"'], {
      encoding: 'utf8',
      timeout: 2000
    });

    initialized = true;
    console.log('[WindowDetector] PowerShell CLI 可用');
    return true;
  } catch (err) {
    initError = err;
    initialized = true;
    console.error('[WindowDetector] PowerShell CLI 不可用: ' + err.message);
    return false;
  }
}

/**
 * 同步版本的初始化检查
 */
function execFileSync(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * 检测鼠标指针下的窗口进程名
 * 使用 PowerShell CLI 调用 Windows API 获取鼠标悬停的窗口进程名
 * @returns {Promise<string|null>} 鼠标下窗口的进程名，如 'chrome.exe'，失败时返回 null
 */
async function getActiveProcess() {
  // 确保已初始化
  if (!ensureInitialized()) {
    return null;
  }

  try {
    // ── 1. 调用 PowerShell 执行脚本 ───────────────────────────────
    const stdout = await Promise.race([
      execFile('powershell.exe', ['-Command', POWER_SHELL_SCRIPT], {
        encoding: 'utf8',
        timeout: 5000, // 5秒超时
        windowsHide: true // 隐藏 PowerShell 窗口
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PowerShell 执行超时')), 5000)
      )
    ]);

    // ── 2. 处理返回结果 ───────────────────────────────────────────
    const processName = stdout.trim();

    // 如果没有输出或输出为空，返回 null
    if (!processName) {
      return null;
    }

    // 确保返回的是有效的进程名（应该包含 .exe 或类似格式）
    // PowerShell 返回的已经是进程名（如 chrome.exe），直接返回
    return processName;

  } catch (error) {
    // 静默处理常见错误，避免过多日志
    if (error.code === 'ENOENT') {
      console.error('[WindowDetector] 未找到 powershell.exe');
    } else if (error.killed) {
      console.warn('[WindowDetector] PowerShell 执行超时');
    } else if (error.stdout && error.stdout.trim()) {
      // 脚本执行成功但输出为空（正常情况）
      return null;
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
          // 通知主进程，由主进程转发给渲染进程
          this._notifyMain(processName);
        }
      } catch (err) {
        console.error('[WindowDetector] 检测错误: ' + err.message);
      }
    }, 200);

    console.log('[WindowDetector] 启动检测（PowerShell CLI 实现）');
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
    // 由主进程通过 IPC 发送消息到渲染进程
    // 此处只是记录，实际 IPC 在 index.js 中实现
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
