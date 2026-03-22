@echo off
title 漲停雷達 - Limit Up Radar
color 0A
echo.
echo  ============================================
echo    漲停雷達 - 台股漲停族群AI分析平台
echo  ============================================
echo.
echo  [1] 啟動本地開發伺服器
echo  [2] 部署到 Vercel (更新線上版)
echo  [3] 開啟線上版網站
echo  [4] 開啟 GitHub Repo
echo  [5] 離開
echo.
set /p choice=請選擇 (1-5):

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto deploy
if "%choice%"=="3" goto online
if "%choice%"=="4" goto github
if "%choice%"=="5" goto end

:dev
echo.
echo  正在啟動開發伺服器...
echo  瀏覽器打開 http://localhost:3000
echo  按 Ctrl+C 停止
echo.
start http://localhost:3000
npm run dev
goto end

:deploy
echo.
echo  正在部署到 Vercel...
echo.
call vercel --yes --prod --archive=tgz
echo.
echo  部署完成！
echo  線上版: https://limit-up-radar.vercel.app
pause
goto end

:online
start https://limit-up-radar.vercel.app
goto end

:github
start https://github.com/Kevin-Power/limit-up-radar
goto end

:end
