# Operator: impor sampai publikasi soal

## Status

Implementasi lokal tersedia. Migrasi tahap 7 **belum diterapkan permanen** dan frontend belum di-deploy oleh tugas ini. Pengujian database memakai TLS terverifikasi, pemeriksaan identitas proyek, dua eksekusi migrasi untuk idempotensi, serta rollback seluruh DDL dan fixture. Tahap 5, tahap 6, dan payment gateway tidak diterapkan atau diubah.

## Pengaturan superadmin

Di Manajemen Admin, aktifkan operator dan centang izin Bank Soal sesuai tanggung jawabnya. Untuk satu operator yang mengerjakan seluruh alur, berikan keenam izin: Melihat Bank Soal, Telaah Soal, Edit Soal, Moderasi Soal, Publikasi Soal, dan Import Soal. Tidak ada pemberian otomatis role superadmin atau perluasan izin yang sudah tersimpan.

- Import Soal: membuka Smart Import, ekstraksi, penataan AI, dan menyimpan draft.
- Melihat Bank Soal: membaca daftar/detail, diperlukan untuk tindakan workflow.
- Telaah Soal: menyimpan hasil pemeriksaan versi.
- Edit Soal: membuat revisi baru, tidak langsung menerbitkan.
- Moderasi Soal: menyetujui versi yang sudah ditelaah atau meminta revisi.
- Publikasi Soal: menerbitkan versi terbaru yang sudah disetujui.

Izin yang dicabut dan operator nonaktif ditolak oleh database pada tindakan berikutnya. Pengguna harus memiliki email terverifikasi, profil aktif, serta tidak dihapus/diblokir; syarat ini berlaku juga bagi superadmin untuk alur Bank Soal.

## Alur

1. Smart Import menyimpan soal sebagai draft dan versi menunggu telaah.
2. Buka Bank Soal. Detail admin menampilkan versi terbaru, termasuk revisi yang belum terbit.
3. Periksa isi dan kunci, isi catatan, lalu simpan telaah.
4. Moderator menyetujui atau meminta revisi. Versi hasil revisi harus ditelaah lagi.
5. Pemegang izin publikasi menerbitkan versi yang disetujui.

Database memeriksa izin tindakan, catatan 5–4000 karakter, versi terbaru, urutan telaah/persetujuan, serta kelengkapan soal/kunci. Semua tindakan dicatat dalam audit baru dan riwayat review lama. Pemegang seluruh izin dapat melakukan ketiga tahap sendiri; tidak ada aturan wajib orang berbeda.

Versi terbit lama tetap tersedia selama revisi ditelaah. Saat publikasi, peralihan versi aktif berlangsung atomik dengan penguncian baris soal. Snapshot ujian yang sudah tersimpan tidak ditulis ulang. Versi usang tidak dapat diterbitkan jika revisi lebih baru telah dibuat.

## Perubahan backend

- Migrasi [tahap 7](migration-stage-7-operator-questions.sql) memperbaiki guard dua mesin impor yang sebelumnya khusus superadmin, tanpa menyalin/mengganti validasi payloadnya. Patch berhenti bila kontrak guard lama tidak cocok.
- Smart Import lama menulis nama lembar audit yang ditolak constraint. Patch memakai nama lembar SOAL yang sudah sah; asal AI tetap tersimpan pada metadata batch dan aturan skor.
- Pemeriksaan izin privat diperketat terhadap status akun dan verifikasi email.
- RPC workflow baru [review_question_version](migration-stage-7-operator-questions.sql:56) menerima identitas soal, identitas versi yang sedang diperiksa, tindakan, dan catatan. Tindakan: REVIEW, APPROVE, REQUEST_REVISION, PUBLISH.
- Tabel audit baru tidak dapat ditulis/dibaca langsung oleh client. Tidak ada service-role key di frontend.
- Moderator/publisher dapat membaca kunci untuk pemeriksaan. Izin melihat saja tidak memberikan akses opsi/kunci melalui tabel terkait.

## Verifikasi dan rilis

Runner [migrate-operator-questions.cjs](../../scripts/migrate-operator-questions.cjs) tanpa argumen selalu rollback. Fixture [operator-questions.sql](../../tests/database/operator-questions.sql) menguji impor terbatas, penolakan akses, tahap persetujuan, publikasi, revisi, kunci tidak valid, dan operator nonaktif. Tes sumber [operator-questions.test.mjs](../../tests/operator-questions.test.mjs) memeriksa kontrak UI/API.

Untuk menerapkan, gunakan runner dengan argumen --apply dan variabel OPERATOR_QUESTIONS_APPLY_PROJECT_REF yang sama persis dengan referensi proyek tujuan. Runner menolak ketidaksesuaian proyek, TLS tidak terverifikasi, dan kegagalan fixture. Rilis tahap 7 bersama frontend terkait. Jangan menjalankan ulang migrasi lama yang mengganti fungsi izin/impor sesudahnya tanpa meninjau definisi akhir.

Belum dilakukan: browser E2E multi-peran, stress test dua koneksi, deployment hosting, atau penerapan permanen database. Uji rollback bukan bukti fitur sudah aktif di produksi.
