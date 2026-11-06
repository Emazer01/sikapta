<#
.SYNOPSIS
    Script Otomatisasi Instalasi & Setup SIKAPTA AI pada Windows
#>

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SIKAPTA AI - Otomatisasi Setup & Instalasi (Windows)    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$rootPath = Split-Path -Parent $PSScriptRoot

# 1. Konfigurasi .env jika belum ada
$envFile = Join-Path $rootPath ".env"
$envExample = Join-Path $rootPath ".env.example"
if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envFile
    Write-Host "[OK] Membuat file konfigurasi .env dari .env.example" -ForegroundColor Green
}

# 2. Virtual Environment Python
$venvPath = Join-Path $rootPath ".venv"
$pythonExe = Join-Path $venvPath "Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    Write-Host "[*] Membuat Python virtual environment (.venv)..." -ForegroundColor Yellow
    & python -m venv $venvPath
    Write-Host "[OK] Virtual environment berhasil dibuat." -ForegroundColor Green
}

# 3. Instalasi Dependensi Backend
Write-Host "[*] Menginstal dependensi backend Python..." -ForegroundColor Yellow
& $pythonExe -m pip install --upgrade pip
& $pythonExe -m pip install -r (Join-Path $rootPath "backend\requirements.txt")
& $pythonExe -m pip install email-validator

# Daftarkan direktori backend ke sys.path melalui .pth
$pthFile = Join-Path $venvPath "Lib\site-packages\sikapta.pth"
Set-Content -Path $pthFile -Value (Join-Path $rootPath "backend")
Write-Host "[OK] Dependensi backend berhasil diinstal dan path didaftarkan." -ForegroundColor Green

# 4. Unduh Model AI
Write-Host "[*] Mengunduh bobot model MediaPipe Pose & YOLO Pose..." -ForegroundColor Yellow
& $pythonExe (Join-Path $rootPath "scripts\download_models.py")
Write-Host "[OK] Model AI siap di data/models." -ForegroundColor Green

# 5. Inisialisasi Database
Write-Host "[*] Inisialisasi dan migrasi database SIKAPTA AI..." -ForegroundColor Yellow
Set-Location (Join-Path $rootPath "backend")
& $pythonExe -m app.core.init_db
Set-Location $rootPath
Write-Host "[OK] Database PostgreSQL berhasil disiapkan." -ForegroundColor Green

# 6. Instalasi Dependensi Frontend
Write-Host "[*] Menginstal dependensi React Frontend..." -ForegroundColor Yellow
Set-Location (Join-Path $rootPath "frontend")
& npm.cmd install
Write-Host "[*] Melakukan build frontend..." -ForegroundColor Yellow
& npm.cmd run build
Set-Location $rootPath
Write-Host "[OK] Frontend berhasil di-build." -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Setup SIKAPTA AI Selesai! Siap Dijalankan.               " -ForegroundColor Green
Write-Host "  Jalankan scripts/start_windows.ps1 untuk memulai.        " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

