@echo off
rem Starts Q-smart v2 on this PC: the database, Firebase's local sign-in, the server and the pages.
rem Close this window to stop everything. (Today's app keeps running separately on its own.)
title Q-smart v2
cd /d "%~dp0"
if not exist node_modules (
  echo Installing the libraries once, this takes a few minutes...
  call npm.cmd install
)
call npm.cmd run dev
echo.
echo Q-smart v2 has stopped. You can close this window.
pause >nul
