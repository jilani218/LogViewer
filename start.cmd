@echo off
REM Launches the adb-bridge for the Logcat Viewer.
REM   start.cmd                 default port 8037
REM   start.cmd --port 9000     custom port
REM   set ADB=C:\path\adb.exe ^&^& start.cmd
REM
REM If adb is not found, downloads Google's official platform-tools zip
REM into .\platform-tools\ and uses that. No admin / winget required.
setlocal

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [X] node not found on PATH. Install Node.js 18+ from https://nodejs.org/ and retry. 1>&2
  exit /b 1
)

REM Resolve adb: explicit %ADB% > local .\platform-tools > system PATH > auto-install
set "ADB_RESOLVED="
if defined ADB (
  set "ADB_RESOLVED=%ADB%"
) else if exist "%~dp0platform-tools\adb.exe" (
  set "ADB_RESOLVED=%~dp0platform-tools\adb.exe"
) else (
  where adb >nul 2>&1 && set "ADB_RESOLVED=adb"
)

if not defined ADB_RESOLVED (
  echo [!] adb not found - installing Android platform-tools locally...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $u='https://dl.google.com/android/repository/platform-tools-latest-windows.zip'; $z=Join-Path $env:TEMP 'platform-tools.zip'; Write-Host ('  > downloading ' + $u); Invoke-WebRequest -Uri $u -OutFile $z -UseBasicParsing; Write-Host '  > extracting into .\platform-tools\'; Expand-Archive -Path $z -DestinationPath '.' -Force; Remove-Item $z"
  if errorlevel 1 (
    echo [X] failed to install platform-tools. Bridge will start anyway; device listing will fail until adb is available. 1>&2
    set "ADB_RESOLVED=adb"
  ) else (
    set "ADB_RESOLVED=%~dp0platform-tools\adb.exe"
    echo   ^> adb ready at %~dp0platform-tools\adb.exe
  )
)

set "ADB=%ADB_RESOLVED%"

if not defined PORT set "PORT=8037"

REM Open the viewer in the default browser once the server is up
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process 'http://localhost:%PORT%/'" >nul 2>&1

node adb-bridge.js %*
