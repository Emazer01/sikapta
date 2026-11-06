# SIKAPTA AI - Dokumentasi & Hasil Pengujian

Dokumen ini memuat laporan hasil pengujian unit (*unit testing*), pengujian integrasi (*integration testing*), dan pengujian antarmuka (*frontend testing*) yang dijalankan pada SIKAPTA AI.

---

## 1. Ringkasan Hasil Pengujian

| Komponen Uji | Framework | Jumlah Kasus Uji | Hasil Eksekusi |
| :--- | :--- | :--- | :--- |
| **Geometri Sendi 3 Titik & Smoothing** | Pytest | 4 Uji | **100% LULUS** |
| **FSM Push-up (Siklus Sah & Penolakan Parsial)** | Pytest | 2 Uji | **100% LULUS** |
| **FSM Sit-up (Siklus Sah & Sudut Torso)** | Pytest | 1 Uji | **100% LULUS** |
| **REST API (Health, Stats, CRUD, Cameras, Rules)** | Pytest + TestClient | 5 Uji | **100% LULUS** |
| **Frontend React Navigation & Brand Rendering** | Vitest + React Testing Library | 1 Uji | **100% LULUS** |
| **Total Keseluruhan** | - | **13 Uji** | **13 Lulus (0 Gagal)** |

---

## 2. Cakupan Skenario Pengujian Unit

### 2.1 Perhitungan Sudut Biomekanika
- Sudut siku tegak lurus ($90^\circ$).
- Garis lurus badan ($180^\circ$).
- Moving average smoothing window.

### 2.2 Validasi State Machine Push-up
- Siklus lengkap: Posisi atas $\to$ turun kedalaman siku $\le 90^\circ$ $\to$ dorong kembali ke posisi atas $\ge 160^\circ$ $\to$ repetisi sah dihitung.
- Penolakan repetisi parsial: Naik kembali saat siku hanya mencapai $\sim 120^\circ$ (belum $\le 90^\circ$) $\to$ gerakan dicatat ditolak dengan feedback `"Kedalaman belum terpenuhi"`.
- Penolakan posture sagging: Kelurusan badan $< 155^\circ$ $\to$ ditolak dengan feedback `"Posisi tubuh perlu diperbaiki"`.

### 2.3 Validasi State Machine Sit-up
- Siklus posisi rebah $\ge 140^\circ \to$ angkat badan $\le 60^\circ \to$ kembali ke rebah $\to$ repetisi sah dihitung.

---

## 3. Cara Menjalankan Uji Otomatis

### Menjalankan Uji Backend:
```powershell
Set-Location backend
..\.venv\Scripts\pytest.exe -v
```

### Menjalankan Uji Frontend:
```powershell
Set-Location frontend
npm.cmd test
```

