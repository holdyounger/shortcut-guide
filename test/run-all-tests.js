#!/usr/bin/env node
/**
 * 🔬 KeySense 测试运行器
 * 一键运行所有测试：单元测试、E2E、性能基准
 */

const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60) + '\n');
}

function runCommand(cmd, cwd = ROOT, env = { ...process.env, FORCE_COLOR: '1' }) {
  return new Promise((resolve, reject) => {
    const parts = cmd.split(' ');
    const command = parts[0];
    const args = parts.slice(1);

    log(`执行: ${cmd}`, 'yellow');

    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`命令退出码 ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function runUnitTests() {
  section('🧪 单元测试 (Unit Tests)');
  try {
    await runCommand('npm test');
    log('✅ 单元测试通过', 'green');
    return true;
  } catch (err) {
    log('❌ 单元测试失败', 'red');
    return false;
  }
}

async function runE2ETests() {
  section('🌐 E2E 自动化测试');
  log('⚠️  注意：此测试将启动完整的 Electron 应用', 'yellow');
  log('预计耗时: 30-60 秒', 'yellow');

  try {
    await runCommand('npm run test:e2e');
    log('✅ E2E 测试通过', 'green');
    return true;
  } catch (err) {
    log('❌ E2E 测试失败', 'red');
    return false;
  }
}

async function runPerformanceTests() {
  section('⚡ 性能基准测试');

  const benchmarks = [
    { name: '启动时间', script: 'test/performance/benchmark-startup.js' },
    { name: '内存泄漏检测', script: 'test/performance/memory-leak-check.js' },
    { name: '快捷键响应延迟', script: 'test/performance/cpu-delay.js' }
  ];

  let allPassed = true;

  for (const { name, script } of benchmarks) {
    log(`\n🏃 运行: ${name}`, 'cyan');
    try {
      await runCommand(`node ${script}`, ROOT);
      log(`✅ ${name} 完成`, 'green');
    } catch (err) {
      log(`❌ ${name} 失败`, 'red');
      allPassed = false;
    }
  }

  return allPassed;
}

function checkManually() {
  section('📋 手动测试 (Manual Tests)');
  const checklistPath = path.join(ROOT, 'test', 'manual', 'manual-test-checklist.md');

  if (fs.existsSync(checklistPath)) {
    log(`📄 手动测试清单: ${checklistPath}`, 'cyan');
    log('请按清单逐项验证，完成后填写报告', 'yellow');
    console.log('');
    console.log('关键项提醒:');
    console.log('  [P0] 快捷键唤出/隐藏');
    console.log('  [P0] 应用切换内容更新 (WinDbg/Chrome/Word/WPS/微信)');
    console.log('  [P1] 鼠标悬停边框弹出');
    console.log('  [P1] 5秒后自动隐藏');
    console.log('  [P1] 多显示器显示位置');
    console.log('');
    return true; // 手动测试需要人工完成，不扣分
  } else {
    log('❌ 手动测试清单不存在', 'red');
    return false;
  }
}

async function printTestReport() {
  section('📊 测试总结');
  const reqPath = path.join(ROOT, 'test', 'test-cases.md');
  if (fs.existsSync(reqPath)) {
    log('详细测试用例请参考: test/test-cases.md', 'cyan');
  }
  log('性能指标请参考: test/performance-metrics.md', 'cyan');
  log('故障场景库: test/fault-scenarios.md', 'cyan');
  log('测试体系文档: test/README.md\n', 'cyan');
}

async function main() {
  const args = process.argv.slice(2);
  const runAll = args.includes('--all') || args.includes('-a');
  const runE2E = args.includes('--e2e') || args.includes('-e');
  const runPerf = args.includes('--perf') || args.includes('-p');

  section('🐾 KeySense 测试套件');
  log('工作区: ' + ROOT);
  console.log('');

  let results = {
    unit: false,
    e2e: false,
    perf: false,
    manual: false
  };

  try {
    // 单元测试（总是运行）
    results.unit = await runUnitTests();

    // E2E
    if (runAll || runE2E) {
      results.e2e = await runE2ETests();
    } else {
      log('⏭️ 跳过 E2E 测试（使用 --all 或 --e2e 运行）', 'cyan');
    }

    // 性能测试
    if (runAll || runPerf) {
      results.perf = await runPerformanceTests();
    } else {
      log('⏭️ 跳过性能测试（使用 --all 或 --perf 运行）', 'cyan');
    }

    // 手动测试提示
    results.manual = checkManually();

    await printTestReport();

    // 最终汇总
    section('🎯 测试结果汇总');
    const status = {
      '单元测试': results.unit ? '✅ 通过' : '❌ 失败',
      'E2E 测试': results.e2e === false ? '⏭️ 跳过' : (results.e2e ? '✅ 通过' : '❌ 失败'),
      '性能测试': results.perf === false ? '⏭️ 跳过' : (results.perf ? '✅ 通过' : '❌ 失败'),
      '手动测试': '📋 待人工完成'
    };

    for (const [name, stat] of Object.entries(status)) {
      log(`${name}: ${stat}`, results[name] === false ? 'red' : 'green');
    }

    console.log('');
    if (results.unit && results.e2e && results.perf) {
      log('🎉 所有自动化测试通过！发布就绪。', 'green');
    } else {
      log('⚠️  部分测试未通过或跳过，请修复后重试。', 'yellow');
    }

  } catch (err) {
    log(`\n❌ 测试运行失败: ${err.message}`, 'red');
    process.exit(1);
  }
}

main();