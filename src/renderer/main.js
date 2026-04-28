/**
 * main.js - 渲染进程主脚本
 * 
 * 功能：
 * - 接收主进程消息，动态渲染快捷键列表
 * - 支持搜索过滤
 * - 根据当前应用名加载数据
 */

// ========== 状态管理 ==========
const state = {
  currentApp: null,
  shortcutsByCategory: {},
  filteredShortcuts: null,
  searchQuery: '',
  isPinned: false,
};

// ========== DOM 元素 ==========
const elements = {
  appName: document.getElementById('appName'),
  appProcess: document.getElementById('appProcess'),
  searchInput: document.getElementById('searchInput'),
  shortcutsContainer: document.getElementById('shortcutsContainer'),
  totalCount: document.getElementById('totalCount'),
  pinButton: document.getElementById('pinButton'),
  footerPinStatus: document.getElementById('footerPinStatus'),
};

// ========== 初始化 ==========
async function init() {
  // 监听应用变化
  window.keySenseAPI.onAppChanged(handleAppChanged);

  // 设置搜索监听
  elements.searchInput.addEventListener('input', handleSearch);

  // 设置固定按钮监听
  elements.pinButton.addEventListener('click', () => {
    togglePin();
  });

  // 拖拽支持（标题栏可拖动整个窗口）
  setupWindowDrag();

  // 初始加载
  await loadCurrentApp();

  console.log('[Renderer] 初始化完成');
}

/**
 * 加载当前活动应用数据
 */
async function loadCurrentApp() {
  try {
    const appData = await window.keySenseAPI.getCurrentApp();
    updateCurrentApp(appData);
  } catch (err) {
    console.error('[Renderer] 加载应用数据失败:', err);
    showEmptyState('无法获取当前应用');
  }
}

/**
 * 更新当前应用信息
 * @param {Object|null} appData - 应用数据
 */
function updateCurrentApp(appData) {
  state.currentApp = appData;
  elements.appName.textContent = appData ? appData.name : '未知应用';
  elements.appProcess.textContent = appData ? `(${appData.processNames[0]})` : '';

  if (appData) {
    loadShortcuts(appData.appId);
  } else {
    showEmptyState('未检测到有效应用');
  }
}

/**
 * 加载指定应用的快捷键
 * @param {string} appId - 应用ID
 */
async function loadShortcuts(appId) {
  try {
    const shortcutsByCategory = await window.keySenseAPI.getShortcuts(appId);
    state.shortcutsByCategory = shortcutsByCategory;
    filterAndRenderShortcuts();
  } catch (err) {
    console.error('[Renderer] 加载快捷键失败:', err);
    showEmptyState('无法加载快捷键');
  }
}

/**
 * 过滤并渲染快捷键列表
 */
function filterAndRenderShortcuts() {
  const query = state.searchQuery.toLowerCase().trim();
  const categories = Object.keys(state.shortcutsByCategory);

  if (categories.length === 0) {
    showEmptyState('该应用无快捷键');
    return;
  }

  // 过滤快捷键
  const filtered = {};
  let totalCount = 0;

  for (const [category, shortcuts] of Object.entries(state.shortcutsByCategory)) {
    const filteredShortcuts = shortcuts.filter(s =>
      s.action.toLowerCase().includes(query) ||
      s.key.toLowerCase().includes(query)
    );

    if (filteredShortcuts.length > 0) {
      filtered[category] = filteredShortcuts;
      totalCount += filteredShortcuts.length;
    }
  }

  state.filteredShortcuts = filtered;
  renderShortcuts();

  // 更新总数
  elements.totalCount.textContent = `${totalCount} 个快捷键`;
}

/**
 * 渲染快捷键列表
 */
function renderShortcuts() {
  const { filteredShortcuts } = state;
  const container = elements.shortcutsContainer;
  container.innerHTML = '';

  if (Object.keys(filteredShortcuts).length === 0) {
    container.innerHTML = `
      <div class="no-results">
        没有找到匹配的快捷键
      </div>
    `;
    return;
  }

  for (const [category, shortcuts] of Object.entries(filteredShortcuts)) {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'category';
    categoryDiv.innerHTML = `<div class="category-title">${category}</div>`;

    for (const shortcut of shortcuts) {
      const item = document.createElement('div');
      item.className = 'shortcut-item';
      item.innerHTML = `
        <span class="shortcut-action">${shortcut.action}</span>
        <span class="shortcut-key">
          ${shortcut.key.split('+').map(k => `<span class="key">${k}</span>`).join('<span class="key-separator">+</span>')}
        </span>
      `;
      categoryDiv.appendChild(item);
    }

    container.appendChild(categoryDiv);
  }
}

/**
 * 搜索输入处理
 */
function handleSearch() {
  state.searchQuery = elements.searchInput.value;
  filterAndRenderShortcuts();
}

/**
 * 显示空状态
 * @param {string} message
 */
function showEmptyState(message) {
  elements.shortcutsContainer.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🪄</div>
      <div class="empty-state-text">${message}</div>
      <div class="empty-state-hint">请切换到支持的应用窗口</div>
    </div>
  `;
  elements.totalCount.textContent = '0 个快捷键';
}

// ========== 固定按钮功能 ==========
/**
 * 拖拽窗口支持
 */
function setupWindowDrag() {
  const header = document.querySelector('.header');
  if (!header) return;

  let isDragging = false;
  let startX = 0, startY = 0;
  let windowStartX = 0, windowStartY = 0;

  header.addEventListener('mousedown', (e) => {
    // 忽略按钮上的点击
    if (e.target.closest('.pin-button')) return;

    isDragging = true;
    startX = e.screenX;
    startY = e.screenY;

    // 通过 BrowserView 的位置获取（需要 IPC）
    // 先用 startX/Y 作为相对基准
    window.keySenseAPI.getWindowBounds().then(bounds => {
      if (bounds) {
        windowStartX = bounds.x;
        windowStartY = bounds.y;
      }
    }).catch(() => {});

    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.screenX - startX;
    const deltaY = e.screenY - startY;
    const newX = windowStartX + deltaX;
    const newY = windowStartY + deltaY;
    window.keySenseAPI.updateDraggedPosition(Math.round(newX), Math.round(newY));
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
    }
  });
}
function togglePin() {
  state.isPinned = !state.isPinned;
  updatePinUI();
  window.keySenseAPI.setPinned(state.isPinned);
}

function updatePinUI() {
  const { pinButton, footerPinStatus } = elements;

  if (state.isPinned) {
    pinButton.classList.add('pinned');
    pinButton.title = '取消固定（恢复自动隐藏）';
    footerPinStatus.textContent = '已固定 · 面板保持显示';
    footerPinStatus.classList.add('visible');
  } else {
    pinButton.classList.remove('pinned');
    pinButton.title = '固定窗口（保持显示）';
    footerPinStatus.textContent = '';
    footerPinStatus.classList.remove('visible');
  }
}

// 启动
init();
