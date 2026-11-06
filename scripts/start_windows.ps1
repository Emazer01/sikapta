<#
.SYNOPSIS
    Script Peluncur SIKAPTA AI (Backend & Frontend) untuk Windows
#>

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SIKAPTA AI - Memulai Layanan Aplikasi (Windows)         " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$rootPath = Split-Path -Parent $PSScriptRoot
$pythonExe = Join-Path $rootPath ".venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    Write-Host "[GAGAL] Virtual environment tidak ditemukan. Jalankan scripts/setup_windows.ps1 terlebih dahulu." -ForegroundColor Red
    exit 1
}

# Dapatkan IP Lokal untuk akses Jaringan (LAN)
$localIP = "10.74.87.97"

Write-Host "[1/2] Menjalankan SIKAPTA AI Core Service (Backend: http://0.0.0.0:8001)..." -ForegroundColor Yellow
$backendDir = Join-Path $rootPath "backend"
$backendProcess = Start-Process -FilePath $pythonExe -ArgumentList "-m uvicorn app.main:app --app-dir `"$backendDir`" --host 0.0.0.0 --port 8001 --reload" -WorkingDirectory $backendDir -PassThru

Write-Host "[2/2] Menjalankan SIKAPTA AI Dashboard (Frontend: http://0.0.0.0:5173)..." -ForegroundColor Yellow
$frontendProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev -- --host 0.0.0.0" -WorkingDirectory (Join-Path $rootPath "frontend") -PassThru

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  SIKAPTA AI Aktif dan Siap Diakses di Jaringan Lokal!    " -ForegroundColor Green
Write-Host "  Akses Lokal (PC ini)       : http://localhost:5173      " -ForegroundColor Cyan
Write-Host "  Akses Jaringan Lokal (LAN) : http://$($localIP):5173     " -ForegroundColor Yellow
Write-Host "  Backend REST API (LAN)     : http://$($localIP):8001/docs" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Tekan sembarang tombol untuk menghentikan seluruh layanan..." -ForegroundColor Yellow

$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host "[*] Menghentikan SIKAPTA AI..." -ForegroundColor Yellow
Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
Write-Host "[OK] Layanan berhasil dihentikan." -ForegroundColor Green

