-- Run manually in Supabase SQL Editor as postgres.
-- Prerequisite: migration-create-competency-tables.sql has been applied.
-- This batch calls the existing RPC, not a separate calculation.
-- Atomic: any failure rolls back every student's regeneration.
-- Subject matching follows get_student_subjects(): subject_code ends with -sd/-smp/-sma.
BEGIN;

DO $batch$
DECLARE
  r record;
  v_count integer := 0;
  v_old_sub text := current_setting('request.jwt.claim.sub', true);
  v_old_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run this batch as postgres in Supabase SQL Editor.';
  END IF;
  IF to_regprocedure('public.generate_student_competency(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Apply the competency migration first.';
  END IF;
  IF to_regclass('public.subject_topics') IS NULL THEN
    RAISE EXCEPTION 'Required table public.subject_topics does not exist. Apply the subject topics migration first.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('batch:student_competency', 0));

  FOR r IN
    SELECT DISTINCT p.id AS user_id, s.subject_code AS subject
    FROM public.profiles p
    JOIN public.subjects s
      ON s.subject_code ILIKE '%-' || lower(btrim(p.education_level))
    WHERE p.account_type = 'STUDENT'
      AND NULLIF(btrim(p.education_level), '') IS NOT NULL
    ORDER BY p.id, s.subject_code
  LOOP
    -- The RPC requires auth.uid(), including calls from SQL Editor.
    -- Use the actual target student's identity only within this transaction;
    -- do not remove or weaken the RPC's cross-user authorization guard.
    PERFORM set_config('request.jwt.claim.sub', r.user_id::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', r.user_id::text, 'role', 'authenticated')::text, true);
    PERFORM public.generate_student_competency(r.user_id, r.subject);
    v_count := v_count + 1;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_old_sub, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_old_claims, '{}'), true);
  RAISE NOTICE 'Completed % student/subject combinations.', v_count;
END;
$batch$;

COMMIT;

-- Summary (no personally identifying fields).
SELECT subject, count(DISTINCT user_id) AS students,
       count(*) AS competency_rows,
       sum(no_of_questions) AS answered_questions
FROM public.student_competency
GROUP BY subject
ORDER BY subject;

-- Subject selection is aligned with the education-level convention used by
-- get_student_subjects(). The generator itself matches questions.subject_code;
-- no display-name assumption is made here.
