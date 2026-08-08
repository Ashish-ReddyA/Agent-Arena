@echo off
title Agent Arena - Local Control
cd /d "%~dp0"
node ".\local-bridge\launcher.mjs"
if errorlevel 1 (
  echo.
  echo Agent Arena could not start. Follow the message above, then try again.
  pause
)
