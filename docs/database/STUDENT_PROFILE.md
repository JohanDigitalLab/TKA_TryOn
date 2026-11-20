# Profil siswa mandiri

Halaman `/student/profile` memungkinkan siswa mandiri memperbarui datanya sendiri.
Berkas terkait:

- Halaman: [../../src/app/student/profile/page.js](../../src/app/student/profile/page.js)
- Migrasi: [migration-student-profile-update.sql](migration-student-profile-update.sql)
- Tes kontrak: [../../tests/student-profile.test.mjs](../../tests/student-profile.test.mjs)

## Akses

Hanya akun dengan `profiles.account_type = 'STUDENT'` **dan** `profiles.is_managed = false`.
Akun lain, termasuk siswa kelolaan sekolah, dialihkan ke `/home`. Pemeriksaan dilakukan dua lapis:

1. Frontend memuat profil dan `router.replace("/home")` bila syarat tidak terpenuhi.
2. RPC `public.update_student_profile` menolak `42501` pada kondisi yang sama, sehingga pemanggilan langsung tetap terblokir.

## Field yang dapat diubah

| Field | Kolom | Aturan |
|---|---|---|
| Nama lengkap | `full_name` | wajib, 2–160 karakter |
| Nama panggilan | `nickname` | opsional, maksimal 50 |
| Avatar | `avatar_url` | URL hasil unggahan bucket `avatars` |
| Jenjang | `education_level` | `sd`, `smp`, atau `sma` |
| NISN | `nisn` | opsional, tepat 10 digit |
| Nomor WhatsApp | `wa_number` | dinormalisasi ke `+62…`, maksimal 20 |

Email **tidak** lagi menjadi field profil: kolom `profiles.email` sudah dihapus
([migration-drop-profiles-email.sql](migration-drop-profiles-email.sql)). Halaman menampilkan
email login (`auth.users.email`) dalam keadaan read-only, dan RPC tidak lagi menerima parameternya.

Field lain seperti `is_subscribed`, `account_type`, `is_managed`, `has_tried_*`, dan `profile_completed`
**tidak** dapat dikirim dari halaman ini.

## Avatar

Bucket `avatars` dibuat publik untuk dibaca, dengan policy INSERT/UPDATE/DELETE yang membatasi
penulisan ke folder `<uid-auth>/…` milik pengguna sendiri. Batas 2 MB dan MIME `png/jpeg/webp`
ditegakkan pada bucket dan pada sisi klien. Mengganti avatar menghapus berkas lama milik sendiri
(best effort). DDL bucket + policy berada di file terpisah
[migration-storage-avatars-bucket.sql](migration-storage-avatars-bucket.sql).

## Kelengkapan profil

Setiap kali penyimpanan berhasil, RPC menghitung ulang:

```
profile_completed = full_name IS NOT NULL
  AND auth.users.email IS NOT NULL   -- email login, bukan kolom profiles
  AND wa_number IS NOT NULL
  AND education_level IN ('sd','smp','sma')
```

Bila menjadi lengkap, `profile_completed_at` diisi `now()`. Bila menjadi tidak lengkap,
`profile_completed` diset `false` dan `profile_completed_at` dibiarkan (riwayat tidak dihapus).

## Catatan jenjang pendidikan

`profiles.education_level` dilindungi trigger `public.protect_profile_education_level` yang aktif
ketika `current_user = 'authenticated'`. RPC ini `SECURITY DEFINER` dengan owner `postgres`,
`search_path = pg_catalog`, sehingga pemilik akun tetap dapat mengubah jenjangnya sendiri melalui
jalur ini sementara akses tulis langsung ke tabel tetap tertutup. `updated_at` diperbarui eksplisit
karena perubahan melalui definer tidak melewati trigger set-`updated_at` pada beberapa konfigurasi.

## Deployment

1. Jalankan [migration-storage-avatars-bucket.sql](migration-storage-avatars-bucket.sql) pada
   Supabase SQL Editor (bucket `avatars` + policy RLS storage; DDL-nya dibungkus
   `SET LOCAL ROLE supabase_storage_admin`).
2. Jalankan [migration-student-profile-update.sql](migration-student-profile-update.sql)
   (RPC `update_student_profile` versi tanpa email, mengirim `NOTIFY pgrst, 'reload schema'`).
3. Setelah semua fungsi bebas `profiles.email`, jalankan
   [migration-drop-profiles-email.sql](migration-drop-profiles-email.sql) (drop index
   `profiles_email_unique` + kolom `email`).
4. Deploy frontend.

Migrasi belum dijalankan pada database mana pun; belum ada verifikasi runtime PL/pgSQL,
RLS Storage, maupun resolusi cache PostgREST.
