@echo off
REM Compatibility wrapper — product is PostPath by 1stStep.ai
setlocal
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Open-PostPath.ps1"
pause
