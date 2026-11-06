# SIKAPTA AI - Arsitektur Keamanan Sistem

Dokumen ini menjabarkan implementasi kontrol keamanan informasi, autentikasi, dan perlindungan privasi dalam sistem SIKAPTA AI.

---

## 1. Autentikasi & Otorisasi

- **Password Hashing**: Menggunakan algoritma **PBKDF2-HMAC-SHA256** dengan *salt* acak kriptografis 16-byte dan 100.000 iterasi. Tidak ada kata sandi yang disimpan dalam bentuk teks polos (*plaintext*).
- **Token Akses**: Menggunakan JSON Web Tokens (JWT) dengan penandatanganan algoritma HMAC-SHA256 (HS256) dan waktu kedaluwarsa terkonfigurasi.
- **Role-Based Access Control (RBAC)**:
  - `admin`: Hak penuh konfigurasi sistem, audit log, pengguna, dan aturan gerakan.
  - `examiner`: Hak membuat peserta, memulai sesi uji langsung, dan mencetak laporan.
  - `operator`: Hak memantau dan mengoperasikan stream kamera.

---

## 2. Keamanan Kredensial Kamera & RTSP

1. **Masking Kredensial**: Password RTSP tidak pernah dikembalikan (*excluded*) dalam skema respons API publik (`CameraResponse`).
2. **Isolasi Jaringan**: Koneksi RTSP ditangani melalui backend service dalam thread terisolasi dengan timeout connection yang ketat untuk mencegah SSRF (*Server-Side Request Forgery*).
3. **Pemberian Izin Eksplisit**: Validasi skema URL (`rtsp://`) diterapkan sebelum membuka koneksi kamera.

---

## 3. Perlindungan Privasi Peserta

- **Kebijakan Penyimpanan Video**: Sistem tidak menyimpan rekaman video penuh secara permanen. Hanya telemetri sudut sendi, hitungan repetisi, dan metadata evaluasi yang disimpan ke database PostgreSQL.
- **Audit Logging**: Setiap aksi penting (`CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `START_SESSION`, `STOP_SESSION`) dicatat secara otomatis dalam tabel `audit_logs` bersama ID pengguna dan timestamp.
- **CORS Eksplisit**: Pembatasan domain asal (*origins*) diterapkan secara ketat pada middleware FastAPI.

