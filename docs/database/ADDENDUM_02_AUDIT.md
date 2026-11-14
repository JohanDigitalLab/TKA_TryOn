# Addendum 02 — audit bukti sebelum implementasi

Tanggal audit: 14 November 2026. Snapshot live: **2026-11-14T09:37:12.415Z**. Status: audit selesai; implementasi dan perubahan produksi **tidak dilakukan**.

## 1. Keputusan ringkas

- Inventori kelas 6/9, Bahasa Indonesia/Matematika: **200 ID soal**, masing-masing 50 per kelompok, seluruhnya current dan published. Target produk 400 berarti kekurangan nominal **200**, bukan sudah terpenuhi.
- Catatan review: **0**. Tidak ada bukti persetujuan manusia pada versi current. Kesenjangan terhadap target 400 soal published dengan review tercatat adalah **400**; 200 soal existing perlu ditelaah, bukan otomatis membuat 400 soal baru.
- Keunikan semantik belum terbukti: 170 hash current berbeda secara global; 30 grup hash duplikat melibatkan 60 versi, semuanya lintas kelas dan tidak lintas mapel. Tidak menyimpulkan plagiarisme/duplikasi semantik dari hash saja.
- Tahap 3 sekolah tersedia, tetapi **sembilan tabel dan sepuluh RPC tahap 4 belum ada di live**. Migrasi yang committed bukan bukti deployment.
- Tidak ada kolom telepon/WhatsApp/kontak pada katalog aplikasi yang diperiksa. Jangan menampilkan jumlah WhatsApp terverifikasi sebagai nol: kontrak penyimpanannya sendiri belum tersedia.
- Jumlah soal ujian resmi per mapel **belum berhasil diverifikasi**. Pedoman 2026 memuat **75 menit untuk komponen gabungan** mapel dan numerasi/literasi SD/SMP, bukan bukti durasi TKA mapel terpisah. Jangan menggunakan contoh workbook atau default RPC sebagai kebijakan resmi.

## 2. Batas audit dan reproduksi

Aturan repositori dan panduan Next terpasang dibaca sebelum pekerjaan. HEAD awal 04f0fd5. Dua berkas OCR untracked yang sudah ada dibiarkan. Tidak mengubah source aplikasi, environment, dependensi, migrasi, maupun data produksi; tidak melakukan commit/push, generate soal, approval otomatis, atau menjalankan RPC aplikasi.

Skrip baru: [audit-addendum-02.cjs](../../scripts/audit-addendum-02.cjs). Jalankan melalui Node dari workspace dengan konfigurasi database lokal dan CA yang sudah tersedia. Skrip menolak argumen, mencocokkan identitas project terhadap konfigurasi aplikasi, memverifikasi sertifikat TLS, menetapkan transaksi repeatable-read read-only, timeout, menjalankan katalog dan agregat tetap, lalu rollback. Tidak menggunakan bypass TLS atau connection string di output. Hasil hanya ditulis setelah rollback berhasil.

Bukti lokal lengkap: [snapshot katalog dan agregat](../../.local/database/addendum-02-db.json), SHA256 **796b1b893312b5b4532fd3bb8263c8d649d06ac09cc5fad2cfd5301ff3440604**. Berkas ini di direktori ignored, berisi peta kueri, seluruh definisi 40 fungsi, ACL, indeks, trigger, kolom, constraint, seed referensi dan agregat; bukan rekaman profil atau isi/kunci soal. Jangan commit bukti mentah.

TLS klien menuju endpoint tervalidasi dan identitas konfigurasi project cocok, termasuk konfigurasi pengujian. Namun statistik SSL sesi backend melaporkan false, versi/cipher kosong. Jadi audit **tidak membuktikan TLS end-to-end endpoint–backend**; jangan menganggap topologi pooler atau enkripsi hop downstream sudah diverifikasi.

Katalog terambil: **29 tabel public, 259 kolom, 147 constraint, 79 indeks, 31 policy, 40 fungsi (29 public/11 private), 10 trigger, 24 baris default ACL, tanpa enum aplikasi**. Semua 29 tabel menggunakan RLS, tidak forced. Audit katalog bukan uji penetrasi atau pengujian RPC dengan pengguna nyata.

## 3. Inventori live dan mutu bukti

| Kelas | Mapel | ID unik | Memiliki current | Question published | Current published | Review current / APPROVE | Target | Kurang nominal |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 6 | Bahasa Indonesia | 50 | 50 | 50 | 50 | 0 / 0 | 100 | 50 |
| 6 | Matematika | 50 | 50 | 50 | 50 | 0 / 0 | 100 | 50 |
| 9 | Bahasa Indonesia | 50 | 50 | 50 | 50 | 0 / 0 | 100 | 50 |
| 9 | Matematika | 50 | 50 | 50 | 50 | 0 / 0 | 100 | 50 |
| **Total** | | **200** | **200** | **200** | **200** | **0 / 0** | **400** | **200** |

Penghitungan memakai ID soal distinct, bukan jumlah join/version/review. Setiap kelompok mempunyai 20 PG_TUNGGAL, 15 PGK_MA, 15 PGK_KATEGORI, seluruhnya sumber IMPORT, serta 50 hash nonnull berbeda di dalam kelompok. Jumlah global berbeda karena pengulangan lintas kelas di atas. Ada 200 versi, tidak ada soal tanpa current, multiple-current, hash current kosong, atau pasangan review/version tidak cocok. Tidak ada review sama sekali; hasil nol mismatch bukan bukti workflow review telah teruji.

Kelima dimensi teks element/material/sub_material/competency/indicator serta cognitive_level terisi pada seluruh 50 soal tiap kelompok. **Terisi bukan berarti benar atau sesuai matriks resmi**; audit ini tidak mengambil isi soal dan tidak memvalidasi pemetaan pedagogis satu per satu. Hash existing juga tidak konsisten sebagai sidik semantik: jalur impor memakai teks+penjelasan, sedangkan revisi memasukkan identitas stimulus baru. Dibutuhkan deduplikasi terkontrol, tanpa memublikasikan isi soal di laporan.

## 4. Kontrak live yang harus dipertahankan

### 4.1 Bank soal dan review

Nama, tipe, nullability, default, constraint, serta signature lengkap tersedia pada lampiran katalog di bawah; bukan asumsi dari migration source.

- [questions](ADDENDUM_02_AUDIT.md:1): kode soal unik; grade 1–12; subject_name wajib tetapi subject_code bukan FK ke subjects. Status: DRAFT, PENDING_REVIEW, NEEDS_REVISION, APPROVED, PUBLISHED, ARCHIVED. Sumber: AI/GURU/MITRA/IMPORT. Struktur SOAL_TUNGGAL/SOAL_GRUP; tipe PG_TUNGGAL/PGK_MA/PGK_KATEGORI; kategori mapel WAJIB/PILIHAN.
- [question_versions](ADDENDUM_02_AUDIT.md:1): nomor versi positif unik per soal; indeks unik parsial menjamin **maksimal satu** current, bukan minimal satu. Status DRAFT/PENDING_REVIEW/NEEDS_REVISION/APPROVED/PUBLISHED/SUPERSEDED. Pertahankan ID versi sebagai snapshot attempt. Jangan mengganti versi yang sudah digunakan attempt.
- [question_reviews](ADDENDUM_02_AUDIT.md:1): reviewer wajib, timestamp wajib, aksi SUBMIT/APPROVE/REQUEST_REVISION/REJECT/COMMENT; FK komposit memastikan review menunjuk versi milik soal yang sama. Atribusi akun/timestamp merupakan jejak audit, **bukan bukti kriptografis bahwa manusia benar-benar menelaah**.
- Tidak ada public RPC review/publish soal di 29 fungsi public yang terambil. Policy soal/versi yang terlihat hanya SELECT untuk izin bank_soal.view; tidak ada policy review. Kode izin bank_soal.review/moderate/publish tersedia, tetapi keberadaan kode izin bukan implementasi workflow.

### 4.2 Fungsi yang definisinya diperiksa utuh

Seluruh 40 definisi tersimpan lengkap. Pemeriksaan manual utuh difokuskan pada fungsi-fungsi berikut; tidak mengklaim seluruh jalur sekolah/admin telah diuji runtime.

| Fungsi live | Kontrak/perilaku penting | Implikasi backend berikutnya |
|---|---|---|
| [start_exam_attempt](ADDENDUM_02_AUDIT.md:1) | Grade 6/9; hitungan 1–100, durasi 1–240; default **20/60**; advisory lock, resume aktif, snapshot versi; memilih question PUBLISHED dan current, tetapi tidak mensyaratkan version PUBLISHED atau review; hanya error jika hasil nol | Default legacy bukan kebijakan resmi; perketat kelayakan versi+review, konfigurasi versioned, matriks dan exact-count. Saat ini kekurangan sebagian dapat menghasilkan sesi lebih pendek tanpa error |
| [get_exam_attempt_review](ADDENDUM_02_AUDIT.md:1) | Pemilik terautentikasi, attempt SUBMITTED; penjelasan/kunci hanya pascasubmit; memakai helper correctness private | Pertahankan batas akses. Defek correctness kategori historis tidak boleh disebut masih live: helper sudah digunakan |
| [save_question_revision](ADDENDUM_02_AUDIT.md:1) | Izin bank_soal.edit dan akun aktif; versi baru PENDING_REVIEW, noncurrent; versi lama dipertahankan; kategori dibatasi BENAR/SALAH; scoring_rule lama dipertahankan | Perlu label kategori terstruktur agar Sesuai/Tidak Sesuai didukung tanpa merusak snapshot lama |
| [save_question_import_batch](ADDENDUM_02_AUDIT.md:1) | Superadmin aktif; payload TQBS MATA_PELAJARAN/STIMULUS/SOAL/RESPON_KUNCI; soal DRAFT, versi PENDING_REVIEW noncurrent, stimulus DRAFT; taxonomy diwarisi dari baris mapel; nilai kognitif/kesulitan tidak dikenal dinormalisasi ke default | Komentar lama tentang langsung aktif/disetujui tidak cocok dengan SQL. Perlu taxonomy per soal, validasi eksplisit, tanpa silent fallback atau autoapproval |
| [save_ai_question_draft_batch](ADDENDUM_02_AUDIT.md:1) | Superadmin aktif; soal DRAFT/source IMPORT, versi PENDING_REVIEW noncurrent; penanda SMART_IMPORT_AI pada scoring_rule; tidak menyimpan taxonomy element/material/submaterial/competency/indicator | Izin operator import saja tidak cukup. Jangan menganggap payload taxonomy AI tersimpan atau source AI sudah tercatat konsisten |
| [handle_new_user](ADDENDUM_02_AUDIT.md:1) | Metadata pendaftaran independent/school dan jenjang sd/smp/sma mengisi jenjang serta lock; conflict profile diabaikan | Tidak mengisi kontak atau completion marker; jangan mengandalkan metadata klien untuk status verifikasi kontak |
| [protect_profile_education_level](ADDENDUM_02_AUDIT.md:1) | Memblokir perubahan jenjang/lock saat current_user authenticated | Pertahankan workflow perubahan jenjang; lengkapi dengan ACL, bukan mengandalkan trigger saja |
| [valid_admin_permissions](ADDENDUM_02_AUDIT.md:1) | view/review/edit/moderate/publish/import bank soal dan education_level.review | Gunakan izin granular pada workflow baru, jangan mengira semua RPC legacy sudah menghormati izin tersebut |
| [save_school_assignment](ADDENDUM_02_AUDIT.md:1) | Staff sekolah; kelas 6/9 milik sekolah; hanya draft dapat diedit, optimistic concurrency melalui expected_updated_at; due masa depan | Pertahankan otorisasi dan konflik edit; konfigurasi resmi baru harus di-snapshot, bukan mengubah assignment published |
| [start_school_assignment](ADDENDUM_02_AUDIT.md:1) | Penerima dan membership siswa aktif; published; waktu cukup; lock sama dengan sesi mandiri; salin snapshot versi assignment, resume existing | Pertahankan pemisahan sesi/tugas dan snapshot; uji jalur publish assignment sebelum menambah seleksi matriks |

### 4.3 Profil dan WhatsApp

[profiles](ADDENDUM_02_AUDIT.md:1) berisi ID, nama, avatar, status akun, timestamp, jenjang, waktu lock dan completion marker; rincian lengkap di lampiran. Tidak ada CHECK jenjang pada tabel profil dalam katalog yang ditangkap; validasi pada jalur fungsi tidak boleh dianggap constraint universal.

Agregat: **5 profil, 5 aktif, 3 memiliki jenjang, 3 terkunci, 0 completion marker, 4 nama terisi**. Distribusi jenjang: sd 2, sma 1, kosong 2. Tidak memilih ID/nama/rekaman individual. RLS membatasi baca/update profil milik sendiri; privilege UPDATE authenticated hanya pada full_name dan updated_at, bukan avatar, status, jenjang atau completion marker. Menambah field di UI tidak otomatis membuat penyimpanan field baru berfungsi.

Tidak ditemukan kolom kontak di public/private, khususnya profil, profil akademik atau sekolah. Kontrak usulan (belum ada): nomor ternormalisasi, kepemilikan siswa/wali yang jelas, consent, status/timestamp verifikasi server, pembatasan akses, retensi, rate limit/antiabuse. Jangan memakai satu boolean completion untuk menyamakan nama terisi, nomor tersedia dan nomor terverifikasi. Jangan menaruh nomor kontak pada ranking/payload sekolah publik.

### 4.4 Sekolah dan tahap 4

Delapan tabel sekolah yang diaudit agregat semuanya **0 baris**: [schools](ADDENDUM_02_AUDIT.md:1), [classes](ADDENDUM_02_AUDIT.md:1), [school_memberships](ADDENDUM_02_AUDIT.md:1), [school_invites](ADDENDUM_02_AUDIT.md:1), [student_academic_profiles](ADDENDUM_02_AUDIT.md:1), [school_assignments](ADDENDUM_02_AUDIT.md:1), [school_assignment_questions](ADDENDUM_02_AUDIT.md:1), [school_assignment_recipients](ADDENDUM_02_AUDIT.md:1). Jadi belum ada bukti pemakaian live workflow sekolah.

Profil akademik memiliki FK kelas/sekolah komposit dan grade 1–12, tetapi default tahun akademik **2026/2027** bersifat statis. Kelas memiliki grade integer tanpa CHECK rentang pada katalog; assignment membatasi grade 6/9. Membership unik sekolah/user, sehingga satu baris tidak menyimpan beberapa role sekaligus. Assignment-question menyimpan FK question dan version secara terpisah, bukan FK pasangan komposit; pertahankan validasi kecocokan pada jalur penulisan.

**Tidak ada** sembilan tabel tahap 4: [school_applications](ADDENDUM_02_AUDIT.md:1), [school_onboarding_settings](ADDENDUM_02_AUDIT.md:1), [school_invite_requests](ADDENDUM_02_AUDIT.md:1), [school_coordinator_transfers](ADDENDUM_02_AUDIT.md:1), [school_messages](ADDENDUM_02_AUDIT.md:1), [school_message_reads](ADDENDUM_02_AUDIT.md:1), [school_support_tickets](ADDENDUM_02_AUDIT.md:1), [school_ticket_replies](ADDENDUM_02_AUDIT.md:1), [school_onboarding_audit](ADDENDUM_02_AUDIT.md:1).

**Tidak ada** sepuluh RPC tahap 4: [school_portal_context](ADDENDUM_02_AUDIT.md:1), [submit_school_application](ADDENDUM_02_AUDIT.md:1), [review_school_application](ADDENDUM_02_AUDIT.md:1), [school_admin_workspace](ADDENDUM_02_AUDIT.md:1), [school_admin_mutate](ADDENDUM_02_AUDIT.md:1), [school_invite_request](ADDENDUM_02_AUDIT.md:1), [school_communications](ADDENDUM_02_AUDIT.md:1), [school_communication_mutate](ADDENDUM_02_AUDIT.md:1), [school_coordinator_transfer](ADDENDUM_02_AUDIT.md:1), [platform_school_workspace](ADDENDUM_02_AUDIT.md:1).

Kolom [classes.onboarding_archived](ADDENDUM_02_AUDIT.md:1) dan [school_invites.onboarding_class_id](ADDENDUM_02_AUDIT.md:1) juga tidak ada. [Migrasi tahap 4](migration-stage-4-school-onboarding.sql) adalah calon deployment terpisah, bukan tindakan yang diotorisasi audit ini.

## 5. Sumber resmi dan batas verifikasi

Tautan literal “tiga URL Pusmendik” tidak tersedia dalam pesan yang diterima. URL di bawah **ditemukan melalui portal**, bukan diklaim identik dengan tiga URL pengguna. Semua fetch yang dilaporkan berhasil memberi HTTP 200 pada 14 November 2026. Host lama gagal DNS; Node pada host baru gagal rantai sertifikat. PowerShell memakai trust Windows berhasil tanpa menonaktifkan pemeriksaan sertifikat. Halaman JDIH utama berhasil diambil tetapi halaman detail status regulasi tidak berhasil diidentifikasi; tidak ada klaim seluruh perubahan/pencabutan terbaru sudah diperiksa.

### 5.1 Portal dan kerangka

Judul portal: **TKA — Pusat Asesmen Pendidikan :: Kementerian Pendidikan Dasar dan Menengah**.

- [Portal TKA](https://pusmendik.kemendikdasmen.go.id/tka/).
- [Kerangka SD/MI/sederajat — default Matematika](https://pusmendik.kemendikdasmen.go.id/tka/kerangka/sd/).
- [Kerangka SMP/MTs/sederajat — default Matematika](https://pusmendik.kemendikdasmen.go.id/tka/kerangka/smp/).
- [Bahasa Indonesia SD](https://pusmendik.kemendikdasmen.go.id/tka/kerangka/sd/?jenis=mata-pelajaran-wajib&mapel=bahasa-indonesia).
- [Bahasa Indonesia SMP](https://pusmendik.kemendikdasmen.go.id/tka/kerangka/smp/?jenis=mata-pelajaran-wajib&mapel=bahasa-indonesia).
- [Unduhan resmi](https://pusmendik.kemendikdasmen.go.id/tka/unduhan/), sumber tautan PDF berikut.

**Peraturan Kepala BSKAP 047/H/AN/2025, Kerangka Asesmen Tes Kemampuan Akademik Jenjang SD/MI/Sederajat dan SMP/MTs/Sederajat**, 24 Juli 2025: [PDF 46 halaman](https://pusmendik.kemendikdasmen.go.id/tka/files/07180.pdf), SHA256 25f2dd0e292108893298a9684004dcaf3c003fe8ee6b2e1ecff243ceccd8d04b. Nomor halaman berikut adalah halaman fisik PDF, bukan indeks nol.

| Jenjang/mapel | Dimensi resmi yang perlu dipisahkan | Halaman PDF |
|---|---|---|
| BI SD | Fokus membaca; teks informasi/fiksi; Pemahaman Tekstual, Pemahaman Inferensial, Evaluasi dan Apresiasi; subkompetensi khusus SD | 8–10 |
| BI SMP | Fokus membaca; teks informasi/fiksi; tiga kompetensi yang sama, tetapi daftar subkompetensi SMP tidak identik SD | 15–17 |
| Matematika SD | Bilangan; Geometri dan Pengukuran; Data. Matriks elemen/subelemen dan kompetensi; kognitif pengetahuan/pemahaman, aplikasi, penalaran | 10–15; matriks 13–15 |
| Matematika SMP | Bilangan; Aljabar; Geometri dan Pengukuran; Data dan Peluang. Matriks subelemen, kompetensi dan batasan | 18–25; matriks 20–25 |
| Bentuk soal | PG dan PGK (MCMA serta kategori) | 7 |

Contoh struktur: SD Bilangan → Bilangan Rasional; SMP Geometri dan Pengukuran → Objek Geometri/Transformasi Geometri/Pengukuran; SMP Data dan Peluang → Data/Peluang. BI memerlukan jenis teks, kompetensi dan subkompetensi membaca, bukan dipaksa memakai elemen matematika. Tema/topik produk boleh menjadi label analitik tambahan, **bukan pengganti taxonomy resmi**. Contoh kategori resmi pada halaman BI daring juga memakai Sesuai/Tidak Sesuai, sehingga hardcode hanya BENAR/SALAH tidak cukup. Tidak menyalin contoh soal/kunci ke laporan.

### 5.2 Regulasi 2025/2026

| Dokumen dan sumber | Bukti pasal/halaman | Kesimpulan yang aman |
|---|---|---|
| **Permendikdasmen 9 Tahun 2025 tentang Tes Kemampuan Akademik**, [PDF 15 halaman](https://pusmendik.kemendikdasmen.go.id/tka/files/81259.pdf) | Hlm. 11 Pasal 25 mencabut Permendikbudristek 31/2023 tentang Uji Kesetaraan; Pasal 26 berlaku saat diundangkan. Hlm. 12 ditetapkan 28 Mei, diundangkan 3 Juni 2025, BN 384 | Ada teks pengundangan, tetapi halaman awal juga memuat kata **RANCANGAN**. Inkonsistensi artefak harus diklarifikasi dengan salinan final JDIH; tidak menyatakan dokumen bebas masalah atau status hukum terkini telah disertifikasi |
| Salinan lain yang dilabeli 9/2025 pada portal, [PDF alternatif](https://pusmendik.kemendikdasmen.go.id/tka/files/00465.pdf) | 15 halaman; ekstraksi halaman awal juga memuat RANCANGAN | Duplikat unduhan bukan verifikasi independen |
| **Permendikdasmen 9 Tahun 2026 tentang Perubahan atas Permendikbudristek 17 Tahun 2021 tentang Asesmen Nasional**, [PDF 5 halaman](https://pusmendik.kemendikdasmen.go.id/tka/files/98566.pdf) | Hlm. 4 Pasal 9A memungkinkan integrasi literasi/numerasi dengan capaian akademik; Pasal II berlaku saat diundangkan; hlm. 5 ditetapkan 11 Februari dan diundangkan 12 Februari 2026, BN 98 | Ini perubahan aturan **AN**, bukan perubahan langsung terhadap Permendikdasmen TKA 9/2025 |
| **Kepmendikdasmen 56 Tahun 2026 tentang Pedoman Penyelenggaraan Tes Kemampuan Akademik dan Asesmen Nasional**, [PDF 71 halaman](https://pusmendik.kemendikdasmen.go.id/tka/files/39870.pdf) | Hlm. 3 diktum KEEMPAT mencabut 95/M/2025; KELIMA berlaku saat ditetapkan, 6 Maret 2026. Hlm. fisik 47–48/halaman tercetak 44–45 tabel jadwal SD/SMP | Bukti eksplisit pencabutan pedoman lama dan waktu komponen gabungan; tidak menganggap pedoman 2025 tetap berlaku tanpa memperhitungkan 2026 |
| **Petunjuk Teknis TKA–AN 2026** (label halaman unduhan), [PDF 48 halaman](https://pusmendik.kemendikdasmen.go.id/tka/files/25346.pdf) | Seluruh 48 halaman menghasilkan teks kosong, dokumen scan; identitas/isi operatif belum dapat diverifikasi dari ekstraksi | Jumlah soal dan ketentuan teknis yang mungkin ada di sini **belum diverifikasi**; butuh OCR/inspeksi visual terarah sebelum konfigurasi resmi dikunci |

Tabel 56/2026: untuk SD/SMP, hari I Matematika **dan Numerasi 75 menit**, hari II Bahasa Indonesia **dan Literasi Membaca 75 menit**, masing-masing latihan 10 menit dan survei 20 menit terpisah. Tidak mengubah angka ini menjadi “75 menit TKA murni” atau menjumlahkannya sebagai durasi latihan produk tanpa keputusan produk yang eksplisit.

Checksum tambahan: PDF 9/2025 81259 a67ea228bd2eee8866dd542a307736eeb4dd021e2d88aff94ae4df86436a24e5; alternatif 00465 a75a7d9554fd2e5e19fcb0ad58fcb1c33aa5322d25b6a3abc3d238ebe933638d; 9/2026 cee0c77cd73062da8c34566a0ca813c788ec649f97a751bacc4167522c9d57f1; juknis scan 77cf8f22cbc378a121c99b32be0599e06bc6d02da9ef3ebe66191b891a7d10f2. PDF/HTML, metadata fetch dan hasil ekstraksi berada hanya di direktori ignored [bukti lokal](../../.local/database/).

## 6. Workbook produk

Ditemukan workbook [TKA (1).xlsx](ADDENDUM_02_AUDIT.md:1) pada Downloads pengguna, ukuran 228965 byte, SHA256 **7100ae19539566a6c702bd21803b7cd6c7e0e7d4a4913e3fed2b1c6c3546ea41**. Workbook berada di luar workspace dan tidak disalin; nama, lokasi umum dan checksum adalah locator audit. Hasil pembacaan lokal: [ekstraksi workbook](../../.local/database/addendum-02-workbook.json), tidak disalin ke repo.

Sheet simulasi-tka/latihan soal/hasil-evaluasi/school dan Sheet10 menunjukkan pemilihan BI/Matematika, konfigurasi jumlah/durasi, evaluasi tema/topik (kuat/cukup/perlu pendalaman), jadwal/tugas sekolah, top-5 serta rancangan subscription/managed account. Contoh Matematika **30 soal/90 menit** merupakan contoh produk, **bukan ketentuan resmi**. Sheet flowchart tidak memiliki data sel; tidak ditemukan hyperlink sumber regulasi. Workbook contoh bank soal lain hanya lima baris soal, bukan sumber inventori 400. Tidak membaca spreadsheet pribadi yang tidak relevan.

## 7. Handoff backend berurutan — belum diimplementasikan

1. **Tutup ketidakpastian sumber:** konfirmasi salinan final 9/2025 melalui JDIH; OCR/inspeksi juknis 2026 untuk jumlah soal dan apakah ada pembagian waktu/komponen lebih rinci. Simpan sumber, hash, halaman, tanggal penetapan/pengundangan dan relasi pengganti. Sampai itu selesai, gunakan konfigurasi latihan berlabel produk, jangan badge “sesuai ujian resmi”.
2. **Deployment sekolah terpisah:** review migrasi tahap 4 terhadap katalog di lampiran dan uji di lingkungan nonproduksi. Deployment produksi perlu otorisasi terpisah; jangan menjalankan runner migrasi sebagai bagian audit ini.
3. **Konfigurasi dan taxonomy versioned:** belum ada tabel registry sumber/matriks/konfigurasi resmi di katalog live. Rancang relasi jenjang–mapel–versi sumber, elemen/subelemen matematika, kompetensi/subkompetensi membaca, jenis teks, indikator dan cognitive level yang terpisah. Snapshot config/source ke sesi/assignment agar hasil historis tidak berubah ketika regulasi atau label berubah.
4. **Workflow editorial transaksional:** tambah kontrak submit/review/request-revision/approve/publish yang memeriksa akun aktif dan izin granular, version ID yang tepat, konflik edit serta audit aktor/waktu. Publication harus mensyaratkan versi current PUBLISHED dan persetujuan versi tersebut; jangan memalsukan review untuk existing published. Draft AI/impor tetap noncurrent sampai workflow sah selesai.
5. **Seleksi soal aman:** selection berdasarkan taxonomy+config, kualitas/review, keunikan dan exact-count; error eksplisit saat persediaan kurang, bukan diam-diam memendekkan ujian. Pertahankan advisory lock/resume, timer server, key secrecy dan snapshot version. Jangan mengubah default lama tanpa kompatibilitas klien dan tes.
6. **Kontak profil:** migrasi/kontrak baru dengan otorisasi ketat, normalisasi nomor, persetujuan dan verifikasi server; completion dapat dibuktikan per persyaratan. Jangan membuka UPDATE status/verifikasi kepada authenticated secara luas atau menganggap field UI sudah mempunyai kolom live.
7. **Pemenuhan konten:** telaah 200 existing, investigasi 30 grup hash lintas kelas, validasi matriks resmi per soal, lalu tambah setidaknya 50 kandidat per kelompok jika semuanya lolos. Jika deduplikasi/review menggugurkan soal, kebutuhan lebih besar dari 200. Kriteria selesai: 100 ID/semantik layak per kelompok, current+published dan bukti review versi, bukan sekadar 400 baris.
8. **Tes sebelum rollout:** RLS/ACL lintas peran dan sekolah, konflik revisi/current, review atas versi lama, label kategori beragam, kehabisan stok matriks, snapshot/resume/history, assignment dan ranking privat, serta field profil yang tidak dapat diubah sendiri. Audit ini tidak menjalankan tes yang menulis DB.

## 8. Lampiran kontrak katalog

Validasi lokal lulus: pemeriksaan sintaks Node, ESLint untuk skrip audit, pemeriksaan whitespace Git, serta pencocokan checksum bukti, 259 kolom, 40 signature dan ketidakhadiran objek tahap 4. Git menunjukkan hanya dua berkas baru audit di luar direktori ignored, selain dua berkas OCR untracked yang sudah ada; tidak ada berkas tracked existing yang berubah. Build aplikasi dan tes yang menulis database tidak dijalankan karena scope hanya dokumentasi dan skrip audit.

Lampiran berikut dihasilkan dari snapshot live yang sama, tanpa menyalin data pengguna atau isi/kunci soal. Semua 40 signature serta kolom/constraint seluruh 29 tabel dicantumkan agar backend tidak perlu menebak kontrak; definisi fungsi lengkap tetap di bukti lokal.

### 8.1 Seed referensi aktual

#### [education_levels](ADDENDUM_02_AUDIT.md:1)

- [sd](ADDENDUM_02_AUDIT.md:1): SD / MI
- [sma](ADDENDUM_02_AUDIT.md:1): SMA / MA / SMK
- [smp](ADDENDUM_02_AUDIT.md:1): SMP / MTs

#### [school_types](ADDENDUM_02_AUDIT.md:1)

- [ma](ADDENDUM_02_AUDIT.md:1): MA — jenjang [sma](ADDENDUM_02_AUDIT.md:1)
- [mi](ADDENDUM_02_AUDIT.md:1): MI — jenjang [sd](ADDENDUM_02_AUDIT.md:1)
- [mts](ADDENDUM_02_AUDIT.md:1): MTs — jenjang [smp](ADDENDUM_02_AUDIT.md:1)
- [sd](ADDENDUM_02_AUDIT.md:1): SD — jenjang [sd](ADDENDUM_02_AUDIT.md:1)
- [sma](ADDENDUM_02_AUDIT.md:1): SMA — jenjang [sma](ADDENDUM_02_AUDIT.md:1)
- [smk](ADDENDUM_02_AUDIT.md:1): SMK / MAK — jenjang [sma](ADDENDUM_02_AUDIT.md:1)
- [smp](ADDENDUM_02_AUDIT.md:1): SMP — jenjang [smp](ADDENDUM_02_AUDIT.md:1)

#### [subjects](ADDENDUM_02_AUDIT.md:1)

- [bahasa-indonesia](ADDENDUM_02_AUDIT.md:1): Bahasa Indonesia — jenjang [sd](ADDENDUM_02_AUDIT.md:1) — aktif true
- [bahasa-indonesia-sma](ADDENDUM_02_AUDIT.md:1): Bahasa Indonesia — jenjang [sma](ADDENDUM_02_AUDIT.md:1) — aktif true
- [bahasa-indonesia-smp](ADDENDUM_02_AUDIT.md:1): Bahasa Indonesia — jenjang [smp](ADDENDUM_02_AUDIT.md:1) — aktif true
- [bahasa-inggris](ADDENDUM_02_AUDIT.md:1): Bahasa Inggris — jenjang [sma](ADDENDUM_02_AUDIT.md:1) — aktif true
- [matematika](ADDENDUM_02_AUDIT.md:1): Matematika — jenjang [sd](ADDENDUM_02_AUDIT.md:1) — aktif true
- [matematika-sma](ADDENDUM_02_AUDIT.md:1): Matematika — jenjang [sma](ADDENDUM_02_AUDIT.md:1) — aktif true
- [matematika-smp](ADDENDUM_02_AUDIT.md:1): Matematika — jenjang [smp](ADDENDUM_02_AUDIT.md:1) — aktif true

### 8.2 Kolom dan constraint live

Notasi: wajib berarti NOT NULL; opsional berarti nullable. Default kosong berarti tidak ada default katalog. Definisi CHECK/FK/UNIQUE berikut disalin dari katalog, bukan rekomendasi baru.

#### [admin_access_audit](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [actor_user_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [target_user_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [action](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [old_data](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [new_data](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [admin_access_audit_actor_user_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (actor_user_id) REFERENCES profiles(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [admin_access_audit_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [admin_access_audit_target_user_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (target_user_id) REFERENCES profiles(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [admin_operator_accounts](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [user_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [is_active](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | wajib | [false](ADDENDUM_02_AUDIT.md:1) |
| [created_by](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [updated_by](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |
| [updated_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [admin_operator_accounts_created_by_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (created_by) REFERENCES profiles(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [admin_operator_accounts_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (user_id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [admin_operator_accounts_updated_by_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (updated_by) REFERENCES profiles(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [admin_operator_accounts_user_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE RESTRICT](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [admin_operator_permissions](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [user_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [permission_code](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [granted_by](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [admin_operator_permissions_granted_by_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (granted_by) REFERENCES profiles(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [admin_operator_permissions_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [admin_operator_permissions_user_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE RESTRICT](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [admin_operator_permissions_user_id_permission_code_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (user_id, permission_code)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [classes](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [school_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [name](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [education_level_id](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [grade](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [academic_year](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [homeroom_teacher_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |
| [updated_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [classes_education_level_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (education_level_id) REFERENCES education_levels(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [classes_homeroom_teacher_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (homeroom_teacher_id) REFERENCES auth.users(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [classes_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [classes_school_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [classes_school_id_name_academic_year_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (school_id, name, academic_year)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [education_level_change_requests](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [user_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [current_level](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [requested_level](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [reason](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [status](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['PENDING'::text](ADDENDUM_02_AUDIT.md:1) |
| [reviewed_by](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [reviewed_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [admin_note](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |
| [updated_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [different_education_level](ADDENDUM_02_AUDIT.md:1): [CHECK (current_level <> requested_level)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [education_level_change_requests_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [education_level_change_requests_reviewed_by_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (reviewed_by) REFERENCES auth.users(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [education_level_change_requests_status_check](ADDENDUM_02_AUDIT.md:1): [CHECK (status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [education_level_change_requests_user_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [education_level_history](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [user_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [previous_level](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [new_level](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [actor_user_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [request_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [change_note](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [education_level_history_actor_user_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (actor_user_id) REFERENCES auth.users(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [education_level_history_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [education_level_history_request_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (request_id) REFERENCES education_level_change_requests(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [education_level_history_user_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [education_levels](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [name](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [grade](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [education_levels_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [exam_attempt_answers](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [attempt_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [question_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [answer_payload](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | wajib | ['{}'::jsonb](ADDENDUM_02_AUDIT.md:1) |
| [answered_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [exam_attempt_answers_attempt_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [exam_attempt_answers_attempt_id_question_id_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (attempt_id, question_id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [exam_attempt_answers_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [exam_attempt_answers_question_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (question_id) REFERENCES questions(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [exam_attempt_questions](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [attempt_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [question_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [question_version_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [question_order](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [exam_attempt_questions_attempt_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [exam_attempt_questions_attempt_id_question_id_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (attempt_id, question_id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [exam_attempt_questions_attempt_id_question_order_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (attempt_id, question_order)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [exam_attempt_questions_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [exam_attempt_questions_question_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (question_id) REFERENCES questions(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [exam_attempt_questions_question_version_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (question_version_id) REFERENCES question_versions(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [exam_attempts](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [user_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [education_level](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [grade](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [subject_name](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [attempt_status](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['IN_PROGRESS'::text](ADDENDUM_02_AUDIT.md:1) |
| [duration_minutes](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | [60](ADDENDUM_02_AUDIT.md:1) |
| [total_questions](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | [0](ADDENDUM_02_AUDIT.md:1) |
| [correct_answers](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [score](ADDENDUM_02_AUDIT.md:1) | [numeric(6,2)](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [started_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |
| [submitted_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [exam_attempts_attempt_status_check](ADDENDUM_02_AUDIT.md:1): [CHECK (attempt_status = ANY (ARRAY['IN_PROGRESS'::text, 'SUBMITTED'::text, 'CANCELLED'::text, 'EXPIRED'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [exam_attempts_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [exam_attempts_user_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (user_id) REFERENCES auth.users(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [profiles](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [full_name](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [avatar_url](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [account_status](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['active'::text](ADDENDUM_02_AUDIT.md:1) |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |
| [updated_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |
| [education_level](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [education_level_locked_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [profile_completed_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | opsional | — |

Constraint:

- [profiles_account_status_check](ADDENDUM_02_AUDIT.md:1): [CHECK (account_status = ANY (ARRAY['active'::text, 'suspended'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [profiles_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [profiles_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [question_category_items](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [question_version_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [item_number](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [item_text](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [category_label](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [correct_category](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [explanation](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [question_category_items_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_category_items_question_version_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (question_version_id) REFERENCES question_versions(id) ON DELETE RESTRICT](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_category_items_question_version_id_item_number_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (question_version_id, item_number)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [question_import_batches](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [batch_code](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [file_name](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [source_type](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['IMPORT'::text](ADDENDUM_02_AUDIT.md:1) |
| [total_rows](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | [0](ADDENDUM_02_AUDIT.md:1) |
| [valid_rows](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | [0](ADDENDUM_02_AUDIT.md:1) |
| [error_rows](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | [0](ADDENDUM_02_AUDIT.md:1) |
| [imported_rows](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | [0](ADDENDUM_02_AUDIT.md:1) |
| [batch_status](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['UPLOADED'::text](ADDENDUM_02_AUDIT.md:1) |
| [notes](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_by](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |
| [completed_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [template_version](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | ['TQBS-2.0'::text](ADDENDUM_02_AUDIT.md:1) |
| [file_path](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [started_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [updated_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [question_import_batches_batch_code_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (batch_code)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_import_batches_batch_status_check](ADDENDUM_02_AUDIT.md:1): [CHECK (batch_status = ANY (ARRAY['UPLOADED'::text, 'PROCESSING'::text, 'VALIDATED'::text, 'PARTIAL'::text, 'COMPLETED'::text, 'FAILED'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_import_batches_created_by_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (created_by) REFERENCES profiles(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_import_batches_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_import_batches_source_type_check](ADDENDUM_02_AUDIT.md:1): [CHECK (source_type = ANY (ARRAY['IMPORT'::text, 'AI'::text, 'GURU'::text, 'MITRA'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [question_import_rows](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [batch_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [sheet_name](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [source_row_number](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [source_key](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [raw_data](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | wajib | ['{}'::jsonb](ADDENDUM_02_AUDIT.md:1) |
| [normalized_data](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | wajib | ['{}'::jsonb](ADDENDUM_02_AUDIT.md:1) |
| [validation_status](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['PENDING'::text](ADDENDUM_02_AUDIT.md:1) |
| [validation_errors](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | wajib | ['[]'::jsonb](ADDENDUM_02_AUDIT.md:1) |
| [validation_warnings](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | wajib | ['[]'::jsonb](ADDENDUM_02_AUDIT.md:1) |
| [imported_record_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |
| [updated_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [question_import_rows_batch_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (batch_id) REFERENCES question_import_batches(id) ON DELETE CASCADE](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_import_rows_batch_id_sheet_name_source_row_number_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (batch_id, sheet_name, source_row_number)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_import_rows_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_import_rows_sheet_name_check](ADDENDUM_02_AUDIT.md:1): [CHECK (sheet_name = ANY (ARRAY['MATA_PELAJARAN'::text, 'STIMULUS'::text, 'SOAL'::text, 'RESPON_KUNCI'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_import_rows_source_row_number_check](ADDENDUM_02_AUDIT.md:1): [CHECK (source_row_number >= 1)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_import_rows_validation_status_check](ADDENDUM_02_AUDIT.md:1): [CHECK (validation_status = ANY (ARRAY['PENDING'::text, 'VALID'::text, 'WARNING'::text, 'ERROR'::text, 'IMPORTED'::text, 'SKIPPED'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [question_options](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [question_version_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [option_code](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [option_text](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [option_order](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | [1](ADDENDUM_02_AUDIT.md:1) |
| [is_correct](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | wajib | [false](ADDENDUM_02_AUDIT.md:1) |
| [explanation](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [question_options_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_options_question_version_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (question_version_id) REFERENCES question_versions(id) ON DELETE RESTRICT](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_options_question_version_id_option_code_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (question_version_id, option_code)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_options_question_version_id_option_order_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (question_version_id, option_order)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [question_reviews](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [question_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [question_version_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [reviewer_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [review_action](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [review_notes](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [reviewed_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [question_reviews_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_reviews_question_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_reviews_question_version_id_question_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (question_version_id, question_id) REFERENCES question_versions(id, question_id) ON DELETE RESTRICT](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_reviews_review_action_check](ADDENDUM_02_AUDIT.md:1): [CHECK (review_action = ANY (ARRAY['SUBMIT'::text, 'APPROVE'::text, 'REQUEST_REVISION'::text, 'REJECT'::text, 'COMMENT'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_reviews_reviewer_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (reviewer_id) REFERENCES profiles(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [question_stimuli](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [stimulus_code](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [stimulus_type](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [title](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [content_text](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [file_url](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [media_description](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [source_reference](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [usage_rights](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['ORISINAL'::text](ADDENDUM_02_AUDIT.md:1) |
| [stimulus_status](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['DRAFT'::text](ADDENDUM_02_AUDIT.md:1) |
| [created_by](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |
| [updated_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [question_stimuli_created_by_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (created_by) REFERENCES profiles(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_stimuli_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_stimuli_stimulus_code_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (stimulus_code)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_stimuli_stimulus_status_check](ADDENDUM_02_AUDIT.md:1): [CHECK (stimulus_status = ANY (ARRAY['DRAFT'::text, 'REVIEW'::text, 'APPROVED'::text, 'ARCHIVED'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_stimuli_stimulus_type_check](ADDENDUM_02_AUDIT.md:1): [CHECK (stimulus_type = ANY (ARRAY['TEKS'::text, 'GAMBAR'::text, 'TABEL'::text, 'GRAFIK'::text, 'AUDIO'::text, 'VIDEO'::text, 'LAINNYA'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_stimuli_usage_rights_check](ADDENDUM_02_AUDIT.md:1): [CHECK (usage_rights = ANY (ARRAY['ORISINAL'::text, 'BERLISENSI'::text, 'IZIN_TERTULIS'::text, 'DOMAIN_PUBLIK'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [question_versions](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [question_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [version_number](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [stimulus_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [instruction](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [question_text](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [explanation](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [scoring_rule](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | wajib | ['{}'::jsonb](ADDENDUM_02_AUDIT.md:1) |
| [content_hash](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [version_status](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['DRAFT'::text](ADDENDUM_02_AUDIT.md:1) |
| [is_current](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | wajib | [true](ADDENDUM_02_AUDIT.md:1) |
| [created_by](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [question_versions_created_by_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (created_by) REFERENCES profiles(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_versions_id_question_id_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (id, question_id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_versions_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_versions_question_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_versions_question_id_version_number_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (question_id, version_number)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_versions_stimulus_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (stimulus_id) REFERENCES question_stimuli(id) ON DELETE RESTRICT](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_versions_version_number_check](ADDENDUM_02_AUDIT.md:1): [CHECK (version_number > 0)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [question_versions_version_status_check](ADDENDUM_02_AUDIT.md:1): [CHECK (version_status = ANY (ARRAY['DRAFT'::text, 'PENDING_REVIEW'::text, 'NEEDS_REVISION'::text, 'APPROVED'::text, 'PUBLISHED'::text, 'SUPERSEDED'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [questions](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [question_code](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [education_level_id](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [grade](ADDENDUM_02_AUDIT.md:1) | [smallint](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [school_type](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [subject_code](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [subject_name](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [subject_category](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['WAJIB'::text](ADDENDUM_02_AUDIT.md:1) |
| [curriculum_reference](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [element](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [material](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [sub_material](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [competency](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [indicator](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [cognitive_level](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [difficulty](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [question_structure](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['SOAL_TUNGGAL'::text](ADDENDUM_02_AUDIT.md:1) |
| [group_order](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [question_type](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [question_status](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['DRAFT'::text](ADDENDUM_02_AUDIT.md:1) |
| [import_batch_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [source_type](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['IMPORT'::text](ADDENDUM_02_AUDIT.md:1) |
| [source_reference](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [usage_rights](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['ORISINAL'::text](ADDENDUM_02_AUDIT.md:1) |
| [created_by](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |
| [updated_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [questions_cognitive_level_check](ADDENDUM_02_AUDIT.md:1): [CHECK (cognitive_level = ANY (ARRAY['PEMAHAMAN'::text, 'APLIKASI'::text, 'PENALARAN'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [questions_created_by_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (created_by) REFERENCES profiles(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [questions_difficulty_check](ADDENDUM_02_AUDIT.md:1): [CHECK (difficulty = ANY (ARRAY['MUDAH'::text, 'SEDANG'::text, 'SULIT'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [questions_education_level_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (education_level_id) REFERENCES education_levels(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [questions_grade_check](ADDENDUM_02_AUDIT.md:1): [CHECK (grade >= 1 AND grade <= 12)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [questions_import_batch_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (import_batch_id) REFERENCES question_import_batches(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [questions_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [questions_question_code_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (question_code)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [questions_question_status_check](ADDENDUM_02_AUDIT.md:1): [CHECK (question_status = ANY (ARRAY['DRAFT'::text, 'PENDING_REVIEW'::text, 'NEEDS_REVISION'::text, 'APPROVED'::text, 'PUBLISHED'::text, 'ARCHIVED'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [questions_question_structure_check](ADDENDUM_02_AUDIT.md:1): [CHECK (question_structure = ANY (ARRAY['SOAL_TUNGGAL'::text, 'SOAL_GRUP'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [questions_question_type_check](ADDENDUM_02_AUDIT.md:1): [CHECK (question_type = ANY (ARRAY['PG_TUNGGAL'::text, 'PGK_MA'::text, 'PGK_KATEGORI'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [questions_source_type_check](ADDENDUM_02_AUDIT.md:1): [CHECK (source_type = ANY (ARRAY['AI'::text, 'GURU'::text, 'MITRA'::text, 'IMPORT'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [questions_subject_category_check](ADDENDUM_02_AUDIT.md:1): [CHECK (subject_category = ANY (ARRAY['WAJIB'::text, 'PILIHAN'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [school_assignment_questions](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [assignment_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [question_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [question_version_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [question_order](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | — |

Constraint:

- [school_assignment_questions_assignment_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (assignment_id) REFERENCES school_assignments(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignment_questions_assignment_id_question_order_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (assignment_id, question_order)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignment_questions_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (assignment_id, question_id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignment_questions_question_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (question_id) REFERENCES questions(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignment_questions_question_order_check](ADDENDUM_02_AUDIT.md:1): [CHECK (question_order > 0)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignment_questions_question_version_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (question_version_id) REFERENCES question_versions(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [school_assignment_recipients](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [assignment_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [user_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [attempt_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |

Constraint:

- [school_assignment_recipients_assignment_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (assignment_id) REFERENCES school_assignments(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignment_recipients_attempt_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignment_recipients_attempt_id_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (attempt_id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignment_recipients_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (assignment_id, user_id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignment_recipients_user_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (user_id) REFERENCES auth.users(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [school_assignments](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [school_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [class_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [created_by](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [title](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [subject_name](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [grade](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [question_count](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [duration_minutes](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [opens_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [due_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [status](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['draft'::text](ADDENDUM_02_AUDIT.md:1) |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |
| [updated_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [school_assignments_check](ADDENDUM_02_AUDIT.md:1): [CHECK (due_at >= (opens_at + duration_minutes::double precision * '00:01:00'::interval))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignments_class_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (class_id) REFERENCES classes(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignments_created_by_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (created_by) REFERENCES auth.users(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignments_duration_minutes_check](ADDENDUM_02_AUDIT.md:1): [CHECK (duration_minutes >= 1 AND duration_minutes <= 240)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignments_grade_check](ADDENDUM_02_AUDIT.md:1): [CHECK (grade = ANY (ARRAY[6, 9]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignments_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignments_question_count_check](ADDENDUM_02_AUDIT.md:1): [CHECK (question_count >= 1 AND question_count <= 100)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignments_school_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (school_id) REFERENCES schools(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignments_status_check](ADDENDUM_02_AUDIT.md:1): [CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'cancelled'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignments_subject_name_check](ADDENDUM_02_AUDIT.md:1): [CHECK (length(btrim(subject_name)) >= 1 AND length(btrim(subject_name)) <= 100)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_assignments_title_check](ADDENDUM_02_AUDIT.md:1): [CHECK (length(btrim(title)) >= 3 AND length(btrim(title)) <= 160)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [school_invites](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [school_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [invite_code](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [role](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [expires_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [max_uses](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [used_count](ADDENDUM_02_AUDIT.md:1) | [integer](ADDENDUM_02_AUDIT.md:1) | wajib | [0](ADDENDUM_02_AUDIT.md:1) |
| [status](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['active'::text](ADDENDUM_02_AUDIT.md:1) |
| [created_by](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [school_invites_created_by_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (created_by) REFERENCES auth.users(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_invites_invite_code_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (invite_code)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_invites_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_invites_role_check](ADDENDUM_02_AUDIT.md:1): [CHECK (role = ANY (ARRAY['teacher'::text, 'student'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_invites_school_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_invites_status_check](ADDENDUM_02_AUDIT.md:1): [CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'expired'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [school_memberships](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [school_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [user_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [role](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [status](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['active'::text](ADDENDUM_02_AUDIT.md:1) |
| [joined_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [school_memberships_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_memberships_role_check](ADDENDUM_02_AUDIT.md:1): [CHECK (role = ANY (ARRAY['school_admin'::text, 'teacher'::text, 'student'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_memberships_school_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_memberships_school_id_user_id_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (school_id, user_id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_memberships_status_check](ADDENDUM_02_AUDIT.md:1): [CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'inactive'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_memberships_user_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [school_types](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [name](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [education_level_id](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |

Constraint:

- [school_types_education_level_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (education_level_id) REFERENCES education_levels(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [school_types_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [schools](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [name](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [npsn](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [school_type_id](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [address](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [city](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [province](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [created_by](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [status](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['active'::text](ADDENDUM_02_AUDIT.md:1) |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |
| [updated_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [schools_created_by_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (created_by) REFERENCES auth.users(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [schools_npsn_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (npsn)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [schools_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [schools_school_type_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (school_type_id) REFERENCES school_types(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [schools_status_check](ADDENDUM_02_AUDIT.md:1): [CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text]))](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [student_academic_profiles](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [user_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [education_level_id](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [school_type_id](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [grade](ADDENDUM_02_AUDIT.md:1) | [smallint](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [school_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [class_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [student_number](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | opsional | — |
| [academic_year](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | ['2026/2027'::text](ADDENDUM_02_AUDIT.md:1) |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |
| [updated_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [student_academic_profiles_education_level_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (education_level_id) REFERENCES education_levels(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [student_academic_profiles_grade_check](ADDENDUM_02_AUDIT.md:1): [CHECK (grade >= 1 AND grade <= 12)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [student_academic_profiles_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (user_id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [student_academic_profiles_school_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [student_academic_profiles_school_type_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (school_type_id) REFERENCES school_types(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [student_academic_profiles_user_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [student_class_requires_school](ADDENDUM_02_AUDIT.md:1): [CHECK (class_id IS NULL OR school_id IS NOT NULL)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [student_class_school_fk](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (class_id, school_id) REFERENCES classes(id, school_id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [subjects](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [name](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [education_level_id](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [is_active](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | wajib | [true](ADDENDUM_02_AUDIT.md:1) |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [subjects_education_level_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (education_level_id) REFERENCES education_levels(id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [subjects_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

#### [user_global_roles](ADDENDUM_02_AUDIT.md:1)

| Kolom | Tipe | Keharusan | Default |
|---|---|---|---|
| [id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | [gen_random_uuid()](ADDENDUM_02_AUDIT.md:1) |
| [user_id](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [role](ADDENDUM_02_AUDIT.md:1) | [text](ADDENDUM_02_AUDIT.md:1) | wajib | — |
| [created_at](ADDENDUM_02_AUDIT.md:1) | [timestamp with time zone](ADDENDUM_02_AUDIT.md:1) | wajib | [now()](ADDENDUM_02_AUDIT.md:1) |

Constraint:

- [user_global_roles_pkey](ADDENDUM_02_AUDIT.md:1): [PRIMARY KEY (id)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [user_global_roles_role_check](ADDENDUM_02_AUDIT.md:1): [CHECK (role = 'super_admin'::text)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [user_global_roles_user_id_fkey](ADDENDUM_02_AUDIT.md:1): [FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE](ADDENDUM_02_AUDIT.md:1); tervalidasi true.
- [user_global_roles_user_id_role_key](ADDENDUM_02_AUDIT.md:1): [UNIQUE (user_id, role)](ADDENDUM_02_AUDIT.md:1); tervalidasi true.

### 8.3 Seluruh signature fungsi live

EXECUTE adalah privilege efektif katalog, bukan bukti caller lolos otorisasi internal. Fungsi trigger/private dengan privilege EXECUTE bukan otomatis RPC REST yang dapat digunakan klien. Tidak ada fungsi yang dipanggil dalam audit ini.

| Schema / signature dengan nama argumen | Hasil | Security definer | EXECUTE anon / authenticated |
|---|---|---|---|
| [private.add_school_creator()](ADDENDUM_02_AUDIT.md:1) | [trigger](ADDENDUM_02_AUDIT.md:1) | true | true / true |
| [private.exam_answer_is_correct(p_question_version_id uuid, p_question_type text, p_answer_payload jsonb)](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | true | false / false |
| [private.exam_answer_payload_is_valid(p_question_version_id uuid, p_question_type text, p_answer_payload jsonb)](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | true | false / false |
| [private.handle_new_user()](ADDENDUM_02_AUDIT.md:1) | [trigger](ADDENDUM_02_AUDIT.md:1) | true | true / true |
| [private.has_admin_permission(p_permission_code text)](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [private.has_school_role(p_school_id uuid, p_roles text[])](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [private.is_active_student_member(p_school_id uuid, p_user_id uuid)](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [private.is_school_member(p_school_id uuid)](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [private.is_super_admin()](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [private.require_school_staff(p_school_id uuid)](ADDENDUM_02_AUDIT.md:1) | [void](ADDENDUM_02_AUDIT.md:1) | true | false / false |
| [private.valid_admin_permissions()](ADDENDUM_02_AUDIT.md:1) | [text[]](ADDENDUM_02_AUDIT.md:1) | false | true / true |
| [public.admin_has_permission(p_permission_code text)](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.admin_operator_audit(p_limit integer DEFAULT 50)](ADDENDUM_02_AUDIT.md:1) | [TABLE(id uuid, actor_user_id uuid, actor_name text, target_user_id uuid, target_name text, action text, old_data jsonb, new_data jsonb, created_at timestamp with time zone)](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.admin_operator_list_candidates()](ADDENDUM_02_AUDIT.md:1) | [TABLE(user_id uuid, full_name text, account_status text, is_operator boolean, is_active boolean, permissions text[])](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.admin_operator_list()](ADDENDUM_02_AUDIT.md:1) | [TABLE(user_id uuid, full_name text, account_status text, is_active boolean, permissions text[])](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.admin_operator_set_access(p_user_id uuid, p_is_active boolean, p_permissions text[] DEFAULT '{}'::text[])](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.approve_education_level_change(p_request_id uuid, p_admin_note text DEFAULT NULL::text)](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.can_review_education_level()](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.cancel_education_level_change(p_request_id uuid)](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.get_exam_attempt_review(p_attempt_id uuid)](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.get_school_assignment_ranking(p_assignment_id uuid)](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.get_student_active_attempts()](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.get_student_assignments()](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.get_student_exam_history(p_limit integer DEFAULT 50, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.get_teacher_workspace(p_school_id uuid)](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.protect_profile_education_level()](ADDENDUM_02_AUDIT.md:1) | [trigger](ADDENDUM_02_AUDIT.md:1) | false | true / true |
| [public.reject_education_level_change(p_request_id uuid, p_admin_note text)](ADDENDUM_02_AUDIT.md:1) | [boolean](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.resume_exam_attempt(p_attempt_id uuid)](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.rls_auto_enable()](ADDENDUM_02_AUDIT.md:1) | [event_trigger](ADDENDUM_02_AUDIT.md:1) | true | true / true |
| [public.save_ai_question_draft_batch(p_payload jsonb)](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.save_exam_answer(p_attempt_id uuid, p_question_id uuid, p_answer_payload jsonb)](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.save_question_import_batch(p_payload jsonb)](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.save_question_revision(p_question_id uuid, p_payload jsonb)](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.save_school_assignment(p_school_id uuid, p_class_id uuid, p_title text, p_subject_name text, p_question_count integer, p_duration_minutes integer, p_opens_at timestamp with time zone, p_due_at timestamp with time zone, p_assignment_id uuid DEFAULT NULL::uuid, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.set_school_assignment_status(p_assignment_id uuid, p_status text)](ADDENDUM_02_AUDIT.md:1) | [void](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.set_updated_at()](ADDENDUM_02_AUDIT.md:1) | [trigger](ADDENDUM_02_AUDIT.md:1) | false | true / true |
| [public.start_exam_attempt(p_grade integer, p_subject_name text, p_question_count integer DEFAULT 20, p_duration_minutes integer DEFAULT 60)](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.start_school_assignment(p_assignment_id uuid)](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.submit_education_level_change(p_requested_level text, p_reason text)](ADDENDUM_02_AUDIT.md:1) | [uuid](ADDENDUM_02_AUDIT.md:1) | true | false / true |
| [public.submit_exam_attempt(p_attempt_id uuid)](ADDENDUM_02_AUDIT.md:1) | [jsonb](ADDENDUM_02_AUDIT.md:1) | true | false / true |
