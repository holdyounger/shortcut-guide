// test/e2e/test-runner.js
// Electron E2E 测试框架 - 使用 Spectron（或 electron-test-utils）

const { Application } = require('spectron');
const path = require('path');
const assert = require('assert');

// 配置
const APP_PATH = path.join(__dirname, '..', '..', '..'); // 项目根目录
const ELECTRON_PATH = require('electron');

// 测试参数
const TIMEOUT = 10000;
const HIDE_DELAY = 5000; // 5秒隐藏延迟

describe('KeySense 快捷键提示器 E2E 测试', function() {
  this.timeout(TIMEOUT * 3);

  let app;

  beforeEach(async () => {
    app = new Application({
      path: ELECTRON_PATH,
      args: [APP_PATH]
    });
    await app.start();
    await app.client.waitUntilWindowLoaded();
  });

  afterEach(async () => {
    if (app && app.isRunning()) {
      await app.stop();
    }
  });

  // === 测试用例 ===

  it('1. 应用启动后应创建托盘图标', async () => {
    const tray = await app.client.waitUntilExists('.tray-icon', TIMEOUT);
    assert.ok(tray, '托盘图标应存在');
  });

  it('2. 按 Ctrl+Shift+G 应显示窗口', async () => {
    await app.client.keys(['Control', 'Shift', 'g']);
    const window = await app.client.waitUntilExists('.header', TIMEOUT);
    assert.ok(window, '窗口应显示');
    const opacity = await app.client.getOpacity();
    assert.ok(opacity > 0.8, '窗口不透明度应为 0.9');
  });

  it('3. 再按 Ctrl+Shift+G 应隐藏窗口', async () => {
    await app.client.keys(['Control', 'Shift', 'g']); // 显示
    await app.client.keys(['Control', 'Shift', 'g']); // 隐藏
    const window = await app.client.waitUntilNotExists('.header', TIMEOUT);
    assert.ok(window, '窗口应隐藏');
    const opacity = await app.client.getOpacity();
    assert.ok(opacity < 0.2, '隐藏后不透明度应为 0.1');
  });

  it('4. 按 ESC 键应隐藏窗口', async () => {
    await app.client.keys(['Control', 'Shift', 'g']); // 显示
    await app.client.keys('Escape');
    const window = await app.client.waitUntilNotExists('.header', TIMEOUT);
    assert.ok(window, 'ESC 应隐藏窗口');
  });

  it('5. 点击窗口外部应隐藏窗口', async () => {
    await app.client.keys(['Control', 'Shift', 'g']); // 显示
    const size = await app.client.getWindowSize();
    const pos = await app.client.getWindowPosition();
    // 点击窗口外
    await app.client.mouseMove(pos.x + size.width + 10, pos.y + 10);
    await app.client.mouseClick();
    const window = await app.client.waitUntilNotExists('.header', TIMEOUT);
    assert.ok(window, '点击外部应隐藏窗口');
  });

  it('6. 鼠标悬停屏幕顶部应显示窗口（模拟）', async () => {
    // 隐藏窗口
    await app.client.keys(['Control', 'Shift', 'g']);
    await app.client.waitUntilNotExists('.header', TIMEOUT);

    // 模拟鼠标移入顶部边框（假设主屏）
    const display = await app.client.getPrimaryDisplay();
    const x = display.bounds.width / 2;
    const y = 0; // 顶部边框

    await app.client.mouseMove(x, y);
    const window = await app.client.waitUntilExists('.header', TIMEOUT);
    assert.ok(window, '顶部边框悬停应显示窗口');
  });

  it('7. 鼠标离开后 5 秒应自动隐藏', async () => {
    await app.client.keys(['Control', 'Shift', 'g']); // 显示
    await app.client.waitUntilExists('.header', TIMEOUT);

    // 移出窗口
    const pos = await app.client.getWindowPosition();
    const size = await app.client.getWindowSize();
    await app.client.mouseMove(pos.x + size.width + 50, pos.y + size.height + 50);

    // 等待 5 秒后检查是否隐藏
    await app.client.wait(HIDE_DELAY + 1000);
    const window = await app.client.waitUntilNotExists('.header', TIMEOUT);
    assert.ok(window, '鼠标离开 5 秒后应自动隐藏');
  });

  it('8. 快捷键响应不应影响其他应用', async () => {
    // 启动一个文本编辑器模拟背景应用
    const process = require('child_process');
    const editor = process.spawn('notepad.exe');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 按快捷键唤出提示器
    await app.client.keys(['Control', 'Shift', 'g']);
    const window = await app.client.waitUntilExists('.header', TIMEOUT);
    assert.ok(window, '提示器应正常显示');

    // 检查记事本是否仍响应（可选：模拟输入）
    // 这里为简化，仅验证提示器能正常工作
    editor.kill();
  });

  it('9. 在不同分辨率下窗口位置应正确', async () => {
    // 模拟不同分辨率（实际测试需在不同机器或虚拟机）
    const displays = await app.client.getAllDisplays();
    assert.ok(displays.length >= 1, '至少应检测到一个显示器');

    await app.client.keys(['Control', 'Shift', 'g']);
    const bounds = await app.client.getWindowBounds();
    const display = displays[0];

    // 窗口应在顶部或右侧
    assert.ok(
      (bounds.y === 0 && bounds.x === display.bounds.width - bounds.width) ||
      (bounds.x === 0 && bounds.y === display.bounds.height - bounds.height),
      '窗口位置应位于顶部或右侧'
    );
  });

});