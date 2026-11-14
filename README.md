# TKA TryOn

Platform persiapan, latihan, dan simulasi Tes Kemampuan Akademik (TKA) dengan area peserta dan administrasi konten akademik.

## Teknologi

- Next.js App Router `16.4.5` dan React `19.3.0`.
- JavaScript dengan Tailwind CSS 4.
- Supabase Auth, PostgREST, PostgreSQL RPC, dan RLS.
- Import XLSX/XLS/CSV, DOCX, PDF, gambar, serta OCR.
- Groq AI untuk menstrukturkan soal hasil import. AI selalu menghasilkan draft yang membutuhkan review manusia.

## Menjalankan lokal

1. Instal dependensi:

   ```bash
   npm install
   ```

2. Salin [`.env.example`](.env.example) menjadi `.env.local`, lalu isi kredensial proyek lokal. Jangan commit `.env.local`.

3. Jalankan development server:

   ```bash
   npm run dev
   ```

4. Buka `http://localhost:3000`.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: URL proyek Supabase.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable/anon key untuk client dan request yang dibatasi RLS.
- `GROQ_API_KEY`: key server-only untuk endpoint AI. Jangan menggunakan prefix `NEXT_PUBLIC_`.

Lihat [`.env.example`](.env.example) dan [`docs/SECURITY_AND_DATABASE.md`](docs/SECURITY_AND_DATABASE.md).

## Area aplikasi

- `/`: landing page publik.
- `/register` dan `/login`: autentikasi peserta.
- `/subscription`: informasi paket Siswa Mandiri dan Sekolah. Halaman ini belum mengaktifkan pembayaran, entitlement, atau transaksi nyata.
- `/student`: dashboard peserta.
- `/student/subjects`: pilihan mata pelajaran.
- `/student/missions`: konfigurasi latihan/simulasi.
- `/student/challenge`: engine CBT.
- `/student/results`: rekap, review jawaban, rekomendasi mapel, dan analisis topik bila metadata review tersedia.
- `/school`: dashboard sekolah berbasis membership aktif, kelas, profil akademik siswa, dan undangan yang diizinkan RLS.
- `/teacher`: buat/edit draft tugas kelas, publish/cancel, monitoring submit, dan ranking Top 5 khusus staf sekolah.
- `/student/assignments`: jadwal dan pengerjaan tugas sekolah dengan konfigurasi serta snapshot soal dari server.
- `/admin`: dashboard administrasi.
- `/admin/questions`: bank soal versioned.
- `/admin/import`: Smart Import Center.

## Alur Smart Import

```text
Upload → Extract → Structure → Validate → Review → Save as DRAFT
```

Ekstraksi dokumen tersedia pada `/api/import/extract`. Structuring AI tersedia pada `/api/import/structure`. Keduanya memerlukan autentikasi server dan permission import. Endpoint `/api/groq-test` juga tidak lagi publik dan memerlukan akses Super Admin.

## Database dan keamanan

Migration versioned tersedia dalam [`docs/database`](docs/database). Tahap 1 mengeraskan scoring/submit, tahap 2 menyediakan histori/review, dan tahap 3 menambah tugas kelas, snapshot soal/penerima, workflow guru mutatif, serta ranking Top 5 server-side. Panduan hak akses, penerapan, dry-run, dan rollback tersedia pada [`SCHOOL_WORKFLOWS.md`](docs/database/SCHOOL_WORKFLOWS.md). Schema dasar sekolah dan bank soal tetap mengikuti objek Supabase yang sudah diaudit; migration ini bukan bootstrap database kosong.

Mutation tugas hanya melalui RPC yang memeriksa role sekolah di database. Tabel baru memakai RLS tanpa akses langsung client. Kelas, invite, dan membership tetap tidak dimutasi dari UI. Payment gateway sengaja **ditunda** atas instruksi pengguna: checkout, transaksi, dan entitlement tidak diaktifkan. Evaluasi topik tidak menebak topik dari urutan soal dan hanya bekerja bila metadata review server tersedia.

Sebelum deployment:

- Pastikan RLS dan pemeriksaan user aktif di semua tabel/RPC.
- Pastikan role dan permission admin dibatasi di database.
- Rotasi secret yang pernah terekspos melalui dashboard provider.
- Dokumentasikan schema, signature RPC, foreign key, enum, dan policy sebagai migration versioned.

## Verifikasi

```bash
npm test
npm run lint
npm run build
```

`npm run build` harus berhasil. Lint pada area server/API yang diperbarui harus bersih; lint global dapat masih menemukan masalah lama pada page besar yang belum selesai dipecah, terutama aturan React effect dan dependency hook.

## UX student dan aksesibilitas

Alur student mendukung navigasi internal tanpa reload pada dashboard, pemilihan mapel, konfigurasi sesi, dan halaman hasil. Histori dari database menjadi sumber kebenaran ketika RPC berhasil; `sessionStorage` hanya menjadi fallback transisi ketika RPC histori gagal. Empty state histori hasil dibedakan dari kegagalan pemuatan data, sesi ujian aktif ditampilkan sebagai aksi untuk melanjutkan, dan validasi pemilihan mapel diumumkan sebagai pesan yang dapat dibaca pembaca layar.

Halaman CBT menggunakan dialog konfirmasi native, target sentuh yang lebih besar, status autosave/timer yang tidak mengumumkan setiap detik, label navigasi soal yang menyatakan status jawaban, serta dukungan `prefers-reduced-motion`. Halaman subscription bersifat informasional sampai payment gateway, validasi webhook, dan rekonsiliasi transaksi dikonfigurasi. Visual global memakai permukaan off-white, garis tipis, hierarki tipografi yang tegas, dan aksen biru tanpa menjadikan gradient, shadow besar, atau rounded card sebagai pola utama.

Pemeriksaan mencakup unit test, lint, build produksi, dan dry-run migration dengan integration test database yang di-rollback. Lihat panduan workflow sekolah untuk cakupan serta keterbatasan. Pengujian visual pada perangkat mobile, pembaca layar, dan E2E browser tetap perlu dilakukan secara manual.
