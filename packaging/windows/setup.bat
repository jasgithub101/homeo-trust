@echo off
REM Homeo Trust - FIRST-RUN setup (run once). Safe to re-run (idempotent).
REM Generates .env, initializes the local database, applies migrations, seeds
REM the first admin, and prints the temporary admin password.
setlocal
cd /d "%~dp0"
set "NODE=%~dp0node\node.exe"
set "HT=%~dp0lib\ht.mjs"

if not exist "%NODE%" (
  echo ERROR: bundled Node not found at "%NODE%". The package looks incomplete -
  echo re-unzip the original download into an empty folder.
  goto :fail
)

REM Works for BOTH database modes. Local (full package): a bundled PostgreSQL is
REM initialized and started below. Remote (lite package, or a .env you pre-filled
REM with a Neon DATABASE_URL): the db-init/db-start steps detect remote mode and
REM skip themselves. Re-running setup.bat is always safe (idempotent).

echo [1/5] Generating configuration (.env)...
"%NODE%" "%HT%" gen-env || goto :fail

echo [2/5] Initializing the local database (local mode only; skipped if remote)...
"%NODE%" "%HT%" db-init || goto :fail

echo [3/5] Starting the database (local mode only; skipped if remote)...
"%NODE%" "%HT%" db-start || goto :fail

echo [4/5] Applying database migrations...
"%NODE%" "%HT%" migrate || goto :fail

echo [5/5] Creating the first administrator...
"%NODE%" "%HT%" seed || goto :fail

"%NODE%" "%HT%" print-admin
echo Setup complete. Next: double-click start.bat
echo.
pause
exit /b 0

:fail
echo.
echo Setup FAILED. See the messages above. You can re-run setup.bat safely.
echo.
pause
exit /b 1
