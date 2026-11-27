# Pengaturan admin platform

## Status implementasi — 27 November 2026

Basis worktree: commit 422f1f1, branch feature/admin-platform-settings. Migrasi telah diterapkan ke database produksi pada 27 November 2026 pukul 22:54 WIB; frontend berhasil dideploy pukul 22:57 WIB dan berstatus Ready. Koneksi memakai TLS terverifikasi dan project reference database cocok dengan aplikasi serta environment produksi. Keempat baris pengaturan tetap identik dengan backup privat; tidak ada duplikat, seed, atau penulisan konfigurasi untuk pengujian.

### Hasil deployment produksi

- URL fitur: https://tka-tryon-champion.vercel.app/admin/settings.
- Deployment: dpl_B73t8i3d4ELnovNHH8CNNWuYP4Uy; URL immutable https://tka-tryon-8810gmrhz-johan-digital-lab.vercel.app; status READY dan alias champion dikonfirmasi ulang melalui Vercel inspect.
- Sumber deployment adalah worktree bersih pada commit fitur f66c9dc6f4383be549e1fdf683650f7ebf0df79b. Tidak ada push Git atau deployment root main. Respons metadata CLI tidak menyertakan SHA Git, jadi SHA sisi server tidak diklaim terverifikasi; commit sumber tercatat dari HEAD worktree sebelum/sesudah deployment.
- Smoke HTTP pada 23:00 WIB: route Pengaturan 200, sebelas chunk JavaScript berhasil dimuat, dan bundle memuat ketiga RPC get/save/history. HTTP 200 hanya membuktikan shell publik tersedia, bukan login atau otorisasi admin.
- Verifikasi database pascadeploy pada 23:01 WIB lulus: empat baris identik dengan backup sebelum migrasi, satu Superadmin eligible, pembacaan get/history dengan role authenticated dan JWT sub Superadmin berhasil, pengguna biasa/anon ditolak, privileges langsung/helper tetap tertutup, revisi 0, audit kosong.
- Pengulangan final: 24 tes fokus lulus, 0 gagal, 0 skip (termasuk PGlite dan routing Superadmin); lint berkas berubah dan build lokal serta build Vercel lulus. Suite penuh tidak diulang; kegagalan lama yang tidak terkait tetap dicatat di bawah.
- Batas QA: tidak ada sesi browser admin login, uji simpan konfigurasi produksi, uji visual desktop/mobile, atau balapan dua koneksi live. Tes save/audit/revisi hanya pada database sintetis terisolasi. Konfigurasi nyata tidak dimutasi untuk membuktikan UI.
- Dokumentasi hasil final ditambahkan sesudah deployment dalam commit dokumentasi terpisah; tidak memerlukan deployment aplikasi ulang.

### Penerapan lanjutan dengan persetujuan eksplisit

- Persetujuan pengguna mencakup verifikasi profil satu Superadmin existing lalu migrasi dan deployment. Transaksi memastikan tepat satu role Superadmin, profil aktif, email terkonfirmasi, tidak banned, dan tidak deleted; baris profil/auth dikunci sebelum pembaruan.
- Tepat satu profil diubah, hanya kolom is_verified menjadi true. Password, subscription, account_type, role, pengguna lain, dan seluruh kolom profil lain tetap. Dua percobaan awal di-rollback karena trigger timestamp; penerapan akhir mengunci tabel profil dan menonaktifkan hanya trigger timestamp di dalam transaksi, mengaktifkannya kembali sebelum commit, lalu membandingkan seluruh kolom profil. Trigger perlindungan pendidikan tetap aktif.
- Backup sebelum perubahan profil dan migrasi disimpan privat di direktori .local yang diabaikan Git, mencakup keadaan profil awal, empat baris konfigurasi allowlist, privileges, dan definisi fungsi. Identitas akun serta nilai kontak tidak dicetak ke log atau dokumentasi.
- Migrasi diterapkan dalam transaksi dengan lock tabel settings, pemeriksaan duplikat, dan perbandingan snapshot sebelum/sesudah. Revisi awal 0 dan audit kosong; tidak ada nilai konfigurasi berubah.
- Pengujian live baca-saja memakai role database authenticated dan JWT sub Superadmin existing: RPC get dan history berhasil; pengguna biasa dan anon ditolak. Direct table privileges dan eksekusi helper ditolak sesuai kontrak. Ini bukan bukti sesi browser login atau pengujian write produksi.
- Tes fokus dan lint diulang; build produksi lokal lulus pada Next.js 16.4.5. Hasil deployment aktual dan batas pembuktiannya tercatat di atas.

### Percobaan penerapan produksi — 27 November 2026, 22:43 WIB

Penerapan dihentikan pada preflight, sebelum migrasi maupun deployment, karena tidak ada Super Admin yang memenuhi syarat verifikasi profil. Database memiliki satu Super Admin dengan email terkonfirmasi, tetapi kolom verifikasi profil bernilai bukan true. Konfirmasi email tidak menggantikan syarat verifikasi profil pada [helper otorisasi](migration-admin-platform-settings.sql:36). Identitas, role, status akun, dan syarat otorisasi tidak diubah untuk memaksakan kelulusan.

- Target domain masih menunjuk deployment baseline `dpl_HJ6MN6vctr1cQ8jR2iSSxHnKEdwu` / `tka-tryon-i2gsbzbcs-johan-digital-lab.vercel.app`, berstatus Ready saat pemeriksaan.
- Koneksi database menggunakan TLS terverifikasi; identitas project database cocok dengan URL aplikasi lokal dan environment produksi Vercel.
- Empat baris pengaturan allowlist ditemukan tanpa duplikat. Kolom prasyarat profil dan auth diperiksa. Semua pemeriksaan database berjalan dalam transaksi baca-saja yang diakhiri rollback.
- Tidak ada migrasi, perubahan nilai, perubahan privileges, perubahan akun, atau deployment baru. Backup penerapan belum dibuat karena proses berhenti sebelum tahap mutasi. Tidak ada commit fitur baru maupun push.
- Tes/build terdahulu di bawah bukan hasil pengulangan pada percobaan penerapan ini. Verifikasi RPC live dan QA browser admin belum dijalankan karena blocker preflight.

Catatan percobaan di atas adalah riwayat blocker, bukan status terkini. Pengguna kemudian memberi persetujuan eksplisit untuk verifikasi profil terbatas; penerapan lanjutan tercatat pada bagian sebelumnya.

## Cakupan

- Nomor WhatsApp aktivasi, pesan siswa, pesan sekolah; pesan maksimum 255 karakter Unicode.
- Perhitungan kompetensi otomatis setelah submit ujian pada halaman Tantangan. Format lama 1/0 dan TRUE/FALSE didukung; penulisan baru menggunakan 1/0.
- Harga belum dihubungkan ke pengaturan: harga masih ditetapkan dalam kode landing dan paket. Tidak tersedia formulir harga yang tidak efektif, sakelar maintenance palsu, CRUD kunci sembarang, pembayaran, atau penyimpanan rahasia.
- Placeholder dalam pesan existing tetap teks literal, sesuai perilaku produksi sebelumnya. Tidak memasukkan email pengguna otomatis ke tautan WhatsApp.
- Nomor/pesan yang hilang ditampilkan sebagai belum dikonfigurasi, bukan diberi nomor palsu. Tidak ada seed konfigurasi. Nomor kosong menonaktifkan aktivasi; pesan kosong membuka chat tanpa pesan.

## Berkas implementasi

- [Migrasi database](migration-admin-platform-settings.sql): RPC otorisasi, pembacaan, penyimpanan atomik, revisi, riwayat, indeks unik parsial, dan penutupan akses tabel.
- [Halaman Pengaturan](../../src/app/admin/settings/page.js): draf, penanda perubahan, validasi, pratinjau, alasan dan konfirmasi, perlindungan draf, retry, riwayat terpaginasikan.
- [Kontrak validasi](../../src/lib/admin/platform-settings.mjs): allowlist, validasi/normalisasi telepon, batas Unicode, pembentukan tautan, pemetaan error.
- [Sidebar admin](../../src/components/admin/admin-sidebar.js) dan [dashboard admin](../../src/app/admin/page.js): route desktop/mobile, navigasi kembali, tautan manajemen operator.
- [Dashboard siswa](../../src/app/student/page.js): loading/error kontak, retry, pratinjau pesan, tautan WhatsApp same-tab yang diklik pengguna sehingga tidak bergantung pada popup setelah await.
- [Tantangan](../../src/app/student/challenge/page.js): kompatibilitas boolean existing.
- [Tes fitur dan SQL](../../tests/platform-settings.test.mjs), [regresi akses belajar](../../tests/learning-access.test.mjs), [regresi pendaftaran](../../tests/registration.test.mjs), [regresi kompetensi](../../tests/school-competency.test.mjs).

## Batas keamanan dan konkurensi

Setiap RPC admin memeriksa identitas dari sesi database, role super_admin, profil aktif (case-insensitive), profil terverifikasi, pengguna tidak dihapus, dan tidak sedang diblokir. Tipe akun STUDENT atau status langganan tidak menggagalkan Super Admin yang valid. Guard UI bukan batas otorisasi.

Akses langsung tabel pengaturan/state/audit dicabut dari PUBLIC, anon, authenticated; RLS tetap aktif. Helper otorisasi tidak dapat dieksekusi langsung oleh authenticated. Ketiga RPC utama hanya dapat dieksekusi authenticated dan tetap memeriksa actor di database. Nilai, revisi, dan audit berubah dalam transaksi RPC yang sama. Revision compare-and-swap dan row lock singleton menolak draf basi dengan kode 40001. Tidak ada audit/revisi baru untuk operasi tanpa perubahan efektif. Pembacaan nilai/revisi memakai satu snapshot statement.

Audit menyimpan kunci allowlist saja dengan nilai sebelum/sesudah, UUID actor, waktu server, alasan 5–300 karakter. Nilai dibatasi 255 karakter; objek audit dibatasi ukurannya. Alasan tidak boleh diisi kredensial atau data pribadi. Riwayat tidak publik. Riwayat sebelum migrasi tidak direkonstruksi.

RPC legacy pembaca pengaturan tetap dipertahankan agar konsumen produksi tidak rusak. Pengaturan yang dikelola ini memang nonrahasia; jangan menggunakan tabel ini untuk API key. Penulisan langsung oleh pemilik database atau service role berada di luar protokol revisi aplikasi. Selama fitur digunakan, seluruh perubahan empat kunci harus melalui RPC save; pekerjaan pemeliharaan privileged perlu window terkontrol dan pemuatan ulang draf. Pengujian WASM tidak membuktikan balapan multi-koneksi live; uji dua sesi di staging sebelum rilis.

## Urutan penerapan manual (memerlukan persetujuan)

1. Pastikan target project/branch benar. Ambil backup terkontrol empat baris existing dan metadata privileges tanpa memasukkannya ke repository atau log publik. Verifikasi kolom auth users banned_until/deleted_at dan profil account_status/is_verified ada.
2. Review [migrasi](migration-admin-platform-settings.sql), jalankan terlebih dahulu di staging. Dependensi tabel settings, profiles, user_global_roles, serta schema auth harus sudah ada; ini bukan bootstrap database kosong.
3. Migrasi mengunci tabel settings dan membatalkan seluruh transaksi jika ditemukan duplikat SYSTEM pada empat kunci. Jangan menghapus atau menggabungkan duplikat otomatis. Pemilik data harus memutuskan nilai yang benar dan menyelesaikan duplikat secara eksplisit sebelum mengulang migrasi.
4. Jalankan migrasi sebagai pemilik database di SQL Editor setelah persetujuan. Migrasi idempotent dan tidak mengubah nilai existing. Indeks unik hanya mencakup empat kunci SYSTEM; kunci/grup lain tidak disentuh. NOTIFY meminta pemuatan ulang schema PostgREST.
5. Dengan akun Super Admin valid, baca konfigurasi dan pastikan nilai sama seperti sebelum migrasi, revisi awal 0, riwayat kosong. Pastikan siswa biasa, admin operator tanpa role super_admin, akun belum verifikasi, suspended, banned, deleted dan anon tidak dapat membaca/menulis/menampilkan audit.
6. Uji perubahan nonproduksi di staging: simpan dengan alasan, lihat revisi/audit, reload untuk memastikan persistensi. Buka dua sesi, simpan sesi pertama, pastikan sesi kedua ditolak konflik revisi dan tidak menimpa data.
7. Verifikasi environment deployment memiliki URL dan anon/publishable key Supabase yang benar. Build lokal awal tanpa variabel lengkap gagal prerender; build berikutnya memakai variabel publik lokal yang diinjeksi ke proses dan berhasil. Tidak ada perubahan environment produksi dilakukan.
8. Setelah migrasi dan staging checks disetujui, deploy kode worktree ini secara manual. Jangan deploy root main yang tertinggal. Bila backend belum dipasang, UI menampilkan instruksi migrasi, bukan keberhasilan palsu.
9. Smoke test desktop/mobile, tema gelap/terang, fokus keyboard, perubahan draf, alasan/konfirmasi, error jaringan, konflik revisi, riwayat lanjutan, dan aktivasi WhatsApp. Uji link membuka chat yang benar tanpa mengirim pesan otomatis. Validasi flag kompetensi dengan ujian sintetis di staging.

Rollback aplikasi dapat dilakukan ke deployment sebelumnya tanpa menghapus tabel audit/state atau nilai existing. Jangan drop tabel atau mengembalikan konfigurasi secara massal. Koreksi nilai melalui penyimpanan baru dengan alasan agar histori terjaga. Pencabutan akses tabel perlu diperhitungkan bila ada integrasi privileged lain; audit awal menemukan tidak ada policy RLS settings.

## Validasi yang telah dijalankan

- 24 tes fokus lulus, tanpa skip: fitur Pengaturan termasuk SQL PGlite, routing Super Admin, akses belajar, pendaftaran, dan kompetensi.
- SQL lokal menguji penerapan dua kali, konfigurasi existing dipertahankan, nilai kosong/missing, validasi allowlist/tipe/telepon/panjang Unicode, stale revision, no-op, rollback partial write, audit actor dan pagination, larangan direct table access/helper, penolakan actor tidak sah/nonaktif/unverified/banned/deleted, dan abort duplikat tanpa dedupe.
- Lint seluruh berkas JavaScript yang diubah lulus; pemeriksaan whitespace diff lulus.
- Build Next.js 16.4.5 lulus, termasuk prerender route Pengaturan.
- Suite menyeluruh: 344 tes, 339 lulus, 1 gagal, 4 dilewati. Pengujian database MapAdventure lulus setelah path mesin lokal diberikan melalui environment. Satu kegagalan tersisa adalah [tes riwayat hasil lama](../../tests/student-tryout-history.test.mjs:31) yang mengharapkan filter VirtualPet di [migrasi hasil siswa](migration-get-student-results.sql), sedangkan basis produksi memakai filter jenis attempt. Kedua berkas tidak diubah fitur ini. Tidak diperbaiki diam-diam dalam lingkup Pengaturan.
- Belum dilakukan QA browser interaktif dengan sesi admin nyata atau pengujian simpan konfigurasi produksi. Mutasi live hanya verifikasi profil yang disetujui dan migrasi additive; tes save/audit/revisi memakai fixture sintetis terisolasi. Otorisasi get/history telah diperiksa live melalui role database, bukan sesi browser.

Untuk mengulang tes lokal, arahkan variabel lingkungan PGLITE_MODULE_PATH ke paket @electric-sql/pglite lokal, lalu jalankan Node test runner untuk berkas tes fitur dan regresi terkait. Bila engine tidak tersedia, tes SQL ditandai skip secara eksplisit; jangan menganggap skip sebagai lolos keamanan. Pada mesin audit engine tersedia di sandbox lokal root. Dependensi build dipasang melalui npm ci hanya di worktree, bukan mengganti dependensi root.
