@echo off
rem Starts Q-smart v2 on this PC with your real Firebase project "Q-smart Demo": sign in with Google.
rem The people in invites.local.txt (one "e-mail role" per line) are invited into the demo company.
rem Close this window to stop everything. (Today's app keeps running separately on its own.)
title Q-smart v2 (real sign-in)
cd /d "%~dp0"
if not exist node_modules (
  echo Installing the libraries once, this takes a few minutes...
  call npm.cmd install
)
call npm.cmd run dev:real
echo.
echo Q-smart v2 has stopped. You can close this window.
pause >nul
