-- Integration test on a DISPOSABLE database after migration. Uses existing published inventory.
-- Requires stage 9, two active verified profiles and a matching subject catalog. Always rolls back.
BEGIN;
DO $$
DECLARE u uuid; outsider uuid; lvl text; subject text; code text:='__tka_test_'||gen_random_uuid()::text;
  r jsonb; again jsonb; aid uuid; n integer; available integer; denied boolean; qid uuid; vid uuid;
BEGIN
  SELECT p.id,lower(p.education_level),q.subject_code INTO u,lvl,subject
  FROM public.profiles p JOIN auth.users a ON a.id=p.id
  JOIN public.questions q ON lower(q.education_level_id)=lower(p.education_level)
    AND q.grade=CASE lower(p.education_level) WHEN 'sd' THEN 6 WHEN 'smp' THEN 9 ELSE 12 END
  JOIN public.subjects s ON s.subject_code=q.subject_code
  WHERE p.account_status='active' AND a.email_confirmed_at IS NOT NULL AND a.deleted_at IS NULL
    AND (a.banned_until IS NULL OR a.banned_until<=now()) AND q.question_status='PUBLISHED'
    AND EXISTS(SELECT 1 FROM public.question_versions v WHERE v.question_id=q.id AND v.version_status='PUBLISHED')
    AND NOT EXISTS(SELECT 1 FROM public.exam_attempts e WHERE e.user_id=p.id AND e.attempt_status='IN_PROGRESS')
  LIMIT 1;
  IF u IS NULL THEN RAISE EXCEPTION 'Missing eligible idle user / published inventory fixture'; END IF;
  SELECT p.id INTO outsider FROM public.profiles p JOIN auth.users a ON a.id=p.id WHERE p.id<>u
    AND p.account_status='active' AND a.email_confirmed_at IS NOT NULL AND a.deleted_at IS NULL
    AND (a.banned_until IS NULL OR a.banned_until<=now()) LIMIT 1;
  IF outsider IS NULL THEN RAISE EXCEPTION 'Missing second verified account fixture'; END IF;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  INSERT INTO public.tka_configurations(tka_code,education_level,subject_code,total_questions,duration_minutes,type)
    VALUES(code,upper(lvl),subject,2,60,'RANDOM');
  -- Impossible classification proves fallback, repeated oversized quotas exercise cap/deduplication.
  INSERT INTO public.tka_question_config(tka_code,theme,topic,no_of_questions)
    VALUES(code,code,code,100),(code,code,code,100);
  SELECT count(*) INTO available FROM public.questions q WHERE q.subject_code=subject AND lower(q.education_level_id)=lvl
    AND q.grade=CASE lvl WHEN 'sd' THEN 6 WHEN 'smp' THEN 9 ELSE 12 END AND q.question_status='PUBLISHED'
    AND EXISTS(SELECT 1 FROM public.question_versions v WHERE v.question_id=q.id AND v.version_status='PUBLISHED');
  r:=public.start_tka_tryout(code); aid:=(r->>'attempt_id')::uuid;
  n:=jsonb_array_length(r->'questions');
  IF n<>least(2,available) THEN RAISE EXCEPTION 'Fallback count incorrect'; END IF;
  IF (SELECT count(DISTINCT question_id) FROM public.exam_attempt_questions WHERE attempt_id=aid)<>n THEN RAISE EXCEPTION 'Duplicate question'; END IF;
  IF EXISTS(SELECT 1 FROM public.exam_attempt_questions aq JOIN public.question_versions v ON v.id=aq.question_version_id
    WHERE aq.attempt_id=aid AND (v.version_status<>'PUBLISHED' OR EXISTS(SELECT 1 FROM public.question_versions newer
      WHERE newer.question_id=aq.question_id AND newer.version_status='PUBLISHED' AND newer.version_number>v.version_number))) THEN RAISE EXCEPTION 'Wrong published version'; END IF;
  IF r::text ~ '"(is_correct|correct_category|explanation)"' THEN RAISE EXCEPTION 'Answer key leaked'; END IF;
  SELECT question_id,question_version_id INTO qid,vid FROM public.exam_attempt_questions WHERE attempt_id=aid LIMIT 1;
  INSERT INTO public.exam_attempt_answers(attempt_id,question_id,answer_payload) VALUES(aid,qid,'{"option_codes":[],"category_answers":{}}');
  again:=public.start_tka_tryout(code);
  IF again->>'attempt_id'<>aid::text OR again->'questions'<>r->'questions' OR NOT (again->'answers' ? qid::text) THEN RAISE EXCEPTION 'Resume regenerated snapshot or lost answer'; END IF;
  IF public.resume_exam_attempt(aid)->'questions'<>r->'questions' THEN RAISE EXCEPTION 'Resume contract differs'; END IF;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  denied:=false;
  BEGIN PERFORM public.resume_exam_attempt(aid); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Cross-user resume allowed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  UPDATE public.exam_attempts SET started_at=clock_timestamp()-interval '61 minutes' WHERE id=aid;
  UPDATE public.tka_configurations SET type='SET',total_questions=1 WHERE tka_code=code;
  INSERT INTO public.tka_question_set(tka_code,question_code) SELECT code,question_code FROM public.questions WHERE id=qid;
  INSERT INTO public.tka_question_set(tka_code,question_code) SELECT code,question_code FROM public.questions WHERE id=qid;
  again:=public.start_tka_tryout(code);
  IF again->>'attempt_id'=aid::text OR jsonb_array_length(again->'questions')<>1 OR again->'questions'->0->>'question_id'<>qid::text THEN RAISE EXCEPTION 'Expired start / SET selection failed'; END IF;
  IF (SELECT total_questions FROM public.tka_configurations WHERE tka_code=code)<>1 THEN RAISE EXCEPTION 'Global target mutated'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  denied:=false;
  BEGIN PERFORM public.start_tka_tryout(code); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Anonymous start allowed'; END IF;
  IF has_function_privilege('anon','public.start_tka_tryout(text)','EXECUTE') OR
     has_function_privilege('authenticated','private.load_tka_tryout(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe grants'; END IF;
END $$;
ROLLBACK;
