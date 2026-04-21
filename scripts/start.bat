@echo off
REM 启动脚本：KeySense 快捷键感知器
REM 适用于 Windows 环境

echo 🚀 启动 KeySense 快捷键感知器...

REM 切换到项目目录
cd /d D:\Montarius\source\shortcut-guide

REM 安装依赖
echo 📦 安装依赖...
call npm install

REM 启动 Electron 应用
echo ⚡ 启动应用...
call npm start

pause
