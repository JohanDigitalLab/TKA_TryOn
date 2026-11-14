# Addendum 02 — kontrak backend dan handoff frontend

## 1. Status dan batas penerapan

Fondasi ini **belum diterapkan permanen**. Verifikasi menjalankan DDL dan fixture dalam transaksi yang selalu dibatalkan. Integrasi frontend Addendum 02 belum tersedia. Penyimpanan artefak ini ke Git tidak mengaktifkan migrasi; penerapan permanen tetap menunggu persetujuan dan kesiapan seluruh jalur pendaftaran. Migrasi tahap 1–3 diperlukan; tahap 4 tidak diperlukan. Migrasi lama tidak diubah.

Artefak:
- [Migrasi tahap 5](migration-stage-5-addendum-foundation.sql).
- [Verifier rollback-only](../../scripts/migrate-addendum-foundation.cjs).
- [Suite integrasi basis data](../../tests/database/addendum-foundation.sql).
- [Audit sumber dan skema awal](ADDENDUM_02_AUDIT.md).

**Bukan paket konten siap produksi:** empat versi taksonomi bawaan berstatus draft dan baru memuat judul domain/kompetensi/jenis teks terverifikasi. Subdomain, subkompetensi, indikator, tingkat kognitif, dan topik perlu kurasi manusia beserta halaman sumber sebelum aktivasi. Tidak ada seed 400 soal, persetujuan otomatis soal lama, atau blueprint aktif bawaan. Target adalah 100 soal eligible per kelompok, bukan klaim stok tersedia.

Sumber terverifikasi: Peraturan Kepala BSKAP **047/H/AN/2025**, 24 Juli 2025, [PDF resmi](https://pusmendik.kemendikdasmen.go.id/tka/files/07180.pdf), SHA-256 25f2dd0e292108893298a9684004dcaf3c003fe8ee6b2e1ecff243ceccd8d04b. Nomor halaman selalu halaman fisik PDF: BI SD 8–10, Matematika SD 13–15, BI SMP 15–17, Matematika SMP 20–25. Matematika SD: Bilangan; Geometri dan Pengukuran; Data. SMP: Bilangan; Aljabar; Geometri dan Pengukuran; Data dan Peluang. Struktur membaca berbeda dari matematika, dan subkompetensi SD/SMP tidak boleh disamakan.

Jumlah soal dan durasi **resmi** belum divalidasi. Jadwal gabungan 75 menit bukan bukti durasi mandiri TKA. Blueprint produk boleh menentukan jumlah/durasi secara eksplisit; jangan diberi label resmi. Aktivasi/start blueprint resmi ditolak. Adaptive secara eksplisit belum didukung.

## 2. Konvensi integrasi dan keamanan

Semua RPC berada pada skema publik. Kirim nama parameter persis dengan awalan p_. Semua hasil berbentuk satu nilai JSON, kecuali permintaan langganan yang mengembalikan UUID. UUID/timestamp dikirim sebagai string; timestamp ISO 8601. Array kosong dikembalikan sebagai array, bukan direktori pengguna. Urutan array tidak dijamin kecuali disebutkan. Field nullable harus dipertahankan sebagai null, bukan diubah menjadi nol.

Kecuali pembacaan konfigurasi bisnis, semua RPC Addendum memerlukan sesi authenticated dan profil aktif. Hak admin diperiksa di backend; menyembunyikan tombol bukan otorisasi. Semua 13 tabel baru memakai RLS, tanpa akses tabel langsung untuk anon/authenticated. Helper privat dan jalur legacy yang dipindahkan tidak dapat dieksekusi klien. Fungsi baru memakai SECURITY DEFINER dengan search path tetap. Jangan mengirim service-role key ke browser.

Token expected_revision adalah angka terakhir yang dibaca, **bukan** angka yang ditebak klien. Nilai awal klasifikasi/langganan yang belum ada adalah 0. Konflik 40001 mengharuskan muat ulang konteks dan konfirmasi ulang; jangan otomatis mengulang aksi editorial dengan data lama. ID versi wajib disimpan terpisah dari ID soal.

## 3. Profil, pendaftaran, kontak

### [a02_profile](migration-stage-5-addendum-foundation.sql:126)

Input: p_update JSON nullable, default null untuk baca. Mutasi hanya menerima full_name (string trim 1–160), whatsapp_number (string), whatsapp_consent (boolean). Field lain ditolak, termasuk flag verified dari klien. Tidak ada parameter user_id: selalu profil pemilik sesi.

Output tepat: user_id, full_name, education_level, whatsapp_number, whatsapp_consent_at, contact_verified, contact_required. Dua field terakhir boolean; contact_verified selalu false karena tidak ada OTP/verifikasi kepemilikan nomor. contact_required hanya menandai nomor null; UI juga harus memeriksa consent timestamp sebelum start baru.

Nomor menerima awalan 08, 628, atau +628, dengan pemisah spasi/kurung/tanda hubung. Bentuk tersimpan +628 diikuti digit kedua 1–9 lalu 7–10 digit; nomor asing/format lain ditolak. Mengirim consent true menyimpan waktu server; false menghapus waktu persetujuan. Nomor tidak dapat dikosongkan lewat RPC.

**Dependensi frontend sebelum apply:** setiap pendaftaran auth baru harus menyertakan metadata whatsapp_number valid. Metadata registration_method independent/school dan education_level sd/smp/sma tetap dipakai untuk inisialisasi pendidikan seperti sebelumnya. Trigger tidak membaca consent dari metadata; lengkapi persetujuan melalui RPC sesudah login. Akun lama boleh tetap bernomor null dan tetap login; pembaruan auth saat login tidak terkena validasi INSERT. Jangan menerapkan migrasi sebelum semua jalur signup, termasuk pembuatan akun operator, siap mengirim nomor valid.

## 4. Registry akademik superadmin

### [a02_registry_workspace](migration-stage-5-addendum-foundation.sql:665)

Tanpa parameter. Superadmin saja. Output: sources, taxonomies, nodes, blueprints, subscriptions, subscription_requests; semua array, termasuk data draft/inactive. Tidak mengekspor auth email. Gunakan untuk layar pengelolaan dan memperoleh token revisi; belum dipaginasi.

Bentuk record yang dikembalikan workspace/mutasi:
- Sumber: code, title, url, sha256, issued_on, verified_at, evidence, active.
- Versi taksonomi: id, code, grade, subject_name, source_code, pdf_pages, status, revision, created_by, created_at.
- Node: id, taxonomy_id, code, dimension, label, parent_id, pdf_pages, active, revision.
- Blueprint: id, code, version, taxonomy_id, mode, total_questions, duration_minutes, topic_counts, status, policy_kind, official_evidence, revision, created_by, created_at.
- Langganan: id, user_id, school_id, status, expires_at, revision, updated_by, updated_at.
- Permintaan: id, user_id, school_id, status, created_at.

### [a02_registry_mutate](migration-stage-5-addendum-foundation.sql:143)

Input: p_kind string dan p_data objek. Output satu record sesuai jenis. Superadmin saja; tidak ada hard-delete. Gunakan versi/record baru untuk koreksi makna, bukan menimpa histori.

| p_kind | Buat baru: field p_data | Ubah record existing |
|---|---|---|
| source | code, title, url HTTPS, sha256 lowercase 64 karakter, issued_on nullable, verified_at, evidence, active boolean | Kirim semua field dengan bukti identik; hanya active berubah. Belum ada optimistic revision sumber; hindari toggle bersamaan. |
| taxonomy | id opsional, code unik, grade 6/9, subject_name Bahasa Indonesia/Matematika, source_code, pdf_pages, status draft/active/inactive | id, expected_revision, status; field makna lain tidak diubah. |
| node | id opsional, taxonomy_id, code, dimension, label, parent_id nullable, pdf_pages, active | id, expected_revision, active; label/hierarki/provenance immutable. |
| blueprint | id opsional, code, version integer positif, taxonomy_id, mode simulation/mission, total_questions nullable, duration_minutes nullable, topic_counts array, status pending_validation/active/inactive, policy_kind product/official, official_evidence nullable | id, expected_revision, status; konfigurasi immutable, buat versi baru untuk revisi. |

Node baru hanya pada taksonomi draft. Parent harus berasal dari taksonomi sama. Dimensi matematika: math_domain, math_subdomain, competency; membaca: reading_competency, reading_subcompetency, text_type. Dimensi bersama: indicator, cognitive_level, topic. Dimensi lintas-mapel ditolak. Aktivasi taksonomi bukan sertifikasi otomatis kelengkapan isi; kurator bertanggung jawab atas verifikasi seluruh node.

Blueprint aktif: total_questions 1–100, duration_minutes 1–240, taksonomi aktif; topic_counts array objek dengan **hanya** topic_id dan count integer positif. Topik aktif dari taksonomi sama, tidak boleh duplikat; jumlah count harus persis total_questions. Mode tidak boleh adaptive. Blueprint resmi boleh disimpan pending_validation dengan jumlah/durasi null, tetapi tidak dapat diaktifkan, meskipun official_evidence diisi.

### [a02_catalog](migration-stage-5-addendum-foundation.sql:373)

Tanpa parameter; profil aktif. Output sources, taxonomies, nodes, blueprints berupa record di atas, hanya record aktif. created_by blueprint dihilangkan; field created_by taksonomi masih tersedia. Katalog tidak menyertakan soal/kunci, dan bukan bukti stok cukup. Jangan memakai workspace superadmin sebagai katalog siswa.

## 5. Bank soal, klasifikasi, editorial

### [a02_inventory](migration-stage-5-addendum-foundation.sql:246)

Tanpa parameter; permission bank_soal.view. Output array empat objek: grade, subject_name, target (100), actual, eligible, shortage. actual menghitung ID soal unik semua status; eligible hanya ID unik yang lulus predikat ketat; shortage adalah kekurangan eligible terhadap target, minimal nol. Tidak ada seed/publikasi yang dilakukan saat pembacaan.

### [a02_classify](migration-stage-5-addendum-foundation.sql:195)

Input: p_version_id UUID, p_expected_revision integer, p_taxonomy_id UUID, p_topic_id UUID, p_node_ids array UUID unik. Permission bank_soal.edit. Versi harus DRAFT/NEEDS_REVISION dan belum dipakai attempt/tugas. Taksonomi aktif harus cocok grade/mapel soal; node/topik aktif pada versi yang sama. Sertakan seluruh parent dalam node_ids atau topik. Wajib indikator dan tingkat kognitif; matematika juga domain/subdomain/kompetensi, membaca juga kompetensi/subkompetensi/jenis teks.

Output: version_id, revision (token baru), classification (snapshot). Snapshot memuat provenance version_snapshot, taxonomy, source, topic, nodes, question_type, difficulty, source_reference, usage_rights. Snapshot menyimpan makna saat klasifikasi, tidak mengikuti label master terkini secara retroaktif.

### [a02_question_metadata](migration-stage-5-addendum-foundation.sql:642)

Input: p_version_id, p_expected_revision, p_data objek dengan subset source_reference, usage_rights, difficulty; semua nilai string nonkosong. Permission bank_soal.edit. Klasifikasi harus sudah ada; hanya draft yang belum dibekukan. Hak penggunaan: ORISINAL/BERLISENSI/IZIN_TERTULIS/DOMAIN_PUBLIK; kesulitan MUDAH/SEDANG/SULIT. Identitas bersama yang pernah disetujui/dipakai tidak boleh diedit lewat revisi baru.

Output: version_id, classification_revision, question (record soal existing). Mutasi menaikkan token, mempertahankan snapshot dengan invalidated true, sehingga metadata_valid false sampai klasifikasi ulang memakai token baru. Token tidak direset ke 0 untuk mencegah stale ABA.

### [a02_editorial_context](migration-stage-5-addendum-foundation.sql:657)

Input p_version_id; permission bank_soal.view. Output version_id, classification (null atau record version_id, taxonomy_id, topic_id, node_ids, snapshot, revision, updated_by, updated_at), metadata_valid boolean, eligible boolean, events array. Event berisi id, question_id, version_id, action, actor_id, note, created_at. Ini konteks admin, bukan endpoint siswa.

### [a02_editorial](migration-stage-5-addendum-foundation.sql:254)

Input p_version_id, p_expected_status, p_expected_classification_revision, p_action, p_note (trim 3–4000). Output normal version_id, status, classification_revision; archive hanya version_id dan status ARCHIVED.

| Aksi | Permission | Transisi |
|---|---|---|
| submit | bank_soal.edit | DRAFT/NEEDS_REVISION → PENDING_REVIEW; metadata lengkap |
| approve | bank_soal.review | PENDING_REVIEW → APPROVED; reviewer bukan pembuat/pengirim versi |
| request_revision | bank_soal.review | PENDING_REVIEW → NEEDS_REVISION; larangan self-review tetap berlaku |
| publish | bank_soal.publish | APPROVED → PUBLISHED/current; wajib approval independen versi persis setelah submit terbaru |
| archive | bank_soal.moderate | status soal → ARCHIVED; tidak menghapus versi/payload histori |

Semua aksi memeriksa status/token. Selain archive, target harus versi terbaru soal. Revisi pending tidak mencabut versi published sebelumnya. Publish menyupersede versi current lama secara atomik. Perubahan langsung konten/opsi/kategori/klasifikasi historis diblokir trigger; penambahan opsi pada versi approved/published/used juga ditolak. Import/revisi legacy masih boleh menambahkan opsi saat baru membuat PENDING_REVIEW, tanpa otomatis memenuhi eligibility.

Eligibility privat mensyaratkan soal published, versi current published, taksonomi/sumber/node aktif, snapshot cocok metadata, lisensi/sumber/kesulitan lengkap, pertanyaan/pembahasan/hash nonkosong, opsi/kunci valid sesuai tipe, stimulus approved dan berlisensi bila ada, serta approval manusia independen versi persis setelah submit Addendum. Legacy tanpa rantai ini tidak eligible otomatis.

### [a02_revision](migration-stage-5-addendum-foundation.sql:618)

Input p_question_id, p_expected_version_id (versi dengan nomor terbesar, bukan sekadar current published), p_payload objek sesuai kontrak revisi existing. Permission bank_soal.edit. Field pokok question_text; opsional instruction, explanation, stimulus; options memakai option_code, option_text, is_correct, explanation; category_items memakai item_number, item_text, correct_category, explanation. Membuat versi baru, tidak menimpa versi lama.

Output success, question_id, version_id, version_number, version_status DRAFT, is_current, previous_version_id, classification_revision 0. Lanjutkan klasifikasi, pemeriksaan stimulus, submit, review, publish. **Batas legacy:** revisi PGK_KATEGORI masih dibatasi BENAR/SALAH oleh fungsi lama; jangan menjanjikan label kategori bebas pada jalur ini. Impor draft mendukung label kategori slash-separated.

### [a02_stimulus_review](migration-stage-5-addendum-foundation.sql:629)

Input p_version_id, p_expected_status (status stimulus, bukan versi), p_note 3–4000. Permission bank_soal.review; reviewer bukan pembuat stimulus. Versi harus editable, stimulus harus punya sumber/lisensi. Output stimulus_id, status APPROVED; audit COMMENT dicatat. Stimulus yang dipakai versi non-draft/historis immutable; buat stimulus baru lewat revisi bila perlu.

## 6. Impor persisted yang ketat

### [a02_import](migration-stage-5-addendum-foundation.sql:508)

Input p_payload objek, superadmin. Field metadata wajib: jenjang SD/SMP, kelas 6/9, mata_pelajaran Bahasa Indonesia/Matematika; fileName opsional. questions array 1–100. Tiap baris boleh override jenjang/kelas/mata_pelajaran; **tiap baris wajib** difficulty dan classification berisi taxonomy_id, topic_id, node_ids. Metadata klasifikasi tidak diwarisi diam-diam dari baris pertama.

Isi baris mengikuti persistence AI existing: pertanyaan, pembahasan, sumber_referensi, hak_penggunaan; options berupa kode_respon, teks_respon, is_correct; kategori berupa category_items dengan nomor_pernyataan, teks_respon, kategori_respon, kunci_kategori. Gunakan hak sumber valid; tipe PG_TUNGGAL/PGK_MA/PGK_KATEGORI mengikuti payload legacy. Tidak cukup menyimpan preview hasil AI: RPC ini benar-benar membuat batch, soal, versi, dan mapping row.

Output success, batch_id, batch_code, questions_saved, publication_status DRAFT, message, rows. Tiap rows berisi row (1-based), question_id, version_id, classification_revision 1, status DRAFT. Jika satu klasifikasi/baris gagal, **seluruh batch rollback**. Tidak ada publish/approval otomatis. API AI/TQBS lama tetap tersedia, tetapi tidak membuat soal eligible otomatis. Migrasi memperbaiki constraint sheet agar sumber SMART_IMPORT_AI yang sudah ditulis fungsi lama diterima.

## 7. Bisnis, langganan, dan trial

### [a02_business_config](migration-stage-5-addendum-foundation.sql:290)

Input p_update default null, p_expected_revision default null. Baca tersedia untuk anon; mutasi hanya superadmin. p_update menerima manager_whatsapp (normalisasi sama), individual_price_label, school_price_label, individual_template, school_template (string trim 1–2000), legacy_start_enforcement (boolean). Tidak ada harga pembayaran terstruktur, payment gateway, atau OTP.

Output persis manager_whatsapp nullable, individual_price_label, school_price_label, individual_template, school_template, legacy_start_enforcement, revision. Default nomor null, harga 'Hubungi pengelola', enforcement false. UI menyusun tautan WhatsApp dari nomor kanonis tanpa plus dan pesan ter-encode; template adalah teks, bukan HTML dan tidak memiliki interpolasi server. Klik WhatsApp **bukan** permintaan tersimpan, pembayaran, atau aktivasi langganan.

### [a02_subscription_set](migration-stage-5-addendum-foundation.sql:307)

Input p_user_id nullable, p_school_id nullable (tepat satu diisi), p_status none/pending/active/inactive, p_expires_at nullable, p_expected_revision, p_reason trim 3–2000. Hanya superadmin. Aktivasi dengan expiry masa lalu ditolak; null berarti tanpa expiry. Output record langganan lengkap seperti workspace. Setiap perubahan menyimpan actor, alasan, nilai lama/baru dalam audit immutable. Expiry yang terlewati membuat entitlement false tanpa mengubah label status tersimpan.

### [a02_subscription_context](migration-stage-5-addendum-foundation.sql:326)

Tanpa parameter, owner-only. Output subscribed boolean; individual objek status, revision dan expires_at jika record ada (tanpa record: status none, revision 0); trials objek simulation dan mission boolean yang berarti **masih tersedia**; requests array id, school_id, status, created_at milik pemanggil. subscribed memperhitungkan langganan individu atau sekolah aktif melalui membership siswa aktif pada sekolah aktif. Tidak ada daftar pengguna global.

### [a02_subscription_request](migration-stage-5-addendum-foundation.sql:333)

Input p_school_id nullable default null. Individu untuk diri sendiri; permintaan sekolah memerlukan staff aktif sekolah terkait. Output UUID request. Idempotent selama pending pada target sama; maksimal lima request baru per pengguna per hari. Tidak mengubah entitlement atau status subscription. Request sekolah milik staff lain dapat menghasilkan UUID pending sekolah yang sama. Status request pending/closed terpisah dari none/pending/active/inactive langganan. Belum tersedia RPC untuk menutup request; jangan membuat tombol close yang mengakses tabel langsung.

Trial tersimpan unik per pengguna per mode: satu simulation dan satu mission. Pelanggan aktif melewati debit trial. Start baru memerlukan nomor dan consent; tugas sekolah saat enforcement aktif memerlukan langganan **institusi**, tidak dapat diganti langganan individu atau trial. Shortage, error, dan resume tidak mendebit. Pemeriksaan/debit satu transaksi dengan pembuatan attempt; unique constraint menjadi arbiter akhir bila ada race.

## 8. Start, resume, jawaban, dan riwayat

### [a02_start](migration-stage-5-addendum-foundation.sql:381)

Input p_blueprint_id UUID, p_adaptive boolean default false (null invalid, true ditolak 0A000). Profil harus sesuai jenjang grade taksonomi. Memilih jumlah **persis** per topik dari versi eligible, mengunci/recheck konten, memakai tabel dan mesin ujian existing. Stok kurang adalah error, bukan fallback soal lama/jumlah lebih sedikit. Konfigurasi dan klasifikasi dibekukan dalam snapshot attempt.

Output dasar engine: attempt_id, education_level (SD/SMP), grade, subject_name, attempt_status, total_questions, duration_minutes, started_at, remaining_seconds, questions; ditambah mode dan config_snapshot (blueprint tanpa created_by, taxonomy). Question berisi question_id, version_id, question_code, question_order, question_type, instruction, question_text, stimulus nullable (title, content_text, stimulus_type, file_url, media_description), options (option_code, option_text, option_order), category_items (item_number, item_text, category_label, category_options), answer_payload (option_codes array, category_answers objek). Tidak ada kunci/pembahasan pada start/resume.

Sesi aktif blueprint sama dikembalikan tanpa debit; sesi lain pada grade/mapel sama menghasilkan A02_OTHER_ACTIVE_SESSION. Pencarian ini masih memerlukan blueprint aktif dan jenjang profil sesuai. Bila konfigurasi sudah dinonaktifkan atau profil berubah, gunakan RPC resume existing berdasarkan attempt_id; jangan memaksa start ulang untuk melanjutkan.

### [start_exam_attempt](migration-stage-5-addendum-foundation.sql:432)

Signature existing dipertahankan: p_grade, p_subject_name, p_question_count default 20, p_duration_minutes default 60. Resume sesi aktif didahulukan. Enforcement false: start baru mendelegasikan perilaku lama, **belum** menerapkan eligibility/contact/trial Addendum. Enforcement true: start mandiri baru ditolak A02_CONFIGURED_START_REQUIRED, arahkan UI ke blueprint. Output tetap payload engine; jangan mengasumsikan mode/config selalu ada pada jalur ini.

### [start_school_assignment](migration-stage-5-addendum-foundation.sql:447)

Input p_assignment_id. Output payload engine existing. Enforcement true pada start baru: penerima/member aktif, seluruh soal tugas eligible versi persis, kontak lengkap, dan entitlement institusi wajib. Error membatalkan attempt dan recipient update. Snapshot sekolah menyimpan assignment_id, question_count, duration_minutes. Resume tugas existing tidak memeriksa ulang kontak/langganan dan tidak mendebit trial; validasi owner/member/status tugas existing tetap berlaku. Enforcement false mempertahankan perilaku lama.

Mesin [resume_exam_attempt](../../src/lib/student/exam.js), penyimpanan jawaban, dan submit existing tetap digunakan. Jam server adalah otoritas; jangan membuat attempt lokal. Jawaban memakai option_codes dan category_answers seperti engine existing.

### [get_exam_attempt_review](migration-stage-5-addendum-foundation.sql:484)

Input p_attempt_id, hanya owner dan status SUBMITTED. Output attempt_id, status, score, total_questions, correct_answers, submitted_at, questions, mode, config_snapshot. Tiap question: question_id, question_code, question_order, question_type, question_text, instruction, explanation, is_correct, stimulus (title, content_text, file_url), answer_payload, options (option_code, option_text, is_correct, explanation), category_items (item_number, item_text, category_label, category_options, correct_category, explanation), question_version_id, classification.

classification adalah snapshot attempt, bukan registry sekarang. Sesi lama tanpa snapshot mendapat provenance legacy_unclassified dan historical_classification_available false. mode fallback legacy, config_snapshot null. Tidak ada backfill klasifikasi palsu. Bug review legacy yang merujuk kolom kategori tidak ada diperbaiki dengan derivasi opsi dari label slash-separated, tanpa menambah sumber kategori mutable baru.

### [get_student_exam_history](migration-stage-5-addendum-foundation.sql:494)

Input p_limit default 50 (dibatasi 1–100), p_before timestamp nullable. Output array owner-only berurutan created_at desc, id desc. Field: attempt_id, subject, grade, education_level, status, total_questions, correct_answers, incorrect_or_unanswered, score, started_at, submitted_at, created_at, mode, config_snapshot. incorrect_or_unanswered null sebelum submit; jangan tampilkan skor null sebagai nol. Paginasi before menggunakan created_at eksklusif; belum ada cursor gabungan ID untuk timestamp identik.

## 9. Evaluasi sekolah

### [a02_evaluation](migration-stage-5-addendum-foundation.sql:531)

Input p_school_id wajib, p_grade null/6/9. Sekolah harus aktif. Siswa aktif hanya melihat dirinya; teacher/school_admin aktif hanya sekolah yang dipilih eksplisit. Superadmin tanpa membership staff tidak mendapat bypass direktori. Tidak ada auth email, answer_payload, kunci, atau raw answer dalam keluaran.

Output: school_id, grade, scope self/school, basis valid_saved_answers_in_submitted_school_attempts, topics, trends, top5, top5_average, students.
- topics: grade, subject_name, topic_id nullable, topic_label, answered, correct, accuracy persen.
- trends: week (awal minggu UTC), grade, subject_name, answered, accuracy persen.
- top5: user_id, attempts, answered, accuracy; urutan accuracy desc, answered desc, user_id; maksimal lima.
- students: user_id, attempts, answered, accuracy, full_name; staff saja.
- top5_average: rerata tidak berbobot accuracy lima siswa teratas yang tersedia; null bila tidak ada data atau scope self.

Basis hanya jawaban benar-benar tersimpan, valid, tidak kosong, dalam waktu sesi, dari attempt sekolah submitted. Membership siswa/profil harus masih aktif. Soal tidak dijawab tidak masuk denominator; ini **akurasi jawaban aktual**, bukan skor ujian keseluruhan. Attempt mandiri tidak dihitung hanya karena siswa anggota sekolah. Jalur tugas lama dikenali melalui assignment recipient. Topik historis tanpa snapshot dilabeli 'Legacy tanpa klasifikasi'. Scope self mengembalikan top5/students array kosong. Tren saat ini mingguan, bukan rentang tanggal arbitrer.

## 10. Error dan penanganan UI

| SQLSTATE / pesan | Tindakan |
|---|---|
| 42501; A02_AUTH_REQUIRED / PERMISSION_REQUIRED / SUPERADMIN_REQUIRED / SELF_REVIEW_FORBIDDEN / SCHOOL_ACCESS_REQUIRED | Tolak akses; jangan mengulang dengan credential lebih tinggi di browser. |
| 40001; A02_STALE_REVISION / STALE_VERSION / STALE_STIMULUS / INVENTORY_CHANGED | Muat ulang konteks, tampilkan konflik, minta operator mengulang keputusan. |
| 22023; A02_INVALID_* / IMPORT_*_REQUIRED | Koreksi input; payload UUID/enum/constraint juga bisa memberi error PostgreSQL 22P02/23514. |
| 0A000; A02_ADAPTIVE_NOT_SUPPORTED / OFFICIAL_POLICY_PENDING_VALIDATION | Tampilkan belum didukung/menunggu validasi, jangan fallback diam-diam. |
| P0001; A02_INVENTORY_SHORTAGE | Tidak ada attempt/trial tersimpan; sediakan informasi stok belum cukup. |
| P0001; A02_CONTACT_REQUIRED | Lengkapi nomor dan consent melalui profil. |
| P0001; A02_TRIAL_EXHAUSTED / SCHOOL_SUBSCRIPTION_REQUIRED | Tawarkan informasi langganan; klik WA tidak mengaktifkan akses. |
| P0001; A02_CONFIGURED_START_REQUIRED / OTHER_ACTIVE_SESSION | Pilih konfigurasi atau lanjutkan sesi tersimpan. |
| P0001; VERSION_FROZEN / SHARED_METADATA_FROZEN / STIMULUS_FROZEN / AUDIT_IMMUTABLE / CLASSIFICATION_REQUIRED | Jangan retry write; gunakan versi baru atau selesaikan klasifikasi. |

Daftar bukan enum lengkap semua error legacy. Gunakan SQLSTATE dan pesan stabil A02 bila tersedia; jangan tampilkan DETAIL internal/credential. Tidak ada envelope success false: error menggagalkan transaksi RPC.

## 11. Urutan rollout dan verifikasi

1. Tinjau migrasi/kontrak dan lengkapi signup WA pada semua frontend; perubahan frontend belum termasuk pekerjaan ini.
2. Kurasi registry lengkap, kebijakan produk, dan proses review manusia; jangan aktifkan draft seed seolah lengkap.
3. Rencanakan apply terpisah dengan persetujuan eksplisit. Verifier ini **tidak memiliki cabang apply**; argumen selain --dry-run ditolak sebelum koneksi.
4. Setelah penerapan terotorisasi, pertahankan enforcement false selama transisi UI. Start terkonfigurasi selalu ketat; start legacy baru masih kompatibel dan belum dipaywall selama false.
5. Integrasikan profil, katalog, start, context langganan, dan resume attempt tersimpan. Isi nomor pengelola/harga melalui superadmin.
6. Setelah stok cukup, entitlement sekolah siap, dan semua pemanggil start mandiri pindah, superadmin mengaktifkan legacy_start_enforcement memakai token revisi terbaru. Ini gate start baru, bukan pemblokiran resume.

Verifier membutuhkan konfigurasi basis data lokal DB_HOST, DB_PORT opsional, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL_CA_PATH dan URL Supabase aplikasi. TLS memverifikasi CA serta authorized; host/ref proyek harus cocok URL managed Supabase, termasuk username pooler. DB_EXPECTED_PROJECT_REF opsional memperketat pencocokan. Secret tidak dicetak.

Verifikasi 14 November 2026: dua cabang tanpa/dengan tahap 4; migrasi dua kali per cabang; 13 tabel RLS/ACL dan ACL helper dicek; suite fondasi dan regresi workflow sekolah lulus, ditambah suite onboarding pada cabang tahap 4. Semua dibatalkan. Suite mencakup lifecycle import/review/publish, self-review/stale guards, klasifikasi invalidated dengan token monotonik, shortage tanpa debit, trial per mode, snapshot/no pre-submit keys, isolasi evaluasi, penolakan bypass entitlement institusi, dan resume setelah consent/langganan dicabut.

**Batas bukti pengujian:** menggunakan unique constraints, advisory/row locks, serta jalur serial dan stale-token tests; belum ada stress test dua koneksi simultan. Tidak semua kombinasi permission operator, jenis kategori, dan stimulus diuji end-to-end. Pemeriksaan ini bukan klaim seluruh acceptance produksi selesai. Diperlukan kurasi akademik penuh, integrasi frontend, pengujian konkurensi multi-session terisolasi, dan review operasional sebelum rollout produksi.
