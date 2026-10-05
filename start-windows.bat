@echo off
chcp 65001 >nul
title Forsatyab - local server
cd /d "%~dp0"
where py >nul 2>nul && (py -3 server\app.py %* & goto end)
where python >nul 2>nul && (python server\app.py %* & goto end)
echo.
echo  Python 3 is not installed.
echo  Download it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
echo.
pause
:end
pause
