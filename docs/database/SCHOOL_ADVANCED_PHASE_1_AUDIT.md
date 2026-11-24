# TKA TryOn — School Advanced: Audit Tahap 1

Tanggal laporan: 23 November 2026. Status: **audit tahap pertama selesai; implementasi tahap kedua HOLD**.

## 1. Keputusan dan batas pemeriksaan

Pengembangan harus melanjutkan proyek ini, bukan membangun aplikasi atau mesin ujian baru. Sumber aplikasi dan katalog database aktif menunjukkan ketidaksinkronan yang memengaruhi otorisasi sekolah dan alur ujian siswa. Dashboard baru dan mutasi siswa/kelas belum aman diimplementasikan sebelum kontrak tersebut direkonsiliasi.

Audit ini mencakup pembacaan sumber, migrasi historis, katalog database aktif, definisi fungsi, constraint, indeks, policy, grant, serta pemeriksaan lint/build/tes aplikasi. Ini bukan sertifikasi keamanan menyeluruh, penetration test, atau bukti semua fitur bekerja pada runtime. Tidak dilakukan login sebagai pengguna sekolah, E2E terautentikasi, penulisan data produksi, eksekusi migrasi, maupun pengujian mutasi database.

**Perubahan sesi ini hanya laporan ini serta keluaran audit/tes lokal yang diabaikan Git. Tidak ada perubahan kode aplikasi, grant, policy, fungsi database, atau data bisnis.** Perubahan lain yang sudah ada dalam working tree tidak dibatalkan atau dianggap hasil pekerjaan ini.

## 2. Sumber bukti dan reproduksibilitas

- Aturan proyek: [AGENTS.md](../../AGENTS.md). Panduan terpasang yang dibaca: [layout dan halaman Next.js](../../node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md).
- Dependensi dan perintah pemeriksaan: [package.json](../../package.json); konfigurasi aplikasi: [next.config.mjs](../../next.config.mjs). Versi terpasang yang diperiksa: Next.js 16.4.5, React 19.3.0, Tailwind 4, Supabase JS 2.119.
- Audit database menggunakan [skrip audit yang sudah tersedia](../../scripts/audit-addendum-02.cjs), dengan transaksi read-only, isolasi repeatable-read, verifikasi TLS dan kecocokan proyek, kemudian rollback. Skrip tidak memanggil RPC aplikasi untuk membuat data.
- Bukti katalog lokal: [snapshot audit](../../.local/database/addendum-02-db.json). Waktu pengambilan: 2026-11-23T01:52:58.881Z. SHA-256: bf6c2bc274e7def1432142c528fc800243feff4775ae245e80471ff23f99356f.
- Snapshot bersifat lokal dan tidak ditambahkan ke repository. Laporan tidak menyalin kredensial, token, email, NISN, atau baris data pribadi. Untuk tinjauan ulang, hasilkan snapshot baru dengan mekanisme read-only yang sama; katalog dapat berubah sesudah waktu pengambilan.
- Konfigurasi tes menunjuk proyek database yang sama, bukan staging terisolasi. **Jangan menjalankan suite mutasi SQL terhadap konfigurasi itu.**
- [Laporan live lama](LIVE_AUDIT_REPORT.md) adalah bukti historis 13 November 2026, bukan sumber kebenaran keadaan sekarang. Migrasi yang tersimpan tidak membuktikan definisi yang sama masih terpasang.

Katalog berisi 55 relasi publik dengan RLS aktif, 465 kolom, 268 constraint, 129 indeks, 25 policy, 108 fungsi publik/private, dan 30 trigger. Tidak ada FORCE RLS. Tercatat 110 grant tabel dan 930 grant kolom; tidak ditemukan hak TRUNCATE efektif bagi peran anonim atau pengguna terautentikasi.

Agregat sekolah saat snapshot: satu sekolah, satu keanggotaan; kelas, undangan, profil akademik, tugas, soal tugas, dan penerima tugas masing-masing nol. **Angka ini tidak membuktikan tidak adanya siswa terkelola**, karena siswa terkelola menggunakan afiliasi profil yang berbeda dan belum dihitung secara khusus.

## 3. Peta sumber yang diperiksa

| Area | Sumber utama | Hasil |
| --- | --- | --- |
| Landing, autentikasi, registrasi | [landing](../../src/app/page.js), [registrasi](../../src/app/register/page.js), [pengarah dashboard](../../src/app/home/page.js), [helper registrasi](../../src/lib/student/registration.mjs) | Login tersedia melalui modal landing; beberapa alur masih merujuk halaman login yang tidak ada. |
| Dashboard sekolah terkelola | [halaman sekolah](../../src/app/school/page.js), [komponen siswa alternatif](../../src/components/school/students.js) | Daftar profil terkelola berbeda dari model keanggotaan portal. Tombol pada halaman utama tidak seluruhnya tersambung. |
| Portal sekolah/kelas/undangan | [portal](../../src/components/school/portal.js), [pengelolaan](../../src/app/school/manage/page.js), [join](../../src/app/school/join/page.js), [registrasi sekolah](../../src/app/school/register/page.js), [helper onboarding](../../src/lib/school/onboarding.mjs) | Memanggil kontrak historis yang tidak lagi tersedia pada nama yang diharapkan. |
| Komunikasi dan koordinasi | [komunikasi](../../src/components/school/communications.js), [transfer](../../src/components/school/transfers.js), [administrasi sekolah](../../src/app/admin/schools/page.js) | Bagian dari kontrak portal lama; tidak boleh dianggap aktif hanya karena UI tersedia. |
| Penugasan | [workspace guru](../../src/app/teacher/page.js), [helper tugas](../../src/lib/school/assignments.mjs), [tugas siswa](../../src/app/student/assignments/page.js) | Fondasi sudah ada, tetapi kontrak guru dan start/resume tugas mengalami drift. |
| Dashboard siswa | [siswa](../../src/app/student/page.js), [siswa terkelola](../../src/app/mstudent/page.js), [tabel aksi](../../src/components/student/action-tables.js), [akses belajar](../../src/components/learning-access.js) | Tabel aksi terkelola bersifat baca; pemeriksaan akses UI bukan otorisasi server. |
| Konfigurasi dan ujian | [mata pelajaran](../../src/app/student/subjects/page.js), [misi](../../src/app/student/missions/page.js), [challenge](../../src/app/student/challenge/page.js), [helper ujian](../../src/lib/student/exam.js) | Penyimpanan konfigurasi browser tidak boleh menjadi sumber otorisasi. Start mandiri memakai kontrak lama. |
| Hasil dan review | [hasil](../../src/app/student/results/page.js), [review](../../src/app/student/review/%5BattemptId%5D/page.js) | Review pemilik masih tersedia; daftar riwayat mengharapkan RPC yang hilang. |
| Supabase dan otorisasi server | [klien](../../src/lib/supabase.js), [auth server](../../src/lib/server/auth.js) | Klien memakai publishable key; tidak ditemukan service-role dalam frontend yang diperiksa. Token server diverifikasi dan pemeriksaan izin admin fail-closed. |

Migrasi utama yang dibandingkan: [fondasi tahap 1](migration-stage-1.sql), [riwayat/UX](migration-stage-2-ux-history.sql), [workflow sekolah](migration-stage-3-school-workflows.sql), [onboarding](migration-stage-4-school-onboarding.sql), [addendum historis](migration-stage-5-addendum-foundation.sql), [akses belajar](migration-stage-6-learning-access.sql), [akses tanpa kuota](migration-stage-9-unrestricted-learning.sql), [dashboard sekolah](migration-school-dashboard.sql), [jadwal bersama](migration-create-scheduled-tryout-tables.sql), dan [konfigurasi TKA](migration-create-tka-configuration-tables.sql). Definisi aktif tetap ditentukan oleh snapshot, bukan dengan menjalankan ulang berkas tersebut.

## 4. Model data aktual dan relasi

### Dua model afiliasi sekolah

1. **Profil terkelola:** jenis akun, ID sekolah, dan penanda terkelola pada profil. Dipakai dashboard sekolah saat ini dan RPC pengelolaan siswa/operator baru.
2. **Keanggotaan:** sekolah, keanggotaan berperan administrator/guru/siswa, profil akademik, kelas, dan undangan. Dipakai portal historis dan tugas sekolah.

Keduanya belum memiliki sinkronisasi yang dapat dijadikan kontrak. Pembuatan siswa terkelola tidak sekaligus membuat keanggotaan dan profil kelas. Menganggap keduanya identik akan menyebabkan siswa hilang dari workspace, gagal menerima tugas, atau memperoleh cakupan akses keliru.

### Integritas yang sudah tersedia

- Profil berelasi dengan pengguna Auth. Kelas berelasi dengan sekolah dan memiliki identitas unik nama/tahun dalam sekolah.
- Keanggotaan unik per pasangan sekolah/pengguna; peran dan status dibatasi.
- Profil akademik sudah memiliki foreign key gabungan kelas/sekolah. **Jangan menambahkan ulang constraint ini seolah belum ada.**
- Tugas berelasi dengan sekolah, kelas, pembuat; penerima unik per tugas/pengguna, dan tautan attempt unik.
- Soal tugas menyimpan versi dan urutan; soal attempt menyimpan versi soal dan urutan unik. Jawaban unik per attempt/soal.
- Indeks aktif membatasi satu attempt IN_PROGRESS untuk pasangan pengguna/kelas jenjang/mata pelajaran. Pertahankan invariant ini ketika mengintegrasikan jadwal.

### Kesenjangan yang perlu migrasi aditif setelah profiling data

- Afiliasi sekolah pada profil belum memiliki foreign key sekolah; jenis akun belum dibatasi daftar nilai bisnis, hanya batas panjang.
- NISN profil belum memiliki indeks unik. Pengecekan sebelum insert pada RPC tidak cukup menghadapi permintaan bersamaan. Aturan keunikan, nilai kosong, dan deduplikasi harus diputuskan dahulu.
- Kelas dan sekolah pada tugas memiliki FK terpisah, belum FK gabungan yang memastikan kelas berasal dari sekolah tugas. Validasi fungsi tetap diperlukan, disertai constraint setelah pemeriksaan data.
- Tabel jadwal telah ada, tetapi referensi sekolah dan kode konfigurasi belum dilindungi FK. Tabel peserta jadwal hanya memiliki primary key, tanpa FK acara/pengguna dan tanpa keunikan acara/pengguna.
- Jadwal aktif menggunakan waktu berzona dan nama kolom deadline yang berbeda dari migrasi awal. Menjalankan ulang migrasi awal berisiko mengembalikan asumsi keliru.
- Skema tugas lama membatasi kelas 6/9, sekali pengerjaan, dan status draft/published/cancelled. Kelas 12, arsip, serta batas percobaan fleksibel **belum tersedia**.
- Metadata tema/topik untuk analitik historis harus dibekukan atau didefinisikan semantiknya. Jangan menghitung hasil lama berdasarkan metadata soal terkini tanpa penjelasan.

## 5. Matriks kompatibilitas kontrak

Nama RPC di bawah dicatat melalui tautan bukti lokal agar tidak dianggap sebagai kontrak yang sudah direkonsiliasi.

| Alur | Kontrak aplikasi | Keadaan katalog aktif | Dampak |
| --- | --- | --- | --- |
| Daftar siswa terkelola | [get_school_students()](../../.local/database/addendum-02-db.json:1) | Ada; berbasis profil SCHOOL dan sekolah profil | Tidak menyelesaikan daftar kelas/keanggotaan. |
| Detail/pengelolaan siswa | [get_school_students_detail()](../../.local/database/addendum-02-db.json:1), [create_school_student()](../../.local/database/addendum-02-db.json:1), [update_school_student()](../../.local/database/addendum-02-db.json:1) | Ada, bersama reset sandi dan pengelolaan operator | Belum diintegrasikan menjadi manajemen siswa/kelas yang konsisten. |
| Portal dan workspace | [school_portal_context()](../../src/components/school/portal.js:32), [school_admin_workspace()](../../src/app/school/manage/page.js:9), [school_admin_mutate()](../../src/app/school/manage/page.js:9) | Hanya versi berawalan x yang ditemukan | Nama yang dipanggil frontend tidak tersedia. |
| Guru/publikasi/ranking | [get_teacher_workspace()](../../src/app/teacher/page.js:15), [save_school_assignment()](../../src/app/teacher/page.js:80), [set_school_assignment_status()](../../src/app/teacher/page.js:92), [get_school_assignment_ranking()](../../src/app/teacher/page.js:103) | Hanya versi berawalan x | Workspace juga bergantung SELECT keanggotaan yang tidak diberikan. |
| Undangan/komunikasi | [school_invite_request()](../../src/app/school/join/page.js:8) dan kontrak komunikasi/transfer | Versi berawalan x ditemukan | Registrasi, persetujuan, komunikasi belum terbukti berfungsi. |
| Mulai mandiri | [start_learning_attempt()](../../src/app/student/challenge/page.js:130) | Nama lama tidak ada; versi x ada | Alur challenge mandiri tidak kompatibel. |
| Mulai engine aktif | [start_tka_tryout()](../../.local/database/addendum-02-db.json:1), [start_student_exercise()](../../.local/database/addendum-02-db.json:1) | Ada; berbasis kode konfigurasi | Tidak ditemukan pemanggilan keduanya pada sumber aplikasi. Tidak dapat mengganti nama saja karena parameter berbeda. |
| Riwayat frontend | [get_student_dashboard_history()](../../src/app/student/page.js:1), [get_student_exam_history()](../../src/app/student/results/page.js:1) | Tidak ditemukan pada nama yang diminta | Dashboard/riwayat berpotensi gagal meskipun build lulus. |
| Riwayat engine aktif | [get_student_history()](../../.local/database/addendum-02-db.json:1), [get_student_tryout_history()](../../.local/database/addendum-02-db.json:1), [get_student_results()](../../.local/database/addendum-02-db.json:1) | Ada; kontrak baru | Perlu pemetaan bentuk data sebelum integrasi. |
| Tugas siswa dan engine simpan | [get_student_assignments()](../../.local/database/addendum-02-db.json:1), [start_school_assignment()](../../.local/database/addendum-02-db.json:1), [resume_exam_attempt()](../../.local/database/addendum-02-db.json:1), [save_exam_answer()](../../.local/database/addendum-02-db.json:1), [submit_exam_attempt()](../../.local/database/addendum-02-db.json:1) | Nama tersedia, tetapi start/resume dan timer tugas bermasalah | Keberadaan RPC tidak sama dengan kesiapan alur tugas. |
| Review | [get_exam_attempt_review()](../../.local/database/addendum-02-db.json:1) | Ada, pemilik saja, setelah submit | Bukan endpoint review lintas siswa bagi sekolah. |

**Jangan menghapus awalan x atau mengaktifkan migrasi historis secara massal.** Alasan penonaktifan/rename tidak diketahui; setiap kontrak perlu dibandingkan bentuk respons, otorisasi, dependency dan grant-nya. Tabel/fungsi addendum a02 historis tidak tersedia seperti asumsi migrasi lama; helper entitlement kompatibilitas yang tersisa tidak membuktikan seluruh addendum terpasang.

## 6. Temuan prioritas dan keamanan

### P0 — penghambat sebelum perluasan fitur

1. **Start/resume tugas tidak konsisten secara struktural.** Helper assignment lama melakukan insert attempt tanpa tipe, padahal tipe wajib dan tidak memiliki default. Katalog tidak menunjukkan trigger attempt yang mengisinya. Dispatcher resume merujuk helper private pemulihan tugas yang tidak ditemukan. Temuan ini berasal dari inspeksi definisi, bukan percobaan insert produksi.
2. **Timer tugas belum mengikuti kontrak engine terkini.** Simpan jawaban memeriksa durasi hanya untuk tipe TRYOUT; deadline dan tipe ASSIGNMENT belum ditegakkan setara. Submit juga membedakan timer berdasarkan TRYOUT. Perbaikan start saja tidak cukup; start/resume/save/submit harus diperiksa sebagai satu invariant.
3. **Kontrak siswa dan sekolah drift.** Frontend masih memakai nama RPC lama; engine yang aktif belum tersambung. Menambah UI akan menyamarkan, bukan menyelesaikan, masalah ini.
4. **Dua sumber otorisasi sekolah.** Perlu keputusan eksplisit model otoritatif dan jalur transisi sebelum mutasi kelas/siswa dan metrik lintas akun.

### P1 — integritas dan penguatan otorisasi

- RPC daftar siswa terkelola memeriksa pengguna, jenis akun SCHOOL dan sekolahnya, tetapi tidak menggunakan pemeriksaan akun aktif/verified, status sekolah, dan keanggotaan yang sama dengan helper portal. Ini celah konsistensi kebijakan yang perlu dikeraskan, bukan bukti eksploitasi yang sudah diuji.
- RPC pembuatan siswa melakukan penulisan langsung ke tabel Auth dengan sandi hash dan konfirmasi email. Jangan memperluas pola ini tanpa review kesesuaian Supabase Auth/identities, kebijakan provisioning, pengiriman kredensial dan audit. Pilihan aman untuk rancangan berikutnya: proses provisioning tepercaya di server dengan API Auth yang didukung, idempotensi, kompensasi kegagalan, dan tanpa secret dalam browser.
- Grant dan policy harus diperiksa bersama. Keanggotaan memiliki policy baca tetapi peran aplikasi tidak mendapat SELECT langsung, sehingga query workspace guru tetap gagal.
- Profil memiliki policy update diri tetapi tidak ada grant update/insert efektif bagi pengguna aplikasi pada kolom profil yang diperiksa. **Tidak ada dasar untuk menyimpulkan pengguna bisa menaikkan perannya sendiri lewat update langsung.** Trigger registrasi hanya mengambil nama/jenjang yang divalidasi, tidak menetapkan jenis akun sekolah dari metadata pengguna.
- Seluruh tabel ber-RLS bukan jaminan isolasi pada fungsi security-definer. Pemilik tabel dapat melewati RLS tanpa FORCE RLS. Setiap RPC privileged harus menentukan aktor dari token, memvalidasi cakupan, mengunci search path, dan memakai grant minimum; beberapa helper historis masih memakai search path publik.
- Constraint jadwal/peserta, keunikan identitas dan tautan tugas-sekolah perlu diperkuat setelah audit orphan/duplikat. Jangan memasang constraint dengan menebak kualitas data.
- Engine mulai TKA menerima kode konfigurasi tanpa konteks acara/penerima sekolah. RPC ini sendiri tidak menegakkan jadwal bersama. Countdown frontend tidak memperbaikinya.

### Proteksi yang sudah ada dan perlu dipertahankan

- Helper aktor portal mensyaratkan akun terverifikasi, aktif, tidak dihapus dan tidak sedang diblokir.
- Jalur tugas lama memeriksa penerima, keanggotaan aktif, status publikasi dan waktu server; memakai lock transaksi dan snapshot soal. Fondasi tersebut perlu direkonsiliasi, bukan dibuang.
- Simpan/submit memeriksa kepemilikan attempt dan menggunakan row lock; jawaban divalidasi terhadap soal/versi, penilaian dilakukan server, submit mengubah status secara terkondisi.
- Payload mulai/resume TKA dan latihan yang diperiksa tidak memuat kunci jawaban, tema atau topik. Review berkunci hanya tersedia setelah submit dan untuk pemilik.
- Resume TKA dapat mengembalikan sisa waktu nol tanpa langsung menolak; penyimpanan memeriksa timer. UI harus menangani keadaan kadaluarsa, dan semantik finalize perlu diuji bersama, bukan bergantung countdown.

## 7. Kesiapan fitur dan masalah UI

- Dashboard sekolah saat ini memiliki tabel siswa terkelola dan tema/topik kompetensi; belum memiliki definisi/metrik lengkap siswa aktif, kelas aktif, partisipasi, rata-rata, kegiatan, serta performa.
- Tombol jadwalkan, profil, review, dan reset sandi pada halaman sekolah utama mengubah pilihan lokal tetapi tidak menampilkan dialog pilihan. Komponen alternatif yang memiliki dialog hanya memberikan placeholder untuk sebagian tindakan; keberadaannya tidak membuktikan halaman utama sudah terintegrasi.
- Tautan operator sekolah, login, dan profil siswa mengarah ke route yang tidak ditemukan pada filesystem/build audit. Tab editor lama bukan bukti route tersedia.
- Tabel aksi siswa terkelola menampilkan tugas/jadwal secara baca, tanpa tombol mulai. Halaman tugas terpisah memiliki tautan mulai, tetapi bergantung masalah engine di atas.
- Portal historis berisi formulir kelas, undangan, persetujuan dan perpindahan, namun tidak siap dinyatakan bekerja karena RPC aktif dan grant tidak cocok. Pencarian/paginasi anggota/kelas juga belum lengkap.
- Belum ada analitik sekolah terotorisasi, unduhan hasil sekolah, monitoring acara end-to-end, multi-attempt, arsip tugas, atau pengaturan operator yang terintegrasi konsisten.
- Pengarah home masih memakai status langganan, sementara konteks akses database menyatakan akses belajar unrestricted. Kebijakan produk dan routing harus diselaraskan tanpa merusak siswa mandiri.

## 8. Arsitektur aman yang direkomendasikan

### A. Rekonsiliasi identitas sebelum UI baru

Gunakan keanggotaan aktif sebagai **rancangan target** peran/cakupan sekolah, profil akademik sebagai penempatan kelas, dan profil umum sebagai identitas. Ini rekomendasi, bukan keputusan migrasi yang sudah dijalankan. Pertahankan penanda profil terkelola sebagai kompatibilitas selama transisi. Rekonsiliasi akun aktual dan peran SCHOOL yang belum memiliki membership; jangan memberi akses otomatis hanya berdasarkan ID sekolah yang dikirim browser.

Buat satu kontrak konteks sekolah terversi yang memverifikasi token, status akun, status sekolah, peran dan cakupan. Untuk pengguna multisekolah, pilihan sekolah hanya petunjuk yang harus diverifikasi server. Administrator platform memakai izin eksplisit dan jejak audit, bukan bypass global dari parameter klien. Tentukan arti akun SCHOOL, operator dan school_admin sebelum pemetaan data.

### B. Lapisan akses dan dashboard

- Pertahankan App Router dan komponen yang ada. Gunakan lapisan akses sekolah terpusat di server/database dengan token pengguna; jangan memperkenalkan service-role dalam frontend atau mengandalkan guard halaman sebagai otorisasi.
- Tetapkan kontrak response/error/paginasi yang stabil dan uji kecocokan katalog di CI/staging. Jika diperlukan adapter kontrak lama, lakukan eksplisit dan terbatas, bukan rename massal.
- Dashboard mengagregasi data di database setelah cakupan aktor ditetapkan. Jangan memuat seluruh hasil semua siswa lalu menyaringnya di browser.
- Siswa aktif = keanggotaan siswa aktif dan akun aktif menurut kebijakan yang disepakati; kelas aktif = kelas tidak diarsipkan dalam tahun ajaran terpilih. Jika model belum direkonsiliasi, tampilkan status belum tersedia, bukan angka nol palsu.
- Partisipasi = penerima unik yang mulai/submit dibanding snapshot penerima acara; definisikan numerator secara eksplisit. Rata-rata = attempt submitted yang sah dalam aktivitas dan rentang yang dipilih, bukan semua riwayat mandiri siswa yang sekarang bersekolah di sana.
- Metrik tanpa denominator atau tanpa data ditampilkan sebagai tidak tersedia. Aktivitas terbaru memerlukan sumber audit yang sah; jangan membuat daftar dummy.

### C. Manajemen siswa dan kelas

Sediakan daftar server-paginated, pencarian, filter tahun/kelas/status, detail terbatas dan riwayat penempatan. Operasi undang, setujui, pindah dan nonaktif harus memverifikasi sekolah pada server, bersifat transaksional, memakai concurrency token/lock, dan menulis audit tanpa sandi. Arsipkan kelas daripada menghapus riwayatnya.

Cegah duplikasi menggunakan identitas Auth yang sudah ada, token undangan berumur terbatas, verifikasi persetujuan dan constraint unik yang disepakati. Sekolah tidak boleh mengambil alih akun mandiri hanya karena mengetahui email/NISN. Perpindahan sekolah harus memiliki persetujuan dan aturan akses sejarah; riwayat hasil tidak dipindahkan atau dipublikasikan diam-diam.

### D. Tugas dan tryout bersama

Gunakan kembali tabel tugas, konfigurasi, jadwal dan engine attempt yang ada. Tambahkan konteks aktivitas sekolah yang otoritatif dan snapshot peserta/kelas/sekolah pada saat penugasan. Jangan menduplikasi mesin jawaban/penilaian.

Wrapper mulai acara harus memverifikasi penerima, status, jendela server, versi paket dan batas percobaan di bawah lock transaksi; hasilkan attempt yang terhubung unik. Start/save/resume/submit menggunakan kebijakan deadline yang sama. Untuk ujian bertimer, deadline efektif mengikuti nilai paling awal antara batas acara dan akhir durasi; kebijakan memulai jika waktu tidak cukup harus diputuskan eksplisit. Latihan tanpa timer tetap tidak disamakan dengan tryout.

Status event yang diminta pengguna perlu dipetakan ke state machine tersendiri, dengan transisi tervalidasi dan jejak audit. Jangan menambahkan nilai status baru ke tabel lama tanpa migrasi dan kompatibilitas. Aksi batal/arsip tidak menghapus jawaban, attempt, atau snapshot yang sudah berjalan.

### E. Hasil dan analitik

Pisahkan endpoint pemilik dari endpoint staf sekolah yang memvalidasi izin dan keterkaitan aktivitas. Tidak membuka endpoint review pemilik menjadi pembacaan global. Gunakan snapshot metadata versi soal untuk analisis tema/topik setelah ujian; kunci/tema/topik tidak dikirim ketika ujian berlangsung.

Ranking harus menentukan tie-break, cohort penerima, percobaan yang dihitung dan pengecualian cancelled/expired. Unduhan diverifikasi ulang saat dibuat/diambil, dibatasi cakupan dan diaudit. Hasil mandiri siswa bukan otomatis aset sekolah berdasarkan afiliasi saat ini.

## 9. Rencana bertahap dan gerbang penerimaan

| Tahap | Pekerjaan | Syarat lulus |
| --- | --- | --- |
| 1 — selesai | Audit dan rancangan pada laporan ini | Bukti dan batas pemeriksaan tercatat; tidak ada mutasi produksi. |
| 1B — wajib sebelum tahap 2 | Putuskan model afiliasi, petakan RPC aktif, pulihkan kontrak siswa, desain perbaikan engine tugas, sediakan staging | Inventaris dependency/grant, skema target dan rancangan SQL aditif direview; regresi siswa lulus di staging. |
| 2A | Dashboard baca dari kontrak terotorisasi | Metrik memakai data riil dan definisi jelas; isolasi dua sekolah terbukti; tanpa placeholder. |
| 2B | Siswa/kelas/undangan/perpindahan | Tidak ada duplikasi atau perpindahan lintas sekolah ilegal; perubahan atomik dan diaudit. |
| 3 | Tugas | Publish membekukan soal/penerima; batas waktu/percobaan dan submit bersamaan diuji. |
| 4 | Tryout bersama | Jadwal server dan peserta tervalidasi; memakai engine yang sama; resume dan kadaluarsa konsisten. |
| 5 | Analitik/unduhan | Akses historis dan cohort terdefinisi; tidak membocorkan soal atau hasil lintas sekolah. |
| 6 | Pengaturan | Identitas/operator/tahun ajaran/langganan sesuai kebijakan produk dan izin. |

Tidak ada SQL migrasi yang dieksekusi atau disiapkan sebagai perintah siap-jalan pada tahap ini. Tahap berikutnya harus menyediakan SQL review-only terpisah, preflight orphan/duplikasi, constraint/index aditif, explicit grants, audit, uji staging, rencana deploy kompatibel dan rollback yang tidak menghapus hasil. Backup dan pemisahan staging wajib sebelum tes mutasi. Tidak ada alasan aman untuk menjalankan ulang seluruh migrasi historis.

## 10. Pengujian dan gerbang regresi

Hasil pemeriksaan sesi ini:

| Pemeriksaan | Hasil |
| --- | --- |
| Lint proyek | Lulus, exit 0. |
| Build produksi | Lulus, exit 0; kompilasi dan generasi route berhasil. Bukan bukti otorisasi atau kecocokan RPC runtime. |
| Tes aplikasi | 90 tes: 87 lulus, 3 gagal, 0 skipped/cancelled. Kegagalan sudah ada sebelum perubahan laporan. |
| Audit katalog read-only | Berhasil, TLS dan identitas proyek terverifikasi; tidak ada migrasi/mutasi. |
| E2E autentikasi dan isolasi dua sekolah | Belum dijalankan. |
| Suite SQL/mutasi | Sengaja tidak dijalankan karena konfigurasi tidak terisolasi dari proyek aktif. |

Tiga kegagalan awal:

1. [Tes akses belajar](../../tests/learning-access.test.mjs:27) mengharapkan tautan WhatsApp pada sumber paket; sumber saat ini mengarah ke registrasi.
2. [Tes registrasi](../../tests/registration.test.mjs:50) mengharapkan tujuan paket mandiri dengan konteks metode; sumber menggunakan tujuan registrasi umum.
3. [Tes onboarding](../../tests/school-onboarding.test.mjs:70) mencoba membaca halaman login yang tidak ada.

Log lengkap tersimpan lokal pada [hasil tes](../../.local/school-phase-1-tests.log). Tes tidak diubah untuk menyembunyikan kegagalan; keputusan perilaku produk diperlukan sebelum perbaikan ekspektasi atau implementasi.

Sebelum tahap kedua dinyatakan aman, uji minimal di staging: anonim; siswa mandiri; siswa terkelola; guru; admin sekolah A/B; akun suspended/unverified; admin platform berizin/tanpa izin. Coba ID sekolah/kelas/penerima palsu, undangan ganda/kadaluarsa, permintaan paralel, pemindahan sekolah, arsip kelas, batas waktu persis, resume terlambat, submit ganda, jawaban bukan milik attempt, dan akses review sebelum/sesudah submit. Verifikasi tidak ada kunci/tema/topik pada payload ujian dan tidak ada pembacaan hasil mandiri/lintas sekolah yang tidak diizinkan. Lakukan contract test untuk setiap RPC yang dipanggil frontend, termasuk bentuk parameter, respons dan grant.

## 11. Hasil akhir tahap ini

- **Dibuat:** laporan ini.
- **Diperbarui lokal:** snapshot audit dan log tes; tidak dipublikasikan atau berisi kredensial dalam laporan.
- **Tidak diubah:** kode aplikasi, skema/RLS/grant/RPC database, data siswa, soal, attempt dan hasil.
- **Belum diimplementasikan:** dashboard lanjutan serta manajemen siswa/kelas baru. Penundaan ini mengikuti syarat keamanan pekerjaan, bukan klaim bahwa fitur tersebut sudah selesai.
- **Prioritas berikutnya:** rekonsiliasi kontrak siswa dan sekolah, penetapan sumber otorisasi, perbaikan invariant tugas, staging terisolasi, kemudian dashboard baca dan manajemen siswa/kelas secara bertahap.
