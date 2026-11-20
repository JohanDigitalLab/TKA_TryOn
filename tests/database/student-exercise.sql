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
    IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
      WHERE s.nspname='private' AND p.proname='exercise_legacy_'||n) THEN
      RAISE EXCEPTION 'Missing preserved legacy function %',n;
    END IF;
  END LOOP;
  SELECT pg_get_functiondef('private.load_student_exercise(uuid)'::regprocedure) INTO body;
  IF body ~ '(is_correct|correct_category|explanation|scoring_rule)' THEN
    RAISE EXCEPTION 'Active loader leaks answer metadata';
  END IF;
  IF has_function_privilege('anon','public.start_student_exercise(text,integer,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','private.load_student_exercise(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Unsafe function grants';
  END IF;
END $$;
-- Inspect these manually; partial repository schema cannot prove compatibility.
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.exam_attempts'::regclass;
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid='public.exam_attempts'::regclass AND NOT tgisinternal;
ROLLBACK;
