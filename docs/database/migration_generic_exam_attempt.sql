-- Sumber tunggal (kanonik) untuk fungsi generik exam attempt.
-- Semua migration lain DILARANG mendefinisikan ulang submit_exam_attempt,
-- save_exam_answer, dan resume_exam_attempt. Jika perlu perubahan (mis. filter
-- tambahan), edit hanya di berkas ini, lalu jalankan ulang melalui Supabase SQL Editor.
-- Dependensi: private.bossfight_sessions (migration-bossfight.sql),
-- private.submit_exercise_attempt / private.save_exercise_answer /
-- private.resume_student_exercise (migration-start-student-exercise.sql),
-- private.resume_tka_tryout (migration-start-tka-tryout.sql),
-- private.exam_answer_is_correct / private.exam_answer_payload_is_valid (migration-stage-1.sql).
BEGIN;

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_attempt_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  u uuid := auth.uid();
  kind text;
  v_attempt public.exam_attempts%ROWTYPE;
  v_total integer;
  v_correct integer;
  v_score numeric(6,2);
  v_submitted_after_deadline boolean := false;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM private.bossfight_sessions WHERE attempt_id=p_attempt_id) THEN
    RAISE EXCEPTION 'Use BossFight endpoint' USING ERRCODE='42501';
  END IF;
  SELECT attempt_type INTO kind FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable' USING ERRCODE='42501'; END IF;
  IF kind='EXERCISE' THEN RETURN private.submit_exercise_attempt(p_attempt_id); END IF;

  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = p_attempt_id AND user_id = u
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.attempt_status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Sesi ujian tidak ditemukan atau sudah selesai.';
  END IF;

  -- Submit setelah deadline adalah auto-submit: nilai dihitung hanya dari
  -- jawaban yang sudah tersimpan. save_exam_answer tetap menolak jawaban baru.
  IF v_attempt.attempt_type = 'TRYOUT'
     AND (v_attempt.started_at IS NULL OR v_attempt.duration_minutes IS NULL
       OR v_attempt.duration_minutes <= 0) THEN
    RAISE EXCEPTION 'Konfigurasi waktu ujian tidak valid.';
  END IF;
  v_submitted_after_deadline := v_attempt.attempt_type = 'TRYOUT'
    AND clock_timestamp() >= v_attempt.started_at
      + (v_attempt.duration_minutes * interval '1 minute');

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
  WHERE id = v_attempt.id AND user_id = u AND attempt_status = 'IN_PROGRESS';

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
END $$;

CREATE OR REPLACE FUNCTION public.save_exam_answer(p_attempt_id uuid,p_question_id uuid,p_answer_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  u uuid := auth.uid();
  kind text;
  v_attempt public.exam_attempts%ROWTYPE;
  v_question_type text;
  v_question_version_id uuid;
  v_now timestamptz;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM private.bossfight_sessions WHERE attempt_id=p_attempt_id) THEN
    RAISE EXCEPTION 'Use BossFight endpoint' USING ERRCODE='42501';
  END IF;
  SELECT attempt_type INTO kind FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable' USING ERRCODE='42501'; END IF;
  IF kind='EXERCISE' THEN RETURN private.save_exercise_answer(p_attempt_id,p_question_id,p_answer_payload); END IF;
  IF kind='ASSIGNMENT' THEN RETURN private.save_exercise_answer(p_attempt_id,p_question_id,p_answer_payload); END IF;

  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = p_attempt_id AND user_id = u
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi ujian tidak ditemukan.';
  END IF;
  IF v_attempt.attempt_status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Sesi ujian sudah selesai atau tidak aktif.';
  END IF;
  v_now := clock_timestamp();
  IF v_attempt.attempt_type = 'TRYOUT'
     AND (v_attempt.started_at IS NULL OR v_attempt.duration_minutes IS NULL
       OR v_attempt.duration_minutes <= 0
       OR v_now >= v_attempt.started_at + (v_attempt.duration_minutes * interval '1 minute')) THEN
    RAISE EXCEPTION 'Waktu ujian telah habis.';
  END IF;

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
END $$;

CREATE OR REPLACE FUNCTION public.resume_exam_attempt(p_attempt_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid := auth.uid(); kind text;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM private.bossfight_sessions WHERE attempt_id=p_attempt_id) THEN
    RAISE EXCEPTION 'Use BossFight endpoint' USING ERRCODE='42501';
  END IF;

  SELECT attempt_type INTO kind FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable' USING ERRCODE='42501'; END IF;
  IF kind='EXERCISE' THEN RETURN private.resume_student_exercise(p_attempt_id); END IF;
  IF kind='ASSIGNMENT' THEN RETURN private.resume_student_exercise(p_attempt_id); END IF;

  RETURN private.resume_tka_tryout(p_attempt_id);
END $$;

REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid),public.save_exam_answer(uuid,uuid,jsonb),public.resume_exam_attempt(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid),public.save_exam_answer(uuid,uuid,jsonb),public.resume_exam_attempt(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
