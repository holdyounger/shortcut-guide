// test/e2e/spectron.config.js
// Spectron 配置文件

module.exports = {
  // Spectron 启动参数
  appPath: process.cwd(),
  requireName: 'electron',
  env: {
    NODE_ENV: 'test'
  },
  // ChromeDriver 选项
  chromeDriverArgs: [
    '--no-sandbox',
    '--disable-dev-shm-usage'
  ],
  // Electron 选项
  electronPath: require.resolve('electron'),
  // 超时设置
  startTimeout: 15000,
  waitTimeout: 10000
};