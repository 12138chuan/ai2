@echo off
cd /d "%~dp0"
echo.
echo   MLP Quest - local preview
echo   ---------------------------------
echo.
where python >nul 2>nul
if errorlevel 1 goto nopython
start "" "http://127.0.0.1:8080/"
echo   Server started. Browser will open automatically.
echo   URL: http://127.0.0.1:8080/
echo   Close this window to stop the server.
echo.
python -m http.server 8080
goto end
:nopython
echo   Python not found. Opening the page directly instead.
echo.
start "" "%~dp0index.html"
pause
:end