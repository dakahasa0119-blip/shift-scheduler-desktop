@echo off
setlocal

set "APP_ROOT=%~dp0"
cd /d "%APP_ROOT%"
if errorlevel 1 exit /b 1

if exist "desktop\packaging\runtime\node.exe" (
  "desktop\packaging\runtime\node.exe" desktop\dist\shift-scheduler.cjs %*
) else (
  node desktop\dist\shift-scheduler.cjs %*
)

exit /b %ERRORLEVEL%
