@echo off
rem Intraday live mode: serves the dashboard and refreshes Market Summary,
rem Heatmap and RRG every minute during market hours (11 AM - 3 PM NPT).
cd /d "%~dp0"
start "" http://127.0.0.1:8765/
python scripts\live_intraday.py %*
