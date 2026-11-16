# Arsip aman Bank Soal — tahap 10

## Status penerapan

Migration telah diterapkan ke database live pada 16 November 2026. Dry-run expanded, apply, dan verifikasi read-only berhasil. Tidak ada soal existing yang diarsipkan selama penerapan; fingerprint seluruh baris soal sebelum/sesudah tetap identik. Semua akun dan soal fixture di-rollback sebelum commit schema. Tidak ada izin operator yang diberikan otomatis.

Implementasi:
- [Migration](migration-stage-10-question-archive.sql)
- [Runner dengan verifikasi TLS dan identitas project](../../scripts/migrate-question-archive.cjs)
- [Pengujian integrasi SQL](../../tests/database/question-archive.sql)
- [Regresi kontrak](../../tests/question-archive.test.mjs)
- [Workspace Bank Soal](../../src/components/admin/questions-workspace.js)

## Perilaku dan otorisasi

Tindakan Hapus diganti menjadi **Arsipkan**, bukan penghapusan fisik. Pengguna harus terautentikasi, terverifikasi, aktif, dan memiliki izin lihat serta izin arsip. Permission khusus terdaftar sebagai [`bank_soal.archive`](migration-stage-10-question-archive.sql:1). Superadmin mengikuti pemeriksaan permission existing; operator memerlukan pemberian izin eksplisit melalui mekanisme administrasi akses yang berwenang. Menampilkan tombol aktif saja bukan otorisasi: backend selalu memeriksa ulang.

Dialog mewajibkan konfirmasi dan alasan 5–2000 karakter setelah pemangkasan spasi. Backend menolak status atau versi yang sudah berubah sejak daftar dimuat. Soal yang memiliki referensi attempt, jawaban, atau assignment ditolak, termasuk riwayat penggunaan lama.

RPC [`archive_question()`](migration-stage-10-question-archive.sql:1) mengunci baris soal, memeriksa dependensi, mencatat aktor/alasan/status sebelumnya/versi/waktu, lalu mengubah status secara atomik. Isi, pilihan, kunci jawaban, versi, dan review tidak dihapus. Audit tidak dapat ditulis langsung oleh frontend; akses baca audit dibatasi RLS.

Empat guard referensi mencegah penggunaan baru pada attempt, jawaban, assignment, dan versi. Satu guard status mencegah pengaktifan kembali melalui workflow lama. Guard tersebut diterapkan pada soal yang memiliki tanda audit arsip tahap ini, bukan mengubah perilaku arsip legacy. Pengarsipan hanya menerima isolasi read committed. Penguncian parent menserialisasi pengarsipan dengan pemasukan referensi; stress test dua sesi belum dijalankan.

Arsip tetap dapat ditemukan melalui filter status yang sudah tersedia. Tidak ada fitur pemulihan atau hard-delete pada UI ini.

## Menjalankan runner

Jalankan Node dari root repository dengan [runner](../../scripts/migrate-question-archive.cjs): tanpa argumen untuk dry-run; argumen --apply untuk commit schema; argumen --verify untuk verifikasi read-only. Dry-run bukan read-only: migration dan fixture dijalankan dalam transaksi lalu di-rollback.

Apply mewajibkan environment konfirmasi [`QUESTION_ARCHIVE_APPLY_PROJECT_REF`](../../scripts/migrate-question-archive.cjs:24) yang sama dengan project Supabase tujuan. Host/user database harus cocok dengan project aplikasi; TLS harus tervalidasi menggunakan CA yang dikonfigurasi. Jangan mencetak konfigurasi rahasia atau menonaktifkan verifikasi sertifikat.

Runner menjalankan migration dua kali untuk uji idempotensi. Fixture berada dalam savepoint tersendiri dan di-rollback bahkan saat apply. Fingerprint seluruh soal wajib tetap identik sebelum commit. Bukti lokal tersanitasi tersimpan sebagai [dry-run](../../.local/database/question-archive-dry-run.json), [apply](../../.local/database/question-archive-apply.json), dan [verify](../../.local/database/question-archive-verify.json). Nilai idempotensi dan rollback-fixture pada laporan verify bernilai false karena mode tersebut tidak menjalankan migration/fixture, bukan karena pemeriksaan apply gagal.

## Bukti dan batas verifikasi

- Dry-run expanded dan apply: berhasil, migration idempoten, fixture di-rollback, soal existing tidak berubah.
- Live read-only: berhasil, RPC tidak dapat dieksekusi anonim, authenticated dapat memanggil RPC tetapi tetap diperiksa otorisasinya, penulisan audit langsung dan penghapusan soal tidak diizinkan, RLS aktif, lima trigger guard terpasang.
- Integrasi SQL: aktor tanpa izin/nonaktif/belum terverifikasi, alasan invalid, konflik status/versi, write langsung, arsip sukses, arsip berulang, visibilitas audit, dependensi existing, pembuatan referensi baru, versi baru, dan pengaktifan ulang diuji.
- Regresi aplikasi: 90/90 tes lulus; lint dan production build lulus.
- Browser terautentikasi belum diverifikasi karena akun uji sebelumnya belum berhasil login. Stress test concurrency dua sesi belum dilakukan.
- Penerapan database terpisah dari rilis frontend. Deployment Vercel tidak dijalankan secara manual dalam pekerjaan ini; push repository dapat memicu deployment otomatis sesuai konfigurasi integrasi hosting.

## Penonaktifan dan pemulihan

Jika fitur perlu dihentikan, batasi akses eksekusi RPC dan cabut izin arsip operator melalui administrasi database yang berwenang, lalu nonaktifkan tindakan UI. Pertahankan audit dan guard untuk melindungi soal yang sudah diarsipkan. Jangan menghapus tabel audit, trigger, atau mereset status secara massal. Pemulihan per soal memerlukan desain, pemeriksaan dependensi, dan persetujuan terpisah; tidak disediakan skrip rollback destruktif otomatis.
