@echo off
setlocal
cd /d "%~dp0.."
call corepack enable
call pnpm install
exit /b %errorlevel%
