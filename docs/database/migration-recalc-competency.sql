-- RPC recalculation of competency after an exam attempt is submitted.
-- Run this migration in the Supabase SQL Editor.
--
-- recalc_student_competency(p_user_uid, p_exam_attempt_uid)
--   1. student_competency kosong untuk user  -> generate penuh per subject
--      via public.generate_student_competency(uuid, text)
--      (nama aktual fungsi generate; diminta di spec sebagai competency_generate_student).
--   2. sudah ada data -> tambah answered/correct attempt ini ke baris
--      subject/theme/topic terkait, hitung ulang score dan competency_level.
--
-- recalc_school_competency(p_school_uid, p_exam_attempt_uid)
--   1. school_competency kosong untuk sekolah -> generate penuh per subject
--      via public.generate_school_competency(uuid, text).
--   2. sudah ada data -> rata-ratakan ulang skor siswa per subject/theme/topic
--      dari student_competency milik siswa sekolah tersebut.
--
-- Catatan idempotensi: jalur incremental siswa MENAMBAH kontribusi attempt,
-- jadi panggil hanya sekali per submit (mis. dari submit_exam_attempt).
-- Jalur sekolah menghitung ulang penuh sehingga aman dipanggil berulang.

BEGIN;

CREATE OR REPLACE FUNCTION public.recalc_student_competency(
  p_user_uid uuid,
  p_exam_attempt_uid uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_attempt record;
  v_subject text;
  v_has_rows boolean;
BEGIN
  IF p_user_uid IS NULL OR p_exam_attempt_uid IS NULL THEN
    RAISE EXCEPTION 'p_user_uid dan p_exam_attempt_uid wajib diisi.' USING ERRCODE = '22023';
  END IF;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;
  IF p_user_uid IS DISTINCT FROM v_actor
     AND NOT COALESCE(private.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Tidak berwenang mengubah kompetensi siswa.' USING ERRCODE = '42501';
  END IF;

  SELECT ea.user_id, ea.attempt_status
  INTO v_attempt
  FROM public.exam_attempts ea
  WHERE ea.id = p_exam_attempt_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi ujian tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF v_attempt.user_id IS DISTINCT FROM p_user_uid THEN
    RAISE EXCEPTION 'Sesi ujian bukan milik siswa ini.' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.attempt_status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'Kompetensi hanya dapat dihitung ulang untuk sesi yang sudah disubmit.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('student_competency:recalc:' || p_user_uid::text, 0)
  );

  SELECT EXISTS (
    SELECT 1 FROM public.student_competency WHERE user_id = p_user_uid
  )
  INTO v_has_rows;

  IF NOT v_has_rows THEN
    -- Generate penuh per subject yang muncul di attempt ini.
    FOR v_subject IN
      SELECT DISTINCT q.subject_code
      FROM public.exam_attempt_questions eaq
      JOIN public.questions q ON q.id = eaq.question_id
      WHERE eaq.attempt_id = p_exam_attempt_uid
        AND q.subject_code IS NOT NULL
    LOOP
      PERFORM public.generate_student_competency(p_user_uid, v_subject);
    END LOOP;
    RETURN;
  END IF;

  -- Update incremental per subject/theme/topic yang disentuh attempt ini.
  INSERT INTO public.student_competency (
    user_id, subject, theme, topic, no_of_questions,
    correct_anwers, score, competency_level
  )
  SELECT
    p_user_uid,
    stats.subject_code,
    stats.theme,
    stats.topic,
    stats.answered,
    stats.correct,
    CASE WHEN stats.answered > 0
      THEN stats.correct::numeric * 100 / stats.answered
      ELSE NULL
    END,
    public.get_competency_level(
      CASE WHEN stats.answered > 0
        THEN stats.correct::numeric * 100 / stats.answered
        ELSE 0
      END
    )
  FROM (
    SELECT
      q.subject_code,
      q.theme,
      q.topic,
      count(*)::integer AS answered,
      count(*) FILTER (
        WHERE private.exam_answer_is_correct(
          qv.id, q.question_type, aa.answer_payload
        )
      )::integer AS correct
    FROM public.exam_attempt_answers aa
    JOIN public.exam_attempt_questions eaq
      ON eaq.attempt_id = aa.attempt_id
     AND eaq.question_id = aa.question_id
    JOIN public.questions q ON q.id = eaq.question_id
    JOIN public.question_versions qv ON qv.id = eaq.question_version_id
    WHERE aa.attempt_id = p_exam_attempt_uid
      AND aa.answered_at IS NOT NULL
      AND q.subject_code IS NOT NULL
      AND q.theme IS NOT NULL
      AND q.topic IS NOT NULL
    GROUP BY q.subject_code, q.theme, q.topic
  ) stats
  ON CONFLICT (user_id, subject, theme, topic) DO UPDATE
  SET
    no_of_questions = student_competency.no_of_questions + EXCLUDED.no_of_questions,
    correct_anwers = student_competency.correct_anwers + EXCLUDED.correct_anwers,
    score = (student_competency.correct_anwers + EXCLUDED.correct_anwers)::numeric * 100
          / NULLIF(student_competency.no_of_questions + EXCLUDED.no_of_questions, 0),
    competency_level = public.get_competency_level(
      (student_competency.correct_anwers + EXCLUDED.correct_anwers)::numeric * 100
      / NULLIF(student_competency.no_of_questions + EXCLUDED.no_of_questions, 0)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_school_competency(
  p_school_uid uuid,
  p_exam_attempt_uid uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_attempt record;
  v_subject text;
  v_has_rows boolean;
BEGIN
  IF p_school_uid IS NULL OR p_exam_attempt_uid IS NULL THEN
    RAISE EXCEPTION 'p_school_uid dan p_exam_attempt_uid wajib diisi.' USING ERRCODE = '22023';
  END IF;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;

  -- Aktor harus anggota aktif sekolah (role apa pun, termasuk siswa yang
  -- tryout-nya baru disubmit) atau super admin. Fungsi ini hanya menulis
  -- agregat turunan dari data sekolahnya sendiri.
  PERFORM private.school_require(p_school_uid);

  SELECT ea.user_id, ea.attempt_status, p.school_id
  INTO v_attempt
  FROM public.exam_attempts ea
  JOIN public.profiles p ON p.id = ea.user_id
  WHERE ea.id = p_exam_attempt_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi ujian tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF v_attempt.attempt_status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'Kompetensi hanya dapat dihitung ulang untuk sesi yang sudah disubmit.';
  END IF;
  IF v_attempt.school_id IS DISTINCT FROM p_school_uid THEN
    RAISE EXCEPTION 'Sesi ujian bukan milik siswa sekolah ini.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('school_competency:recalc:' || p_school_uid::text, 0)
  );

  SELECT EXISTS (
    SELECT 1 FROM public.school_competency WHERE school_id = p_school_uid
  )
  INTO v_has_rows;

  IF NOT v_has_rows THEN
    -- Generate penuh per subject yang muncul di attempt ini.
    FOR v_subject IN
      SELECT DISTINCT q.subject_code
      FROM public.exam_attempt_questions eaq
      JOIN public.questions q ON q.id = eaq.question_id
      WHERE eaq.attempt_id = p_exam_attempt_uid
        AND q.subject_code IS NOT NULL
    LOOP
      PERFORM public.generate_school_competency(p_school_uid, v_subject);
    END LOOP;
    RETURN;
  END IF;

  -- Hitung ulang penuh (idempoten) dari student_competency siswa sekolah ini:
  -- total siswa, siswa berskor > 0, rata-rata skor valid, lalu level kompetensi.
  INSERT INTO public.school_competency (
    school_id, subject_name, theme, topic, no_of_students,
    no_of_valid_scores, average_score, competency_level
  )
  SELECT
    p_school_uid,
    stats.subject,
    stats.theme,
    stats.topic,
    stats.students,
    stats.valid_scores,
    stats.average_score,
    public.get_competency_level(COALESCE(stats.average_score, 0))
  FROM (
    SELECT
      sc.subject AS subject,
      sc.theme,
      sc.topic,
      count(DISTINCT sc.user_id)::integer AS students,
      count(DISTINCT sc.user_id) FILTER (WHERE sc.score > 0)::integer AS valid_scores,
      avg(sc.score) FILTER (WHERE sc.score > 0) AS average_score
    FROM public.student_competency sc
    JOIN public.profiles p ON p.id = sc.user_id AND p.school_id = p_school_uid
    GROUP BY sc.subject, sc.theme, sc.topic
  ) stats
  ON CONFLICT (school_id, subject_name, theme, topic) DO UPDATE
  SET
    no_of_students = EXCLUDED.no_of_students,
    no_of_valid_scores = EXCLUDED.no_of_valid_scores,
    average_score = EXCLUDED.average_score,
    competency_level = EXCLUDED.competency_level;
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_student_competency(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_student_competency(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.recalc_school_competency(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_school_competency(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.recalc_student_competency(uuid, uuid) IS
  'Generate atau update incremental student_competency berdasarkan satu exam attempt yang sudah disubmit.';
COMMENT ON FUNCTION public.recalc_school_competency(uuid, uuid) IS
  'Generate atau rata-rata ulang school_competency dari student_competency siswa sekolah terkait.';

NOTIFY pgrst, 'reload schema';

COMMIT;
