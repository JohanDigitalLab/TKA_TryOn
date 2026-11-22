-- Pengaturan AUTO_CALC_COMPETENCY + RPC pembacanya.
-- Setelah submit_exam_attempt di halaman /student/challenge, frontend
-- membaca get_setting('AUTO_CALC_COMPETENCY'); bila TRUE, frontend memanggil
-- recalc_student_competency(p_user_uid, p_exam_attempt_uid) dan
-- recalc_school_competency(p_school_uid, p_exam_attempt_uid) (lihat
-- migration-recalc-competency.sql).
-- Jalankan di Supabase SQL Editor setelah migration-create-settings-table.sql
-- dan migration-recalc-competency.sql.

BEGIN;

-- Seed default 1 (TRUE) hanya bila belum ada baris dengan nama yang sama.
INSERT INTO public.settings ("group", name, value, type, options, description)
SELECT 'SYSTEM', 'AUTO_CALC_COMPETENCY', 1, 'BOOL', '',
       'Hitung ulang kompetensi siswa dan sekolah secara otomatis setelah submit jawaban.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.settings s WHERE s."group" = 'SYSTEM' AND s.name = 'AUTO_CALC_COMPETENCY'
);

-- Pembaca tunggal nilai settings (akses tabel settings via PostgREST tetap tertutup RLS).
CREATE OR REPLACE FUNCTION public.get_setting(
  p_name text,
  p_group text DEFAULT 'SYSTEM'
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT s.value
  FROM public.settings s
  WHERE s."group" = COALESCE(NULLIF(btrim(p_group), ''), 'SYSTEM')
    AND s.name = btrim(p_name)
  ORDER BY s."group", s.name
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_setting(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_setting(text, text) TO authenticated;

COMMENT ON FUNCTION public.get_setting(text, text) IS
  'Mengembalikan value settings berdasarkan name (default group SYSTEM).';

NOTIFY pgrst, 'reload schema';

COMMIT;
