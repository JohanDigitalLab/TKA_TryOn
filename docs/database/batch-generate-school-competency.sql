-- Run as postgres in Supabase SQL Editor, after the competency migration.
-- All schools x subjects matching the school's education level.
-- Education level comes from schools.school_type_id -> school_types.education_level_id.
-- The RPC requires an active verified school_admin for each active school.
-- Preflight fails for the entire batch rather than silently skipping a school.
BEGIN;

DO $batch$
DECLARE
  r record;
  v_missing integer;
  v_count integer := 0;
  v_old_sub text := current_setting('request.jwt.claim.sub', true);
  v_old_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run as postgres in Supabase SQL Editor.';
  END IF;
  IF to_regprocedure('public.generate_school_competency(uuid,text)') IS NULL
     OR to_regclass('public.subject_topics') IS NULL THEN
    RAISE EXCEPTION 'Apply the competency and subject_topics migrations first.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('batch:school_competency', 0));

  SELECT count(*) INTO v_missing
  FROM public.schools s
  WHERE NOT EXISTS (
      SELECT 1 FROM public.school_types st
      WHERE st.id = s.school_type_id
        AND lower(btrim(st.education_level_id)) IN ('sd', 'smp', 'sma')
    )
     OR s.status IS DISTINCT FROM 'active'
     OR NOT EXISTS (
       SELECT 1
       FROM public.school_memberships m
       JOIN public.profiles p ON p.id = m.user_id
       JOIN auth.users u ON u.id = m.user_id
       WHERE m.school_id = s.id AND m.role = 'school_admin'
         AND m.status = 'active' AND p.account_status = 'active'
         AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
         AND (u.banned_until IS NULL OR u.banned_until <= now())
     );
  IF v_missing > 0 THEN
    RAISE EXCEPTION '% schools have an unsupported/missing education level or cannot pass RPC authorization (inactive school or no active verified school_admin). No regeneration performed.', v_missing;
  END IF;

  FOR r IN
    SELECT s.id AS school_id, subjects.subject_code, actor.user_id
    FROM public.schools s
    JOIN public.school_types st ON st.id = s.school_type_id
    JOIN (SELECT DISTINCT subject_code FROM public.subjects) subjects
      ON subjects.subject_code ILIKE '%-' || lower(btrim(st.education_level_id))
    CROSS JOIN LATERAL (
      SELECT m.user_id
      FROM public.school_memberships m
      JOIN public.profiles p ON p.id = m.user_id
      JOIN auth.users u ON u.id = m.user_id
      WHERE m.school_id = s.id AND m.role = 'school_admin'
        AND m.status = 'active' AND p.account_status = 'active'
        AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
        AND (u.banned_until IS NULL OR u.banned_until <= now())
      ORDER BY m.user_id LIMIT 1
    ) actor
    ORDER BY s.id, subjects.subject_code
  LOOP
    -- Trusted SQL Editor context only; keep the existing RPC checks intact.
    PERFORM set_config('request.jwt.claim.sub', r.user_id::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', r.user_id::text, 'role', 'authenticated')::text, true);
    PERFORM public.generate_school_competency(r.school_id, r.subject_code);
    v_count := v_count + 1;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_old_sub, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_old_claims, '{}'), true);
  RAISE NOTICE 'Completed % school/subject combinations.', v_count;
END;
$batch$;

COMMIT;

SELECT subject_name, count(DISTINCT school_id) AS schools,
       count(*) AS competency_rows
FROM public.school_competency
GROUP BY subject_name ORDER BY subject_name;

-- IMPORTANT: the existing RPC matches p_subject against both
-- subject_topics.subject_code and exam_attempts.subject_name.
-- Resolve code/name mapping first if attempts store display names.
-- Execution has not been verified against the live database.
