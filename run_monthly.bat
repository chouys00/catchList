@echo off
rem ============================================================
rem run_monthly.bat — 每月排程入口，依序更新動畫、電影與遊戲
rem 供 Antigravity Scheduled Tasks 或 Windows 工作排程器呼叫
rem 輸出完整記錄到 logs\update-<日期時間>.log
rem ============================================================
cd /d "%~dp0"
if not exist logs mkdir logs

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set TS=%%i
set LOGFILE=logs\update-%TS%.log

echo [%date% %time%] 開始每月更新,記錄檔:%LOGFILE%
call npm run update:all >> "%LOGFILE%" 2>&1
set RESULT=%errorlevel%

if %RESULT% neq 0 (
  echo [%date% %time%] 更新失敗 ^(exit code %RESULT%^),詳見 %LOGFILE%
) else (
  echo [%date% %time%] 更新成功完成
)
exit /b %RESULT%
