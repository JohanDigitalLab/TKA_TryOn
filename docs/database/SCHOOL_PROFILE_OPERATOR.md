# Profil sekolah, operator, dan siswa

Halaman administrasi untuk akun `SCHOOL` dan `ADMIN`.

- Halaman profil sekolah: [../../src/app/school/profile/page.js](../../src/app/school/profile/page.js)
- Halaman profil operator: [../../src/app/school/operator/page.js](../../src/app/school/operator/page.js)
- Dashboard sekolah (daftar siswa): [../../src/app/school/page.js](../../src/app/school/page.js)
- Migrasi: [migration-school-profile-operator.sql](migration-school-profile-operator.sql) dan
  [migration-school-student-management.sql](migration-school-student-management.sql)
- Daftar provinsi: [../../src/lib/indonesia/provinces.mjs](../../src/lib/indonesia/provinces.mjs)
  melalui route [../../src/app/api/provinces/route.js](../../src/app/api/provinces/route.js)
- Tes kontrak: [../../tests/school-profile-operator.test.mjs](../../tests/school-profile-operator.test.mjs),
  [../../tests/school-students.test.mjs](../../tests/school-students.test.mjs)

## Akses

Ketiga halaman hanya untuk `profiles.account_type` bernilai `SCHOOL` atau `ADMIN`. Akun lain,
termasuk siswa, dialihkan ke `/home`; sesi tanpa login dialihkan ke `/`. Redirect dilakukan
sebelum konten dirender (state `redirecting`), dan RPC terkait ikut menolak `42501` sehingga
pemanggilan langsung tetap terblokir.

## /school/profile

| Aspek | Perilaku |
|---|---|
| Sekolah yang diedit | Akun `SCHOOL` selalu memakai `profiles.school_id` miliknya. Akun `ADMIN` memakai parameter URL `?schoolId=<uuid>`. |
| `school_id` kosong pada akun `SCHOOL` | Pesan: "Kamu belum terdaftar untuk menjadi admin sekolah manapun. Minta admin yang sekarang untuk mendaftarkan akunmu sebagai admin sekolah." |
| Field sekolah | `name` (wajib 3-160), `npsn` (tepat 8 digit, unik), `school_type_id` (harus ada di `school_types`), `address` (wajib 3-500), `city` dan `province` (wajib 2-100). `status` dan `created_by` tidak diubah dari halaman ini. |
| Urutan tipe sekolah | Dropdown `school_types` diurutkan berdasarkan `education_levels.grade` lalu nama; label menampilkan jenjang dan kelas. |
| Provinsi | Dropdown. Daftarnya diambil dari API wilayah Indonesia (EMSIFA) lewat route `/api/provinces`; bila jaringan gagal dipakai daftar statis 38 provinsi. Nilai tersimpan tetap teks nama provinsi pada `schools.province`. |
| Daftar operator | `profiles` dengan `school_id` sama **dan** `account_type = 'SCHOOL'`, menampilkan `full_name` dan `email`. |
| Tombol Tambah | Menampilkan `profiles` bertipe `SCHOOL` dengan `school_id IS NULL`. Memilih salah satu memanggil `set_school_operator(p_assign => true)`. |
| Tombol Hapus | Selalu meminta konfirmasi eksplisit ("Lepas dari sekolah ini?" + Ya/Batal) sebelum `set_school_operator(p_assign => false)` yang mereset `school_id` menjadi `NULL`. |

Menautkan operator juga menyalin jenjang: `profiles.education_level` diisi dari
`schools.school_type_id` lalu `school_types.education_level_id`. Pemindahan akun yang sudah
terhubung ke sekolah lain hanya boleh dilakukan `ADMIN`.

## /school/operator

Field yang dapat diubah hanya: `full_name`, `nickname`, `avatar_url`, `wa_number`. Input email
sudah dihapus dari halaman ini; email yang tampil selalu email login (`auth.users.email`) dan
tidak dapat diubah dari aplikasi. Kolom `profiles.email` telah dihapus
(lihat [migration-drop-profiles-email.sql](migration-drop-profiles-email.sql)). Jenjang pendidikan
**tidak** dapat diubah di sini karena mengikuti sekolah tempat akun ditautkan.

Avatar diunggah ke bucket `avatars` pada folder `<uid>/…` (bucket dan policy dibuat oleh
[migration-storage-avatars-bucket.sql](migration-storage-avatars-bucket.sql)); maksimal 2 MB,
tipe PNG/JPG/WEBP.

Setelah penyimpanan, RPC menghitung ulang `profile_completed` dari `full_name`, `email`,
`wa_number`, dan `education_level`. Karena itu akun yang belum ditautkan ke sekolah tetap
berstatus belum lengkap sampai admin menambahkan sekolahnya.

## Daftar siswa di /school

- Sumber: `get_school_students` (nama, NISN) lalu diperkaya `get_school_students_detail`
  (email, WhatsApp, jenjang). Bila RPC detail belum terpasang, daftar dasar tetap tampil.
- Kolom tabel: `#`, NISN, Nama Siswa, Email, Aksi.
- **Pencarian** satu kolom untuk nama, NISN, atau email; halaman reset ke 1 saat kata kunci berubah.
- **Paging 5 baris per halaman** dengan indikator "Halaman x dari y · n siswa".
- **Tambah** membuka modal: NISN, email, nama lengkap, nomor WhatsApp, password, dan ulangi
  password. NISN/email/nama wajib; NISN tepat 10 digit; password minimal 8 karakter dan harus sama
  dengan konfirmasi. `school_id` dan `education_level` diisi server dari sekolah aktif.
- **Profil** membuka modal yang sama untuk mode edit; NISN dan email `readOnly`, tanpa field password.

## RPC

Semua fungsi `SECURITY DEFINER` dengan `search_path = pg_catalog`, owner `postgres`, `REVOKE` dari
`PUBLIC`/`anon`, dan `GRANT EXECUTE` ke `authenticated`:

- `get_school_profile(p_school_id uuid DEFAULT NULL)` — sekolah, `school_types`, operator, kandidat.
- `update_school_profile(p_school_id, p_name, p_npsn, p_school_type_id, p_address, p_city, p_province)`.
- `set_school_operator(p_user_id, p_assign boolean, p_school_id uuid DEFAULT NULL)`.
- `update_operator_profile(p_full_name, p_nickname, p_avatar_url, p_wa_number)`.
- `get_school_students_detail(p_school_id uuid DEFAULT NULL)`.
- `create_school_student(p_nisn, p_email, p_full_name, p_wa_number, p_password, p_school_id)`.
- `update_school_student(p_user_id, p_full_name, p_wa_number, p_school_id)`.

Fungsi definer berjalan sebagai owner sehingga trigger proteksi jenjang
(`current_user = 'authenticated'`) tidak memblokir penyalinan `education_level` yang disahkan ini,
sementara akses tulis langsung ke tabel `profiles`/`schools` tetap tertutup.

## Deployment

1. Jalankan [migration-school-profile-operator.sql](migration-school-profile-operator.sql), lalu
   [migration-school-student-management.sql](migration-school-student-management.sql) pada Supabase
   SQL Editor, setelah migrasi tabel profil dan bucket avatar.
2. Deploy frontend.

## Batasan yang perlu diperhatikan

- `create_school_student` menyisipkan baris `auth.users` langsung dengan `crypt(..., gen_salt('bf'))`
  agar akun dapat dibuat dari sisi sekolah. Pendekatan ini bypass alur konfirmasi email GoTrue, jadi
  `email_confirmed_at` sengaja diisi `now()`. Bila proyekmu mensyaratkan verifikasi email, ganti
  jalur ini dengan Supabase Admin API (service role) di server.
- Struktur kolom `auth.users` yang dipakai adalah minimum yang berlaku pada GoTrue Supabase
  (`aud`, `role`, `email`, `encrypted_password`, `email_confirmed_at`, `raw_*_meta_data`,
  `confirmation_token`, `recovery_token`, `is_sso_user`). Sesuaikan bila versi GoTrue berubah.
- NISN divalidasi 10 digit dan dicek unik terhadap `profiles.nisn`; `profiles.nisn` bertipe
  `char(10)`, sehingga pembandingan memakai nilai yang sudah dipangkas.
- Migrasi belum dijalankan pada database mana pun. Verifikasi runtime PL/pgSQL, RLS, dan resolusi
  cache PostgREST tetap wajib dilakukan pada staging.
