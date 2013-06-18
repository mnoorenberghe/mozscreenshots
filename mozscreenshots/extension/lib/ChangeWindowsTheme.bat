@echo OFF

REM   This Source Code Form is subject to the terms of the Mozilla Public
REM   License, v. 2.0. If a copy of the MPL was not distributed with this
REM   file, You can obtain one at http://mozilla.org/MPL/2.0/.

REM The first argument is the full path to the Windows theme.
Set _ThemePath=%1

CALL :dequote _ThemePath

@echo %_ThemePath%

setlocal ENABLEEXTENSIONS
set KEY_NAME="HKCU\Software\Microsoft\Windows\CurrentVersion\Themes"
set VALUE_NAME=CurrentTheme

FOR /F "usebackq skip=2 tokens=3*" %%A IN (`REG QUERY %KEY_NAME% /v %VALUE_NAME% 2^>nul`) DO (
    set ValueValue=%%A %%B
)

if defined ValueValue (
    @echo Value Value = %ValueValue%
) else (
    @echo %KEY_NAME%\%VALUE_NAME% not found.
)

if /i "%ValueValue%" == "%_ThemePath%" (
  @echo "Trying to change to existing theme. Quitting"
  Goto :eof
)

rundll32.exe %SystemRoot%\system32\shell32.dll,Control_RunDLL %SystemRoot%\system32\desk.cpl desk,@Themes /Action:OpenTheme /file:"%_ThemePath%"

REM ===== helpers =====

:DeQuote
for /f "delims=" %%A in ('echo %%%1%%') do set %1=%%~A
Goto :eof
