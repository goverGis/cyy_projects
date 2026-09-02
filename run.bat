@echo off
setlocal
REM ============================================================
REM  Territory Division System  --  one-click launcher
REM    Backend  FastAPI  ->  http://127.0.0.1:8000
REM    Frontend Vite     ->  http://localhost:3000
REM
REM  Prerequisites:
REM    1) PostgreSQL 13 + PostGIS service running (port 5432)
REM    2) Database "webgis_territory" created and seeded
REM       (see README.md  Quick Start)
REM
REM  Usage: just double-click this file.
REM
REM  NOTE: this file is intentionally ASCII-only and does NOT use
REM  "chcp". Mixing chcp with non-ASCII text inside a .bat file
REM  makes cmd.exe mis-parse the script and the window closes
REM  instantly -- that was the reason the old version failed.
REM ============================================================

echo.
echo ============================================
echo   Territory Division System - starting up
echo ============================================
echo.

REM ---------- 1/2  backend ----------
echo [1/2] Backend  FastAPI  -^>  http://127.0.0.1:8000
cd /d "%~dp0api"
if errorlevel 1 (
  echo   ERROR: cannot enter folder "%~dp0api"
  goto :fail
)
if not exist ".venv\Scripts\python.exe" (
  echo   ERROR: .venv\Scripts\python.exe not found in "%CD%"
  echo   Create the venv and install deps first:
  echo     python -m venv .venv
  echo     .venv\Scripts\python.exe -m pip install -r requirements.txt
  goto :fail
)
start "WebGIS-Backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

REM ---------- 2/2  frontend ----------
echo [2/2] Frontend Vite     -^>  http://localhost:3000
cd /d "%~dp0frontend"
if errorlevel 1 (
  echo   ERROR: cannot enter folder "%~dp0frontend"
  goto :fail
)
if not exist "node_modules" (
  echo   ERROR: node_modules not found in "%CD%"
  echo   Install frontend deps first:  npm install
  goto :fail
)
start "WebGIS-Frontend" cmd /k "npm run dev"

echo.
echo Both services were launched in their own windows.
echo   Backend  window title: WebGIS-Backend
echo   Frontend window title: WebGIS-Frontend
echo.
echo Waiting a few seconds for Vite to compile, then opening the browser...
timeout /t 8 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo Done. Open http://localhost:3000 if the browser did not pop up.
echo Close a service window to stop that service, or run stop.bat.
echo.
echo If the backend window shows a connection error, the PostgreSQL
echo service is probably not running. Start "postgresql-x64-13" in
echo Windows Services, then close both windows and run this again.
echo.
pause
exit /b 0

:fail
echo.
echo Startup aborted. Read the message above, fix it, then run again.
echo.
pause
exit /b 1
