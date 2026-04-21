#!/bin/bash

# 启动脚本：KeySense 快捷键感知器
# 适用于 Windows WSL2 环境

set -e

echo "🚀 启动 KeySense 快捷键感知器..."

# 确保在项目根目录
cd /mnt/d/Montarius/source/shortcut-guide

# 安装依赖（如果需要）
echo "📦 安装依赖..."
npm install

# 启动 Electron 应用
echo "⚡ 启动应用..."
npm start

# 保持终端打开（用于调试）
echo "✅ 应用已启动，按 Ctrl+C 退出"
read -r -p "按回车键退出..." 
