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
- `/school`: portal membership aktif, status pengajuan, dan penerimaan transfer koordinator pada akun tujuan sendiri.
- `/school/register`: signup staf tanpa pendidikan siswa, verifikasi email, pengajuan sekolah, serta status/catatan reviewer. Akun existing dapat langsung masuk.
- `/school/join`: preview undangan kelas dan konfirmasi permintaan siswa setelah login/verifikasi; akun baru diarahkan kembali ke portal undangan.
- `/school/manage`: admin sekolah mengelola kontak, kelas, undangan siswa, permintaan, perpindahan/nonaktivasi siswa, serta proposal/pembatalan transfer primary.
- `/school/messages`: pengumuman seluruh sekolah, pesan privat/laporan siswa ke admin, tanda dibaca sendiri, forwarding pesan asli menjadi tiket, pembuatan/balasan/penutupan tiket.
- `/admin/schools`: review pending/approved/rejected oleh superadmin atau operator berizin; pesan platform, tiket dan pemulihan koordinator khusus superadmin.
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

Mutation tugas serta onboarding hanya melalui RPC yang memeriksa identitas dan role/permission di database. Tabel onboarding tidak ditulis langsung oleh client. Pengelolaan kelas, invite, dan membership memakai kontrak tahap 4 pada [SCHOOL_ONBOARDING.md](docs/database/SCHOOL_ONBOARDING.md). UI tidak memberikan role dari metadata, tidak memakai service credentials, dan tidak membuat API backend baru. Payment gateway sengaja **ditunda**: checkout, transaksi, dan entitlement tidak diaktifkan. Evaluasi topik tidak menebak topik dari urutan soal dan hanya bekerja bila metadata review server tersedia.

### Onboarding sekolah: operasi dan batas kontrak

**UI onboarding sudah diimplementasikan; backend tahap 4 baru diimplementasikan/dry-run dengan rollback, belum diterapkan live.** Frontend menampilkan pesan rollout belum tersedia bila RPC belum terpasang. Commit/push kode tidak menerapkan migrasi database. Deployment hosting belum diverifikasi; pengujian E2E browser multi-role belum dilakukan. Penerapan backend tetap membutuhkan persetujuan rollout terpisah dan prosedur pemilik backend.

1. Staf membuka `/school/register`, membuat akun atau memakai akun existing, lalu memverifikasi email. Pendidikan hanya untuk signup siswa; staf dapat menuju portal sekolah tanpa prompt pendidikan siswa. Profil siswa yang terbuka di editor sebelumnya tidak ada sebagai route pada checkout ini; tidak ditambahkan prompt global baru.
2. Ajukan data sekolah lengkap dan pernyataan kewenangan. NPSN **wajib tepat 8 angka**, termasuk nol di depan. Tidak ada alur tanpa NPSN/manual, penyimpanan draft, pengeditan aplikasi pending, atau status needs_revision. Penolakan dapat diikuti pengajuan baru sebagai histori baru.
3. Superadmin memberikan izin `school_onboarding.review` melalui Manajemen Admin kepada operator aktif bila dibutuhkan. Reviewer membuka `/admin/schools`; tidak boleh menilai pengajuan sendiri. Persetujuan final membuat sekolah dan designated primary secara atomik di server. Layout admin existing hanya memeriksa sesi, bukan gate superadmin; route baru memeriksa konteks reviewer dan RPC tetap menjadi batas otorisasi.
4. Admin membuat kelas sesuai jenjang sekolah (SD 1–6, SMP 7–9, SMA 10–12) dan tahun berurutan. Rename tidak mengganti grade/tahun; untuk kenaikan kelas buat kelas baru lalu pindahkan siswa. Arsip ditolak selama masih ada siswa/request pending dan mencabut undangan kelas.
5. Undangan siswa memakai kode bearer 64 karakter; tampilkan/bagikan hanya kepada siswa tujuan. Link mengarah ke `/school/join?code=...`. Login/signup mempertahankan tujuan lokal melalui parameter next; signup tidak lagi menyimpan schoolCode sebagai metadata yang seolah membuat membership. Email callback juga harus diizinkan pada konfigurasi Supabase Redirect URLs. Kode dalam link adalah rahasia; jangan bagikan log URL/referrer. Preview tidak memakai slot, konfirmasi memesan satu slot request, approval admin tetap wajib. Retry kode sama mengambil status lama, tidak reaktivasi. Status request dapat diperiksa dengan pengiriman ulang eksplisit kode yang sudah diketahui; backend belum menyediakan daftar request milik siswa. Penolakan/expiry/revocation tidak mengembalikan slot.
6. Admin mengirim pengumuman **seluruh sekolah**, bukan kelas tertentu, atau pesan privat ke anggota aktif. Siswa mengirim laporan privat ke admin aktif. RLS existing tidak memberi siswa direktori admin; admin dapat membagikan ID kontaknya dari halaman Pesan melalui pengumuman/saluran sekolah. Siswa memasukkan ID tersebut dan RPC memvalidasi penerima. Tidak ada pembukaan email directory atau bypass RLS. Platform juga tidak mendapat direktori anggota; UI menyediakan pengumuman sekolah atau pesan privat dengan ID penerima yang diketahui, tetap divalidasi RPC. Receipt hanya milik pembaca sendiri.
7. Admin dapat meneruskan satu pesan asli secara eksplisit sebagai tiket; body diambil server, bukan diketik ulang/diubah klien. Tiket/reply baru tidak idempotent. Semua mutasi memiliki lock double-submit, tombol/fieldset disabled saat pending, error/status aksesibel, konfirmasi eksplisit untuk keputusan/destruksi, serta reload tanpa retry mutasi otomatis. Jika respons jaringan tidak pasti, muat ulang daftar sebelum mengirim ulang untuk menghindari duplikasi.
8. Hanya primary yang ditunjuk dapat propose transfer. Proposal berlaku tujuh hari; proposal baru membatalkan pending sebelumnya. **Tidak ada email otomatis**: hubungi calon penerima manual agar masuk/daftar staf dengan email tujuan terverifikasi, membuka `/school`, dan menerima dalam konteks akunnya sendiri. Jangan berbagi sesi/password. Penerimaan menonaktifkan primary lama dan mempertahankan histori. Student sekolah tersebut tidak boleh menjadi target coordinator. Admin legacy tanpa primary memerlukan recovery eksplisit superadmin. Recovery tidak menunjuk paksa dan tetap butuh acceptance target; ID proposal ditampilkan untuk disimpan/dibatalkan. Backend tidak menyediakan daftar transfer platform, sehingga pembatalan superadmin memakai ID proposal.

Guru legacy tetap memakai scope assignment tingkat sekolah dari tahap 3. Tidak ada teacher invitation/promotion UI baru; otorisasi per kelas/mapel masih pekerjaan berikutnya. UI tidak mengubah engine CBT, snapshot assignment, atau histori. Daftar backend dibatasi: 200 pengajuan platform, 500 sekolah, 200 pesan, 100 tiket sekolah, 200 tiket platform; belum ada pagination. Verifikasi legal NPSN/dokumen, CAPTCHA/rate limit gateway, email transfer otomatis dan pembayaran tidak termasuk.

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

Target verifikasi adalah seluruh unit test, lint global tanpa error/warning, dan build produksi berhasil. Suite frontend onboarding pada [school-onboarding.test.mjs](tests/school-onboarding.test.mjs) mencakup validasi kontrak murni, perlindungan redirect lokal, payload aplikasi/kelas/transfer, retensi tujuan undangan, error aman dan pemeriksaan wiring sumber UI. Ini bukan pengganti pengujian browser multi-role terhadap backend yang telah diterapkan.

## UX student dan aksesibilitas

Alur student mendukung navigasi internal tanpa reload pada dashboard, pemilihan mapel, konfigurasi sesi, dan halaman hasil. Histori dari database menjadi sumber kebenaran ketika RPC berhasil; `sessionStorage` hanya menjadi fallback transisi ketika RPC histori gagal. Empty state histori hasil dibedakan dari kegagalan pemuatan data, sesi ujian aktif ditampilkan sebagai aksi untuk melanjutkan, dan validasi pemilihan mapel diumumkan sebagai pesan yang dapat dibaca pembaca layar.

Halaman CBT menggunakan dialog konfirmasi native, target sentuh yang lebih besar, status autosave/timer yang tidak mengumumkan setiap detik, label navigasi soal yang menyatakan status jawaban, serta dukungan `prefers-reduced-motion`. Halaman subscription bersifat informasional sampai payment gateway, validasi webhook, dan rekonsiliasi transaksi dikonfigurasi. Visual global memakai permukaan off-white, garis tipis, hierarki tipografi yang tegas, dan aksen biru tanpa menjadikan gradient, shadow besar, atau rounded card sebagai pola utama.

Pemeriksaan mencakup unit test, lint, build produksi, dan dry-run migration dengan integration test database yang di-rollback. Lihat panduan workflow sekolah untuk cakupan serta keterbatasan. Pengujian visual pada perangkat mobile, pembaca layar, dan E2E browser tetap perlu dilakukan secara manual.
