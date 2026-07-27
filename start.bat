@echo off
cd /d "%~dp0"
title LoRA Captioner

where python >nul 2>&1 || (
    echo [ERROR] Python not found.
    echo Install Python 3.10+ from https://www.python.org/downloads/
    pause
    exit /b
)

if not exist venv\ (
    echo [*] Creating virtual environment...
    python -m venv venv
)
call venv\Scripts\activate.bat

echo [*] Installing PyTorch (CPU version)...
pip install --quiet torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

echo [*] Installing dependencies...
pip install --quiet -r backend\requirements.txt

echo [*] Starting LoRA Captioner...
echo.
echo    Open http://localhost:8000
echo.
start http://localhost:8000
uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
