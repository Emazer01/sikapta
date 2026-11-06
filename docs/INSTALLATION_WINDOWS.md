# Panduan Instalasi & Pengoperasian SIKAPTA AI (Windows)

Dokumen ini memandu pemasangan lengkap SIKAPTA AI pada sistem operasi Windows 10/11 64-bit dengan pemrosesan CPU-only.

---

## 1. Prasyarat Sistem

1. **Sistem Operasi**: Windows 10 atau Windows 11 (64-bit).
2. **Python**: Python 3.11 atau lebih baru (termasuk Python 3.12, 3.13, 3.14). Pastikan opsi *"Add python.exe to PATH"* dicentang saat instalasi.
3. **Node.js & NPM**: Node.js v18 atau v20+ LTS (dilengkapi `npm.cmd`).
4. **Basis Data**:
   - PostgreSQL 14+ lokal (port default 5432) **ATAU**
   - SQLite lokal (aktif secara otomatis jika PostgreSQL tidak terpasang).
5. **Kamera**: Webcam laptop, USB Camera, atau IP Camera yang mendukung RTSP.

---

## 2. Pemasangan Otomatis Cepat (Quick Setup)

Buka terminal PowerShell pada direktori proyek `sikapta-ai`:

```powershell
# 1. Jalankan pemeriksaan kesiapan lingkungan
.\scripts\check_environment.ps1

# 2. Jalankan skrip setup otomatis
.\scripts\setup_windows.ps1
```

Skrip `setup_windows.ps1` akan:
- Membuat file konfigurasi `.env`.
- Membuat virtual environment Python `.venv`.
- Menginstal seluruh pustaka backend (FastAPI, OpenCV, PyTorch, MediaPipe, Ultralytics, dll.).
- Mengunduh model AI (`pose_landmarker_lite.task` dan `yolov8n-pose.pt`).
- Melakukan inisialisasi dan migrasi database PostgreSQL.
- Menginstal dependensi frontend dan melakukan build produksi.

---

## 3. Menjalankan Aplikasi SIKAPTA AI

Cukup jalankan satu perintah:

```powershell
.\scripts\start_windows.ps1
```

Aplikasi akan otomatis aktif:
- **Frontend Dashboard**: `http://localhost:5173`
- **Backend API & Swagger Docs**: `http://localhost:8000/docs`

Untuk menghentikan layanan, tekan sembarang tombol pada terminal PowerShell peluncur.

---

## 4. Konfigurasi Manual Basis Data PostgreSQL

Jika Anda ingin membuat database secara manual melalui psql / pgAdmin:
```sql
CREATE DATABASE sikapta_ai;
```
Pastikan kredensial di file `.env` telah disesuaikan:
```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/sikapta_ai
```

---

## 5. Menjalankan Pengujian Otomatis (Automated Tests)

```powershell
# Uji Backend (Pytest)
.\.venv\Scripts\pytest.exe

# Uji Frontend (Vitest)
Set-Location frontend
npm.cmd test
```

---

## 6. Troubleshooting

- **Error PowerShell ExecutionPolicy**: Jika script `.ps1` ditolak, jalankan PowerShell sebagai pengguna dan aktifkan izin eksekusi script:
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
  ```
- **Kamera tidak terdeteksi**: Pastikan aplikasi lain (seperti Zoom/Teams) tidak sedang mengunci kamera USB.
- **Port 8000 atau 5173 sudah digunakan**: Anda dapat mengubah port di `backend/app/main.py` dan `frontend/vite.config.ts`.

