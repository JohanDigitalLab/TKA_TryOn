-- Pending deployment; see STUDENT_EXERCISE.md. Never apply automatically.
BEGIN;
CREATE OR REPLACE FUNCTION private.load_student_exercise(p_attempt_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=auth.uid(); a public.exam_attempts%ROWTYPE; qs jsonb; ans jsonb;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.exam_attempts
  WHERE id=p_attempt_id AND user_id=u AND attempt_type='EXERCISE' FOR UPDATE;
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
    'education_level',a.education_level,'attempt_type','EXERCISE','duration_minutes',NULL,'total_questions',a.total_questions,
    'started_at',a.started_at,'tka_code',a.tka_code,'questions',qs,'answers',ans,
    'remaining_seconds',NULL);
END $$;

CREATE OR REPLACE FUNCTION public.start_student_exercise(p_subject_code text, p_question_count integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  u uuid:=auth.uid(); lvl text; g integer; subj text; aid uuid;
  selected uuid[]:='{}'; more uuid[]; r record; actual integer;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_question_count IS NULL OR p_question_count NOT BETWEEN 1 AND 100 OR p_subject_code IS NULL THEN
    RAISE EXCEPTION 'Invalid exercise configuration' USING ERRCODE='22023';
  END IF;
  SELECT lower(btrim(education_level)) INTO lvl FROM public.profiles WHERE id=u;
  IF lvl IS NULL OR lvl NOT IN('sd','smp','sma') OR right(lower(p_subject_code),length(lvl)+1)<>'-'||lvl THEN
    RAISE EXCEPTION 'Education level mismatch' USING ERRCODE='42501';
  END IF;
  SELECT name INTO subj FROM public.subjects WHERE subject_code=p_subject_code;
  IF subj IS NULL THEN RAISE EXCEPTION 'Subject unavailable' USING ERRCODE='22023'; END IF;
  g:=CASE lvl WHEN 'sd' THEN 6 WHEN 'smp' THEN 9 ELSE 12 END;
  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
  SELECT id INTO aid FROM public.exam_attempts WHERE user_id=u AND grade=g AND subject_name=subj
    AND attempt_type='EXERCISE' AND attempt_status='IN_PROGRESS' ORDER BY started_at DESC,id LIMIT 1 FOR UPDATE;
  IF aid IS NOT NULL THEN RETURN private.load_student_exercise(aid)||jsonb_build_object('resumed',true); END IF;
  IF EXISTS(SELECT 1 FROM public.exam_attempts WHERE user_id=u AND grade=g AND subject_name=subj AND attempt_status='IN_PROGRESS') THEN
    RAISE EXCEPTION 'Finish or resume existing subject session';
  END IF;
  -- Missing competency is NA. Shuffle topics independently inside each priority level.
  FOR r IN
    SELECT t.theme,t.topic,CASE coalesce(c.competency_level,'NA')
      WHEN 'NA' THEN 0 WHEN 'KURANG' THEN 1 ELSE 2 END AS priority
    FROM public.subject_topics t LEFT JOIN public.student_competency c
      ON c.user_id=u AND c.subject=p_subject_code AND c.theme=t.theme AND c.topic=t.topic
    WHERE t.subject_code=p_subject_code AND coalesce(c.competency_level,'NA') IN('NA','KURANG','CUKUP')
    GROUP BY t.theme,t.topic,c.competency_level
    ORDER BY priority,random()
  LOOP
    SELECT coalesce(array_agg(x.id),'{}'::uuid[]) INTO more FROM (
      SELECT q.id FROM public.questions q WHERE q.subject_code=p_subject_code AND q.grade=g
        AND lower(q.education_level_id)=lvl AND q.question_status='PUBLISHED'
        AND q.theme=r.theme AND q.topic=r.topic AND NOT(q.id=ANY(selected))
        AND EXISTS(SELECT 1 FROM public.question_versions v WHERE v.question_id=q.id AND v.version_status='PUBLISHED')
      ORDER BY random() LIMIT 1
    ) x;
    selected:=selected||more;
    EXIT WHEN cardinality(selected)>=p_question_count;
  END LOOP;
  SELECT coalesce(array_agg(x.id),'{}'::uuid[]) INTO more FROM (
    SELECT q.id FROM public.questions q WHERE q.subject_code=p_subject_code AND q.grade=g
      AND lower(q.education_level_id)=lvl AND q.question_status='PUBLISHED' AND NOT(q.id=ANY(selected))
      AND EXISTS(SELECT 1 FROM public.question_versions v WHERE v.question_id=q.id AND v.version_status='PUBLISHED')
    ORDER BY random() LIMIT greatest(0,p_question_count-cardinality(selected))
  ) x;
  selected:=selected||more;
  IF cardinality(selected)=0 THEN RAISE EXCEPTION 'No published questions available'; END IF;
  INSERT INTO public.exam_attempts(user_id,education_level,grade,subject_name,duration_minutes,total_questions,attempt_type,started_at,deadline_at)
  VALUES(u,upper(lvl),g,subj,60,cardinality(selected),'EXERCISE',clock_timestamp(),NULL) RETURNING id INTO aid;
  INSERT INTO public.exam_attempt_questions(attempt_id,question_id,question_version_id,question_order)
  SELECT aid,q.id,v.id,row_number() OVER(ORDER BY random())::integer FROM public.questions q
  JOIN LATERAL(SELECT id FROM public.question_versions WHERE question_id=q.id AND version_status='PUBLISHED'
    ORDER BY version_number DESC,id DESC LIMIT 1) v ON true WHERE q.id=ANY(selected);
  GET DIAGNOSTICS actual=ROW_COUNT;
  IF actual=0 THEN RAISE EXCEPTION 'No published questions available'; END IF;
  UPDATE public.exam_attempts SET total_questions=actual WHERE id=aid;
  RETURN private.load_student_exercise(aid)||jsonb_build_object('resumed',false);
END $$;
REVOKE ALL ON FUNCTION public.start_student_exercise(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_student_exercise(text,integer) TO authenticated;
CREATE OR REPLACE FUNCTION private.exercise_save_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_answer_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_attempt public.exam_attempts%ROWTYPE;
  v_question_type text;
  v_question_version_id uuid;
  v_now timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.';
  END IF;

  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = p_attempt_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi ujian tidak ditemukan.';
  END IF;
  IF (v_attempt.attempt_status <> 'IN_PROGRESS' OR v_attempt.attempt_type <> 'EXERCISE') THEN
    RAISE EXCEPTION 'Sesi ujian sudah selesai atau tidak aktif.';
  END IF;
  v_now := clock_timestamp();


  SELECT q.question_type, aq.question_version_id
  INTO v_question_type, v_question_version_id
  FROM public.exam_attempt_questions aq
  JOIN public.questions q ON q.id = aq.question_id
  JOIN public.question_versions qv
    ON qv.id = aq.question_version_id AND qv.question_id = aq.question_id
  WHERE aq.attempt_id = p_attempt_id AND aq.question_id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soal tidak terdaftar dalam sesi ujian.';
  END IF;

  IF NOT private.exam_answer_payload_is_valid(
    v_question_version_id, v_question_type, p_answer_payload
  ) THEN
    RAISE EXCEPTION 'Jawaban tidak sesuai dengan struktur soal.';
  END IF;

  INSERT INTO public.exam_attempt_answers (attempt_id, question_id, answer_payload, answered_at)
  VALUES (p_attempt_id, p_question_id, p_answer_payload, v_now)
  ON CONFLICT (attempt_id, question_id) DO UPDATE SET
    answer_payload = EXCLUDED.answer_payload,
    answered_at = EXCLUDED.answered_at;

  RETURN jsonb_build_object(
    'saved', true,
    'attempt_id', p_attempt_id,
    'question_id', p_question_id,
    'question_type', v_question_type,
    'answered_at', v_now
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.exercise_submit_attempt(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_attempt public.exam_attempts%ROWTYPE;
  v_total integer;
  v_correct integer;
  v_score numeric(6,2);
  v_submitted_after_deadline boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.';
  END IF;

  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = p_attempt_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR (v_attempt.attempt_status <> 'IN_PROGRESS' OR v_attempt.attempt_type <> 'EXERCISE') THEN
    RAISE EXCEPTION 'Sesi ujian tidak ditemukan atau sudah selesai.';
  END IF;

  -- Submit setelah deadline adalah auto-submit: nilai dihitung hanya dari
  -- jawaban yang sudah tersimpan. save_exam_answer tetap menolak jawaban baru.
  v_submitted_after_deadline := false;

  SELECT COUNT(*)::integer,
         COUNT(*) FILTER (
           WHERE private.exam_answer_is_correct(
             aq.question_version_id, q.question_type, COALESCE(a.answer_payload, '{}'::jsonb)
           )
         )::integer
  INTO v_total, v_correct
  FROM public.exam_attempt_questions aq
  JOIN public.questions q ON q.id = aq.question_id
  LEFT JOIN public.exam_attempt_answers a
    ON a.attempt_id = aq.attempt_id AND a.question_id = aq.question_id
  WHERE aq.attempt_id = v_attempt.id;

  v_score := CASE WHEN v_total = 0 THEN 0
                  ELSE ROUND((v_correct::numeric / v_total) * 100, 2)
             END;

  UPDATE public.exam_attempts
  SET attempt_status = 'SUBMITTED', correct_answers = v_correct,
      score = v_score, submitted_at = clock_timestamp()
  WHERE id = v_attempt.id AND user_id = v_user_id AND attempt_status = 'IN_PROGRESS';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi ujian sudah diproses oleh permintaan lain.';
  END IF;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'total_questions', v_total,
    'correct_answers', v_correct,
    'incorrect_or_unanswered', v_total - v_correct,
    'score', v_score,
    'status', 'SUBMITTED',
    'submitted_after_deadline', v_submitted_after_deadline
  );
END;
$function$;

DO $$ BEGIN
 IF to_regprocedure('private.exercise_legacy_resume_exam_attempt(uuid)') IS NULL THEN
   ALTER FUNCTION public.resume_exam_attempt(uuid) SET SCHEMA private;
   ALTER FUNCTION private.resume_exam_attempt(uuid) RENAME TO exercise_legacy_resume_exam_attempt;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.resume_exam_attempt(p_attempt_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=auth.uid(); kind text;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT attempt_type INTO kind FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable' USING ERRCODE='42501'; END IF;
 IF kind='EXERCISE' THEN RETURN private.load_student_exercise(p_attempt_id); END IF;
 RETURN private.exercise_legacy_resume_exam_attempt(p_attempt_id);
END $$;
REVOKE ALL ON FUNCTION private.exercise_legacy_resume_exam_attempt(uuid),private.load_student_exercise(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.resume_exam_attempt(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resume_exam_attempt(uuid) TO authenticated;

DO $$ BEGIN
 IF to_regprocedure('private.exercise_legacy_save_exam_answer(uuid,uuid,jsonb)') IS NULL THEN
   ALTER FUNCTION public.save_exam_answer(uuid,uuid,jsonb) SET SCHEMA private;
   ALTER FUNCTION private.save_exam_answer(uuid,uuid,jsonb) RENAME TO exercise_legacy_save_exam_answer;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.save_exam_answer(p_attempt_id uuid,p_question_id uuid,p_answer_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=auth.uid(); kind text;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT attempt_type INTO kind FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable' USING ERRCODE='42501'; END IF;
 IF kind='EXERCISE' THEN RETURN private.exercise_save_answer(p_attempt_id,p_question_id,p_answer_payload); END IF;
 RETURN private.exercise_legacy_save_exam_answer(p_attempt_id,p_question_id,p_answer_payload);
END $$;
REVOKE ALL ON FUNCTION private.exercise_legacy_save_exam_answer(uuid,uuid,jsonb),private.exercise_save_answer(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_exam_answer(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_exam_answer(uuid,uuid,jsonb) TO authenticated;

DO $$ BEGIN
 IF to_regprocedure('private.exercise_legacy_submit_exam_attempt(uuid)') IS NULL THEN
   ALTER FUNCTION public.submit_exam_attempt(uuid) SET SCHEMA private;
   ALTER FUNCTION private.submit_exam_attempt(uuid) RENAME TO exercise_legacy_submit_exam_attempt;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_attempt_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=auth.uid(); kind text;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT attempt_type INTO kind FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable' USING ERRCODE='42501'; END IF;
 IF kind='EXERCISE' THEN RETURN private.exercise_submit_attempt(p_attempt_id); END IF;
 RETURN private.exercise_legacy_submit_exam_attempt(p_attempt_id);
END $$;
REVOKE ALL ON FUNCTION private.exercise_legacy_submit_exam_attempt(uuid),private.exercise_submit_attempt(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
