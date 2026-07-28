@echo off
cd /d "%~dp0"
title LoRA Captioner [GPU]

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found.
    echo Install Python 3.10+ from https://www.python.org/downloads/
    pause
    exit /b
)

where nvidia-smi >nul 2>&1
if errorlevel 1 (
echo [WARN] NVIDIA driver not found ^(nvidia-smi missing^).
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

echo [*] Upgrading pip...
python -m pip install --upgrade pip
if errorlevel 1 (
    echo [WARN] Failed to upgrade pip, continuing...
)

echo [*] Checking current PyTorch installation...
python -c "import torch; has_cuda = torch.cuda.is_available(); exit(0 if has_cuda else 1)" 2>nul
if errorlevel 1 (
    echo [*] Installing PyTorch ^(CUDA version^)...
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124 --force-reinstall
    if errorlevel 1 (
        echo [ERROR] Failed to install PyTorch
        pause
        exit /b
    )
    echo [*] Verifying CUDA availability...
    python -c "import torch; exit(0 if torch.cuda.is_available() else 1)"
    if errorlevel 1 (
        echo [ERROR] PyTorch installed but CUDA is not available.
        echo    Your NVIDIA driver may be too old for CUDA 12.4.
        echo    Try updating drivers: https://www.nvidia.com/download.aspx
        pause
        exit /b
    )
) else (
    echo [OK] PyTorch with CUDA already installed.
)

echo [*] Installing dependencies...
pip install -r backend\requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b
)

if exist frontend\dist\index.html (
    powershell -Command "exit [int]((Get-Item 'frontend\dist\index.html').LastWriteTime -ge ((Get-ChildItem 'frontend\src' -Recurse -File | Measure-Object -Property LastWriteTime -Maximum).Maximum))"
    if errorlevel 1 goto :skip_build
)

echo [*] Building frontend...
cd frontend
if not exist node_modules\ goto :install_npm
:npm_installed
npm run build
if errorlevel 1 goto :build_failed
cd ..
goto :frontend_ready

:install_npm
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo Install Node.js 18+ from https://nodejs.org/
    pause
    exit /b
)
echo [*] Installing npm packages...
npm install
if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b
)
goto :npm_installed

:build_failed
cd ..
echo [ERROR] Frontend build failed
pause
exit /b

:frontend_ready
:skip_build

:start_server
echo.
echo [*] Starting LoRA Captioner...
echo.
echo    Open http://127.0.0.1:8000
echo.

start http://127.0.0.1:8000

uvicorn app.main:app --host 127.0.0.1 --port 8000 --app-dir backend 2>>backend\backend_err.log

if errorlevel 1 (
    echo [ERROR] Server stopped unexpectedly
    echo    Check backend\backend_err.log for details.
    pause
)
