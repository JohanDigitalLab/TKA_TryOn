-- Apply AFTER migration-rename-student-dashboard-history-to-history.sql.
-- No CASCADE: dependent database objects must be reviewed/migrated explicitly.
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public.get_student_history(integer)') IS NULL THEN
    RAISE EXCEPTION 'Expected renamed get_student_history(integer); apply rename first (migration is one-shot)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_student_history'
      AND p.oid <> 'public.get_student_history(integer)'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Unexpected get_student_history overload; reconcile before migration';
  END IF;
END $$;

CREATE FUNCTION public.get_student_history("p_limit" integer DEFAULT 10, "p_type" text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_types text[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;
  IF "p_limit" IS NULL OR "p_limit" < 0 THEN
    RAISE EXCEPTION 'p_limit harus berupa bilangan bulat non-negatif.' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(upper(token)) INTO v_types
  FROM (
    SELECT regexp_replace(value, '^[[:space:]]+|[[:space:]]+$', '', 'g') AS token
    FROM unnest(string_to_array("p_type", ',')) AS parts(value)
  ) AS tokens
  WHERE token <> '';

  RETURN (
    SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.started_at DESC, h.attempt_id DESC), '[]'::jsonb)
    FROM (
      SELECT a.id AS attempt_id, a.started_at, a.attempt_type, a.subject_name, a.score
      FROM public.exam_attempts AS a
      WHERE a.user_id = v_user_id
        AND (v_types IS NULL OR upper(a.attempt_type::text) = ANY(v_types))
      ORDER BY a.started_at DESC, a.id DESC
      limit NULLIF("p_limit", 0)
    ) AS h
  );
END;
$function$;

-- Preserve owner and explicit EXECUTE grantees, except PUBLIC/anon which stay denied.
-- Clear default-privilege grants on the new object before copying the old ACL.
DO $$
DECLARE r record; v_owner text;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO v_owner
  FROM pg_proc WHERE oid = 'public.get_student_history(integer)'::regprocedure;
  FOR r IN
    SELECT DISTINCT acl.grantee FROM pg_proc p,
      LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid = 'public.get_student_history(integer,text)'::regprocedure
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.get_student_history(integer,text) FROM %s',
      CASE WHEN r.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END);
  END LOOP;
  FOR r IN
    SELECT acl.grantee, acl.is_grantable FROM pg_proc p,
      LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid = 'public.get_student_history(integer)'::regprocedure
      AND acl.privilege_type = 'EXECUTE' AND acl.grantee <> 0
      AND pg_get_userbyid(acl.grantee) <> 'anon'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.get_student_history(integer,text) TO %I%s',
      pg_get_userbyid(r.grantee), CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;
  EXECUTE format('ALTER FUNCTION public.get_student_history(integer,text) OWNER TO %I', v_owner);
END $$;
REVOKE ALL ON FUNCTION public.get_student_history(integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_history(integer,text) TO authenticated;

-- RESTRICT (default) aborts the entire transaction if tracked dependencies exist.
DROP FUNCTION public.get_student_history(integer) RESTRICT;
NOTIFY pgrst, 'reload schema';
COMMIT;
