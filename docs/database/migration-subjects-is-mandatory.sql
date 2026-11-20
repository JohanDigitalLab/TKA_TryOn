-- Tambah kolom wajib-studi pada tabel subjects.
-- is_mandatory bool, NOT NULL, default true (berlaku untuk baris lama maupun baru).
-- Jalankan di Supabase SQL Editor. Tidak menyentuh objek lain.
BEGIN;

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.subjects.is_mandatory IS
  'Menandai mata pelajaran wajib untuk jenjangnya; default true.';

NOTIFY pgrst, 'reload schema';

COMMIT;
