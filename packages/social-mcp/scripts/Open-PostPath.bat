@echo off
setlocal
title PostPath by 1stStep.ai
cd /d "%~dp0\.."
echo.
echo  PostPath by 1stStep.ai
echo  Checking Node.js 20+ and launching the desk...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Open-PostPath.ps1"
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo  Something went wrong ^(exit %ERR%^). See messages above.
  echo  Need Node 20+? https://nodejs.org
  echo.
  pause
  exit /b %ERR%
)
