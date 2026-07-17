@echo off
setlocal
cd /d "%~dp0"

echo This creates an installable Android APK using Expo EAS Build.
echo You will be prompted to install or sign in to EAS if needed.
echo.
call npx.cmd expo-doctor || goto :error
call npx.cmd eas-cli login || goto :error
call npx.cmd eas-cli init || goto :error
call npx.cmd eas-cli build --platform android --profile preview || goto :error
pause
exit /b 0

:error
echo.
echo The APK build stopped because a command failed. Review the error above.
pause
exit /b 1
