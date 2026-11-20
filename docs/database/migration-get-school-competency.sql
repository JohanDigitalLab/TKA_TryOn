-- Dashboard sekolah: baca ringkasan kompetensi dari public.school_competency.
-- Jalankan di Supabase SQL Editor setelah migration-create-competency-tables.sql
-- dan migration-school-subject-topics.sql.
--
-- Catatan pemetaan: generate_school_competency() menyimpan btrim(p_subject) ke
-- kolom subject_name, sementara batch pengisi data melewatkan subject_code.
-- Karena itu subject_name di sini dipertukarkan sebagai subject_code, dengan
-- fallback ke nama mapel bila database lama masih menyimpan display name.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_school_competency()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_school uuid;
  v_account_type text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;

  SELECT p.account_type, p.school_id INTO v_account_type, v_school
  FROM public.profiles p
  WHERE p.id = v_user;

  IF v_account_type IS DISTINCT FROM 'SCHOOL' THEN
    RAISE EXCEPTION 'Hanya akun sekolah yang dapat mengakses kompetensi sekolah.' USING ERRCODE = '42501';
  END IF;

  IF v_school IS NULL OR NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = v_school) THEN
    RAISE EXCEPTION 'Profil akun harus terhubung dengan sekolah yang valid.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'subject_code', sc.subject_code,
      'subject_label', sc.subject_label,
      'theme', sc.theme,
      'topic', sc.topic,
      'no_of_students', sc.no_of_students,
      'no_of_valid_scores', sc.no_of_valid_scores,
      'average_score', sc.average_score,
      'competency_level', sc.competency_level
    ) ORDER BY sc.subject_label, sc.theme, sc.topic)
    FROM (
      SELECT
        coalesce(by_code.subject_code, by_name.subject_code, c.subject_name) AS subject_code,
        coalesce(
          by_code.name,
          by_name.name,
          (SELECT s.name FROM public.subjects s WHERE s.subject_code = c.subject_name),
          c.subject_name
        ) AS subject_label,
        c.theme,
        c.topic,
        c.no_of_students,
        c.no_of_valid_scores,
        c.average_score,
        c.competency_level
      FROM public.school_competency c
      LEFT JOIN LATERAL (
        SELECT s.subject_code, s.name FROM public.subjects s WHERE s.subject_code = c.subject_name LIMIT 1
      ) by_code ON true
      LEFT JOIN LATERAL (
        SELECT s.subject_code, s.name FROM public.subjects s WHERE s.name = c.subject_name LIMIT 1
      ) by_name ON true
      WHERE c.school_id = v_school
    ) sc
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_school_competency() IS
  'Ringkasan kompetensi sekolah pemanggil dari public.school_competency.';

REVOKE ALL ON FUNCTION public.get_school_competency() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_school_competency() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
