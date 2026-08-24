@echo off
setlocal
cd /d "%~dp0.."
call pnpm run build
exit /b %errorlevel%
