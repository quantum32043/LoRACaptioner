@echo off
cd /d "%~dp0"
title LoRA Captioner [GPU]

where python >nul 2>&1 || (
    echo [ERROR] Python not found.
    echo Install Python 3.10+ from https://www.python.org/downloads/
    pause
    exit /b
)

where nvidia-smi >nul 2>&1
if errorlevel 1 (
    echo [WARN] NVIDIA driver not found (nvidia-smi missing).
    echo    PyTorch will fall back to CPU.
    echo    Install NVIDIA drivers if you have a compatible GPU.
    echo.
)

if not exist venv\ (
    echo [*] Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment
        pause
        exit /b
    )
)
call venv\Scripts\activate.bat

echo [*] Installing PyTorch (CUDA version)...
pip install torch torchvision torchaudio
if errorlevel 1 (
    echo [ERROR] Failed to install PyTorch
    pause
    exit /b
)

echo [*] Installing dependencies...
pip install -r backend\requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b
)

echo [*] Starting LoRA Captioner...
echo.
echo    Open http://localhost:8000
echo.
start http://localhost:8000
uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend

if errorlevel 1 (
    echo [ERROR] Server stopped unexpectedly
    pause
)
