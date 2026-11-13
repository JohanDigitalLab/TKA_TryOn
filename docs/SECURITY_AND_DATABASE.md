# Keamanan dan Kontrak Database TKA TryOn

## Status pekerjaan

Perubahan repository yang sudah diterapkan:

- `.env.local` tetap diabaikan Git melalui `.gitignore`; gunakan `.env.example` sebagai template tanpa secret.
- Endpoint import dan health check AI melakukan autentikasi server-side dari Bearer token.
- Endpoint import memeriksa `super_admin` atau permission `bank_soal.import` melalui database.
- Respons error API tidak meneruskan pesan mentah dari provider AI.
- Endpoint AI structuring dikonsolidasikan ke `src/lib/server/ai-structure.js`.
- Validasi body JSON, ukuran request, metadata, instruksi, dan output AI dilakukan sebelum data dikembalikan ke client.
- Semua hasil AI diberi status `NEEDS_HUMAN_REVIEW`; AI tidak boleh menjadi sumber publikasi langsung.

## Tindakan eksternal yang wajib dilakukan

Tindakan berikut tidak dapat dilakukan hanya dari repository:

1. Jika `GROQ_API_KEY` pernah terlihat dalam log, chat, screenshot, commit, atau deployment yang tidak aman, revoke dan buat key baru di dashboard Groq.
2. Periksa audit log Supabase dan rotasi key yang terlanjur terekspos.
3. Pastikan `GROQ_API_KEY` hanya disimpan sebagai environment variable server dan tidak memakai prefix `NEXT_PUBLIC_`.
4. Aktifkan/konfirmasi RLS pada seluruh tabel yang diakses client.
5. Verifikasi fungsi RPC bersifat `SECURITY INVOKER` atau memiliki pemeriksaan pemanggil yang eksplisit dan tidak dapat dieksploitasi melalui parameter.
6. Batasi permission admin di database, bukan hanya menyembunyikan tombol pada UI.

## Kontrak database yang harus diekspor/didokumentasikan

Repository saat ini belum berisi migration SQL. Sebelum membuat migration baru, ekspor schema resmi dari Supabase agar foreign key, enum, return type, dan policy tidak ditebak.

Objek yang dirujuk aplikasi:

- Tabel: `profiles`, `user_global_roles`, `questions`, `question_versions`, `question_stimuli`, `question_options`, `question_category_items`.
- RPC ujian: `start_exam_attempt`, `save_exam_answer`, `get_exam_attempt_review`, `submit_exam_attempt`.
- RPC admin: `admin_has_permission`, `admin_operator_list_candidates`, `admin_operator_set_access`.
- RPC import: `save_ai_question_draft_batch`.
- RPC editor: `save_question_revision`.

Checklist untuk setiap RPC:

- Pemanggil terautentikasi.
- User hanya dapat membaca/mengubah data miliknya sendiri.
- `attempt_id`, `question_id`, dan user ID diverifikasi di dalam fungsi.
- Status attempt mencegah submit ganda dan perubahan setelah submit.
- Timer ditentukan server/database.
- Draft import tidak dapat menjadi soal published tanpa review/permission.
- Fungsi tidak memiliki `search_path` yang tidak aman.
- Hak `EXECUTE` tidak diberikan ke `public` tanpa validasi internal.

## Histori hasil ujian

Engine CBT menyimpan attempt dan jawaban melalui RPC database, sedangkan rekap multi-subject pada halaman hasil masih memakai `sessionStorage`. Perubahan permanen ke database membutuhkan kontrak resmi untuk query histori, misalnya RPC/view yang mengembalikan:

- daftar attempt milik user aktif;
- subject, grade, activity type, dan simulation/session ID;
- status, score, jumlah benar, jumlah salah/kosong;
- review soal hanya setelah attempt selesai;
- urutan sesi multi-subject.

Jangan menambahkan nama RPC atau kolom baru sebelum signature resmi tersedia. Setelah kontrak tersedia, halaman results harus memakai database sebagai sumber kebenaran dan menjadikan `sessionStorage` hanya cache transisi.

## Verifikasi lokal

```bash
npm run lint
npm run build
```

Lint pada area API/server yang diperbarui harus bersih dari error. Lint global masih dapat melaporkan warning/error lama pada page besar yang belum direfaktor.
