@echo off
setlocal DisableDelayedExpansion
set "signTool=%ASTRO_ONE_DESKTOP_WINDOWS_SIGNTOOL%"
set "certificateFile=%ASTRO_ONE_DESKTOP_WINDOWS_CER_FILE%"
set "tokenPin=%ASTRO_ONE_DESKTOP_WINDOWS_TOKEN_PIN%"
set "keyContainer=%ASTRO_ONE_DESKTOP_WINDOWS_KEY_CONTAINER%"
set "targetFile=%ASTRO_ONE_DESKTOP_WINDOWS_SIGN_TARGET%"
set "appendSignature="
if "%ASTRO_ONE_DESKTOP_WINDOWS_SIGN_APPEND%"=="1" set "appendSignature=/as"
set "ASTRO_ONE_DESKTOP_WINDOWS_SIGNTOOL="
set "ASTRO_ONE_DESKTOP_WINDOWS_CER_FILE="
set "ASTRO_ONE_DESKTOP_WINDOWS_TOKEN_PIN="
set "ASTRO_ONE_DESKTOP_WINDOWS_KEY_CONTAINER="
set "ASTRO_ONE_DESKTOP_WINDOWS_SIGN_TARGET="
set "ASTRO_ONE_DESKTOP_WINDOWS_SIGN_APPEND="
set "signTool=" & set "certificateFile=" & set "tokenPin=" & set "keyContainer=" & set "targetFile=" & set "appendSignature=" & "%signTool%" sign /v /fd sha256 /f "%certificateFile%" /kc "[{{%tokenPin%}}]=%keyContainer%" /csp "eToken Base Cryptographic Provider" %appendSignature% "%targetFile%"
exit /b %errorlevel%
