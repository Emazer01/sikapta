<#
.SYNOPSIS
    Script Pemeriksaan Kesiapan Lingkungan Windows untuk SIKAPTA AI
#>

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SIKAPTA AI - Pemeriksaan Kesiapan Lingkungan (Windows)   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Periksa Python
Write-Host "[1/5] Memeriksa Python..." -NoNewline
try {
    $pyVer = & python --version 2>&1
    Write-Host " OK ($pyVer)" -ForegroundColor Green
} catch {
    Write-Host " GAGAL! Python tidak terdeteksi di PATH." -ForegroundColor Red
}

# 2. Periksa Node.js & NPM
Write-Host "[2/5] Memeriksa Node.js & NPM..." -NoNewline
try {
    $nodeVer = & node --version 2>&1
    $npmVer = & npm.cmd --version 2>&1
    Write-Host " OK (Node $nodeVer, NPM $npmVer)" -ForegroundColor Green
} catch {
    Write-Host " GAGAL! Node.js atau npm.cmd tidak terdeteksi." -ForegroundColor Red
}

# 3. Periksa PostgreSQL
Write-Host "[3/5] Memeriksa Konektivitas PostgreSQL (localhost:5432)..." -NoNewline
try {
    $tcp = Test-NetConnection -ComputerName localhost -Port 5432 -WarningAction SilentlyContinue
    if ($tcp.TcpTestSucceeded) {
        Write-Host " OK (Port 5432 Terbuka / Aktif)" -ForegroundColor Green
    } else {
        Write-Host " PERINGATAN (Port 5432 tidak merespons, SIKAPTA AI akan otomatis menggunakan fallback SQLite)" -ForegroundColor Yellow
    }
} catch {
    Write-Host " GAGAL memeriksa port PostgreSQL." -ForegroundColor Red
}

# 4. Periksa Virtual Environment Python
Write-Host "[4/5] Memeriksa Virtual Environment Python (.venv)..." -NoNewline
if (Test-Path ".venv\Scripts\python.exe") {
    Write-Host " OK (.venv ditemukan)" -ForegroundColor Green
} else {
    Write-Host " BELUM ADA. Jalankan scripts/setup_windows.ps1 untuk membuatnya." -ForegroundColor Yellow
}

# 5. Periksa Model AI
Write-Host "[5/5] Memeriksa File Bobot Model AI (data/models)..." -NoNewline
$mpLite = "data\models\pose_landmarker_lite.task"
$yoloPt = "data\models\yolov8n-pose.pt"
if ((Test-Path $mpLite) -and (Test-Path $yoloPt)) {
    Write-Host " OK (MediaPipe & YOLO siap)" -ForegroundColor Green
} else {
    Write-Host " BELUM LENGKAP. Jalankan 'python scripts/download_models.py'." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Pemeriksaan selesai. Untuk memulai SIKAPTA AI, jalankan 'scripts/start_windows.ps1'." -ForegroundColor Cyan

