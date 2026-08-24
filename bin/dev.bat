@echo off
setlocal
cd /d "%~dp0.."
call pnpm run watch
exit /b %errorlevel%
