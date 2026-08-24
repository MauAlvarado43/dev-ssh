@echo off
setlocal
cd /d "%~dp0.."
call pnpm run package
exit /b %errorlevel%
