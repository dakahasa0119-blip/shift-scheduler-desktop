@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%\..\..\.." >nul
if errorlevel 1 exit /b 1

npx -y -p tsx tsx desktop/app/windowsLauncher.ts %*
set "EXIT_CODE=%ERRORLEVEL%"

popd >nul
exit /b %EXIT_CODE%
