# Audit database dan histori — status implementasi

## Batas bukti

Audit live database telah dijalankan pada 2026-11-13 melalui koneksi PostgreSQL lokal dengan TLS CA Supabase. Audit menggunakan transaksi `READ ONLY` dan tidak menerapkan perubahan SQL. Detail temuan tersedia pada [LIVE_AUDIT_REPORT.md](LIVE_AUDIT_REPORT.md). Bukti mentah berada di folder lokal yang diabaikan Git.

Histori multi-mapel masih berasal dari sessionStorage: belum permanen, tidak lintas perangkat, dan bukan sumber nilai terpercaya. Histori per-attempt sudah tersimpan pada tabel database aktual, tetapi belum memiliki kontrak RPC/view histori resmi.

Gunakan [audit-readonly.sql](audit-readonly.sql) untuk audit ulang. Skrip tidak membaca jawaban/profil pengguna. Definisi fungsi dan default kolom tetap harus ditinjau untuk memastikan tidak memuat rahasia sebelum dibagikan. Jangan mengirim token, password, data pengguna, atau service-role key.

## Pembaruan Tahap 1 — 2026-11-13

Migration awal dan koreksi Tahap 1 telah diterapkan ke Supabase melalui TLS dalam transaksi. Sumber SQL: [migration-stage-1.sql](migration-stage-1.sql).

- Scoring ketiga tipe soal memakai snapshot versi soal; opsi asing/duplikat dan kategori/item asing ditolak.
- Jawaban kategori parsial tetap sah untuk autosave, tetapi tidak mendapat nilai benar sampai seluruh item terjawab benar. Nilai kategori harus berupa string.
- Save dan submit mengunci attempt; waktu save diperiksa setelah memperoleh lock. Submit terlambat ditolak. Penolakan transaksi tidak menyimpan perubahan status kedaluwarsa.
- Tidak ada privilege pengosongan tabel efektif bagi kedua role API. Helper internal tidak dapat dieksekusi oleh keduanya; RPC save/submit tetap tersedia hanya bagi role terautentikasi.
- 13 kasus integrasi helper database lulus, menggunakan versi soal yang sudah tersedia tanpa mengubah data siswa. Lint, 17 pengujian regresi, dan production build lulus.
- Histori dan frontend histori tidak diubah. Belum ada commit atau push.

Batas verifikasi: belum diuji end-to-end memakai akun A/B, operator, super admin, atau request bersamaan. Correctness kategori pada RPC review belum diselaraskan; default privilege milik pembuat object lain masih membutuhkan hardening terpisah.

Pengujian E2E ditunda atas keputusan pengguna. Kredensial pada `.env.test.local` menunjuk project Supabase yang berbeda dari aplikasi pada `.env.local` dan target database yang telah diaudit, sehingga kedua login ditolak dengan `invalid_credentials`. Tidak ada attempt uji yang dibuat. Pengujian tidak boleh dilanjutkan sampai dua akun dibuat pada project yang sama dengan target aplikasi/database.

Tabel temuan berikut merekam kondisi saat audit awal, sebelum Tahap 1.

## Temuan dan tindakan

| Area | Bukti aktual | Status / tindakan |
| --- | --- | --- |
| Autentikasi import | Server memverifikasi token melalui Supabase dan memeriksa super_admin atau permission | Fail-closed pada error; RPC dan policy sudah diaudit live |
| Attempt CBT | RPC exam memakai ownership `auth.uid()`, timer server, dan lock pada save/resume | Ownership dan status cukup terlindungi; submit belum menghitung `PGK_MA`/`PGK_KATEGORI` |
| Kunci sebelum submit | start/resume hanya mengirim opsi dan kategori tanpa field kunci | Tidak ditemukan paparan kunci sebelum submit pada definisi RPC; tetap wajib uji response aktual |
| Validasi jawaban | save memeriksa bentuk payload dan membership question | Belum memvalidasi kode opsi/kategori terhadap isi question; perlu diperbaiki |
| Bank soal | Policy relasi question/options/version membatasi akses admin | Perlu pengujian runtime dengan akun siswa, operator, super_admin, dan anon |
| Administrasi | RPC admin memakai `SECURITY DEFINER` dan permission helper | Tetap perlu matriks uji eskalasi dan publication boundary |
| SECURITY DEFINER | Fungsi exam owner `postgres`, `search_path` dibatasi, EXECUTE anon false | Default privilege public terlalu luas; privilege `TRUNCATE` efektif tersedia pada role API dan harus dicabut |
| Histori | `exam_attempts` menyimpan histori per-attempt; frontend masih memakai sessionStorage untuk rekap simulasi | Buat RPC histori per-attempt; histori multi-mapel memerlukan kontrak schema baru |

## Kebutuhan kontrak histori (bukan nama kolom/RPC baru)

Setelah schema resmi tersedia, tentukan query/view/RPC berdasarkan tabel aktual. Kontrak harus menyediakan:

- Identitas pemilik diambil dari auth.uid(), bukan parameter user yang dipercaya begitu saja.
- Pagination deterministik dengan urutan waktu dan ID attempt; batas jumlah hasil.
- Identitas attempt, status, mapel, kelas, waktu mulai/selesai dan ringkasan nilai yang bersumber dari server.
- Jenis aktivitas dan pengelompokan simulasi multi-mapel hanya jika tersimpan di server; jangan menebak dari urutan attempt.
- Review dan kunci hanya untuk attempt selesai milik pemanggil.
- Kebijakan attempt lama: apakah tersedia metadata simulasi; bila tidak, tampilkan per-attempt tanpa mengarang grup.
- Strategi index, migration, rollback, backfill dan retensi setelah tabel diketahui.

## Matriks uji wajib sebelum persetujuan database

Gunakan staging dan dua akun siswa terpisah (A/B), operator terbatas, super_admin, serta anon. Jangan memakai service-role untuk pengujian RLS pengguna.

1. Anon ditolak pada start/save/submit/review/history dan mutation administrasi.
2. A tidak bisa membaca/mengubah/submit/review attempt B, termasuk melalui ID tebakan dan query tabel langsung.
3. A tidak bisa menyimpan jawaban untuk question yang bukan anggota attempt; jawaban setelah deadline/submit ditolak.
4. Submit ulang dan submit bersamaan tidak menggandakan skor atau attempt; save-versus-submit harus atomik.
5. Start/resume tidak mengirim jawaban benar maupun penjelasan; review sebelum selesai ditolak.
6. Operator hanya dapat menjalankan permission yang diberikan, tidak dapat menaikkan akses sendiri atau menerbitkan draft tanpa izin.
7. Histori A hanya berisi attempt A; pagination stabil, hasil konsisten dengan review, tetap tersedia setelah logout/perangkat berganti.
8. Error tidak membocorkan detail SQL sensitif. Verifikasi EXECUTE grant dan policy untuk semua overload fungsi.

## Spreadsheet

Dependency SheetJS dikunci ke distribusi resmi CDN versi 0.20.3, bukan versi npm 0.18.5 yang memiliki advisory prototype pollution dan ReDoS. Lockfile menyimpan integrity paket. Batas file 10 MB, 20 sheet, 10000 baris/100 kolom per sheet dan 250000 sel total; header prototype dan duplikat ditolak. Parser tidak mengeksekusi formula.

Batas range diperiksa setelah parsing. Batas ini bukan jaminan menghadapi seluruh ZIP bomb atau waktu CPU patologis. Worker/isolasi proses dan batas waktu/memori merupakan hardening lanjutan; jangan mengklaim proteksi DoS menyeluruh.
