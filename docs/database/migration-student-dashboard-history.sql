-- Apply in Supabase SQL Editor before deploying the dashboard change.
-- No direct table grants or RLS changes are required.
BEGIN;

-- Remove the legacy overload to avoid ambiguous RPC resolution.
DROP FUNCTION IF EXISTS public.get_student_dashboard_history();

CREATE OR REPLACE FUNCTION public.get_student_dashboard_history("limit" integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;

  IF "limit" IS NULL OR "limit" < 0 THEN
    RAISE EXCEPTION 'Limit harus berupa bilangan bulat non-negatif.' USING ERRCODE = '22023';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.started_at DESC, h.attempt_id DESC), '[]'::jsonb)
    FROM (
      SELECT a.id AS attempt_id, a.started_at, a.attempt_type, a.subject_name, a.score
      FROM public.exam_attempts AS a
      WHERE a.user_id = v_user_id AND a.attempt_type = 'TRYOUT'
      ORDER BY a.started_at DESC, a.id DESC
      LIMIT NULLIF("limit", 0)
    ) AS h
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_dashboard_history(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_dashboard_history(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
