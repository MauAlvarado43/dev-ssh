@echo off
setlocal
cd /d "%~dp0.."
if not exist "node_modules\" call "%~dp0install.bat"
if errorlevel 1 exit /b 1
call pnpm run check
exit /b %errorlevel%
