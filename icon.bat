@echo off
setlocal

REM Kaynak ikon klasoru
set "SRC=C:\Users\salih\icons"

REM Scriptin bulundugu (mevcut) klasor
set "BASE=%~dp0"
if "%BASE:~-1%"=="\" set "BASE=%BASE:~0,-1%"

REM Mevcut klasorde icons hedefi
set "DEST=%BASE%\icons"
if not exist "%DEST%" mkdir "%DEST%"

REM Dosyalari kopyala (tasima degil)
for %%F in (256.png 16.png 32.png 48.png 128.png) do (
  if exist "%SRC%\%%F" (
    copy /Y "%SRC%\%%F" "%DEST%\" >nul
  ) else (
    echo Bulunamadi: "%SRC%\%%F"
  )
)

echo Bitti.
endlocal