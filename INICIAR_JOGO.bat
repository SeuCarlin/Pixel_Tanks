@echo off
setlocal
cd /d "%~dp0"

if exist "%~dp0node.exe" (
  set "TANK_NODE=%~dp0node.exe"
) else (
  where node.exe >nul 2>nul
  if errorlevel 1 (
    echo Node.js nao foi encontrado. Use a pasta portatil exportada ou instale Node.js 20+.
    pause
    exit /b 1
  )
  set "TANK_NODE=node.exe"
)

echo Preparando servidor multiplayer do TankDots Wars...
"%TANK_NODE%" scripts\host-launcher.mjs
pause
