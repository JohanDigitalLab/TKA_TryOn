-- Staging only, read-only metadata assertions. Does not install migrations.
BEGIN;
DO $$
DECLARE n text; body text;
BEGIN
  IF to_regprocedure('public.start_student_exercise(text,integer,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Deploy exercise migration on staging first';
  END IF;
  IF to_regprocedure('public.start_student_exercise(text,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'Ambiguous old start_student_exercise signature still present';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.subjects'::regclass
    AND attname='is_mandatory' AND attnum>0 AND NOT attisdropped) THEN
    RAISE EXCEPTION 'subjects.is_mandatory column missing';
  END IF;
  FOREACH n IN ARRAY ARRAY['resume_exam_attempt','save_exam_answer','submit_exam_attempt'] LOOP
    -- (generic dispatcher tetap sumber tunggal definisi ketiga fungsi ini)
    IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
      WHERE s.nspname='public' AND p.proname=n) THEN
      RAISE EXCEPTION 'Missing canonical generic function %',n;
    END IF;
  END LOOP;
  -- Halaman latihan/tugas memanggil RPC spesifik, jadi semuanya wajib ada dan executable.
  FOREACH n IN ARRAY ARRAY[
    'public.resume_student_exercise(uuid)','public.submit_exercise_attempt(uuid)',
    'public.save_exercise_answer(uuid,uuid,jsonb)',
    'public.resume_tka_tryout(uuid)','public.submit_tka_attempt(uuid)',
    'public.save_tka_answer(uuid,uuid,jsonb)'] LOOP
    IF to_regprocedure(n) IS NULL THEN
      RAISE EXCEPTION 'Missing specific attempt RPC %',n;
    END IF;
    IF NOT has_function_privilege('authenticated',n,'EXECUTE') THEN
      RAISE EXCEPTION 'Authenticated role cannot execute %',n;
    END IF;
    IF has_function_privilege('anon',n,'EXECUTE') THEN
      RAISE EXCEPTION 'Anon must not execute %',n;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
    WHERE s.nspname='private' AND p.proname LIKE 'exercise_legacy_%') THEN
    RAISE EXCEPTION 'Retired exercise_legacy_* function still present';
  END IF;
  -- Desain terkini: resume/save/submit latihan berada di skema public.
  SELECT pg_get_functiondef('public.resume_student_exercise(uuid)'::regprocedure) INTO body;
  IF body ~ '(is_correct|correct_category|explanation|scoring_rule)' THEN
    RAISE EXCEPTION 'Active loader leaks answer metadata';
  END IF;
  IF has_function_privilege('anon','public.start_student_exercise(text,integer,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.resume_student_exercise(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.save_exercise_answer(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.submit_exercise_attempt(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.resume_tka_tryout(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.save_tka_answer(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.submit_tka_attempt(uuid)','EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
      WHERE s.nspname='private' AND p.proname IN('resume_student_exercise','save_exercise_answer','submit_exercise_attempt','resume_tka_tryout')) THEN
    RAISE EXCEPTION 'Unsafe function grants or retired private helpers still present';
  END IF;
  IF NOT has_function_privilege('authenticated','public.resume_tka_tryout(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role cannot resume a tryout session';
  END IF;
END $$;
-- Inspect these manually; partial repository schema cannot prove compatibility.
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.exam_attempts'::regclass;
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid='public.exam_attempts'::regclass AND NOT tgisinternal;
ROLLBACK;
