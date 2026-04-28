/**
 * data-manager.js - 快捷键数据管理模块
 *
 * 负责：
 * - 加载内置 shortcuts.json / apps/ 目录
 * - 加载用户自定义 user-custom.json
 * - 根据进程名匹配应用（模糊匹配）
 * - 合并/覆盖数据
 */

const fs = require('fs');
const path = require('path');

class DataManager {
  constructor() {
    /** @type {Object|null} 内置快捷键数据 */
    this.builtInData = null;
    /** @type {Object|null} 用户自定义数据 */
    this.userData = null;
    /** @type {Object} 合并后的完整数据 { appId: { name, type, processNames, platforms, shortcuts } } */
    this.mergedData = {};
    /** @type {Map<string, string>} 进程名 -> 应用ID 的快速查找表 */
    this.processMap = new Map();
    /** @type {string} data 目录路径 */
    this.dataDir = path.join(__dirname, '../../data');
    /** @type {string} apps 目录路径 */
    this.appsDir = path.join(this.dataDir, 'apps');
  }

  /**
   * 初始化：加载数据并构建索引
   */
  init() {
    this._loadBuiltInData();
    this._loadUserData();
    this._mergeData();
    this._buildProcessMap();
    console.log(`[DataManager] 初始化完成，共 ${Object.keys(this.mergedData).length} 个应用`);
  }

  /**
   * 加载内置快捷键数据
   * 优先从 apps/ 目录加载（type 分类文件），不存在则回退到 shortcuts.json
   * @private
   */
  _loadBuiltInData() {
    // 优先从 apps/ 目录加载（新的分类结构）
    if (fs.existsSync(this.appsDir)) {
      try {
        const files = fs.readdirSync(this.appsDir).filter(f => f.endsWith('.json'));
        const allApps = {};
        for (const file of files) {
          const typeFile = path.join(this.appsDir, file);
          const raw = fs.readFileSync(typeFile, 'utf-8');
          const data = JSON.parse(raw);
          // data.apps 是 { appId: appData } 的字典
          Object.assign(allApps, data.apps || {});
        }
        this.builtInData = { apps: allApps };
        console.log(`[DataManager] 从 apps/ 目录加载 ${Object.keys(allApps).length} 个应用`);
        return;
      } catch (err) {
        console.error(`[DataManager] 从 apps/ 加载失败，回退到 shortcuts.json: ${err.message}`);
      }
    }

    // 回退：加载原始 shortcuts.json
    const filePath = path.join(this.dataDir, 'shortcuts.json');
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      this.builtInData = JSON.parse(raw);
      console.log(`[DataManager] 已加载内置数据: ${Object.keys(this.builtInData.apps || {}).length} 个应用`);
    } catch (err) {
      console.error(`[DataManager] 加载内置数据失败: ${err.message}`);
      this.builtInData = { apps: {} };
    }
  }

  /**
   * 加载用户自定义 user-custom.json
   * @private
   */
  _loadUserData() {
    const filePath = path.join(this.dataDir, 'user-custom.json');
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        this.userData = JSON.parse(raw);
        console.log(`[DataManager] 已加载用户自定义数据: ${Object.keys(this.userData.apps || {}).length} 个应用`);
      } else {
        console.log('[DataManager] 未找到用户自定义数据，跳过');
        this.userData = { apps: {} };
      }
    } catch (err) {
      console.error(`[DataManager] 加载用户自定义数据失败: ${err.message}`);
      this.userData = { apps: {} };
    }
  }

  /**
   * 合并内置数据和用户自定义数据
   * 用户数据优先级更高，会覆盖同 key 的快捷键
   * @private
   */
  _mergeData() {
    // 先复制内置数据（包含 type 字段）
    const builtInApps = this.builtInData.apps || {};
    for (const [appId, appData] of Object.entries(builtInApps)) {
      this.mergedData[appId] = {
        name: appData.name,
        type: appData.type || 'system',       // 保留 type 字段
        processNames: [...(appData.processNames || [])],
        platforms: [...(appData.platforms || [])],
        shortcuts: [...(appData.shortcuts || [])],
      };
    }

    // 合并用户自定义数据
    const userApps = this.userData.apps || {};
    for (const [appId, appData] of Object.entries(userApps)) {
      if (this.mergedData[appId]) {
        // 已有应用：追加 processNames，合并快捷键
        const existing = this.mergedData[appId];
        // 追加新的进程名
        for (const pn of (appData.processNames || [])) {
          if (!existing.processNames.includes(pn)) {
            existing.processNames.push(pn);
          }
        }
        // 合并快捷键（按 key 去重，用户数据优先）
        const userKeyMap = new Map(
          (appData.shortcuts || []).map(s => [s.key.toLowerCase(), s])
        );
        existing.shortcuts = existing.shortcuts.filter(
          s => !userKeyMap.has(s.key.toLowerCase())
        );
        existing.shortcuts.push(...appData.shortcuts);
      } else {
        // 新应用：直接添加
        this.mergedData[appId] = {
          name: appData.name,
          type: appData.type || 'system',
          processNames: [...(appData.processNames || [])],
          platforms: [...(appData.platforms || [])],
          shortcuts: [...(appData.shortcuts || [])],
        };
      }
    }
  }

  /**
   * 构建进程名到应用ID的查找表
   * 支持 .exe 后缀和不带后缀两种形式
   * @private
   */
  _buildProcessMap() {
    this.processMap.clear();
    for (const [appId, appData] of Object.entries(this.mergedData)) {
      for (const procName of (appData.processNames || [])) {
        // 存储小写形式以便不区分大小写匹配
        this.processMap.set(procName.toLowerCase(), appId);
        // 同时存储不带 .exe 后缀的形式
        const baseName = procName.replace(/\.exe$/i, '').toLowerCase();
        if (baseName !== procName.toLowerCase()) {
          this.processMap.set(baseName, appId);
        }
      }
    }
  }

  /**
   * 根据进程名匹配应用
   * 支持精确匹配和模糊匹配
   * @param {string} processName - 进程名（如 "chrome.exe"）
   * @returns {Object|null} 匹配到的应用数据，包含 appId
   */
  matchApp(processName) {
    if (!processName) return null;

    const lower = processName.toLowerCase();

    // 1. 精确匹配
    const appId = this.processMap.get(lower);
    if (appId) {
      return { appId, ...this.mergedData[appId] };
    }

    // 2. 模糊匹配：进程名包含已知关键词
    for (const [knownProc, mappedAppId] of this.processMap.entries()) {
      if (lower.includes(knownProc) || knownProc.includes(lower)) {
        return { appId: mappedAppId, ...this.mergedData[mappedAppId] };
      }
    }

    return null;
  }

  /**
   * 获取指定应用的快捷键
   * @param {string} appId - 应用ID
   * @returns {Array} 快捷键列表
   */
  getShortcuts(appId) {
    const app = this.mergedData[appId];
    return app ? app.shortcuts : [];
  }

  /**
   * 获取指定应用的快捷键，按分类分组
   * @param {string} appId - 应用ID
   * @returns {Object} 按分类分组的快捷键 { category: [shortcuts] }
   */
  getShortcutsByCategory(appId) {
    const shortcuts = this.getShortcuts(appId);
    const grouped = {};
    for (const s of shortcuts) {
      const cat = s.category || '其他';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(s);
    }
    return grouped;
  }

  /**
   * 获取所有已注册的应用列表
   * @returns {Array} 应用列表 [{ appId, name, type, processNames }]
   */
  getAllApps() {
    return Object.entries(this.mergedData).map(([appId, data]) => ({
      appId,
      name: data.name,
      type: data.type,
      processNames: data.processNames,
    }));
  }

  /**
   * 获取所有应用，按 type 分组
   * @returns {Object} 按 type 分组的应用 { type: [{ appId, name, processNames }] }
   */
  getAppsByType() {
    const grouped = {};
    for (const [appId, data] of Object.entries(this.mergedData)) {
      const type = data.type || 'system';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push({ appId, name: data.name, processNames: data.processNames });
    }
    return grouped;
  }

  /**
   * 获取所有支持的 type 列表
   * @returns {Array} type 列表 [{ id, name }]
   */
  getTypes() {
    const typeNames = {
      development: '开发工具',
      communication: '通信聊天',
      office: '办公效率',
      media: '媒体设计',
      system: '系统工具',
    };
    const seen = new Set();
    const result = [];
    for (const data of Object.values(this.mergedData)) {
      const t = data.type || 'system';
      if (!seen.has(t)) {
        seen.add(t);
        result.push({ id: t, name: typeNames[t] || t });
      }
    }
    return result;
  }

  /**
   * 重新加载数据（热更新用）
   */
  reload() {
    this.mergedData = {};
    this.processMap.clear();
    this._loadBuiltInData();
    this._loadUserData();
    this._mergeData();
    this._buildProcessMap();
    console.log('[DataManager] 数据已重新加载');
  }
}

module.exports = DataManager;