# TKA tryout — migration pending

Status: **implemented in repository, NOT applied or live-verified**. Exported column metadata is not proof of deployed RPCs, constraints, or grants.

## Deployment

Review and apply [migration-start-tka-tryout.sql](migration-start-tka-tryout.sql) in staging first. Prerequisites: existing CBT tables/save/submit/review engine, TKA configuration tables, subject catalog, profile education level, active-account helper from stage 4, and learning-access policy from stage 9. The migration uses the observed nullable TKA code/deadline fields, not the historical configuration UID field. The attempt type is TRYOUT (fits the historical ten-character field).

The migration adds nullable theme/topic classifications (255 characters each). **No automatic copying from element/material**; classify questions explicitly through a separately approved workflow. Until classified, RANDOM quotas can miss and the subject/level fallback supplies questions.

Latest published means highest version number among PUBLISHED versions, regardless of current-version flag or a newer draft. RANDOM quotas match the new independent classifications; SET joins question codes. Both cap at target, exclude duplicates, and fill shortages from published questions of the same subject, grade and level. Insufficient inventory produces a smaller attempt with its actual count; zero inventory raises an error. Global configuration is never rewritten.

## Resume and access

The canonical ownership-checking dispatcher is [migration_generic_exam_attempt.sql](migration_generic_exam_attempt.sql:81). It rejects game-linked attempts (including legacy EXERCISE/TRYOUT tags) and GAMIFICATION, then dispatches by persisted type. No legacy function rename is needed. Inspect the installed bodies and grants before deployment; exported column metadata cannot establish them.

Start serializes by the existing learning-user advisory lock plus user/TKA lock. An unexpired same-user/config non-game attempt is returned before entitlement rechecking; active verified account and matching profile level are still required. New starts consult installed learning-access context: unrestricted or subscribed is accepted. This migration targets stage 9; it deliberately does not implement the retired trial consumption scheme. An older installation fails closed for unsubscribed starts. Only non-game TRYOUT with valid positive duration and an elapsed timer becomes EXPIRED; EXERCISE/ASSIGNMENT and all game sessions are never expired here. Another active subject session returns a conflict result, not a successful attempt or an exception. The legacy one-active-subject uniqueness contract is retained without changing any index or constraint.

The allowlisted CBT response contains ordered questions, nested options/category items, saved answers and server remaining seconds; it excludes correctness flags, category keys and explanations. Save/submit/review functions are unchanged. An expired resume returns zero remaining seconds to permit the existing CBT auto-submit behavior.

The [tryout page](../../src/app/student/tryout/page.js) and [exercise page](../../src/app/student/exercise/page.js) explicitly handle conflict results before navigating or writing exercise configuration. A non-game conflict offers a labelled resume link (latihan/tugas sekolah/tryout); it never silently starts an exercise as tryout. The [challenge page](../../src/app/student/challenge/page.js:147) uses the canonical guarded dispatcher for an attempt ID and requires server attempt type; only TRYOUT activates its timer. Game conflicts disclose no CBT attempt ID and instruct the student to finish in the original game. Unknown/legacy unresumable types require operator inspection. Old exception-only deployments show actionable Indonesian guidance, but cannot offer an attempt ID until SQL is deployed.

## Perbaikan konflik sesi — deployment manual

Penyebab pesan lama: start tryout hanya me-resume konfigurasi TKA yang sama, kemudian memeriksa semua sesi aktif pada siswa/kelas/nama mapel, termasuk EXERCISE, ASSIGNMENT dan GAMIFICATION. UPDATE lama juga menerapkan durasi placeholder latihan ke semua tipe. Audit historis mencatat indeks unik lintas tipe pada [LIVE_AUDIT_REPORT.md](LIVE_AUDIT_REPORT.md:61), tetapi nama/DDL indeks dan kondisi database saat ini belum terverifikasi. Snapshot parsial tidak mencakup indeks. Karena itu perbaikan ini **tidak menghapus/mengganti indeks**, tidak menghapus sesi/jawaban/snapshot, dan tetap menolak pembuatan sesi kedua pada subject yang sama. Game yang masih aktif tetap menghalangi start sesuai kontrak tersebut, dengan arahan yang aman; pemisahan keunikan per tipe memerlukan perubahan produk dan migrasi tersendiri.

1. Jalankan [audit baca-saja](audit-subject-session-conflict.sql:1) secara manual di staging; simpan definisi fungsi/grant untuk rollback. Periksa semua indeks (termasuk indeks yang menopang constraint), predicate, status valid/ready, CHECK, trigger expiry dan signature RPC. Periksa scheduler expiry di luar trigger secara terpisah. Tabel game opsional yang ada harus mempunyai kolom attempt_id yang sesuai. Jika kontrak aktual berbeda, ada duplikasi, atau trigger/scheduler masih meng-expire game/latihan, hentikan rollout untuk ditinjau, jangan menghapus data/constraint.
2. Terapkan [helper konflik](migration-subject-session-conflict.sql:1) terlebih dahulu. Helper privat tidak diberi EXECUTE kepada client. Migrasi ini tidak mengubah sesi saat deployment; expiry hanya terjadi saat start yang terautentikasi.
3. Instalasi baru/staging sesuai prasyarat: jalankan [migrasi tryout](migration-start-tka-tryout.sql:1), [migrasi exercise](migration-start-student-exercise.sql:1), lalu [dispatcher kanonik](migration_generic_exam_attempt.sql:1). Untuk hotfix instalasi yang sudah berjalan: dalam satu transaksi manual, ambil hanya blok lengkap CREATE OR REPLACE FUNCTION public.start_tka_tryout(text) dan public.start_student_exercise(text,integer,text,text) dari kedua migrasi tersebut; akhiri dengan NOTIFY pgrst,'reload schema' dan COMMIT. Jangan menyalin nomor baris, menjalankan DROP signature lama, atau menimpa save/submit yang tidak terkait. CREATE OR REPLACE mempertahankan grant fungsi lama; verifikasi PUBLIC/anon tetap tidak mendapat EXECUTE dan authenticated mendapatnya. Helper boleh dipasang terlebih dahulu karena tidak dipanggil fungsi lama. Audit/pasang dispatcher kanonik jika belum identik, lalu deploy frontend **setelah** RPC tersedia. Arsip migrasi tryout lama memiliki beberapa blok transaksi/save-submit; jangan menganggap seluruh arsip sebagai hotfix atomik tunggal.
4. Jalankan [uji SQL staging](../../tests/database/tka-tryout.sql:1) pada database disposable saja. Uji dua koneksi PostgreSQL serentak: dua start same-config harus memperoleh ID sama dan hanya satu row aktif; start exercise versus tryout harus menghasilkan satu pemenang dan satu konflik bertipe, tanpa unique violation atau progres hilang. Uji juga game versus start melalui endpoint game asli karena lock game bisa berbeda. Uji submit sesi yang ditawarkan lalu mulai tryout kembali. Semua ini wajib lulus sebelum produksi.
5. Rollback aplikasi dan pulihkan definisi start/dispatcher yang disimpan bila diperlukan. Jangan hapus sesi siswa atau memaksa status terminal untuk membuka blokir. Helper yang tidak lagi dipanggil boleh dibiarkan; jangan mencabut dependensi fungsi secara paksa.

Validasi lokal baru: [uji runtime SQL](../../tests/subject-session-database.test.mjs:1) memakai PGlite disposable dengan indeks unik legacy dan body RPC nyata, tanpa kredensial/network DB. Aktifkan melalui variabel lingkungan SUBJECT_SESSION_PGLITE_MODULE yang menunjuk modul PGlite lokal, kemudian jalankan node --test tests/subject-session-database.test.mjs. Fixture lokal memakai schema minimum, bukan replika DB live; pengujian serial ini **bukan bukti konkurensi multi-koneksi produksi**. Tidak ada SQL yang diaplikasikan ke live.

## Validation

Run the local source-contract tests with the project's test command. Run [database integration tests](../../tests/database/tka-tryout.sql) only against disposable staging after deployment; they roll back all changes and require two verified active profiles plus published inventory. They check fallback shortages/cap, duplicate SET mappings, latest published snapshots, answer restoration, expiry, ownership, anonymous denial and grants. Source tests are not SQL execution or proof of concurrency correctness.

Additional staging checks: run two simultaneous authenticated starts for the same idle user/TKA and confirm identical attempt IDs and exactly one new attempt. Test matching RANDOM classification quotas, a published version followed by a newer draft, empty inventory, level mismatch, save/submit/review for all three question types, and an unexpired different-config subject session. Verify legacy exercise and assignment start/resume still work. These integration/concurrency checks must pass before production rollout.

### Validasi lokal perbaikan konflik — 2026-11-25

- Pengujian terarah: 37 lulus; runtime SQL disposable: 6 lulus.
- Suite proyek: 275 lulus, 0 gagal, 4 runtime opsional dilewati. Runtime konflik di atas dijalankan terpisah, bukan hanya dilewati.
- Lint berkas terkait, build produksi dan pemeriksaan whitespace diff: lulus.
- Database live, skrip integration berbasis fixture staging dan konkurensi multi-koneksi: tidak dijalankan. Tidak ada deployment SQL atau perubahan sesi live.

### Local validation — 2026-11-19 (historical)

- Full project lint: passed; whitespace diff check: passed.
- Targeted tryout and CBT helper tests: 8 passed, 0 failed.
- Full suite: 92 passed, 3 failed outside changed implementation: subscription contact expectation, registration subscription-link expectation, and missing login page fixture. Those unrelated files were not changed for this task.
- Production build: blocked by missing local document-processing dependencies (mammoth, pdf-parse, tesseract.js).
- Database migration, SQL integration tests and concurrent-session verification: **not executed**. No live database changes were made.
