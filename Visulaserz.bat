@echo off
rem Visulaserz: double-click to start. The first run installs yt-dlp; later runs start straight away.
cd /d "%~dp0"
title Visulaserz

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kur, sonra bunu tekrar ac.
  pause
  exit /b 1
)

if not exist ".venv" (
  echo Ilk kurulum: yt-dlp yukleniyor...
  call npm run setup
  if errorlevel 1 (
    echo Kurulum basarisiz. Python 3 kurulu mu? https://www.python.org  ^(kurarken "Add to PATH" isaretle^)
    pause
    exit /b 1
  )
)

where ffmpeg >nul 2>nul
if errorlevel 1 echo UYARI: ffmpeg yok. YouTube calismaz, dosyalar calisir. Kurmak icin: winget install Gyan.FFmpeg

start "" http://localhost:4777
node server.js
pause
