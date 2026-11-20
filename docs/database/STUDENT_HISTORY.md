# Rename RPC riwayat dashboard siswa

RPC aktif menjadi **get_student_history**. Ini berbeda dari RPC riwayat hasil **get_student_tryout_history**; keduanya tidak digabung.

Signature aktual berasal dari [migrasi pembuat](migration-student-dashboard-history.sql:8): satu parameter bernama **limit**, bertipe integer, default 10, hasil jsonb. Rename tidak mengubah filter TRYOUT/milik pengguna, urutan started_at dan attempt_id menurun, maupun makna limit 0 (semua), nilai negatif/null (ditolak), dan autentikasi. Dashboard tetap meminta 5 atau 0.

## Urutan deployment

1. Untuk database baru, jalankan [migrasi historis pembuat](migration-student-dashboard-history.sql) terlebih dahulu. File ini sengaja dipertahankan dengan nama lama agar histori tidak ditulis ulang. Pada database yang sudah memiliki fungsi tersebut, jangan jalankan ulang pembuatnya.
2. Jalankan [migrasi rename](migration-rename-student-dashboard-history-to-history.sql:5) setelah seluruh migrasi historis pembuat fungsi. Polanya mengikuti [rename riwayat tryout](migration-rename-student-exam-history-to-tryout.sql:4). Migrasi ini disiapkan untuk deployment, bukan dijalankan otomatis oleh tes atau skrip aplikasi.
3. Migrasi mengirim notifikasi reload schema PostgREST. Pastikan cache schema sudah memuat nama baru, lalu deploy aplikasi yang memanggilnya. Koordinasikan pergantian aplikasi/database atau gunakan maintenance window: klien versi lama tidak lagi dapat memanggil nama lama setelah rename; tidak disediakan alias kompatibilitas.
4. Jangan menjalankan ulang migrasi pembuat setelah rename: itu akan menciptakan kembali nama lama. Jika kedua nama sudah ada, migrasi rename gagal dan operator harus merekonsiliasi terlebih dahulu, bukan menimpa salah satunya. Jika keduanya tidak ada, migrasi juga gagal; jika hanya nama baru ada, pengulangan aman.

Rename memakai perubahan nama fungsi tanpa membuat ulang implementasi: OID, owner, grants/ACL, default parameter, security definer, volatility, dan search_path tetap melekat pada fungsi. Tidak ada perubahan tabel, RLS, filter, atau parameter pada langkah rename itu sendiri.

## Filter tipe (migrasi lanjutan)

Setelah rename, terapkan [migrasi filter](migration-student-history-type-filter.sql:1) satu kali, dalam maintenance window. Kontrak aktif sesudah langkah ini adalah **get_student_history(p_limit integer DEFAULT 10, p_type text DEFAULT NULL)**, hasil jsonb. Pemanggil posisi integer (misalnya `get_student_history(5)`), pemanggil tanpa argumen, dan pemanggil named-parameter dengan **p_limit** (termasuk dashboard 5/0) tetap kompatibel; pemanggil named-parameter lama **limit** harus diperbarui menjadi **p_limit** karena nama parameter berubah.

- p_type null, string kosong, whitespace (termasuk tab/newline), atau CSV yang seluruh tokennya kosong berarti seluruh attempt milik pengguna aktif, **tanpa batasan status maupun tipe**.
- Satu tipe atau CSV merupakan filter OR terhadap attempt_type. Token ditrim dan dinormalisasi uppercase; token kosong diabaikan. Contoh: `exercise, ASSIGNMENT, ,` memilih EXERCISE atau ASSIGNMENT. Tipe tidak dikenal tidak menimbulkan error; jika tidak ada yang cocok hasilnya array kosong.
- Ownership selalu auth.uid(); pemanggil tanpa identitas ditolak dengan 42501. Parameter user ID tidak disediakan.
- Shape tetap array objek dengan attempt_id, started_at, attempt_type, subject_name, score. Urutan started_at DESC lalu attempt_id DESC; p_limit default 10, 0 tanpa batas, null/negatif ditolak dengan 22023.

Migrasi bersifat transaksional: membuat signature baru, menyalin owner dan EXECUTE ACL eksplisit (termasuk grant option), mencabut PUBLIC/anon dan memastikan authenticated dapat EXECUTE, lalu menghapus signature integer lama dengan RESTRICT, bukan CASCADE. Default privilege objek baru dibersihkan sebelum ACL disalin. SECURITY DEFINER, STABLE dan search_path pg_catalog dipertahankan. OID fungsi berubah. Signature lama **tidak** dibiarkan sebagai wrapper/overload supaya PostgREST tidak ambigu. Notifikasi reload schema dikirim saat commit; tunggu cache diperbarui sebelum mengirim parameter baru.

Pencarian repository menemukan pemanggil aplikasi hanya memakai parameter limit (kini **p_limit**); tidak ditemukan SQL dependen terhadap nama baru di luar migrasi rename. Ini bukan bukti keadaan database deployment. Operator harus memeriksa pg_depend (termasuk view, default, policy, dan fungsi dengan dependency tercatat), pemanggil eksternal, serta referensi SQL dinamis/body fungsi yang tidak tercatat sebelum deployment. Jika ada dependency tercatat, DROP RESTRICT membatalkan **seluruh transaksi**, sehingga signature lama dan grants tetap utuh; migrasikan dependency secara eksplisit dalam rencana deployment yang ditinjau, jangan memakai CASCADE. Overload tak terduga atau prasyarat rename yang hilang juga menggagalkan migrasi. Pengulangan setelah sukses sengaja ditolak; jangan jalankan ulang pembuat maupun rename setelah migrasi filter.

## Validasi

Tes statis lokal berada di [tes regresi](../../tests/student-history.test.mjs:1). [Kasus SQL](../../tests/database/student-history.sql:1) disiapkan untuk database lokal/staging setelah migrasi, memakai data yang sudah ada dan ROLLBACK; tidak membuat fixture karena schema lengkap tidak tersedia. Agar ownership dan kedua tipe benar-benar teruji, siapkan minimal dua siswa, masing-masing memiliki attempt, dan EXERCISE/ASSIGNMENT serta status berbeda pada siswa pertama. Tes menolak fixture yang tidak memadai. Tidak ada SQL yang dijalankan terhadap database live dalam pekerjaan ini; validasi runtime PL/pgSQL, ACL, dependency aktual, dan resolusi cache PostgREST tetap wajib pada staging.
