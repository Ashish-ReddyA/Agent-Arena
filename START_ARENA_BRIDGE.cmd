@echo off
setlocal
cd /d "%~dp0"
where docker >nul 2>nul
if errorlevel 1 (
  echo Docker was not found. Start Docker Desktop, then run this file again.
  pause
  exit /b 1
)
start "Agent Arena Local Bridge" cmd /k "cd /d ""%~dp0local-bridge"" && npm start"
start "Agent Arena Local Dashboard" cmd /k "cd /d ""%~dp0"" && set WRANGLER_LOG_PATH=.wrangler/wrangler.log&& npm exec vinext dev"
echo Starting Agent Arena on this computer...
timeout /t 7 /nobreak >nul
start "" "http://localhost:3000"
echo The local dashboard is opening. Keep both Arena windows running during live sessions.
timeout /t 4 /nobreak >nul
endlocal
