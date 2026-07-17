@echo off
setlocal
cd /d "%~dp0"

echo Checking Node.js...
where node >nul 2>nul || (
  echo Node.js was not found. Install Node.js 20.19 or newer, then run this file again.
  pause
  exit /b 1
)

node --version
npm.cmd --version

echo.
echo Installing project packages...
call npm.cmd install || goto :error

echo.
echo Aligning packages with Expo SDK 54...
call npx.cmd expo install --fix || goto :error

echo.
echo Running Expo Doctor...
call npx.cmd expo-doctor || goto :error

echo.
echo Setup completed successfully.
echo Run start-android.cmd to open the development server.
pause
exit /b 0

:error
echo.
echo Setup stopped because a command failed. Review the error above.
pause
exit /b 1
