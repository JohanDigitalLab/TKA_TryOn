-- Revoke the one-trial-before-subscription policy.
-- Existing subscription/trial tables are retained for history and future reporting,
-- but they no longer block learning activity.
BEGIN;

CREATE OR REPLACE FUNCTION public.learning_access_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=private.school_actor();
BEGIN
  RETURN jsonb_build_object(
    'subscribed',private.learning_subscribed(u),
    'unrestricted',true,
    'individual',(SELECT jsonb_build_object('active',active,'expires_at',expires_at)
      FROM public.learning_subscriptions WHERE user_id=u),
    'packages',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT p.id,p.mode,p.grade,p.subjects,p.question_count,p.duration_minutes,p.expires_at,
        n.subject_index-1 AS current_subject_index
      FROM public.learning_packages p CROSS JOIN LATERAL (
        SELECT s.subject_index FROM unnest(p.subjects) WITH ORDINALITY s(subject_name,subject_index)
        LEFT JOIN public.learning_package_attempts pa ON pa.package_id=p.id AND pa.subject_name=s.subject_name
        LEFT JOIN public.exam_attempts a ON a.id=pa.attempt_id
        WHERE a.id IS NULL OR (a.attempt_status='IN_PROGRESS'
          AND a.started_at+a.duration_minutes*interval '1 minute'>statement_timestamp())
        ORDER BY s.subject_index LIMIT 1
      ) n WHERE p.user_id=u AND p.expires_at>statement_timestamp()
      ORDER BY p.created_at DESC LIMIT 20
    ) x),'[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.start_learning_attempt(
  p_package_id uuid,p_mode text,p_grade integer,p_subjects text[],p_subject_name text,
  p_question_count integer DEFAULT 20,p_duration_minutes integer DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); pkg public.learning_packages%ROWTYPE; aid uuid; result jsonb; idx integer;
BEGIN
  IF p_package_id IS NULL OR p_mode IS NULL OR p_mode NOT IN('simulation','mission') OR p_grade IS NULL OR p_grade NOT IN(6,9)
  OR p_subjects IS NULL OR cardinality(p_subjects) NOT BETWEEN 1 AND 5 OR array_ndims(p_subjects)<>1 OR array_lower(p_subjects,1)<>1
  OR array_position(p_subjects,NULL) IS NOT NULL OR cardinality(p_subjects)<>(SELECT count(DISTINCT x) FROM unnest(p_subjects) x)
  OR p_subject_name IS NULL OR NOT p_subject_name=ANY(p_subjects) OR p_question_count IS NULL OR p_question_count NOT BETWEEN 1 AND 100
  OR p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'Invalid learning package' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
  SELECT * INTO pkg FROM public.learning_packages WHERE id=p_package_id FOR UPDATE;
  IF FOUND THEN
    IF pkg.user_id<>u THEN RAISE EXCEPTION 'Package unavailable' USING ERRCODE='42501'; END IF;
    IF (pkg.mode,pkg.grade,pkg.subjects,pkg.question_count,pkg.duration_minutes) IS DISTINCT FROM
       (p_mode,p_grade,p_subjects,p_question_count,p_duration_minutes) THEN
      RAISE EXCEPTION 'Package settings are fixed' USING ERRCODE='22023';
    END IF;
    SELECT attempt_id INTO aid FROM public.learning_package_attempts
      WHERE package_id=pkg.id AND subject_name=p_subject_name;
    IF aid IS NOT NULL THEN RETURN public.resume_exam_attempt(aid); END IF;
    IF pkg.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'LEARNING_PACKAGE_EXPIRED'; END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM unnest(p_subjects) s WHERE NOT EXISTS(
      SELECT 1 FROM public.questions q WHERE q.subject_name=s AND q.grade=p_grade AND q.question_status='PUBLISHED')) THEN
      RAISE EXCEPTION 'Published questions unavailable';
    END IF;
    INSERT INTO public.learning_packages(id,user_id,mode,grade,subjects,question_count,duration_minutes)
      VALUES(p_package_id,u,p_mode,p_grade,p_subjects,p_question_count,p_duration_minutes) RETURNING * INTO pkg;
  END IF;
  idx:=array_position(pkg.subjects,p_subject_name);
  IF idx>1 AND EXISTS(
    SELECT 1 FROM unnest(pkg.subjects[1:idx-1]) s
    LEFT JOIN public.learning_package_attempts pa ON pa.package_id=pkg.id AND pa.subject_name=s
    LEFT JOIN public.exam_attempts a ON a.id=pa.attempt_id
    WHERE a.id IS NULL OR (a.attempt_status='IN_PROGRESS'
      AND a.started_at+a.duration_minutes*interval '1 minute'>clock_timestamp())
  ) THEN RAISE EXCEPTION 'Finish previous subject first'; END IF;
  result:=private.learning_legacy_start(p_grade,p_subject_name,p_question_count,p_duration_minutes);
  aid:=(result->>'attempt_id')::uuid;
  IF EXISTS(SELECT 1 FROM public.learning_package_attempts WHERE attempt_id=aid) THEN
    RAISE EXCEPTION 'Finish or resume the existing package';
  END IF;
  INSERT INTO public.learning_package_attempts VALUES(pkg.id,p_subject_name,aid);
  RETURN result||jsonb_build_object('package_id',pkg.id,'mode',pkg.mode);
END $$;

CREATE OR REPLACE FUNCTION public.start_school_assignment(p_assignment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); result jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
  result:=private.learning_legacy_assignment(p_assignment_id);
  RETURN result;
END $$;

-- The older addendum path is also made non-blocking when it is installed.
CREATE OR REPLACE FUNCTION private.a02_entitle(p_attempt_id uuid,p_mode text,p_school_id uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  -- Deliberately unrestricted: trial/subscription entitlement is no longer a gate.
  RETURN;
END $$;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='public' AND p.proname IN('learning_access_context','start_learning_attempt','start_exam_attempt','start_school_assignment'))
       OR (n.nspname='private' AND p.proname='a02_entitle') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.learning_access_context(),public.start_learning_attempt(uuid,text,integer,text[],text,integer,integer),public.start_exam_attempt(integer,text,integer,integer),public.start_school_assignment(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
