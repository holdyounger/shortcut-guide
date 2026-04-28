/**
 * main.js - 渲染进程主脚本
 *
 * 功能：
 * - 接收主进程消息，动态渲染快捷键列表
 * - 支持搜索过滤
 * - 首次启动欢迎页
 * - 隐藏倒计时显示
 */

const WELCOME_KEY = 'keysense_welcomed';

// ========== 状态管理 ==========
const state = {
  currentApp: null,
  shortcutsByCategory: {},
  filteredShortcuts: null,
  searchQuery: '',
  isPinned: false,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  windowStartX: 0,
  windowStartY: 0,
  isCountingDown: false,
  countdownInterval: null,
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
  welcomeOverlay: document.getElementById('welcomeOverlay'),
  welcomeBtn: document.getElementById('welcomeBtn'),
  countdownBadge: document.getElementById('countdownBadge'),
  countdownNumber: document.getElementById('countdownNumber'),
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

  // 设置拖拽事件
  setupDragEvents();

  // 鼠标进入/离开窗口事件
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.addEventListener('mouseenter', () => {
      window.keySenseAPI.mouseEnter();
    });
    appEl.addEventListener('mouseleave', () => {
      window.keySenseAPI.mouseLeave();
    });
    console.log('[Renderer] 鼠标进入/离开监听已注册');
  }

  // 监听倒计时更新
  window.keySenseAPI.onCountdownUpdate(handleCountdownUpdate);

  // 欢迎页按钮
  if (elements.welcomeBtn) {
    elements.welcomeBtn.addEventListener('click', closeWelcome);
  }

  // 检查是否首次启动
  checkWelcome();

  // 初始加载
  await loadCurrentApp();

  console.log('[Renderer] 初始化完成');
}

// ========== 首次启动欢迎页 ==========
function checkWelcome() {
  try {
    const welcomed = localStorage.getItem(WELCOME_KEY);
    if (!welcomed) {
      // 首次启动：显示欢迎页
      if (elements.welcomeOverlay) {
        elements.welcomeOverlay.classList.add('visible');
        console.log('[Renderer] 首次启动，显示欢迎页');
      }
    } else {
      console.log('[Renderer] 非首次启动，跳过欢迎页');
    }
  } catch (err) {
    console.warn('[Renderer] localStorage 不可用:', err);
  }
}

function closeWelcome() {
  try {
    localStorage.setItem(WELCOME_KEY, '1');
  } catch (err) {
    console.warn('[Renderer] localStorage 写入失败:', err);
  }
  if (elements.welcomeOverlay) {
    elements.welcomeOverlay.classList.remove('visible');
    console.log('[Renderer] 关闭欢迎页');
  }
}

// ========== 倒计时显示 ==========
/**
 * 处理倒计时状态更新（由主进程 edge-detector 推送）
 * @param {{isCountingDown: boolean, remainingMs: number|null}} data
 */
function handleCountdownUpdate(data) {
  state.isCountingDown = data.isCountingDown;
  const remaining = data.remainingMs;

  if (state.isCountingDown && remaining !== null && remaining > 0) {
    // 启动倒计时显示
    if (!elements.countdownBadge.classList.contains('visible')) {
      elements.countdownBadge.classList.add('visible');
    }
    updateCountdownDisplay(remaining);

    // 启动轮询更新（每秒刷新一次显示）
    if (!state.countdownInterval) {
      state.countdownInterval = setInterval(async () => {
        const info = await window.keySenseAPI.getCountdown();
        if (!info.isCountingDown || info.remainingMs === null) {
          hideCountdown();
          clearInterval(state.countdownInterval);
          state.countdownInterval = null;
          return;
        }
        updateCountdownDisplay(info.remainingMs);
      }, 200);
    }
  } else {
    hideCountdown();
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
      state.countdownInterval = null;
    }
  }
}

function updateCountdownDisplay(remainingMs) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  elements.countdownNumber.textContent = seconds;
}

function hideCountdown() {
  elements.countdownBadge.classList.remove('visible');
}

// ========== 处理主进程发来的应用变化事件 ==========
function handleAppChanged(data) {
  const { appData } = data;
  updateCurrentApp(appData);
}

// ========== 设置窗口拖拽事件 ==========
function setupDragEvents() {
  const header = document.querySelector('.header');
  if (header) {
    header.style.cursor = 'move';
    header.addEventListener('mousedown', async (e) => {
      if (e.target.closest('.pin-button')) return;
      if (e.target.closest('.countdown-badge')) return;

      state.isDragging = true;
      state.dragStartX = e.screenX;
      state.dragStartY = e.screenY;

      const bounds = await window.keySenseAPI.getWindowBounds();
      if (bounds) {
        state.windowStartX = bounds.x;
        state.windowStartY = bounds.y;
      }
      console.log(`[Drag] 开始拖拽: screen(${state.dragStartX}, ${state.dragStartY}), win(${state.windowStartX}, ${state.windowStartY})`);

      const onMouseMove = (e) => {
        if (!state.isDragging) return;
        const newX = state.windowStartX + (e.screenX - state.dragStartX);
        const newY = state.windowStartY + (e.screenY - state.dragStartY);
        window.keySenseAPI.updateDraggedPosition(newX, newY);
      };

      const onMouseUp = (e) => {
        if (!state.isDragging) return;
        state.isDragging = false;
        const finalX = state.windowStartX + (e.screenX - state.dragStartX);
        const finalY = state.windowStartY + (e.screenY - state.dragStartY);
        window.keySenseAPI.updateDraggedPosition(finalX, finalY);
        console.log(`[Drag] 结束拖拽: (${finalX}, ${finalY})`);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
}

// ========== 加载当前活动应用数据 ==========
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
 * @param {Object|null} appData
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
 * @param {string} appId
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
    hideCountdown();
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
      state.countdownInterval = null;
    }
  } else {
    pinButton.classList.remove('pinned');
    pinButton.title = '固定窗口（保持显示）';
    footerPinStatus.textContent = '';
    footerPinStatus.classList.remove('visible');
  }
}

// 启动
init();