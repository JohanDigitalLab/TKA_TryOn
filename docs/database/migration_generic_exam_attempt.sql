-- Sumber tunggal (kanonik) untuk fungsi generik exam attempt.
-- Semua migration lain DILARANG mendefinisikan ulang submit_exam_attempt,
-- save_exam_answer, dan resume_exam_attempt. Jika perlu perubahan (mis. filter
-- tambahan), edit hanya di berkas ini, lalu jalankan ulang melalui Supabase SQL Editor.
-- Ketiga fungsi TIDAK di-rename; filter sesi gamification ditambahkan inline di body asli.
-- Dependensi: private.virtualpet_sessions (migration-virtualpet.sql),
-- private.submit_exercise_attempt / private.save_exercise_answer /
-- private.resume_student_exercise (migration-start-student-exercise.sql),
-- public.submit_tka_attempt / public.save_tka_answer /
-- private.resume_tka_tryout (migration-start-tka-tryout.sql),
-- private.exam_answer_is_correct / private.exam_answer_payload_is_valid (migration-stage-1.sql).
-- private.bossfight_sessions dan private.mapadventure_sessions bersifat opsional
-- sampai migrasinya dipasang, sehingga pemeriksaannya memakai to_regclass + EXECUTE:
-- plpgsql mem-parse seluruh body saat pertama kali dijalankan, sehingga EXISTS statis
-- akan gagal ketika tabel gamification tersebut belum ada.
BEGIN;

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_attempt_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  u uuid := auth.uid();
  kind text;
  v_owner uuid;
  v_flag boolean;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF to_regclass('private.mapadventure_sessions') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM private.mapadventure_sessions WHERE attempt_id=$1)'
      INTO v_flag USING p_attempt_id;
    IF v_flag THEN RAISE EXCEPTION 'Use MapAdventure RPC' USING ERRCODE='42501'; END IF;
  END IF;
  IF to_regclass('private.virtualpet_sessions') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM private.virtualpet_sessions WHERE attempt_id=$1)'
      INTO v_flag USING p_attempt_id;
    IF v_flag THEN RAISE EXCEPTION 'Use VirtualPet RPC' USING ERRCODE='42501'; END IF;
  END IF;
  IF to_regclass('private.bossfight_sessions') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM private.bossfight_sessions WHERE attempt_id=$1)'
      INTO v_flag USING p_attempt_id;
    IF v_flag THEN RAISE EXCEPTION 'Use BossFight endpoint' USING ERRCODE='42501'; END IF;
  END IF;
  -- Attempt gamification yang tag-nya terpasang tetapi sesi privatnya hilang tetap
  -- ditutup; gunakan tag, bukan sesi privat, sebagai pagar terakhir.
  SELECT attempt_type, user_id INTO kind, v_owner
  FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable' USING ERRCODE='42501'; END IF;
  IF v_owner IS NULL OR kind='GAMIFICATION' THEN
    RAISE EXCEPTION 'Use the game-specific RPC' USING ERRCODE='42501';
  END IF;
  IF kind='EXERCISE' OR kind='ASSIGNMENT' THEN RETURN private.submit_exercise_attempt(p_attempt_id); END IF;
  RETURN public.submit_tka_attempt(p_attempt_id);
END $$;

CREATE OR REPLACE FUNCTION public.save_exam_answer(p_attempt_id uuid,p_question_id uuid,p_answer_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  u uuid := auth.uid();
  kind text;
  v_flag boolean;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF to_regclass('private.mapadventure_sessions') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM private.mapadventure_sessions WHERE attempt_id=$1)'
      INTO v_flag USING p_attempt_id;
    IF v_flag THEN RAISE EXCEPTION 'Use MapAdventure RPC' USING ERRCODE='42501'; END IF;
  END IF;
  IF to_regclass('private.virtualpet_sessions') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM private.virtualpet_sessions WHERE attempt_id=$1)'
      INTO v_flag USING p_attempt_id;
    IF v_flag THEN RAISE EXCEPTION 'Use VirtualPet RPC' USING ERRCODE='42501'; END IF;
  END IF;
  IF to_regclass('private.bossfight_sessions') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM private.bossfight_sessions WHERE attempt_id=$1)'
      INTO v_flag USING p_attempt_id;
    IF v_flag THEN RAISE EXCEPTION 'Use BossFight endpoint' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT attempt_type INTO kind
  FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable' USING ERRCODE='42501'; END IF;
  IF kind='GAMIFICATION' THEN RAISE EXCEPTION 'Use the game-specific RPC' USING ERRCODE='42501'; END IF;
  IF kind='EXERCISE' THEN RETURN private.save_exercise_answer(p_attempt_id,p_question_id,p_answer_payload); END IF;
  IF kind='ASSIGNMENT' THEN RETURN private.save_exercise_answer(p_attempt_id,p_question_id,p_answer_payload); END IF;
  RETURN public.save_tka_answer(p_attempt_id,p_question_id,p_answer_payload);
END $$;

CREATE OR REPLACE FUNCTION public.resume_exam_attempt(p_attempt_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid := auth.uid(); kind text; v_flag boolean;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF to_regclass('private.mapadventure_sessions') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM private.mapadventure_sessions WHERE attempt_id=$1)'
      INTO v_flag USING p_attempt_id;
    IF v_flag THEN RAISE EXCEPTION 'Use MapAdventure RPC' USING ERRCODE='42501'; END IF;
  END IF;
  IF to_regclass('private.virtualpet_sessions') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM private.virtualpet_sessions WHERE attempt_id=$1)'
      INTO v_flag USING p_attempt_id;
    IF v_flag THEN RAISE EXCEPTION 'Use VirtualPet RPC' USING ERRCODE='42501'; END IF;
  END IF;
  IF to_regclass('private.bossfight_sessions') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM private.bossfight_sessions WHERE attempt_id=$1)'
      INTO v_flag USING p_attempt_id;
    IF v_flag THEN RAISE EXCEPTION 'Use BossFight endpoint' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT attempt_type INTO kind FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable' USING ERRCODE='42501'; END IF;
  IF kind='GAMIFICATION' THEN RAISE EXCEPTION 'Use the game-specific RPC' USING ERRCODE='42501'; END IF;
  IF kind='EXERCISE' THEN RETURN private.resume_student_exercise(p_attempt_id); END IF;
  IF kind='ASSIGNMENT' THEN RETURN private.resume_student_exercise(p_attempt_id); END IF;
  RETURN private.resume_tka_tryout(p_attempt_id);
END $$;

REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid),public.save_exam_answer(uuid,uuid,jsonb),public.resume_exam_attempt(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid),public.save_exam_answer(uuid,uuid,jsonb),public.resume_exam_attempt(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
