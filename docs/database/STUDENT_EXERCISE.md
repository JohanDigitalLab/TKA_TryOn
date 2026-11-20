# Latihan adaptif — pending deployment

Migration: [migration-start-student-exercise.sql](migration-start-student-exercise.sql), lalu perluasan tema/topik [migration-start-student-exercise-theme-topic.sql](migration-start-student-exercise-theme-topic.sql), dan kolom [migration-subjects-is-mandatory.sql](migration-subjects-is-mandatory.sql) (`subjects.is_mandatory boolean NOT NULL DEFAULT true`). Belum diaplikasikan ke database.

## Prasyarat wajib

Snapshot parsial bukan schema resmi. DBA wajib memeriksa schema, constraint, index, trigger, RLS dan signature fungsi staging sebelum deployment. Diperlukan engine stage 1, stage 6–9, tabel subjects, subject_topics (subject_code berupa kode bukan nama), student_competency dengan user_id/subject, kolom questions.theme/topic, attempt_type, deadline_at dan tka_code. Terapkan migration TKA tryout terlebih dahulu; setelah itu migration exercise, terakhir frontend. Jangan menjalankan ulang migration TKA sesudah exercise karena akan mengganti dispatcher resume terluar.

EXERCISE berjumlah 8 karakter, kompatibel dengan attempt_type varchar(10). Verifikasi setiap CHECK attempt_type mengizinkan EXERCISE; migration tidak menghapus constraint yang belum terverifikasi. Nilai duration_minutes=60 hanya placeholder kompatibilitas constraint legacy (1–240); EXERCISE tidak menggunakan nilai ini untuk timer, save atau submit, dan deadline_at NULL. Audit trigger/background expiry agar mengecualikan EXERCISE. Jangan deploy jika trigger masih memaksakan deadline atau expiry. Fungsi review harus tetap mensyaratkan ownership dan SUBMITTED.

Fungsi private dan dispatcher menggunakan search_path pg_catalog dan pemeriksaan ownership. Legacy resume/save/submit dipindahkan sekali, tidak ditimpa pada reapply. Urutan migration wajib dipertahankan; ulang migration exercise aman. Semua perubahan berada dalam satu transaksi.

## Perilaku

Jumlah soal integer 1–100. Jenjang dari profil, subject_code harus cocok dengan jenjang. Per subject: NA (termasuk kompetensi belum tersedia), KURANG, CUKUP; topik diacak dalam prioritas tersebut. Maksimal satu soal per pasangan tema/topik pada tahap adaptif, kemudian fallback acak subject yang sama tanpa duplikat sampai batas permintaan. Fallback boleh memakai topik yang sudah terpilih. Hanya soal published dan versi published terbaru; tidak memakai element/material, difficulty. Snapshot versi disimpan, jumlah aktual dilaporkan. Nol soal membatalkan transaksi.

Parameter opsional `p_theme` dan `p_topic` pada `start_student_exercise`: bila keduanya diisi, soal diambil acak sebanyak `p_question_count` dari pasangan tema/topik tersebut; bila hanya `p_theme` yang diisi, topic diacak dalam tema tersebut; `p_topic` tanpa `p_theme` ditolak sebagai konfigurasi tidak valid. Tanpa keduanya, perilaku adaptif lama dipakai. Signature lama `(text,integer)` di-drop pada migrasi perluasan agar PostgREST tidak ambigu; panggilan tanpa tema/topik tetap cocok karena parameter baru ber-DEFAULT NULL.

Klik ganda diserialkan client dan lock database. Attempt exercise aktif pada subject yang sama dilanjutkan. Attempt aktif jenis lain tidak diganti. Resume memulihkan options/category_items/jawaban tanpa kunci benar atau penjelasan. Multi-subject tetap memakai cache konfigurasi sesi; histori permanen tetap engine database.

## Verifikasi deployment

Jalankan contract tests lokal dan skrip [student-exercise.sql](../../tests/database/student-exercise.sql) hanya pada staging terisolasi. Tambahkan fixture dua user lintas jenjang, tiga tipe soal, multi-versi published/draft, kompetensi NA/KURANG/CUKUP/KUAT dan subject kosong. Uji start ulang konkuren menghasilkan satu ID, snapshot tidak berubah setelah publikasi versi baru, zero-question rollback, jumlah kurang dari permintaan, save setelah lebih dari 60 menit tetap berhasil untuk exercise, save/submit silang user ditolak, save setelah submit ditolak, dan TRYOUT/assignment legacy tetap memakai timer. Skrip metadata tidak menggantikan pengujian fixture tersebut.

Tidak ada koneksi DB, service role atau secret yang diperlukan untuk perubahan repository. Browser hanya memakai key publik dan sesi pengguna. Jangan mengaplikasikan migration ke produksi tanpa audit prasyarat dan hasil staging.
