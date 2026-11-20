-- LOCAL/STAGING ONLY, run after migrations; never installs migrations or mutates fixtures.
BEGIN;
DO $$
DECLARE
  u uuid; other_user uuid; expected jsonb; actual jsonb; filter text;
BEGIN
  SELECT user_id INTO u FROM public.exam_attempts
  GROUP BY user_id HAVING count(DISTINCT attempt_type) >= 2
    AND bool_or(attempt_type::text = 'EXERCISE')
    AND bool_or(attempt_type::text = 'ASSIGNMENT') LIMIT 1;
  SELECT user_id INTO other_user FROM public.exam_attempts WHERE user_id <> u LIMIT 1;
  IF u IS NULL OR other_user IS NULL THEN
    RAISE EXCEPTION 'Requires two students with attempts; first needs EXERCISE and ASSIGNMENT';
  END IF;
  IF to_regprocedure('public.get_student_history(integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'Ambiguous legacy signature remains';
  END IF;
  IF has_function_privilege('anon', 'public.get_student_history(integer,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.get_student_history(integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Incorrect grants';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', u)::text, true);
  SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY started_at DESC, attempt_id DESC), '[]'::jsonb)
  INTO expected FROM (
    SELECT id AS attempt_id, started_at, attempt_type, subject_name, score
    FROM public.exam_attempts WHERE user_id = u
  ) h;
  FOREACH filter IN ARRAY ARRAY[NULL::text, '', '   ', E'\t\n', ' , , '] LOOP
    actual := public.get_student_history(0, filter);
    IF actual IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'Unfiltered/ownership/shape mismatch for %', filter;
    END IF;
  END LOOP;
  FOREACH filter IN ARRAY ARRAY['EXERCISE', 'exercise', ' EXERCISE ', 'EXERCISE, ASSIGNMENT', E' \texercise , , assignment\n,'] LOOP
    SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY started_at DESC, attempt_id DESC), '[]'::jsonb)
    INTO expected FROM (
      SELECT id AS attempt_id, started_at, attempt_type, subject_name, score
      FROM public.exam_attempts WHERE user_id = u
        AND (attempt_type::text = 'EXERCISE'
          OR (filter ILIKE '%assignment%' AND attempt_type::text = 'ASSIGNMENT'))
    ) h;
    IF public.get_student_history(0, filter) IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'Filter/ownership mismatch for %', filter;
    END IF;
  END LOOP;
  IF public.get_student_history(0, '__UNKNOWN__') <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Unknown type should match nothing';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY started_at DESC, attempt_id DESC), '[]'::jsonb)
  INTO expected FROM (
    SELECT id AS attempt_id, started_at, attempt_type, subject_name, score
    FROM public.exam_attempts WHERE user_id = u ORDER BY started_at DESC, id DESC LIMIT 1
  ) h;
  IF public.get_student_history("p_limit" => 1) IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Legacy limit-only caller/sort mismatch';
  END IF;
  IF public.get_student_history() IS DISTINCT FROM public.get_student_history(10, NULL) THEN
    RAISE EXCEPTION 'Default arguments mismatch';
  END IF;
  BEGIN
    PERFORM public.get_student_history(-1);
    RAISE EXCEPTION 'Negative limit accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.get_student_history(NULL::integer);
    RAISE EXCEPTION 'Null limit accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  BEGIN
    PERFORM public.get_student_history();
    RAISE EXCEPTION 'Missing auth accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
