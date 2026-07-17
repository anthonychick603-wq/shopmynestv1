@echo off
setlocal
cd /d "%~dp0"
call npx.cmd expo start --clear
