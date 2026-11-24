-- Pending deployment. Requires school_actor, learning_access_context and the existing CBT engine.
BEGIN;
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS theme varchar(255),
  ADD COLUMN IF NOT EXISTS topic varchar(255);
-- Deliberately NO element/material backfill.

CREATE OR REPLACE FUNCTION private.resume_tka_tryout(p_attempt_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); a public.exam_attempts%ROWTYPE; qs jsonb; ans jsonb;
BEGIN
  SELECT * INTO a FROM public.exam_attempts
  WHERE id=p_attempt_id AND user_id=u AND tka_code IS NOT NULL AND attempt_type='TRYOUT' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tryout unavailable' USING ERRCODE='42501'; END IF;
  IF a.attempt_status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Tryout is not active'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'question_id',q.id,'question_version_id',v.id,'question_order',aq.question_order,
    'question_type',q.question_type,'question_text',v.question_text,'instruction',v.instruction,
    'stimulus',(SELECT jsonb_build_object('title',s.title,'content_text',s.content_text,
      'file_url',s.file_url,'media_description',s.media_description) FROM public.question_stimuli s WHERE s.id=v.stimulus_id),
    'options',coalesce((SELECT jsonb_agg(jsonb_build_object('option_code',o.option_code,'option_text',o.option_text)
      ORDER BY o.option_order,o.option_code) FROM public.question_options o WHERE o.question_version_id=v.id),'[]'::jsonb),
    'category_items',coalesce((SELECT jsonb_agg(jsonb_build_object('item_number',c.item_number,
      'item_text',c.item_text,'category_label',c.category_label) ORDER BY c.item_number)
      FROM public.question_category_items c WHERE c.question_version_id=v.id),'[]'::jsonb)
  ) ORDER BY aq.question_order),'[]'::jsonb) INTO qs
  FROM public.exam_attempt_questions aq JOIN public.questions q ON q.id=aq.question_id
  JOIN public.question_versions v ON v.id=aq.question_version_id AND v.question_id=q.id
  WHERE aq.attempt_id=a.id;
  SELECT coalesce(jsonb_object_agg(x.question_id::text,x.answer_payload),'{}'::jsonb) INTO ans
  FROM public.exam_attempt_answers x WHERE x.attempt_id=a.id;
  RETURN jsonb_build_object('attempt_id',a.id,'subject_name',a.subject_name,'grade',a.grade,
    'education_level',a.education_level,'attempt_type',a.attempt_type,'duration_minutes',a.duration_minutes,'total_questions',a.total_questions,
    'started_at',a.started_at,'tka_code',a.tka_code,'questions',qs,'answers',ans,
    'remaining_seconds',greatest(0,floor(extract(epoch FROM
      (a.started_at+a.duration_minutes*interval '1 minute'-clock_timestamp())))));
END $$;

CREATE OR REPLACE FUNCTION public.start_tka_tryout(p_tka_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  u uuid:=private.school_actor(); cfg public.tka_configurations%ROWTYPE; lvl text; g integer;
  aid uuid; selected uuid[]:='{}'; more uuid[]; r record; actual integer; access jsonb; subj text;
BEGIN
  IF p_tka_code IS NULL OR btrim(p_tka_code)='' THEN RAISE EXCEPTION 'Invalid TKA code' USING ERRCODE='22023'; END IF;
  -- Share the learning engine's user lock and also serialize this user/config pair.
  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('tka:'||u::text||':'||p_tka_code,0));
  SELECT * INTO cfg FROM public.tka_configurations WHERE tka_code=p_tka_code FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TKA configuration unavailable' USING ERRCODE='22023'; END IF;
  SELECT lower(btrim(education_level)) INTO lvl FROM public.profiles WHERE id=u;
  IF lvl NOT IN('sd','smp','sma') OR lvl IS NULL OR lvl<>lower(btrim(cfg.education_level)) THEN
    RAISE EXCEPTION 'TKA education level mismatch' USING ERRCODE='42501';
  END IF;
  g:=CASE lvl WHEN 'sd' THEN 6 WHEN 'smp' THEN 9 ELSE 12 END;
  IF cfg.total_questions<=0 OR cfg.duration_minutes<=0 OR cfg.type NOT IN('RANDOM','SET') THEN
    RAISE EXCEPTION 'Invalid TKA configuration' USING ERRCODE='22023';
  END IF;
  SELECT id INTO aid FROM public.exam_attempts WHERE user_id=u AND tka_code=cfg.tka_code
    AND attempt_type='TRYOUT' AND attempt_status='IN_PROGRESS'
    AND clock_timestamp()<started_at+duration_minutes*interval '1 minute'
    ORDER BY started_at DESC,id LIMIT 1 FOR UPDATE;
  IF aid IS NOT NULL THEN RETURN private.resume_tka_tryout(aid)||jsonb_build_object('resumed',true); END IF;
  -- Respect the installed entitlement policy; stage 9 intentionally removes subscription gates.
  access:=public.learning_access_context();
  IF NOT coalesce((access->>'unrestricted')::boolean,false)
     AND NOT coalesce((access->>'subscribed')::boolean,false) THEN
    RAISE EXCEPTION 'LEARNING_SUBSCRIPTION_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT name INTO subj FROM public.subjects WHERE subject_code=cfg.subject_code LIMIT 1;
  IF subj IS NULL THEN RAISE EXCEPTION 'TKA subject unavailable'; END IF;
  -- Keep the legacy one-active-subject index intact, without resuming a different configuration.
  UPDATE public.exam_attempts SET attempt_status='EXPIRED' WHERE user_id=u AND grade=g AND subject_name=subj
    AND attempt_status='IN_PROGRESS' AND started_at+duration_minutes*interval '1 minute'<=clock_timestamp();
  IF EXISTS(SELECT 1 FROM public.exam_attempts WHERE user_id=u AND grade=g AND subject_name=subj AND attempt_status='IN_PROGRESS') THEN
    RAISE EXCEPTION 'Finish or resume the existing subject session';
  END IF;
  IF cfg.type='RANDOM' THEN
    FOR r IN SELECT * FROM public.tka_question_config WHERE tka_code=cfg.tka_code ORDER BY id LOOP
      SELECT coalesce(array_agg(x.id),'{}'::uuid[]) INTO more FROM (
        SELECT q.id FROM public.questions q WHERE q.subject_code=cfg.subject_code AND q.grade=g
          AND lower(q.education_level_id)=lvl AND q.question_status='PUBLISHED'
          AND q.theme=r.theme AND q.topic=r.topic AND NOT(q.id=ANY(selected))
          AND EXISTS(SELECT 1 FROM public.question_versions v WHERE v.question_id=q.id AND v.version_status='PUBLISHED')
        ORDER BY random() LIMIT greatest(0,least(r.no_of_questions,cfg.total_questions-cardinality(selected)))
      ) x;
      selected:=selected||more;
      EXIT WHEN cardinality(selected)>=cfg.total_questions;
    END LOOP;
  ELSE
    SELECT coalesce(array_agg(x.id),'{}'::uuid[]) INTO selected FROM (
      SELECT q.id FROM public.questions q WHERE q.subject_code=cfg.subject_code AND q.grade=g
        AND lower(q.education_level_id)=lvl AND q.question_status='PUBLISHED'
        AND EXISTS(SELECT 1 FROM public.tka_question_set s WHERE s.tka_code=cfg.tka_code AND s.question_code=q.question_code)
        AND EXISTS(SELECT 1 FROM public.question_versions v WHERE v.question_id=q.id AND v.version_status='PUBLISHED')
      ORDER BY random() LIMIT cfg.total_questions
    ) x;
  END IF;
  SELECT coalesce(array_agg(x.id),'{}'::uuid[]) INTO more FROM (
    SELECT q.id FROM public.questions q WHERE q.subject_code=cfg.subject_code AND q.grade=g
      AND lower(q.education_level_id)=lvl AND q.question_status='PUBLISHED' AND NOT(q.id=ANY(selected))
      AND EXISTS(SELECT 1 FROM public.question_versions v WHERE v.question_id=q.id AND v.version_status='PUBLISHED')
    ORDER BY random() LIMIT greatest(0,cfg.total_questions-cardinality(selected))
  ) x;
  selected:=selected||more;
  IF cardinality(selected)=0 THEN RAISE EXCEPTION 'No published questions available'; END IF;
  INSERT INTO public.exam_attempts(user_id,education_level,grade,subject_name,duration_minutes,total_questions,
    attempt_type,tka_code,started_at,deadline_at)
  VALUES(u,upper(lvl),g,subj,cfg.duration_minutes,cardinality(selected),'TRYOUT',cfg.tka_code,
    clock_timestamp(),NULL) RETURNING id INTO aid;
  INSERT INTO public.exam_attempt_questions(attempt_id,question_id,question_version_id,question_order)
  SELECT aid,q.id,v.id,row_number() OVER(ORDER BY random())::integer
  FROM public.questions q JOIN LATERAL (
    SELECT id FROM public.question_versions WHERE question_id=q.id AND version_status='PUBLISHED'
    ORDER BY version_number DESC,id DESC LIMIT 1
  ) v ON true WHERE q.id=ANY(selected);
  GET DIAGNOSTICS actual=ROW_COUNT;
  IF actual=0 THEN RAISE EXCEPTION 'No published questions available'; END IF;
  UPDATE public.exam_attempts SET total_questions=actual,
    deadline_at=started_at+duration_minutes*interval '1 minute' WHERE id=aid;
  RETURN private.resume_tka_tryout(aid)||jsonb_build_object('resumed',false);
END $$;
REVOKE ALL ON FUNCTION private.resume_tka_tryout(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.start_tka_tryout(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_tka_tryout(text) TO authenticated;
-- public.resume_exam_attempt kini didefinisikan hanya di migration_generic_exam_attempt.sql.
NOTIFY pgrst,'reload schema';
COMMIT;
