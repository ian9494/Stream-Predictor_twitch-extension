@echo off
REM tools/admin-tools.bat
REM Interactive admin tools

SETLOCAL EnableDelayedExpansion

:: HOST selection: priority -> 4th arg, ADMIN_HOST env var, default domain
if not "%~4"=="" (
  set HOST=%~4
) else (
  if defined ADMIN_HOST (
    set HOST=%ADMIN_HOST%
  ) else (
    set HOST=https://twitch-extension-api.noctration.dev
  )
)

:: If no arguments, goto interactive label to avoid parenthesized parsing issues
if "%~1"=="" goto interactive

set ACTION=%~1
set TOKEN=%~2
set MARKET_ID=%~3

goto main

:interactive
echo.
echo ==========================
echo        Admin Tools
echo ==========================
echo 1) export-votes
echo 2) reset-leaderboard
echo 3) Exit
echo.
set /p choice=Select option [1-3]: 
if "%choice%"=="3" goto :eof
if "%choice%"=="1" (
  set ACTION=export-votes
  set /p TOKEN=Enter Admin token: 
  set /p MARKET_ID=Enter market id ^(leave blank for all^): 
)
if "%choice%"=="2" (
  set ACTION=reset-leaderboard
  set /p TOKEN=Enter Admin token: 
)
if not defined ACTION (
  echo Invalid choice
  goto :eof
)

:main

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
  set /p CONFIRM=About to reset leaderboard. Confirm [y/N]: 
  :: take first character (handles leading spaces) and compare
  set "_c=!CONFIRM:~0,1!"
  if /I "!_c!"=="y" (
    curl -X POST -H "Content-Type: application/json" -H "x-admin-token: %TOKEN%" -d "{ \"confirm\": \"yes\" }" "%HOST%/admin/reset-leaderboard"
    echo Reset leaderboard requested
  ) else (
    echo Aborted.
  )
  goto :eof
)

echo Unknown action: %ACTION%
ENDLOCAL
