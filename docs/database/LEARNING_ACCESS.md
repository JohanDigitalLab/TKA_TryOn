# Akses belajar — tahap 6

## Status aktual

Implementasi selesai dan dry-run database berhasil pada 14 November 2026. **Migrasi belum diterapkan permanen** dan deployment hosting belum diverifikasi. Status commit/push mengikuti riwayat Git dan tidak menjadi bukti penerapan database. Semua fixture dibatalkan. Tahap 5 Addendum 02 tidak diterapkan dan bukan prasyarat tahap ini.

Verifikasi: 55 unit/source-contract tests, lint global, build produksi, pemeriksaan diff, serta integration fixture SQL melalui koneksi TLS terverifikasi. Migrasi dijalankan dua kali dalam transaksi untuk menguji idempotensi. Pengujian browser multi-role dan stress test dua koneksi serentak belum dilakukan; jangan menganggap pengujian lock serial sebagai bukti concurrency E2E.

## Kebijakan

- Satu akun mendapat satu paket simulasi dan satu paket latihan, masing-masing terpisah. Penghitungan dimulai saat rollout; penggunaan sebelum rollout tidak di-backfill karena riwayat lama tidak membedakan mode/paket secara andal.
- Paket memuat 1–5 mapel unik dan pengaturan tetap, dijalankan berurutan. Trial dibebankan setelah start berhasil secara atomik, bukan saat membuka persiapan atau saat setiap mapel dimulai.
- Paket berlaku 24 jam untuk memulai mapel tersisa. Tenggat setiap attempt tetap ditentukan engine CBT. Mengubah penyimpanan browser tidak dapat mengganti pengaturan paket server.
- Paket yang sudah dimulai dapat menyelesaikan mapel tersisa sampai batas paket meskipun langganan berakhir. Tidak ada pengembalian atau reset trial otomatis.
- Attempt yang sudah berjalan dapat dilanjutkan sesuai tenggat aslinya tanpa langganan. History dan review tidak digate oleh langganan.
- Penugasan sekolah memakai kuota simulasi yang sama. Langganan individual atau langganan sekolah terkait yang aktif mengizinkan start baru. Siswa harus tetap memenuhi otorisasi penerima tugas.
- Langganan sekolah hanya memberi akses kepada anggota berperan siswa yang aktif di sekolah aktif. Tidak otomatis memberi akses kepada guru/operator.
- Jenjang engine existing tetap kelas 6/9. Tahap ini tidak menambahkan engine kelas 12 atau filter kesulitan baru.

## Aktivasi manual

Halaman [administrasi langganan](../../src/app/admin/subscriptions/page.js) hanya dapat memuat/mengubah data melalui RPC superadmin aktif dan terverifikasi. Masukkan UUID akun/sekolah yang sudah diverifikasi, status, batas waktu opsional, serta alasan. Kosongnya batas waktu berarti tidak ada kedaluwarsa otomatis; admin wajib menetapkan kebijakan akhir akses yang disepakati, bukan menganggap sistem mendeteksi kelulusan.

Siswa dapat melihat ID akunnya di halaman Paket dan menghubungi Wahyu Yoga Pratama melalui WhatsApp +62 821-3817-1938. Tidak ada checkout, webhook, deteksi pembayaran, atau aktivasi otomatis. Jangan meminta password/token siswa.

Mutasi memakai optimistic revision dan audit aktor/alasan/nilai sebelum-sesudah. Jika jaringan terputus setelah penyimpanan, muat ulang daftar dan pilih catatan kembali sebelum mengulangi. Daftar maksimal 500 subscription terbaru; ID existing di luar daftar tetap ditolak oleh revision guard, bukan ditimpa. Pencarian/pagination dan audit viewer belum disediakan.

## Keamanan dan kontrak

Lima tabel baru mengaktifkan RLS dan mencabut akses langsung anon/authenticated. Public RPC hanya diberikan ke authenticated dan memvalidasi aktor di database. Helper legacy dipindah ke schema private dan hak eksekusi klien dicabut. Wrapper legacy public tetap digate; bukan jalur start tanpa batas. Advisory transaction lock per akun dan unique trial `(user_id, mode)` mengamankan debit atomik.

Fixtures mencakup: kuota per mode, retry idempotent, perubahan konfigurasi, akses lintas akun, larangan eskalasi siswa/private bypass, aktivasi/deaktivasi, stale revision, multi-mapel berurutan, pemulihan paket, langganan sekolah kedaluwarsa, serta resume/history setelah akses berakhir.

## Urutan rilis terkoordinasi

Jangan menerapkan backend penguncian sendirian saat frontend produksi masih memakai start per-mapel versi lama: klien lama tidak membawa ID paket multi-mapel dan dapat terblokir pada mapel berikutnya. Rilis harus dijadwalkan dengan jendela pemeliharaan singkat/penghentian start baru, sementara sesi berjalan tetap disimpan.

1. Tinjau perubahan dan buat commit/push setelah diminta; siapkan artefak frontend baru tanpa membuka start ke pengguna.
2. Pastikan backup/PITR tersedia, cocokkan project aplikasi/database dan sertifikat CA. Konfigurasi runner memakai environment lokal yang tidak masuk Git.
3. Jalankan dry-run melalui [runner tahap 6](../../scripts/migrate-learning-access.cjs); default selalu rollback. Runner memeriksa TLS, identitas project, RLS/ACL, idempotensi dan SQL fixtures.
4. Dalam jendela rilis, jalankan runner dengan argumen `--apply` serta environment `LEARNING_ACCESS_APPLY_PROJECT_REF` yang persis cocok project terverifikasi. Fixture tetap rollback; hanya migrasi yang commit. Jangan menerapkan tahap 3/5 setelah tahap 6 karena keduanya mendefinisikan ulang RPC start dan dapat mengganti gate.
5. Aktifkan deployment frontend baru, reload klien, verifikasi Supabase schema cache dan uji browser siswa/superadmin/sekolah. Pastikan paket mapel kedua memakai ID paket yang sama dan resume/history tetap bekerja.
6. Catat hasil apply/deployment aktual pada dokumen ini. Sampai langkah tersebut dilakukan, fitur belum aktif produksi.

Rollback frontend saja tidak aman untuk alur multi-mapel baru. Jika rilis gagal, hentikan start baru dan lakukan forward fix teruji; jangan menghapus tabel paket/trial/audit atau membuka engine legacy kepada klien. Resume dan history existing tidak memerlukan penghapusan gate.
