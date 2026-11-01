@echo off
setlocal
cd /d "%~dp0"
if exist node.exe (set "TANK_NODE=%~dp0node.exe") else (set "TANK_NODE=node.exe")
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install-tunnel.ps1
if errorlevel 1 goto fim
"%TANK_NODE%" scripts\public-launcher.mjs
:fim
pause
