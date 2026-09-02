@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM  Territory Division System  --  stop both dev servers
REM  Kills whatever is LISTENING on port 8000 (backend)
REM  and 3000 / 3001 / 3002 (frontend, Vite may shift ports).
REM
REM  ASCII-only on purpose: see the note in run.bat.
REM ============================================================

echo.
echo Stopping WebGIS dev servers (ports 8000 / 3000 / 3001 / 3002)...
echo.

set "KILLED=0"
for %%P in (8000 3000 3001 3002) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /r /c:":%%P *LISTENING"') do (
    echo   port %%P  ->  killing PID %%I
    taskkill /PID %%I /F >nul 2>&1
    set "KILLED=1"
  )
)

if "!KILLED!"=="0" (
  echo   Nothing was listening on those ports - already stopped.
)

echo.
echo Done. Double-click run.bat to start again.
echo.
pause
