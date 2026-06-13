@echo off
REM Homeo Trust - UPDATE to a new version.
REM Replaces ONLY the app\ and tools\ folders from a new release. Your database
REM (data\), uploaded files (data\attachments\), and secret key (.env) are NEVER
REM touched. After updating, start.bat applies any new migrations automatically.
REM
REM Usage:
REM   1. Close the running app (close the start.bat window).
REM   2. Unzip the NEW HomeoTrust release somewhere (e.g. Downloads).
REM   3. Run:  update.bat  "C:\path\to\new\HomeoTrust"   (the unzipped new folder)
REM   4. Run start.bat.
setlocal
cd /d "%~dp0"
set "SRC=%~1"

if "%SRC%"=="" (
  set /p "SRC=Path to the unzipped NEW release folder: "
)
if not exist "%SRC%\app\server.js" (
  echo ERROR: "%SRC%" does not look like a Homeo Trust release ^(no app\server.js^).
  pause
  exit /b 1
)
if not exist "%SRC%\tools\seed.cjs" (
  echo ERROR: "%SRC%" is missing tools\. Aborting.
  pause
  exit /b 1
)

echo Make sure the app is CLOSED (the start.bat window is not open).
pause

echo Replacing app\ ...
robocopy "%SRC%\app" "%~dp0app" /MIR /NJH /NJS /NFL /NDL || if errorlevel 8 goto :fail
echo Replacing tools\ ...
robocopy "%SRC%\tools" "%~dp0tools" /MIR /NJH /NJS /NFL /NDL || if errorlevel 8 goto :fail

REM Optionally refresh node\ if the release bumped it (only if present in SRC).
if exist "%SRC%\node\node.exe" (
  echo Refreshing node\ ...
  robocopy "%SRC%\node" "%~dp0node" /MIR /NJH /NJS /NFL /NDL || if errorlevel 8 goto :fail
)

echo.
echo Update applied. data\ and .env were left untouched.
echo Now run start.bat (it will apply any new migrations).
echo.
pause
exit /b 0

:fail
echo.
echo Update FAILED during copy. See messages above. Your data\ and .env are unchanged.
echo.
pause
exit /b 1
