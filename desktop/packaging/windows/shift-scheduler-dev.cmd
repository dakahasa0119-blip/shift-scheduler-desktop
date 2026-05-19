@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%\..\..\.." >nul
if errorlevel 1 exit /b 1

if exist "%SCRIPT_DIR%\..\runtime\node.exe" (
  "%SCRIPT_DIR%\..\runtime\node.exe" desktop\dist\shift-scheduler.cjs %*
) else (
  node desktop\dist\shift-scheduler.cjs %*
)
set "EXIT_CODE=%ERRORLEVEL%"

popd >nul
exit /b %EXIT_CODE%
