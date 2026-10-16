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

echo Iniciando TankDots Wars em http://localhost:3000
start "" "http://localhost:3000"
"%TANK_NODE%" server\index.js
pause
