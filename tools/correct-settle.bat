@echo off
REM correct-settle.bat
REM 用法: correct-settle.bat <market_id> <correct_option_id> <admin_token> [server_url]
REM 範例: correct-settle.bat myMarket yes myAdmintoken https://twitch-extension-api.noctration.dev

if "%~3"=="" (
  echo 用法: %~nx0 market_id correct_option_id admin_token [server_url]
  exit /b 1
)

set MARKET=%~1
set OPTION=%~2
set TOKEN=%~3
set URL=%~4
if "%URL%"=="" set URL=http://localhost:8081

powershell -NoProfile -Command ^
  "$body = @{ market_id = '%MARKET%'; correct_option_id = '%OPTION%' } | ConvertTo-Json; ^
   try { ^
     $r = Invoke-RestMethod -Uri '%URL%/admin/correct-settle' -Method Post -Body $body -ContentType 'application/json' -Headers @{ 'x-admin-token' = '%TOKEN%' }; ^
     Write-Output 'Response:'; $r | ConvertTo-Json -Depth 5; ^
   } catch { ^
     if ($_.Exception -and $_.Exception.Response) { ^
       $stream = $_.Exception.Response.Content.ReadAsStringAsync().Result; Write-Error $stream; ^
     } else { $_ | Write-Error } ; exit 1 ^
   }"

exit /b %ERRORLEVEL%
