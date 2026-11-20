-- Bucket avatar + policy RLS storage (dipisah dari migration-student-profile-update.sql).
-- Jalankan di Supabase SQL Editor sebelum halaman /student/profile dan
-- /school/operator digunakan (keduanya mengunggah avatar ke bucket 'avatars').
--
-- Pada proyek Supabase modern, tabel storage.objects dimiliki peran
-- supabase_storage_admin, sehingga ALTER/CREATE POLICY oleh postgres gagal
-- ("must be owner of table objects"). postgres adalah anggota peran tersebut,
-- jadi seluruh DDL storage dijalankan dengan SET LOCAL ROLE di dalam transaksi
-- ini dan otomatis kembali ke postgres setelah COMMIT.
BEGIN;

SET LOCAL ROLE supabase_storage_admin;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Setiap pengguna hanya dapat menulis, mengganti, dan menghapus file di folder
-- bernama sama dengan ID user-nya sendiri, misalnya "<uuid>/1712-awa.png".
DROP POLICY IF EXISTS avatars_owner_insert ON storage.objects;
CREATE POLICY avatars_owner_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
CREATE POLICY avatars_owner_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;
CREATE POLICY avatars_owner_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = 'avatars');

RESET ROLE;

NOTIFY pgrst, 'reload schema';

COMMIT;
