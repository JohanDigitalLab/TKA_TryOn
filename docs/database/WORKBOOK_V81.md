# Workbook v8.1 — Rilis impor 474 soal

## Hasil penerapan

- File sumber: `TKA_TryOut_v8_1_Master_Konsolidasi_474_WORKING.xlsx`.
- Total workbook: 25 sheet.
- Sheet diproses berdasarkan nama, bukan posisi: 4.
- Sheet diabaikan: 21.
- Soal tersimpan permanen: 474.
- Batch produksi: `IMP-V81-3ed5141563da4fe1b8684a741bec646d`.
- Tidak ada soal impor yang aktif/current atau masuk pool CBT.
- 338 soal: `PENDING_REVIEW`.
- 136 soal: `NEEDS_REVISION` karena status sumber `REKONSTRUKSI WAJIB — BELUM SIAP DIGUNAKAN`.
- Hak penggunaan tidak tersedia di workbook, sehingga disimpan sebagai belum diverifikasi dan tidak otomatis dianggap `ORISINAL`.
- 200 soal lama yang ID-nya bertabrakan diarsipkan dengan kode `LEGACY-V81-<uuid>-<kode-lama>`; UUID internal, versi, snapshot dan jawaban siswa dipertahankan.

## Verifikasi

Verifikasi rollback dan penerapan memakai TLS CA serta guard project ref. File asli lolos validasi dengan 474 ID unik, 274 `PG_TUNGGAL`, 100 `PGK_MA`, dan 100 `PGK_KATEGORI`. Metadata 24 kolom, tema/cakupan, topik/submateri, opsi, kunci MCMA, dan kategori Benar/Salah diperiksa terhadap database.

Idempotensi:

- Impor ulang identik: 474 dilewati.
- Mode skip: 474 dilewati.
- Perubahan satu ID pada mode upsert: membuat satu versi baru nonaktif.
- Batch bersifat atomik: error validasi membatalkan seluruh transaksi.

Audit pascapenerapan:

- Batch v8.1 `COMPLETED`, `imported_rows=474`, `question_rows=474`.
- Status database: 338 `PENDING_REVIEW`, 136 `NEEDS_REVISION`.
- Semua versi baru `is_current=false`.
- Riwayat tidak berubah: 500 `exam_attempt_questions`, 86 `exam_attempt_answers`.
- Migrasi tahap 7 operator dan tahap 8 workbook diterapkan oleh runner terverifikasi.

## Operasi berikutnya

Guru/operator dengan izin review harus menelaah versi baru. Soal rekonstruksi tidak dapat dipublikasikan sebelum diperbaiki. Publikasi harus melewati workflow review dan approval; guard backend menolak penerbitan jika hak penggunaan belum diverifikasi.

Jangan menghapus kode arsip lama secara fisik: tabel ujian dan jawaban merujuk UUID internal lama.
