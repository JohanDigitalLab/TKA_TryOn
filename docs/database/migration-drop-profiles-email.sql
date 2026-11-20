-- Hapus kolom profiles.email.
-- Satu-satunya sumber email adalah email login (auth.users.email / username).
-- PENTING: jalankan SETELAH pembaruan fungsi pada
--   migration-school-student-management.sql,
--   migration-school-profile-operator.sql, dan
--   migration-student-profile-update.sql, karena fungsi-fungsi tersebut
--   tidak lagi membaca/menulis profiles.email.
BEGIN;

-- Indeks unik parsial yang dibangun di atas kolom ini harus ikut dihapus.
DROP INDEX IF EXISTS public.profiles_email_unique;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS email;

COMMENT ON TABLE public.profiles IS
  'Profil aplikasi per akun. Email tidak disimpan di sini; gunakan auth.users.email.';

NOTIFY pgrst, 'reload schema';

COMMIT;
