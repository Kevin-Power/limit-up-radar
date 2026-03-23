@echo off
REM Daily update script - run after market close (after 2:30 PM)
REM Usage: scripts\update.bat [YYYY-MM-DD]
cd /d "%~dp0\.."
set PYTHONPATH=.
python scripts/classify_and_save.py %*
echo.
echo Done! Data saved. Run 'vercel --prod' to deploy.
