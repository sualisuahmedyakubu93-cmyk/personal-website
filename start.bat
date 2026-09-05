@echo off
title Personal Website Server

echo ========================================
echo     Starting Personal Website Server
echo ========================================
echo.

cd /d "%~dp0"

node server.js

pause