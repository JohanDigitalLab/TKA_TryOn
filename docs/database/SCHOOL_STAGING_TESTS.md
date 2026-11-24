# Pengujian sekolah di staging (runner read-only dan mutasi terpisah)

Runner: [`scripts/verify-school-staging.mjs`](../../scripts/verify-school-staging.mjs). Guard: [`src/lib/server/staging-guard.mjs`](../../src/lib/server/staging-guard.mjs). Tes offline: [`tests/staging-guard.test.mjs`](../../tests/staging-guard.test.mjs).

## Prasyarat dan cara menjalankan

**Jangan jalankan pada production. Implementasi ini belum dieksekusi ke staging karena konfigurasi terisolasi belum tersedia.** Tidak ada provisioning, fixture baru, migrasi, refresh token, login password, service-role, maupun perubahan data.

Administrator harus memasok environment proses melalui secret manager/terminal terisolasi, bukan file env lokal. Runner tidak memuat file env apa pun. Variabel wajib:

| Variabel | Isi |
| --- | --- |
| STAGING_TESTS_CONFIRM | Nilai tepat `READ_ONLY_STAGING` |
| STAGING_PROJECT_REF | Ref staging eksplisit, 20 huruf kecil |
| STAGING_SUPABASE_URL | Origin HTTPS Supabase dengan ref staging tersebut; tanpa path/query/kredensial |
| PRODUCTION_PROJECT_REF | Ref produksi yang diketahui valid dan berbeda dari staging; wajib jika session snapshot tidak menyediakan ref produksi |
| STAGING_SUPABASE_PUBLISHABLE_KEY | Publishable key staging atau JWT anon, bukan service-role/secret key |
| STAGING_SCHOOL_A_TOKEN | Access token user admin sekolah A, terverifikasi dan aktif |
| STAGING_SCHOOL_B_TOKEN | Access token user admin sekolah B yang berbeda |
| STAGING_STUDENT_TOKEN | Access token siswa aktif sekolah A, UID berbeda dari kedua admin |
| STAGING_SCHOOL_A_ID | ID sekolah A yang sudah tersedia |
| STAGING_SCHOOL_B_ID | ID sekolah B yang berbeda dan sudah tersedia |
| STAGING_STUDENT_ATTEMPT_ID | ID attempt submitted milik siswa di atas, dengan soal review tersedia |

Ref bukan bukti bahwa project aman: operator wajib memverifikasi pemisahan project/data terlebih dahulu. Runner menambahkan ref produksi dari metadata session snapshot audit lokal bila tersedia; ref eksplisit tidak dapat menimpa denylist tersebut. Snapshot tanpa identitas project tidak dianggap sebagai bukti isolasi. Snapshot rusak menyebabkan gagal tertutup.

Setelah seluruh konfigurasi terisolasi diverifikasi, jalankan Node pada [runner](../../scripts/verify-school-staging.mjs). Jangan gunakan opsi pemuatan file env. Untuk tes offline saja, jalankan Node test runner pada [tes guard](../../tests/staging-guard.test.mjs); tes ini memakai transport palsu, tidak mengakses staging.

## Invariant yang diperiksa

- Guard memvalidasi konfirmasi, ref, origin, tipe key, token, UID berbeda, ID sekolah berbeda, dan ID attempt **sebelum jaringan pertama**. Isi JWT belum dianggap autentik sampai endpoint Auth memverifikasinya.
- User A/B/siswa harus terverifikasi oleh Auth; token kedaluwarsa atau salah issuer ditolak.
- Context memakai kontrak portal aktif; A/B wajib admin pada sekolah masing-masing, bukan platform admin/reviewer atau anggota sekolah lawan. Siswa hanya memiliki peran siswa dan bukan anggota sekolah B.
- Workspace sekolah sendiri harus valid dan scoped sesuai ID. Kedua arah akses workspace lintas sekolah serta akses workspace admin oleh siswa harus menghasilkan penolakan izin eksplisit. Missing RPC atau generic error tidak dianggap lolos.
- Review attempt supplied harus berhasil bagi siswa pemilik sebagai positive control. Kedua admin harus ditolak oleh owner check/otorisasi. Attempt fiktif atau belum submitted tidak dapat menghasilkan kelulusan semu.
- Transport hanya mengizinkan empat endpoint baca: Auth user, context, scoped workspace, dan review. Semua menggunakan HTTP GET, tanpa redirect, retry mutasi, start/resume attempt, atau akses tabel bebas.
- Output hanya PASS/FAIL generik; tidak menulis token, key, email, nama, ID, payload review, atau respons backend. Jangan menambahkan log debug rahasia.

## Runner MUTATION School Advanced terisolasi

Runner baru: [verify-school-staging-mutation.mjs](../../scripts/verify-school-staging-mutation.mjs). Guard terpisah: [staging-mutation-guard.mjs](../../src/lib/server/staging-mutation-guard.mjs). Tes offline: [staging-mutation.test.mjs](../../tests/staging-mutation.test.mjs). Runner/guard read-only di atas tidak diubah. Tidak ada pemuatan file environment, service role, provisioning, SQL/migrasi, atau akses tabel langsung.

Wajib pasok seluruh [daftar environment](../../src/lib/server/staging-mutation-guard.mjs:5) melalui environment proses. URL/key/token/ref/sekolah memakai variabel staging yang sama seperti tabel di atas; ref produksi eksplisit wajib, ditambah denylist metadata session snapshot bila tersedia, tidak dapat ditimpa. ID attempt read-only tidak diperlukan. Tiga persetujuan **terpisah dan harus persis**:

- STAGING_MUTATION_CONFIRM = MUTATE_ISOLATED_STAGING_ONLY.
- STAGING_ISOLATION_CONFIRM = NONPRODUCTION_PROJECT_NO_REAL_USERS.
- STAGING_FIXTURE_CONFIRM = EXISTING_TEST_ONLY_FIXTURES_EMPTY_STUDENT_HISTORY.

STAGING_MUTATION_FIXTURE adalah satu objek JSON dengan **hanya** field berikut: projectRef, userIds (urutan admin A/admin B/siswa), schoolIds (A/B), classId (sekolah A), tkaCode, subjectName, grade (6/9), questionCount, durationMinutes, runId (UUID unik baru). ID harus cocok dengan token dan environment; jumlah/durasi/nama harus cocok konfigurasi SET existing yang dikembalikan RPC siswa. Field tambahan atau izin wildcard tidak diterima. Lihat [validasi persis fixture](../../src/lib/server/staging-mutation-guard.mjs:19).

Operator wajib memastikan project, kedua sekolah, ketiga akun, kelas khusus satu siswa, SET **dan pool soal tugas** adalah fixture existing test-only tanpa pengguna/data nyata. Akun siswa harus benar-benar belum mempunyai riwayat maupun sesi aktif; runner memeriksa history/assignment/agenda kosong, scope kelas satu siswa, serta tidak ada tugas pada kelas di workspace terbatas. RPC berhalaman bukan bukti ketiadaan semua riwayat database: pernyataan operator tetap wajib. Runner tidak membuat/memperbaiki fixture atau menghapus sejarah agar preflight lolos. Setelah berhasil, siswa memiliki dua attempt submitted yang dipertahankan; pengulangan wajib memakai fixture siswa/kelas baru yang kosong, bukan reset/destructive cleanup.

Jalankan Node dengan path [runner mutasi](../../scripts/verify-school-staging-mutation.mjs), tanpa opsi pemuatan environment. Kehadiran semua variabel diperiksa tanpa mencetak nilainya; jika kurang: SKIP sebelum network. Jika lengkap tetapi konfirmasi/guard tidak valid: FAIL sebelum network. Semua identitas diverifikasi Auth terlebih dahulu, kemudian context/capability versi tepat untuk ketiga aktor sebelum mutasi.

Cakupan: draft/publish tugas, ranking kosong lalu hasil siswa; draft/publish jadwal, monitor satu peserta; siswa start ulang saat aktif dengan attempt sama, resume, simpan satu jawaban yang diturunkan hanya dari struktur soal publik, resume memverifikasi simpanan, submit/review via engine existing, start setelah submit harus ditolak. Jam server dipakai, waktu mulai jadwal +30 detik, polling terbatas sekitar 40 detik. Cross-school membaca dua arah wajib ditolak; negative mutation hanya mencoba **cancel draft baru milik runner** memakai admin B, lalu mengecek status/revisi tidak berubah. Tidak pernah membuat/mengedit objek di sekolah B. Missing RPC/generic error bukan bukti denial.

Akhir sukses/gagal mencoba cancellation hanya untuk ID tugas/jadwal yang dikembalikan create pada run ini, dengan revisi jadwal terakhir yang terkonfirmasi. Tidak ada retry mutasi, delete, restore status, atau perubahan historis. Timeout/response create atau publish ambigu dapat menyisakan rekaman/attempt test-only; cancellation gagal membuat run FAIL, bukan PASS. Review manual project terisolasi diperlukan untuk status ambigu, tanpa retry otomatis. Output tidak berisi URL, ID, token, key, jawaban, atau respons backend.

**Hasil sesi implementasi: 51/51 tes lokal terfokus lulus (termasuk 5 tes baru memakai transport palsu). Pemeriksaan runtime environment proses menghasilkan SKIP karena konfigurasi wajib belum lengkap; tidak ada request jaringan dan staging authenticated belum dijalankan/terverifikasi.** Belum mencakup concurrency, revocation, exact deadline, authoring/freeze race, anonymous/unverified runtime, atau seluruh deployment gates pada [kontrak](SCHOOL_ADVANCED_AGENDA_CONTRACT.md). Ini bukan sertifikasi staging/produksi dan tidak mengeksekusi migrasi.

## Mengapa tes baseline diperbarui

[Pengujian akses belajar](../../tests/learning-access.test.mjs) sebelumnya mengharuskan RPC historis `start_learning_attempt` dan tautan WhatsApp yang tidak digunakan source produk. Challenge aktif memakai [adapter kontrak siswa](../../src/lib/student/rpc-contract.mjs): start tryout berdasarkan kode TKA server, latihan berdasarkan kode mapel/jumlah/filter, serta prioritas assignment dan resume. Tes pengganti memeriksa argumen tepat, konfigurasi legacy gagal sebelum dispatch, timer latihan untimed, dan pemetaan soal tanpa kunci jawaban—bukan sekadar menghapus assertion gagal.

Source landing/subscription dan [tes registrasi](../../tests/registration.test.mjs) menghendaki registrasi: paket mandiri menuju siswa mandiri; paket sekolah menuju pendaftaran staf/sekolah; siswa undangan memakai jalur siswa sekolah tersendiri. Assertions baru memastikan perbedaan tujuan, semantik helper registrasi, rendering tautan, dan harga lama tetap terjaga. Kebijakan harga/WhatsApp tidak diubah demi tes. Login diuji untuk submit aktual, kegagalan tanpa bocoran error, pencegahan double-submit, kelanjutan undangan, dan fallback role melalui halaman home; staf tidak diminta jenjang.
