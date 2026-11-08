@echo off
title Byte Runner PRACTICE (keep this window open)
cd /d "%~dp0"
node tools\practice.js
if errorlevel 1 pause
