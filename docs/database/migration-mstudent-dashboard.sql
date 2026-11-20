-- Run in Supabase SQL Editor before deploying /mstudent.
-- Requires exam_attempts.deadline and the scheduled tryout/configuration tables.
-- Scheduled timestamps without time zone are interpreted as Asia/Jakarta.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_mstudent_actions(p_kind text, p_page integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('ASSIGNMENT', 'SCHEDULED_TRYOUT') OR p_page IS NULL OR p_page < 1 THEN
    RAISE EXCEPTION 'Jenis atau halaman tidak valid.' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'ASSIGNMENT' THEN
    WITH filtered AS (
      SELECT a.id, a.subject_name, a.deadline AS event_at
      FROM public.exam_attempts a
      WHERE a.user_id = v_user_id
        AND a.attempt_type = 'ASSIGNMENT'
        AND a.status IN ('NOT_STARTED', 'IN_PROGRESS')
        AND a.deadline_at > now()
    ), paged AS (
      SELECT * FROM filtered ORDER BY event_at, id
      LIMIT 5 OFFSET ((p_page::bigint - 1) * 5)
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM filtered),
      'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.event_at, p.id) FROM paged p), '[]'::jsonb)
    ) INTO v_result;
  ELSE
    WITH filtered AS (
      SELECT s.id,
        COALESCE((
          SELECT string_agg(subjects.subject_name, ', ' ORDER BY subjects.position)
          FROM (
            SELECT c.subject_name, min(codes.position) AS position
            FROM unnest(ARRAY[s.tka_code1, s.tka_code2, s.tka_code3, s.tka_code4, s.tka_code5])
              WITH ORDINALITY AS codes(code, position)
            JOIN public.tka_configurations c ON c.tka_code = codes.code
            GROUP BY c.subject_name
          ) subjects
        ), '-') AS subject_name,
        s.start_at AT TIME ZONE 'Asia/Jakarta' AS event_at
      FROM public.scheduled_tryouts s
      WHERE s.deadline_at > (now() AT TIME ZONE 'Asia/Jakarta')
        AND EXISTS (
          SELECT 1 FROM public.scheduled_tryout_users u
          WHERE u.scheduled_tryouts = s.id AND u.user_id = v_user_id
        )
    ), paged AS (
      SELECT * FROM filtered ORDER BY event_at, id
      LIMIT 5 OFFSET ((p_page::bigint - 1) * 5)
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM filtered),
      'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.event_at, p.id) FROM paged p), '[]'::jsonb)
    ) INTO v_result;
  END IF;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_mstudent_actions(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mstudent_actions(text, integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
