-- Secure subject topic lookup for the school dashboard.
-- Run after subject_topics, subjects, and profiles are available.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_school_subject_topics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user uuid;
  v_level text;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;

  SELECT upper(coalesce(p.education_level, ''))
  INTO v_level
  FROM public.profiles p
  WHERE p.id = v_user;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'subject_code', st.subject_code,
          'theme', st.theme,
          'topic', st.topic,
          'syllabus', st.syllabus,
          'subject_label', coalesce(s.name, st.subject_code)
        )
        ORDER BY st.subject_code, st.theme, st.topic
      )
      FROM public.subject_topics st
      LEFT JOIN public.subjects s ON s.subject_code = st.subject_code
      WHERE v_level = '' OR st.subject_code ILIKE '%' || '-' || v_level
    ),
    '[]'::jsonb
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_school_subject_topics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_school_subject_topics() TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
