@echo off
TITLE BWB Media - 100%% Free Cloudflare Live Bot
COLOR 0B

echo ==============================================================================
echo 🚀 STARTING BWB MEDIA AI LEAD BOT + CLOUDFLARE SECURE TUNNEL
echo ==============================================================================
echo.

if exist "%~dp0src\server.js" (
    cd /d "%~dp0"
) else (
    cd /d "c:\Users\dell\Documents\antigravity\zealous-mendel"
)

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b
)

:: 2. Start server in a background window
echo [*] Starting BWB Media Server on port 3000...
start "BWB Media Node Server" cmd /k "node src/server.js"

:: 3. Wait 3 seconds for server to initialize
timeout /t 3 /nobreak >nul

:: 4. Start Cloudflare Tunnel
echo [*] Connecting to Cloudflare Global Network...
node scripts/start_tunnel.js

pause
