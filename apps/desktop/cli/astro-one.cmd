@echo off
setlocal DisableDelayedExpansion
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0..\..\..\..\Astro One.exe" --expose-internals "%~dp0..\..\..\app.asar\astro-one\node_modules\@astro-one\desktop-host\lib\cli.js" %*
exit /b %errorlevel%
