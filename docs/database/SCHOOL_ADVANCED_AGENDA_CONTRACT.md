# School Advanced SQL/1 — kontrak review-only

**Belum deployed, belum dikonfirmasi live.** [Migration lanjutan](migration-school-advanced-agenda.sql) berakhir rollback. Dependensi wajib: [blockers existing](migration-school-advanced-blockers.sql), bukan menjalankan ulang migrasi historis. Sumber definisi adalah [snapshot lokal](../../.local/database/addendum-02-db.json), hash SHA-256 bf6c2bc274e7def1432142c528fc800243feff4775ae245e80471ff23f99356f. Tidak ada akses network, database, environment secret atau produksi selama implementasi.

## Capability gate untuk parent

Parent **jangan mengintegrasikan/mengaktifkan UI berdasarkan keberadaan file SQL**. Setelah deployment disetujui dan staging lulus, panggil [school_advanced_capabilities(p_school_id uuid)](migration-school-advanced-agenda.sql). Hanya sukses dengan capability_version tepat **school-advanced-sql/1**, assignment_contract = 1, agenda_contract = 1 dan school_id cocok boleh mengaktifkan integrasi versi ini. RPC hilang, akses ditolak, atau versi berbeda berarti unavailable; jangan fallback ke versi x atau akses tabel langsung. Capability menunjukkan kontrak terpasang untuk aktor yang lolos scope, **bukan sertifikasi hasil staging/live**.

Respons capability juga menyatakan single_set_package = true, max_attempts = 1, full_duration_start = true, revocation_finalize = deny, school_reference = schools.id. Tidak ada grant tabel/policy RLS baru.

## Signature tugas yang direkonsiliasi

Seluruh signature dan parameter bernama berikut dipertahankan dari snapshot versi x, nama publik tanpa x ditambahkan secara eksplisit; grant versi x dicabut untuk PUBLIC/anon/authenticated. Tidak ada aktivasi massal RPC historis.

| RPC | Parameter berurutan | Response |
| --- | --- | --- |
| [get_teacher_workspace](migration-school-advanced-agenda.sql) | p_school_id uuid | Objek classes (baris kelas sekolah), assignments (maksimum 100; id, title, class_id, subject_name, grade, status, opens_at, due_at, duration_minutes, question_count, created_by, updated_at, recipients, submitted) |
| [save_school_assignment](migration-school-advanced-agenda.sql) | p_school_id uuid, p_class_id uuid, p_title text, p_subject_name text, p_question_count integer, p_duration_minutes integer, p_opens_at timestamptz, p_due_at timestamptz, p_assignment_id uuid default null, p_expected_updated_at timestamptz default null | UUID tugas, bukan objek |
| [set_school_assignment_status](migration-school-advanced-agenda.sql) | p_assignment_id uuid, p_status text | void; published/cancelled; publish snapshot dan validasi penerima atomik |
| [get_school_assignment_ranking](migration-school-advanced-agenda.sql) | p_assignment_id uuid | Array maksimum 5: position, student_name, score, correct_answers, total_questions, submitted_at. Hanya tugas published dan attempt ASSIGNMENT submitted. Tie-break score DESC, submitted_at, attempt id |

Staf wajib guru/admin dengan membership aktif, sekolah aktif, akun aktif verified/tidak banned/deleted melalui helper existing. Pembuat/admin saja yang mengubah tugas. Profil legacy hanya veto konflik; bukan pemberi akses, tidak ada backfill. Daftar tugas siswa turut diperketat: afiliasi historis yang sekarang dicabut bisa membuat daftar keseluruhan ditolak secara konservatif. Kelas 6/9 dan invariant tugas existing tetap berlaku; bukan dukungan kelas 12 tugas.

## RPC agenda baru minimal

Snapshot tidak mempunyai RPC jadwal. Tabel jadwal/peserta existing digunakan kembali; kolom lifecycle/revision/snapshot nullable dan relasi attempt ditambahkan. Baris legacy tanpa status tetap dikarantina, tidak dianggap draft otomatis.

| RPC | Signature parameter persis | Response |
| --- | --- | --- |
| [create_school_schedule](migration-school-advanced-agenda.sql) | p_school_id uuid, p_label text, p_tka_code text, p_start_at timestamptz, p_deadline_at timestamptz, p_participant_ids uuid[] | schedule_id, status = draft, revision = 1 |
| [set_school_schedule_status](migration-school-advanced-agenda.sql) | p_schedule_id uuid, p_status text, p_expected_revision bigint | schedule_id, status, revision baru |
| [get_school_schedule_agenda](migration-school-advanced-agenda.sql) | p_school_id uuid | server_now, schedules: maksimum 100 terbaru berisi schedule_id, label, start_at, deadline_at, status, revision, tka_code, attempt_id milik aktor atau null |
| [get_school_schedule_participants](migration-school-advanced-agenda.sql) | p_schedule_id uuid, p_limit integer default 100, p_offset integer default 0 | schedule_id, status, server_now, total, participants: user_id, full_name, attempt_id, attempt_status, started_at, submitted_at, deadline_at, score, answered_count |
| [start_school_schedule](migration-school-advanced-agenda.sql) | p_schedule_id uuid | Payload resume engine ditambah schedule_id, resumed |

Monitoring/peserta hanya staf sekolah acara, tidak membaca hasil mandiri atau kunci/jawaban siswa. Halaman peserta maksimum 100. Agenda siswa hanya acara published/cancelled tempat ia terdaftar. Draft tidak dapat diedit lewat RPC versi ini: batalkan dan buat draft baru dengan peserta yang benar; tidak ada delete/dedup history. Cancel membutuhkan revision terbaru; pemanggilan ulang dengan revision lama ditolak, bukan idempotent success.

Versi pertama sengaja **satu paket SET per acara**, tidak ada RANDOM atau lima subujian. Publish memilih tepat jumlah soal konfigurasi dari SET tanpa fallback pool, membekukan versi/urutan, jenjang, mata pelajaran, jumlah, durasi dan cohort. Semua peserta diverifikasi saat draft dan publish, termasuk jenjang. Publish mensyaratkan waktu mulai di masa depan; mulai mensyaratkan durasi penuh masih tersedia. SET yang kurang soal gagal seluruh transaksi. Pengaman konten menolak perubahan/penghapusan versi, opsi, kategori, stimulus atau soal yang telah direferensikan acara published/cancelled; authoring perlu versi baru. Tidak ada salinan engine atau tabel baru. Status draft/published/cancelled, snapshot, revisi dan peserta tidak diberi akses langsung ke klien.

## Engine dan timing

[resume_exam_attempt(p_attempt_id uuid)](migration-school-advanced-blockers.sql) existing tetap dispatcher. [save_exam_answer(p_attempt_id uuid,p_question_id uuid,p_answer_payload jsonb)](migration-school-advanced-agenda.sql) dan [submit_exam_attempt(p_attempt_id uuid)](migration-school-advanced-agenda.sql) mempertahankan bentuk respons engine dan scoring existing. Resume TKA menambahkan deadline_at efektif; untuk acara, start/resume memberikan attempt_id, subject_name, grade, education_level, attempt_type, duration_minutes, total_questions, started_at, tka_code, questions, answers, remaining_seconds, deadline_at. Questions berisi question_id, question_version_id, question_order, question_type, question_text, instruction, stimulus, options, category_items; tanpa kunci/tema/topik.

Deadline acara efektif = minimum deadline jadwal, deadline attempt, started_at + durasi beku. Jam server otoritatif. Resume lewat deadline mengembalikan nol; save sejak deadline ditolak; submit lewat deadline menilai hanya jawaban tersimpan. Satu attempt sepanjang umur acara/pengguna dilindungi unique constraint dan lock pengguna engine. Attempt selesai tidak diulang; start ulang ditolak oleh resume existing. Sesi aktif mapel lain dengan identitas sama tidak diadopsi/di-expire. Mulai TKA mandiri tidak me-resume attempt acara; helper legacy juga menolak mengambil alih sesi aktivitas.

**Cancel, sekolah nonaktif, akun revoked/suspended/unverified, atau membership dicabut menolak start/resume/save/submit termasuk finalize terlambat.** Tidak ada worker/admin finalize baru atau bypass. Attempt yang tertinggal tetap tersimpan; penanganan administratif membutuhkan kebijakan terpisah. Review hasil pemilik yang sudah submitted tetap mengikuti endpoint existing, bukan dibuka bagi staf.

## Gate deployment dan batas jujur

1. Migration ini tidak menjalankan blockers. Reviewer harus memastikan blockers benar-benar terpasang beserta definisi helper/constraint/grant yang sesuai, bukan sekadar nama fungsi tersedia. SQL sengaja non-idempoten.
2. Dua gate transaksi tidak diaktifkan dalam artefak: school_advanced.school_uid_reference harus schools.id; school_advanced.affiliation_writers_reviewed harus approved. Ini pernyataan persetujuan reviewer, bukan bukti live dari snapshot. Preflight menolak orphan dan collision dengan ID profil akun SCHOOL; mapping ambigu harus direkonsiliasi eksplisit di luar migration. Tidak ada backfill/konversi UID otomatis.
3. Seluruh penulis afiliasi/provisioning/authoring dan ACL owner security-definer wajib direview. Helper mengambil lock tabel SHARE pada sekolah, profil, membership dan Auth agar perubahan status/phantom membership tidak lolos transaksi; ini konservatif dan bisa mengurangi throughput. Publish juga mengunci tabel konten dan advisory konten; penulis lama yang mengambil lock berlawanan dapat deadlock (PostgreSQL membatalkan salah satu transaksi). Uji staging concurrency wajib sebelum deployment, retry transaksi penuh hanya setelah otorisasi ulang; jangan menonaktifkan trigger/policy untuk menghindarinya.
4. Pengaman konten mempertahankan referensi versi pada database, bukan menjamin isi URL media eksternal immutable. Media perlu storage versioning/immutability yang disetujui. Trigger scanning snapshot konservatif perlu profiling pada skala nyata. Freeze konten acara tidak memperbaiki mutabilitas seluruh sejarah tugas/ujian lama.
5. Pemeriksaan sesi ini hanya tes statis lokal terfokus, bukan parser PostgreSQL, execution plan, tes ACL runtime, staging atau E2E. Sebelum UI: validasi SQL di staging terisolasi dengan anonymous/unverified, dua sekolah, legacy unmapped, publish/cancel/participant revocation bersamaan, start ganda, deadline exact, submit ganda, soal diarsipkan/diedit sesudah publish, regresi engine dan lock penulis lama. Tidak ada klaim live confirmed.
6. Final rollback wajib dipertahankan pada artefak review. Deployment terpisah yang disetujui menentukan commit, maintenance, backup dan validasi FK. Rollback aplikasi dahulu jika gagal setelah deploy; jangan hapus kolom/snapshot/attempt atau memulihkan ACL lama tanpa review.

## Hasil validasi lokal

Enam tes statis backend baru lulus. Pemeriksaan awal menemukan signature snapshot publik tanpa prefix schema menyebabkan perakitan ACL salah; assembler diperbaiki dengan kualifikasi schema eksplisit dan pemeriksaan koreksi terfokus lulus 6/6. Tidak menjalankan suite existing/DB, migrasi, parser PostgreSQL atau build frontend. Pemeriksaan whitespace pada path pekerjaan ini juga selesai tanpa error; berkas baru tetap untracked, tidak ada staging/commit Git.

## Artefak

- [SQL review-only](migration-school-advanced-agenda.sql).
- [Assembler offline](../../scripts/build-school-advanced-review.cjs): input hash pinned; mempertahankan bagian SQL handwritten lalu merakit fungsi snapshot/blockers dengan perubahan terarah. Tidak memuat environment, client DB atau network.
- [Tes statis backend baru](../../tests/school-advanced-agenda.test.mjs). Tidak mengubah tes existing, frontend/adapters, dirty changes existing atau data sejarah.
