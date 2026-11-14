# School onboarding — kontrak backend tahap 4

## Status dan batas perubahan

Backend tersedia pada [migrasi tahap 4](migration-stage-4-school-onboarding.sql), [runner](../../scripts/migrate-school-onboarding.cjs), dan [integration test](../../tests/database/school-onboarding.sql). UI onboarding, pengelolaan sekolah, undangan siswa, pesan/tiket, transfer koordinator, dan review platform sudah diimplementasikan bersama helper serta unit test frontend; lihat [panduan aplikasi](../../README.md). Payment ditunda. **Migrasi tahap 4 hanya diverifikasi melalui dry-run dengan rollback; belum diterapkan permanen/live.** Commit/push kode bukan penerapan database. Deployment hosting belum diverifikasi dan pengujian E2E browser multi-role belum dilakukan.

Prasyarat backend: schema hasil audit lokal serta migrasi tahap 1–3 sudah diterapkan. [Aturan agen](../../AGENTS.md) berlaku untuk perubahan frontend. UI memakai RPC melalui client Supabase yang sudah ada, tanpa endpoint API Next.js baru.

**Perubahan otorisasi sesuai instruksi terbaru:** pengajuan dapat disetujui superadmin ATAU operator aktif dengan izin **school_onboarding.review**. Izin diberikan/dicabut superadmin melalui mekanisme pengelolaan akses operator yang sudah ada; migrasi menambahkannya ke daftar izin yang sah, tetapi tidak memberikannya otomatis kepada operator mana pun. Akun operator tidak disamakan dengan superadmin. Pemulihan koordinator, tiket platform, dan pengiriman pesan platform tetap khusus superadmin.

## Aturan universal

Sepuluh RPC publik di bawah memakai SECURITY DEFINER dengan search path tetap pg_catalog; semua referensi tabel/helper memakai schema eksplisit. Akses PUBLIC dan anonim dicabut, eksekusi diberikan eksplisit hanya kepada authenticated. Helper baru tidak dapat dipanggil klien. Setiap entrypoint menuntut identitas auth, email terkonfirmasi di database, pengguna tidak terhapus/tidak diblokir, serta profil aktif. Email atau klaim otorisasi dari metadata/JWT tidak dipercaya untuk transfer.

Akses sekolah menuntut sekolah aktif serta membership aktif dengan peran sesuai. Tidak ada bypass school-admin hanya karena pengguna superadmin/operator. Pengecualian terpisah adalah persetujuan platform dan transfer acceptance: kandidat yang belum menjadi anggota boleh menerima transfer yang ditujukan ke email terverifikasinya.

Tabel baru memakai RLS tanpa grant akses langsung maupun kebijakan klien. Hak tulis tabel dan hak tulis tingkat kolom pada sekolah, membership, undangan, kelas dicabut termasuk TRUNCATE; kebijakan tulis lama dihapus. Kebijakan/grant SELECT lama dipertahankan. Kebijakan tulis academic-profile oleh staf dihapus untuk mencegah bypass pindah kelas; self-service siswa independen dipertahankan. Fungsi lama pada schema public/private yang menulis empat tabel inti diidentifikasi dari definisi dan hak eksekusi klien dicabut. Audit runtime runner memeriksa kembali ACL fungsi tersebut.

Trigger creator sekolah dipertahankan untuk kompatibilitas, tetapi klien tidak dapat membuat sekolah langsung. Pengajuan disimpan terpisah dan tidak memberi membership. Pembuatan sekolah, membership admin, primary, dan keputusan persetujuan dilakukan dalam satu transaksi RPC.

Semua mutasi tabel terkait dicatat oleh trigger audit, termasuk nilai sebelum/sesudah, aktor, waktu, operasi, dan tabel. Kode bearer undangan tidak dimasukkan ke audit. Audit tidak dapat dibaca/ditulis klien. Administrasi database/service-role tetap merupakan trust boundary, bukan pengguna akhir.

## Kontrak RPC persis untuk frontend

Semua return bertipe JSONB. UUID direpresentasikan sebagai string; waktu menggunakan timestamptz ISO. Gunakan nama parameter persis sebagaimana tautan deklarasi. Field tambahan pada payload tidak dipakai; jangan menganggapnya tersimpan. Error otorisasi memakai SQLSTATE 42501; validasi bisnis dapat memakai P0001, 22023, 23505, atau constraint database. Frontend harus menampilkan pesan aman, memuat ulang konteks setelah mutasi, dan tidak memperlakukan error sebagai keberhasilan.

### Konteks dan pengajuan

- [school_portal_context()](migration-stage-4-school-onboarding.sql:174): tanpa parameter. Mengembalikan objek berisi applications milik sendiri; memberships aktif pada sekolah aktif; is_platform_admin khusus superadmin; can_review_applications untuk reviewer berizin; school_types berisi id, name, education_level_id; transfers pending belum kedaluwarsa yang ditujukan ke email akun sendiri. Membership berisi school_id, school_name, role, is_primary. Aplikasi berisi id, school_name, npsn, school_type_id, status, review_note, school_id, created_at. Transfer berisi id, school_id, school_name, expires_at.
- [submit_school_application(p_data jsonb)](migration-stage-4-school-onboarding.sql:191): payload wajib school_name (3–160), npsn (tepat delapan angka), school_type_id (ID teks dari konteks), address (3–500), city/province (2–100), teacher_name (2–160), teacher_position (2–100), contact_phone (6–30), authorization_confirmed (boolean true). Teks di-trim. Return application_id, status. Status awal pending. Satu pending per pengguna dan satu pending per NPSN; pengulangan pengguna/NPSN pending mengembalikan ID sama, tidak memperbarui data. Sekolah dengan NPSN yang sudah terdaftar ditolak. Aplikasi ditolak dapat diajukan ulang sebagai histori baru.
- [review_school_application(p_application_id uuid,p_decision text,p_note text)](migration-stage-4-school-onboarding.sql:208): reviewer berizin; dilarang menilai pengajuan sendiri. Keputusan persis approved atau rejected; catatan maksimal 2000, boleh null. Return application_id, status, school_id (null untuk penolakan). Keputusan final; pengulangan keputusan sama idempotent. Persetujuan memeriksa ulang kelayakan pemohon dan secara atomik membuat sekolah aktif serta satu designated primary coordinator.

### Administrasi sekolah

- [school_admin_workspace(p_school_id uuid)](migration-stage-4-school-onboarding.sql:234): khusus admin sekolah aktif. Return school, classes, members, requests, invites, transfers. Identitas sekolah name/npsn/type bersifat read-only. Tidak mengekspos email auth seluruh anggota atau profil lintas sekolah.
  - school: id, name, npsn, school_type_id, address, city, province, contact_phone, primary_user_id.
  - classes: id, name, grade, academic_year, education_level_id, archived.
  - members: membership_id, user_id, name, role, status, class_id.
  - requests: id, user_id, name, class_id, status, created_at.
  - invites: id, code, class_id, expires_at, max_uses, used_count, status. Kode hanya untuk admin dan harus dianggap rahasia bearer.
  - transfers: id, target_email, status, expires_at.
- [school_admin_mutate(p_school_id uuid,p_action text,p_data jsonb)](migration-stage-4-school-onboarding.sql:250): khusus admin sekolah; aksi berikut saja:

| Aksi | Payload | Hasil |
| --- | --- | --- |
| profile_update | address, city, province, contact_phone; batas sama seperti pengajuan | ok true; tidak mengubah identitas |
| class_save | name (1–100), grade integer, academic_year YYYY/YYYY; class_id opsional untuk rename | class_id |
| class_archive | class_id | ok true |
| invite_create | class_id, days integer 1–30, max_uses integer 1–1000; role opsional hanya student | invite_id, code, expires_at |
| invite_revoke | invite_id | ok true |
| member_approve / member_reject | request_id | ok true; retry keputusan sama mengembalikan request_id/status |
| member_deactivate | membership_id | ok true |
| member_move | membership_id, class_id tujuan pada sekolah sama | ok true |

Jenjang kelas diturunkan dari tipe sekolah, bukan input klien: SD kelas 1–6, SMP 7–9, SMA 10–12. Academic year harus dua tahun berurutan. Grade/tahun kelas existing tidak bisa diubah; buat kelas baru dan pindahkan siswa agar snapshot tugas tidak berubah. Archive ditolak bila masih ada academic profile atau request pending; tidak menghapus kelas/histori dan mencabut undangan kelas itu.

Pengelolaan membership hanya siswa, bukan promosi staf. Penonaktifan melepaskan school/class academic profile, tetapi tidak menghapus membership, sesi, jawaban, atau snapshot penerima tugas. Perpindahan hanya mengubah kelas/grade/tahun pada profil; snapshot tugas terbit tetap utuh.

### Undangan dan persetujuan siswa

- [school_invite_request(p_code text,p_confirm boolean default false)](migration-stage-4-school-onboarding.sql:338): pengguna terverifikasi; kode baru sepanjang 64 karakter.
  - Preview (false/null): school_name, class_name, grade, academic_year, expires_at, requires_approval true. Tidak mengungkap daftar siswa, kontak, atau identitas pembuat.
  - Join (true): request_id, status. Tidak langsung membuat membership aktif. Pendidikan profil harus cocok dengan jenjang kelas dan pengguna tidak boleh sudah terafiliasi dengan sekolah lain/aktif. Satu request pending per pengguna lintas sekolah.
  - Kuota merupakan **reservasi permintaan**, bukan jumlah approval. Request pending mengonsumsi satu slot. Rejection/expiry/revocation tidak mengembalikan slot untuk mencegah penyalahgunaan ulang. Preview tidak mengonsumsi kuota. Retry invite+user mengembalikan request lama tanpa increment, termasuk setelah reject/deactivation; tidak mengaktifkan ulang akun. Buat undangan baru bila perlu reapply.
  - Approval memeriksa ulang sekolah, kelas, akun, pendidikan, afiliasi lintas sekolah, serta undangan aktif dan belum kedaluwarsa. Pending request tidak otomatis hilang ketika undangan expired; admin dapat menolaknya untuk membebaskan pending request pengguna, bukan slot undangan.
  - Kode lama tanpa kelas dan undangan teacher tidak dapat digunakan lewat RPC ini. Tidak ada staff invitation atau teacher promotion baru sampai otorisasi guru per kelas/mapel diselesaikan. Guru legacy dan kemampuan tugas tahap 3 tetap ada, bukan diperluas.

Mutasi pengelolaan sekolah dan join mengambil row lock sekolah terlebih dahulu. Join juga mengunci profil pengguna dan undangan, lalu increment bersyarat. Approval mengunci request/profil/undangan dan memakai keunikan membership serta upsert atomic. Keputusan/transfer diserialisasi; unique index mencegah dua pending request atau dua pending transfer yang sama. Transaksi client tidak boleh menahan beberapa RPC lintas sekolah dalam urutan berlawanan; retry transaksi penuh pada deadlock/serialization failure.

### Pesan, tanda dibaca, forwarding, dan tiket

- [school_communications(p_school_id uuid default null)](migration-stage-4-school-onboarding.sql:371): messages (maksimal 200 terbaru), tickets (maksimal 100 terbaru). Null berarti gabungan scope sekolah aktif milik sendiri; bukan scope platform. Pesan broadcast untuk anggota aktif sekolah, pesan privat hanya sender/recipient yang masih aktif di sekolah. Bahkan primary baru/superadmin tidak otomatis memperoleh pesan privat lama milik orang lain.
  - Message: id, school_id, sender_id, recipient_id, body, platform_origin, created_at, read_at milik pemanggil.
  - Ticket: id, school_id, subject, body, status, created_at, replies; hanya admin sekolah aktif yang dapat melihat tiket sekolah. Reply: id, body, sender_id, platform_origin, created_at.
- [school_communication_mutate(p_action text,p_data jsonb)](migration-stage-4-school-onboarding.sql:390): semua return id.

| Aksi | Payload dan otorisasi |
| --- | --- |
| message_send | school_id, body (1–5000), recipient_id opsional. Admin boleh broadcast/privat; anggota non-admin hanya boleh privat ke admin aktif |
| platform_message | school_id, body, recipient_id opsional; khusus superadmin, sekolah harus aktif |
| message_read | message_id yang terlihat oleh pemanggil; receipt sendiri, idempotent |
| ticket_create | school_id, subject (3–160), body (1–5000); admin sekolah |
| message_forward | message_id yang terlihat, subject; admin sekolah, body diambil server dari pesan asli; satu ticket per pesan, retry idempotent |
| ticket_reply | ticket_id, body; admin sekolah terkait atau superadmin; hanya tiket open |
| ticket_close | ticket_id; admin sekolah terkait atau superadmin; idempotent |

Tiket diteruskan ke platform secara eksplisit, bukan dengan memberikan platform akses seluruh pesan sekolah. Hanya isi pesan yang dipilih menjadi body tiket; tidak menyertakan seluruh percakapan. Operator reviewer tidak memperoleh akses tiket/pesan platform. Receipt orang lain tidak diekspos. Pesan, tiket, reply baru tidak memakai idempotency key; kirim ulang karena jaringan dapat membuat duplikasi, sehingga frontend harus menonaktifkan double-submit dan memuat ulang daftar sebelum retry otomatis.

### Transfer primary dan pemulihan

- [school_coordinator_transfer(p_action text,p_data jsonb)](migration-stage-4-school-onboarding.sql:452): return transfer_id, status, expires_at (retry accept/cancel dapat tidak menyertakan expires_at).
  - propose: school_id, email. Hanya designated primary aktif. Target boleh belum terdaftar; tidak membocorkan apakah email terdaftar. Berlaku tujuh hari. Proposal identik pending milik aktor sama idempotent; proposal baru membatalkan pending sebelumnya.
  - accept: transfer_id. Harus akun aktif terverifikasi dengan email auth sekarang persis cocok secara case-insensitive. Tidak menerima email target dari payload. Kandidat student pada sekolah itu ditolak. Lock sekolah dan transfer menjamin primary lama masih sama serta proposal belum kedaluwarsa. Membership target dibuat/dipromosikan atomik, pointer primary dipindahkan, primary lama dinonaktifkan (tidak diubah menjadi guru bebas). Histori assignment/membership/pesan/tiket tetap disimpan. Retry acceptance oleh penerima yang sama idempotent.
  - cancel: transfer_id. Primary aktif atau superadmin; tidak dapat membatalkan acceptance final. Pengulangan cancel idempotent.
  - recover: school_id, email, reason (10–2000). Hanya superadmin; tetap memerlukan acceptance target terverifikasi, bukan penunjukan paksa. Berlaku untuk kehilangan akses koordinator dan sekolah legacy yang belum memiliki primary.

Primary disimpan sebagai satu pointer per sekolah dengan deferred constraint trigger yang memeriksa membership admin aktif. Sekolah baru selalu punya designated primary; sekolah legacy **tidak dipilihkan primary secara acak**. Legacy admin tetap dapat mengelola sekolah sesuai peran existing, tetapi tidak dapat mengusulkan transfer hingga superadmin memulihkan primary secara eksplisit. Pemulihan legacy tidak otomatis menonaktifkan semua admin legacy lain yang tidak pernah ditunjuk sebagai primary.

### Workspace platform

- [platform_school_workspace()](migration-stage-4-school-onboarding.sql:511): reviewer berizin. applications maksimal 200 terbaru berisi field pengajuan yang diperlukan reviewer, applicant_id, status, review_note, school_id, created_at; schools maksimal 500 berdasarkan nama berisi id/name/npsn/school_type_id/status/primary_user_id/needs_primary_recovery. tickets maksimal 200 terbaru, hanya superadmin; operator mendapat array kosong. Tidak mengembalikan audit penuh, auth email directory, atau daftar siswa lintas sekolah.

## Runner dan prosedur operasi

Jalankan Node terhadap [runner](../../scripts/migrate-school-onboarding.cjs) tanpa argumen untuk dry-run. Runner membaca konfigurasi database lokal (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL_CA_PATH), mencocokkan project ref host database atau username pooler dengan URL Supabase aplikasi, dan memeriksa URL test bila ada. DB_EXPECTED_PROJECT_REF dapat dipakai sebagai pemeriksaan tambahan. Sertifikat CA dibaca lokal dengan TLS rejectUnauthorized aktif, lalu status peer terotorisasi diperiksa. Credential, env, dan isi row error tidak dicetak.

Runner mengunci advisory migration, menjalankan migrasi dua kali dalam transaksi, memeriksa RLS/ACL tabel/kolom/fungsi, menjalankan [suite onboarding](../../tests/database/school-onboarding.sql) pada SAVEPOINT, memaksa deferred constraints, lalu rollback fixture. [Suite tugas/CBT sebelumnya](../../tests/database/school-workflows.sql) dijalankan dalam SAVEPOINT terpisah. Default mengakhiri seluruh transaksi dengan ROLLBACK, termasuk DDL.

Penerapan permanen **belum dilakukan**. Runner mendukung flag --apply hanya jika SCHOOL_ONBOARDING_APPLY_PROJECT_REF cocok dengan ref aplikasi; persetujuan rollout baru, backup, dan peninjauan migrasi tetap diperlukan. Jangan menjalankan migrasi SQL langsung untuk melewati guard runner. Jangan mengedit/menerapkan ulang migrasi tahap lama. Rollback produksi harus forward-fix versioned, bukan menghapus tabel berisi histori. Setelah commit, pemberitahuan schema cache PostgREST dikirim.

## Hasil verifikasi dan risiko tersisa

Dry-run terverifikasi 14 November 2026: TLS dan identitas proyek cocok; migrasi dieksekusi dua kali; sepuluh RPC, sembilan tabel baru dan empat tabel lama diperiksa; 40 fungsi dan 14 kebijakan sebelum migrasi diinspeksi; hak eksekusi trigger creator lama dicabut dari klien. Suite onboarding serta regresi tugas/CBT lulus dan fixture di-rollback. Tidak ada COMMIT database.

Cakupan suite: akun anonim/belum verified/nonaktif, bypass tulis langsung, eskalasi peran, operator tanpa izin vs reviewer berizin, aplikasi tanpa membership prematur, approval retry, sekolah/kelas/request lintas tenant, preview/join pending, quota replay/exhaustion, approval/rejection retry, pindah kelas, pesan privat/broadcast dan receipt, forwarding/tiket/reply, target transfer salah, acceptance retry, cancel transfer, pemindahan primary dan histori, recovery sekolah legacy, pencabutan akses primary lama, deactivation replay, profile identity immutable, expiry/revocation, serta pemeriksaan row lock pada fungsi kritis. Suite tugas existing mencakup publish snapshot, start/resume, submit, ranking, dan retensi histori pembatalan. Pemeriksaan sintaks runner dan whitespace empat berkas lulus; seluruh 22 unit test existing juga lulus.

Batas yang harus dipahami sebelum rollout:

- Pengujian konkurensi saat ini memeriksa row-lock pada definisi fungsi, batas kuota, dan interleaving/replay secara serial dalam transaksi. **Stress test dua sesi simultan belum dilakukan**; jangan mengklaim pengujian paralel sudah lulus. Advisory/row locking adalah implementasi kontrol konkurensi, bukan bukti stress-test.
- Revokasi mutator lama memindai definisi SQL statis; runtime audit menemukan trigger creator sebagai satu-satunya mutator lama empat tabel inti. Fungsi baru di masa depan dengan dynamic SQL/indirect helper harus ditinjau terpisah; jangan memberi grant klien secara default pada mutator baru.
- Definisi helper ACL dibekukan, tetapi keamanan tetap bergantung pada larangan CREATE bagi klien di schema tepercaya dan pada pengelolaan aman akun database/service-role.
- Guru legacy masih memiliki scope tugas tingkat sekolah dari tahap 3; tidak ada teacher invitation baru yang memperluasnya. Otorisasi per kelas/mapel tetap pekerjaan berikutnya.
- List platform memiliki batas tanpa pagination pada tahap ini; daftar sekolah/admin workspace/aplikasi sendiri tidak semuanya dibatasi. Tambahkan pagination dan retention audit sebelum skala besar.
- Rate limiting di gateway, CAPTCHA/anti-spam aplikasi/pesan, notifikasi email transfer, verifikasi legal NPSN/dokumen, dan uji browser multi-role belum termasuk empat berkas backend ini. Proposal transfer ditemukan melalui konteks portal, tidak otomatis mengirim email.
- Verifikasi auth/profile dilakukan ulang pada entrypoint, namun perubahan status akun oleh transaksi administratif eksternal saat RPC berjalan mengikuti snapshot PostgreSQL; revoke privilege database/service-role darurat berada di luar kontrak ini.
- Pembayaran dan entitlement belum diimplementasikan. Integrasi UI sudah tersedia dalam kode, tetapi membutuhkan rollout backend tahap 4 yang disetujui terpisah; keberhasilan unit test/build bukan bukti deployment hosting atau E2E browser.
