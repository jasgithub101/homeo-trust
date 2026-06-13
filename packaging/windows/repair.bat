@echo off
REM Homeo Trust - REPAIR (use only if the app can no longer connect to its
REM database, e.g. the .env file was lost or the DB password got out of sync).
REM
REM This regenerates the secret key (AUTH_SECRET) and the database password in a
REM fresh .env and re-applies that password to the EXISTING database, WITHOUT
REM deleting any data. Your patients, cases, and uploaded files are preserved.
REM
REM Effects: everyone is signed out (new secret key) and must log in again. Your
REM administrator account and its current password are NOT changed.
setlocal
cd /d "%~dp0"
set "NODE=%~dp0node\node.exe"
set "HT=%~dp0lib\ht.mjs"

echo This will regenerate .env and re-sync the database password against your
echo existing data in data\pgdata. No data is deleted. Everyone is signed out.
set /p "OK=Type YES to continue: "
if /I not "%OK%"=="YES" (
  echo Cancelled.
  pause
  exit /b 0
)

echo Stopping the database...
"%NODE%" "%HT%" db-stop

echo Repairing secrets + database password...
"%NODE%" "%HT%" repair || goto :fail

echo Starting the database...
"%NODE%" "%HT%" db-start || goto :fail

echo.
echo Repair complete. Run start.bat to use the app again.
echo.
pause
exit /b 0

:fail
echo.
echo Repair FAILED. See messages above. Your data has not been deleted.
echo.
pause
exit /b 1
