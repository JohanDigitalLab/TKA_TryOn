# Laporan audit database live

Tanggal audit: 2026-11-13

Audit dijalankan melalui koneksi PostgreSQL lokal dengan TLS dan CA Supabase. Seluruh query audit berada dalam transaksi `READ ONLY`. Tidak ada `ALTER`, `CREATE`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, `REVOKE`, atau `GRANT` yang dijalankan.

## Pembaruan setelah audit — Tahap 1

Pada 2026-11-13, pengguna menyetujui perubahan scoring, validasi jawaban, atomic submit, dan pencabutan hak pengosongan tabel bagi role API. [Migration Tahap 1](migration-stage-1.sql) beserta koreksinya telah diterapkan dan dikomit sebagai transaksi database; ini bukan commit Git.

Hasil verifikasi:

- 13 kasus helper database lulus: jawaban benar ketiga tipe, opsi asing/duplikat/kosong, kategori parsial, item asing, kategori asing, dan nilai kategori bukan string.
- Autosave kategori parsial tetap didukung; scoring kategori mensyaratkan seluruh item benar.
- Tidak ada hak pengosongan tabel efektif pada kedua role API; ACL helper dan RPC save/submit sesuai pembatasan.
- Waktu save diambil setelah memperoleh lock; submit menggunakan lock dan update bersyarat. Request terlambat ditolak tanpa klaim perubahan status yang akan dibatalkan oleh exception.
- Lint, 17 test aplikasi, dan production build berhasil.
- Tidak ada data siswa, histori, atau pengelompokan simulasi yang diubah.

Belum diverifikasi: isolasi akun A/B, anon melalui API, race request nyata, operator/super admin, dan alur auto-submit pada deadline. Pengujian E2E ditunda karena kredensial pada `.env.test.local` menunjuk project `dzsmeqpysyzrqzrioweu`, sedangkan aplikasi pada `.env.local` menunjuk project `xhuceetgvzcnoiwvbrdu` dan target database yang diaudit berbeda. Kedua login uji ditolak dengan `invalid_credentials`; tidak ada attempt uji yang dibuat. E2E hanya boleh diulang setelah akun dibuat pada project target yang sama. Correctness kategori RPC review belum diperbarui. Default privilege milik pembuat object lain belum dihardening menyeluruh. Temuan di bawah merupakan rekaman kondisi audit awal, bukan seluruhnya kondisi setelah migration.

## Ringkasan inventaris

- 26 tabel public.
- 238 metadata kolom.
- 125 constraint.
- 31 policy RLS.
- 21 fungsi/RPC public.
- 72 index public.
- 10 trigger public.
- Tidak ada view pada schema `public` atau `private` yang ditemukan.
- 8 fungsi pada schema `private`.

Bukti mentah tersimpan lokal dan tidak boleh dikirim bersama kredensial atau data pengguna:

- [`schema-audit.json`](../../.local/database/schema-audit.json)
- [`schema-audit-extra.json`](../../.local/database/schema-audit-extra.json)

## Temuan histori

### Yang sudah tersedia

Tabel `exam_attempts` sudah menyimpan histori per-attempt secara permanen:

- `id`
- `user_id`
- `education_level`
- `grade`
- `subject_name`
- `attempt_status`
- `duration_minutes`
- `total_questions`
- `correct_answers`
- `score`
- `started_at`
- `submitted_at`
- `created_at`

Soal yang dipakai pada attempt juga dibekukan melalui `exam_attempt_questions`, termasuk `question_version_id` dan `question_order`. Jawaban tersimpan pada `exam_attempt_answers` dengan unique key `(attempt_id, question_id)`.

Index histori yang tersedia:

- `(user_id, created_at DESC)` pada `exam_attempts`.
- Unique partial index satu attempt `IN_PROGRESS` per `(user_id, grade, subject_name)`.
- `(attempt_id, question_order)` pada `exam_attempt_questions`.
- `(attempt_id)` pada `exam_attempt_answers`.

### Yang belum tersedia

Audit tidak menemukan penyimpanan server untuk:

- `simulationId`.
- Grup atau sesi multi-mapel.
- Urutan subject dalam satu simulasi.
- `activityType`.
- Status penyelesaian satu simulasi multi-mapel.
- RPC/view histori resmi dengan pagination.

Kesimpulan: histori per-attempt dapat dibuat tanpa migration besar. Histori multi-mapel permanen tidak boleh menebak grup berdasarkan waktu atau urutan attempt dari browser; diperlukan kontrak schema baru atau penggantian desain sesi.

## Temuan RPC ujian

### Ownership dan timer

RPC berikut menggunakan `SECURITY DEFINER`, owner `postgres`, `search_path` yang dibatasi, dan memeriksa `auth.uid()`:

- `start_exam_attempt`
- `resume_exam_attempt`
- `save_exam_answer`
- `submit_exam_attempt`
- `get_exam_attempt_review`

`resume_exam_attempt` dan `save_exam_answer` mengunci baris attempt dengan `FOR UPDATE`. `save_exam_answer` memeriksa status `IN_PROGRESS`, batas waktu server, dan membership question. `get_exam_attempt_review` memeriksa ownership serta hanya mengizinkan status `SUBMITTED`. RPC start/resume tidak mengirim field kunci jawaban.

### Defect correctness pada submit

`submit_exam_attempt` hanya memasukkan kondisi benar untuk `PG_TUNGGAL`. Tipe `PGK_MA` dan `PGK_KATEGORI` tidak masuk kondisi tersebut, sehingga jawaban benar untuk kedua tipe itu tetap tidak dihitung sebagai benar.

`get_exam_attempt_review` sudah membandingkan opsi untuk `PG_TUNGGAL` dan `PGK_MA`, tetapi belum memberikan nilai correctness untuk `PGK_KATEGORI` karena cabangnya mengembalikan `NULL`.

### Validasi payload yang masih kurang

`save_exam_answer` memvalidasi:

- Payload berbentuk object.
- `option_codes` berupa array string tanpa duplikat.
- `category_answers` berupa object.
- Struktur umum sesuai tipe soal.
- Question termasuk dalam attempt.

Namun, audit definisi fungsi belum menemukan validasi bahwa:

- Setiap `option_code` benar-benar tersedia pada `question_version_id` tersebut.
- `category_answers` hanya memakai item number yang tersedia.
- Setiap category answer termasuk pilihan kategori yang diizinkan pada item tersebut.

Hal ini harus diperbaiki agar payload arbitrer tidak dapat disimpan dan agar perhitungan nilai memakai domain jawaban yang valid.

## Temuan RLS dan grant

RLS aktif pada seluruh tabel public yang diaudit. Untuk tabel attempt:

- Siswa hanya memiliki policy `SELECT` untuk attempt miliknya sendiri.
- Jawaban dan daftar soal dibatasi melalui relasi ke attempt milik user.
- Mutation attempt dilakukan melalui RPC, bukan grant table langsung.
- Grant `EXECUTE` RPC exam diberikan kepada `authenticated`, tidak kepada `anon`.

Temuan hardening penting: metadata privilege efektif menunjukkan `TRUNCATE` tersedia bagi role `anon` dan `authenticated` pada tabel public. RLS tidak membatasi `TRUNCATE`. Hak ini tidak diperlukan oleh aplikasi siswa dan harus dicabut dari role API.

Default privilege schema `public` juga menunjukkan grant luas pada object tabel dan fungsi untuk role API. Perlu dilakukan hardening default privilege dengan hati-hati agar migration berikutnya tidak kembali memberikan hak berlebih. Pencabutan privilege harus diverifikasi terhadap kebutuhan Supabase/PostgREST dan tidak boleh dilakukan bersamaan dengan perubahan histori tanpa rencana rollback.

## Rencana perubahan yang disarankan

### Tahap 1 — correctness dan security RPC

1. Perbaiki algoritme penilaian untuk `PG_TUNGGAL`, `PGK_MA`, dan `PGK_KATEGORI` dengan satu fungsi/aturan perbandingan yang konsisten.
2. Simpan atau hitung hasil per-item secara deterministik dari snapshot `question_version_id`.
3. Lengkapi correctness review untuk kategori.
4. Validasi kode opsi dan kategori terhadap snapshot question sebelum upsert jawaban.
5. Pastikan submit mengunci attempt dengan `FOR UPDATE` dan update bersyarat status `IN_PROGRESS`.
6. Cabut `TRUNCATE` dari `anon` dan `authenticated` setelah verifikasi hak yang diperlukan oleh platform.
7. Tetapkan default privilege public yang minimal untuk object baru.

### Tahap 2 — histori permanen

Opsi A, risiko paling rendah:

- Tambahkan RPC histori per-attempt yang membaca `exam_attempts` milik `auth.uid()`.
- Gunakan pagination keyset atau page terbatas dengan urutan `(created_at DESC, id DESC)`.
- Frontend results membaca skor server, bukan skor dari `sessionStorage`.
- `sessionStorage` hanya dipakai sebagai fallback transisi atau cache tampilan.

Opsi B, untuk histori simulasi multi-mapel:

- Tambahkan tabel sesi simulasi yang memiliki owner `user_id`, `activity_type`, `grade`, waktu, dan status.
- Tambahkan tabel anggota sesi atau foreign key `simulation_session_id` pada attempt.
- Simpan `subject_order` di server.
- Tambahkan RPC start/complete/history dengan ownership `auth.uid()` dan pagination.
- Siapkan backfill hanya untuk attempt baru; attempt lama ditampilkan sebagai histori per-attempt karena tidak memiliki identitas grup yang dapat dipercaya.

Opsi B membutuhkan keputusan produk sebelum SQL migration ditulis. Tidak boleh mengisi grup lama berdasarkan urutan attempt atau `sessionStorage`.

## Verifikasi wajib sebelum eksekusi write

Pengujian harus menggunakan akun staging terpisah:

1. Anon ditolak pada seluruh RPC exam dan histori.
2. User A tidak dapat membaca atau memutasi attempt User B.
3. Question di luar attempt ditolak.
4. Opsi/kategori yang tidak tersedia ditolak.
5. Save setelah deadline atau submit ditolak.
6. Submit bersamaan dan save-versus-submit tetap atomik.
7. Skor semua tipe soal konsisten dengan review.
8. Histori hanya mengembalikan data owner dan pagination stabil.
9. Tidak ada field kunci pada start/resume.
10. Tidak ada `TRUNCATE` efektif bagi role API setelah hardening.

Belum ada perubahan database yang diterapkan. Migration baru boleh dijalankan setelah rencana tahap yang dipilih disetujui secara eksplisit.
