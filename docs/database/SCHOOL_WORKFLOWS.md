# Tugas sekolah dan workflow guru

## Status penerapan

Migration tahap 3 diterapkan pada 14 November 2026 ke database yang target proyeknya telah dicocokkan dengan konfigurasi Supabase aplikasi. Runner mengonfirmasi COMMIT, tiga tabel dengan RLS, enam RPC terotorisasi, dan integration test sukses; fixture di-rollback sebelum commit. Verifikasi aplikasi: 22 unit test lulus, lint bersih, build produksi berhasil, dan diff check tanpa whitespace error. Deployment aplikasi serta uji visual/browser multi-role tetap terpisah dari penerapan database.

## Cakupan

Payment gateway **ditunda**. Tidak ada checkout, webhook pembayaran, transaksi, atau entitlement baru.

Migration tahap 3 menambah tiga tabel dengan RLS dan enam RPC publik. Akses tabel baru ditutup sepenuhnya untuk anon/authenticated; pembacaan dan mutation memakai RPC SECURITY DEFINER yang memeriksa identitas, status akun, membership aktif, dan sekolah di database. Tidak menggunakan service-role key di browser.

- `/teacher`: guru dan admin membuat/edit draft, menerbitkan, membatalkan, memantau jumlah submit, dan melihat Top 5.
- `/student/assignments`: penerima membaca jadwal, memulai/melanjutkan satu sesi, melihat nilai akhir.
- `/school`: tautan ke pengelolaan tugas untuk staf.
- Dukungan kelas mengikuti engine yang terverifikasi: kelas 6 dan 9. Kelas 12 belum diaktifkan.

## Hak akses

| Aksi | Siswa penerima | Guru sekolah | Admin sekolah | Sekolah lain/anonim |
| --- | --- | --- | --- | --- |
| Daftar tugas siswa | Milik sendiri | Tidak | Tidak | Tidak |
| Workspace dan Top 5 | Tidak | Ya | Ya | Tidak |
| Buat draft kelas sekolah | Tidak | Ya | Ya | Tidak |
| Edit/publish/cancel | Tidak | Tugas buatannya | Semua tugas sekolah | Tidak |
| Mulai sesi tugas | Sekali, milik sendiri | Tidak | Tidak | Tidak |

Guru sekolah dapat membuat tugas untuk seluruh kelas di sekolahnya. Belum ada pembatasan guru per mapel/kelas atau delegasi guru kolaborator. Tidak ada mutation membership/role, penghapusan siswa, pengelolaan kelas, atau undangan baru pada tahap ini.

## Kontrak dan lifecycle

- `get_teacher_workspace(p_school_id)`: kelas dan maksimal 100 tugas terbaru, termasuk jumlah penerima/submit.
- `save_school_assignment(...)`: membuat atau mengedit draft; edit memakai `p_expected_updated_at` untuk mencegah lost update.
- `set_school_assignment_status(p_assignment_id,p_status)`: draft → published/cancelled; published → cancelled. Status cancelled final. Pengulangan status sama bersifat idempotent.
- `get_student_assignments()`: maksimal 100 tugas terbaru milik siswa dengan membership dan akun aktif.
- `start_school_assignment(p_assignment_id)`: membuat sesi dengan konfigurasi dan snapshot server; permintaan ulang mengembalikan sesi yang sama. Tidak menerima attempt ID atau nilai dari client.
- `get_school_assignment_ranking(p_assignment_id)`: Top 5 hasil SUBMITTED untuk staf sekolah, berdasarkan score menurun, submitted_at menaik, lalu attempt ID. Bukan ranking global dan tidak dibuka kepada siswa.

Publish mengunci daftar siswa aktif dalam kelas dan versi soal terbit. Semua penerima memperoleh paket soal sama; soal yang kurang atau kelas tanpa siswa membuat publish gagal atomik. Siswa yang baru bergabung setelah publish memerlukan tugas baru. Perpindahan kelas tidak mengubah snapshot penerima; membership sekolah nonaktif menghilangkan akses tugas.

Tugas harus dibuka dan memiliki sisa waktu sekurangnya satu durasi penuh saat sesi baru dimulai. Durasi tidak dapat diubah oleh siswa. Pengerjaan dan submit memakai RPC CBT existing, termasuk scoring server dan validasi deadline autosave. Pembatalan menghentikan akses mulai lewat tugas, tetapi sesi yang sudah berjalan tetap bisa diselesaikan lewat mekanisme resume CBT. Pembatalan tidak menghapus histori ataupun hasil ranking. Tidak ada auto-submit background saat browser ditutup; hasil baru masuk ranking setelah submit server.

## Verifikasi dan penerapan

Runner membaca koneksi TLS terverifikasi dari `.env.database.local` (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL_CA_PATH), tanpa mencetak credential.

```sh
node scripts/migrate-school-workflows.cjs
```

Default adalah dry-run: migration dijalankan dua kali dalam transaksi untuk memeriksa idempotensi, RLS, ACL, lalu integration test sebagai role authenticated. Seluruh perubahan dan fixture di-rollback. Integration test memerlukan minimal satu soal terbit kelas 6/9 dan school type yang sesuai.

Setelah meninjau target koneksi dan backup, terapkan dengan:

```sh
node scripts/migrate-school-workflows.cjs --apply
```

Runner tetap menjalankan pemeriksaan. Fixture dibuat dalam SAVEPOINT terpisah dan selalu di-rollback sebelum COMMIT migration. Bila satu pemeriksaan gagal, seluruh migration di-rollback. NOTIFY me-refresh schema cache PostgREST saat commit. Jalankan hanya satu runner migration pada satu waktu.

Alternatif: jalankan SQL tahap 3 di Supabase SQL editor sebagai satu transaksi setelah backup dan verifikasi prasyarat tahap 1/2. Jangan mengubah atau menjalankan ulang migration lama secara buta.

Rollback operasional: kembalikan deployment aplikasi sebelumnya dan hentikan pemakaian route guru/tugas; biarkan tabel dan hasil tetap tersimpan. Jangan DROP tabel yang sudah berisi data. Perbaikan berikutnya harus berupa migration versioned baru.

## Pengujian

- Unit test: jendela jadwal, status lifecycle, sesi resume, validasi konfigurasi, optimistic concurrency payload.
- Integration SQL: publish idempotent, snapshot penerima/soal, penolakan edit published, penolakan lintas sekolah, penolakan eskalasi siswa, tabel tidak terbuka langsung, mulai idempotent, submit, ranking, histori setelah cancel, dan autentikasi wajib.
- Verifikasi manual sebelum rollout luas: akun admin/guru/siswa pada browser berbeda, daftar kelas aktual, waktu lokal perangkat, koneksi terputus/resume, tampilan mobile, dan pembaca layar.
