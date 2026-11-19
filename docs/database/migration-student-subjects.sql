-- Run in Supabase SQL Editor to expose only subjects matching the caller's profile.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_student_subjects()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_level text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;

  SELECT lower(trim(coalesce(p.education_level, '')))
  INTO v_level
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_level IS NULL OR v_level NOT IN ('sd', 'smp', 'sma') THEN
    RAISE EXCEPTION 'Jenjang pendidikan belum ditetapkan pada profilmu.' USING ERRCODE = '22023';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'name', s.name,
      'subject_code', s.subject_code,
      'configuration', configuration.value
    ) ORDER BY s.name, s.subject_code)
    FROM public.subjects s
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'tka_code', c.tka_code,
        'total_questions', c.total_questions,
        'duration_minutes', c.duration_minutes,
        'type', c.type
      ) AS value
      FROM public.tka_configurations c
      WHERE c.subject_code = s.subject_code
        AND lower(trim(c.education_level)) = v_level
      ORDER BY CASE WHEN c.is_default = 1 THEN 0 ELSE 1 END, c.tka_code, c.id
      LIMIT 1
    ) configuration ON true
    WHERE s.subject_code ILIKE '%-' || v_level
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_subjects() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_subjects() TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
