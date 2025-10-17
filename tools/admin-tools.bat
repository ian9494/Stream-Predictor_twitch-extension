@echo off
REM tools/admin-tools.bat
REM Usage: admin-tools.bat <action> <ADMIN_TOKEN> [market_id]
REM Actions:
REM   export-votes [market_id]  - download votes JSON using curl
REM   reset-leaderboard         - call API to reset leaderboard (requires confirm)

SETLOCAL
if "%~1"=="" (
  echo Usage: %~nx0 ^<action^> ^<ADMIN_TOKEN^> [market_id]
  goto :eof
)

set ACTION=%~1
set TOKEN=%~2
set MARKET_ID=%~3
set HOST=http://localhost:8081

if "%ACTION%"=="export-votes" (
  if "%MARKET_ID%"=="" (
    curl -H "x-admin-token: %TOKEN%" "%HOST%/admin/export-votes" -o votes-all.json
    echo Saved votes-all.json
  ) else (
    curl -H "x-admin-token: %TOKEN%" "%HOST%/admin/export-votes?market_id=%MARKET_ID%" -o votes-%MARKET_ID%.json
    echo Saved votes-%MARKET_ID%.json
  )
  goto :eof
)

if "%ACTION%"=="reset-leaderboard" (
  curl -X POST -H "Content-Type: application/json" -H "x-admin-token: %TOKEN%" -d "{ \"confirm\": \"yes\" }" "%HOST%/admin/reset-leaderboard"
  echo Reset leaderboard requested
  goto :eof
)

echo Unknown action: %ACTION%
ENDLOCAL
