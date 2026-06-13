@echo off
REM Homeo Trust - START (run every time you want to use the app).
REM Ensures the database is up, applies any new migrations (idempotent), then
REM runs the app on http://127.0.0.1:8787 (loopback only). Close this window to stop.
setlocal
cd /d "%~dp0"
set "NODE=%~dp0node\node.exe"
set "HT=%~dp0lib\ht.mjs"

if not exist "%~dp0.env" (
  echo ERROR: .env not found. Run setup.bat first.
  pause
  exit /b 1
)

echo Checking the app is not already running...
"%NODE%" "%HT%" check-port || goto :fail

echo Ensuring the database is up (local mode only; skipped if remote)...
"%NODE%" "%HT%" db-start || goto :fail

echo Applying any new database migrations...
"%NODE%" "%HT%" migrate || goto :fail

echo Opening your browser at http://127.0.0.1:8787 ...
start "" "http://127.0.0.1:8787"

echo.
echo Homeo Trust is running. KEEP THIS WINDOW OPEN. Close it to stop the app.
echo.
"%NODE%" "%HT%" serve
exit /b 0

:fail
echo.
echo Could not start. See the messages above.
echo.
pause
exit /b 1
