# Deployment BossFight — manual, belum diterapkan live

## Urutan migrasi exact

Cadangkan database, review diff dan uji staging terisolasi dahulu. Dokumen ini bukan izin menjalankan migrasi live.

1. Skema ujian existing dan [stage 1](database/migration-stage-1.sql), termasuk schema private dan helper penilaian.
2. Migrasi ujian/exercise existing, termasuk [start student exercise](database/migration-start-student-exercise.sql) dan [start TKA tryout](database/migration-start-tka-tryout.sql) yang menyediakan helper privat dispatch.
3. [Generic exam attempt](database/migration_generic_exam_attempt.sql) — sumber tunggal dan kanonik untuk `public.submit_exam_attempt`, `public.save_exam_answer`, `public.resume_exam_attempt`. Migration lain tidak boleh mendefinisikan ulang ketiga fungsi ini; perubahan apa pun (mis. filter tambahan) dilakukan hanya di berkas ini.
4. [Gamification foundation](database/migration-gamification-foundation.sql). Menyiapkan settings/tips/log, kolom gamification_app, XP, estimasi, tabel virtual pet/map adventure, serta timeout.
5. [BossFight](database/migration-bossfight.sql), terakhir, satu transaksi. Memperlebar attempt_type, menyiapkan state/config privat, RPC dan trigger gate. Gate sesi BossFight pada generic RPC sudah termasuk di berkas generic (langkah 3) dan bergantung pada `private.bossfight_sessions` dari langkah ini, sehingga jalankan ulang [generic exam attempt](database/migration_generic_exam_attempt.sql) setelah BossFight saat pertama kali deploy.

Migrasi BossFight aman diulang; existing state dan konfigurasi tidak dihapus. Saat memperbarui sesi yang sudah berjalan dari versi lama, review snapshot settings legacy terlebih dahulu; migration tidak otomatis mengganti mode sesi lama.

## Kontrak RPC dan konfigurasi

Entry point server tetap [public.bossfight(p_action text, p_payload jsonb DEFAULT '{}') RETURNS jsonb](database/migration-bossfight.sql:109). Actions bootstrap/settings/start/batch/finish dan bentuk payload dijelaskan pada [kontrak API](bossfight-api.md). Tidak ada perubahan signature yang diperlukan. Respons questions memuat seluruh batch outstanding dan **answer_keys untuk sesi baru**, sesuai kebutuhan review. Terapkan ulang migrasi BossFight untuk mengaktifkannya; pool sesi lama tidak diubah. Kunci dapat dilihat lewat browser: ini tradeoff game, bukan anti-cheat ujian. Penilaian serta reward tetap diverifikasi server. Batch menerima lebih dari satu record terurut, maksimal100/64 KiB, tetapi tidak boleh mengirim jawaban sesudah KO.

Signature publik tetap [submit_exam_attempt(uuid)](database/migration_generic_exam_attempt.sql:12), [save_exam_answer(uuid,uuid,jsonb)](database/migration_generic_exam_attempt.sql:88), dan [resume_exam_attempt(uuid)](database/migration_generic_exam_attempt.sql:159), semuanya mengembalikan jsonb. Gate BossFight berada langsung di body fungsi pada berkas generic; dispatch exercise/tryout memakai helper privat existing. Tidak ada lagi fungsi `*_legacy_*` untuk ketiga RPC ini.

Tabel [private.bossfight_config](database/migration-bossfight.sql:79) memiliki satu baris singleton=true. death_initial dan death_additional masing-masing default10, integer1–100. Hanya pemilik database/operator tepercaya boleh mengubahnya. Initial berlaku pada sesi death baru; additional dibaca saat refill. Tidak ada konfigurasi ini di settings pengguna. Death tidak mengambil1000 soal; refill hanya saat exhausted, mengecualikan semua soal sesi sebelumnya. Bank yang habis mengakhiri sesi.

Profil harus punya education_level sd/smp/sma, nickname/full_name, xp_score; subject_code bersufiks jenjang. Soal dan versi PUBLISHED, estimasi positif maksimal5 menit. Jangan mutasi versi published selama sesi aktif. Audit RLS dan RPC lain di instalasi; trigger gate melindungi attempt/soal/jawaban BossFight dari jalur penulisan lain.

Aplikasi hanya memakai URL/publishable key Supabase existing dan JWT bearer pengguna. Tanpa service-role key. Tidak ada secret atau URL database dibutuhkan oleh tes lokal.

## Verifikasi lokal

[Database tests](../tests/bossfight-database.test.mjs) dan [schema tests](../tests/gamification-schema.test.mjs) memakai Node test runner. Integrasi PGlite opt-in melalui environment BOSSFIGHT_PGLITE_MODULE berisi path absolut ke entry dist/index.js paket di direktori sementara di luar proyek. Database dibuat di memori; tidak memakai kredensial atau koneksi live. Tanpa variabel, tes integrasi ditandai skip, bukan dianggap lulus.

Pada Windows gunakan direktori sementara sistem, termasuk short path bila nama pengguna mengandung spasi. Instalasi yang ditemukan pada audit berada di temporary bossfight-db-tests; tidak menambah dependency atau mengubah lockfile proyek.

Cakupan: deploy ulang, defaults/missing/save, auth/ownership, batch nyata dan rollback order invalid, retry identik, limited cap, refill death configurable, tanpa kunci, published/jenjang/estimasi, tiga tipe jawaban lewat helper asli, HP/heal/timeout, hasil GAMIFICATION/BOSSFIGHT, XP tepat1/log singular, persistence hanya terpakai, serta penolakan generic/direct writes.

Hasil verifikasi lokal 24 November 2026: kedua file tes dijalankan dengan PGlite aktif, 6 tes lulus, 0 gagal, 0 skip. Pemeriksaan whitespace diff tujuh file audit exit0. Tidak ada dependency/lockfile diubah.

Audit ini tidak menjalankan build/UI/backend tests karena dikerjakan parent. Smoke test Supabase staging, browser berautentikasi, dan concurrency lintas koneksi belum dilakukan. Tidak ada migrasi live atau commit.

## Rollback

Transaksi gagal rollback otomatis. Setelah deployment berhasil dan ada attempt GAMIFICATION, jangan drop state atau mempersempit tipe kolom. Nonaktifkan endpoint dahulu, pertahankan state untuk audit. DBA harus meninjau dependensi sebelum mengembalikan body generic RPC; jangan menimpa definisi secara membabi-buta.
