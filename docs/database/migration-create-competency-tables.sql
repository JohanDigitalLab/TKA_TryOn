-- Create competency summary tables for schools and students.
-- Run this migration in the Supabase SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.school_competency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  subject_name varchar(20) NOT NULL,
  theme varchar(255) NOT NULL,
  topic varchar(255) NOT NULL,
  no_of_students integer NOT NULL DEFAULT 0,
  no_of_valid_scores integer NOT NULL DEFAULT 0,
  average_score numeric NULL,
  competency_level varchar(20) NULL DEFAULT 'NA',
  CONSTRAINT school_competency_scope_unique
    UNIQUE (school_id, subject_name, theme, topic),
  CONSTRAINT school_competency_counts_check
    CHECK (no_of_students >= 0 AND no_of_valid_scores >= 0),
  CONSTRAINT school_competency_valid_scores_check
    CHECK (no_of_valid_scores <= no_of_students),
  CONSTRAINT school_competency_level_check
    CHECK (competency_level IN ('NA', 'KURANG', 'CUKUP', 'KUAT'))
);

CREATE INDEX IF NOT EXISTS school_competency_school_idx
  ON public.school_competency (school_id, subject_name, theme, topic);

COMMENT ON TABLE public.school_competency IS
  'Ringkasan kompetensi siswa pada tingkat sekolah berdasarkan subject, tema, dan topik.';
COMMENT ON COLUMN public.school_competency.average_score IS
  'Nilai rata-rata dari skor valid pada kombinasi sekolah, subject, tema, dan topik.';
COMMENT ON COLUMN public.school_competency.competency_level IS
  'Level kompetensi: NA, KURANG, CUKUP, atau KUAT.';

CREATE TABLE IF NOT EXISTS public.student_competency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  subject varchar(20) NOT NULL,
  theme varchar(255) NOT NULL,
  topic varchar(255) NOT NULL,
  no_of_questions integer NOT NULL DEFAULT 0,
  correct_anwers integer NOT NULL DEFAULT 0,
  score numeric NULL,
  competency_level varchar(20) NULL DEFAULT 'NA',
  CONSTRAINT student_competency_scope_unique
    UNIQUE (user_id, subject, theme, topic),
  CONSTRAINT student_competency_counts_check
    CHECK (no_of_questions >= 0 AND correct_anwers >= 0),
  CONSTRAINT student_competency_correct_answers_check
    CHECK (correct_anwers <= no_of_questions),
  CONSTRAINT student_competency_level_check
    CHECK (competency_level IN ('NA', 'KURANG', 'CUKUP', 'KUAT'))
);

-- Upgrade an existing table without deleting competency data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_competency'
      AND column_name = 'user_uid'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_competency'
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.student_competency RENAME COLUMN user_uid TO user_id;
  END IF;
END;
$$;
ALTER TABLE public.student_competency
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.student_competency'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.student_competency
      ADD CONSTRAINT student_competency_pkey PRIMARY KEY (id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS student_competency_user_idx
  ON public.student_competency (user_id, subject, theme, topic);

COMMENT ON TABLE public.student_competency IS
  'Ringkasan kompetensi siswa berdasarkan subject, tema, dan topik.';
COMMENT ON COLUMN public.student_competency.correct_anwers IS
  'Jumlah jawaban benar; nama kolom dipertahankan sesuai spesifikasi awal.';
COMMENT ON COLUMN public.student_competency.competency_level IS
  'Level kompetensi: NA, KURANG, CUKUP, atau KUAT.';

ALTER TABLE public.school_competency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_competency ENABLE ROW LEVEL SECURITY;

-- Return a competency label from a percentage score.
CREATE OR REPLACE FUNCTION public.get_competency_level(p_score numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_score >= 80 THEN 'KUAT'
    WHEN p_score >= 60 THEN 'CUKUP'
    WHEN p_score > 0 THEN 'KURANG'
    ELSE 'NA'
  END;
$$;

CREATE OR REPLACE FUNCTION public.generate_student_competency(
  p_user_id uuid,
  p_subject text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_actor uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'User tidak ditemukan.' USING ERRCODE = '42501';
  END IF;
  IF v_user_id IS DISTINCT FROM v_actor
     AND NOT COALESCE(private.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Tidak berwenang membuat kompetensi siswa.' USING ERRCODE = '42501';
  END IF;
  IF p_subject IS NULL OR btrim(p_subject) = '' THEN
    RAISE EXCEPTION 'Subject wajib diisi.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('student_competency:' || v_user_id::text || ':' || btrim(p_subject), 0)
  );

  DELETE FROM public.student_competency
  WHERE user_id = v_user_id AND subject = btrim(p_subject);

  INSERT INTO public.student_competency (
    user_id, subject, theme, topic, no_of_questions,
    correct_anwers, score, competency_level
  )
  SELECT
    v_user_id,
    btrim(p_subject),
    qt.theme,
    qt.topic,
    COALESCE(stats.answered, 0),
    COALESCE(stats.correct, 0),
    CASE WHEN COALESCE(stats.answered, 0) > 0
      THEN stats.correct::numeric * 100 / stats.answered
      ELSE NULL
    END,
    public.get_competency_level(
      CASE WHEN COALESCE(stats.answered, 0) > 0
        THEN stats.correct::numeric * 100 / stats.answered
        ELSE 0
      END
    )
  FROM (
    SELECT DISTINCT theme, topic, subject_code
    FROM public.subject_topics
    WHERE subject_code = btrim(p_subject)
  ) qt
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS answered,
      count(*) FILTER (
        WHERE private.exam_answer_is_correct(
          qv.id, q.question_type, aa.answer_payload
        )
      )::integer AS correct
    FROM public.exam_attempt_answers aa
    JOIN public.exam_attempts ea ON ea.id = aa.attempt_id
    JOIN public.exam_attempt_questions eaq
      ON eaq.attempt_id = aa.attempt_id
     AND eaq.question_id = aa.question_id
    JOIN public.questions q ON q.id = eaq.question_id
    JOIN public.question_versions qv ON qv.id = eaq.question_version_id
    WHERE ea.user_id = v_user_id
      AND ea.attempt_status = 'SUBMITTED'
      AND q.subject_code = btrim(p_subject)
      AND q.theme = qt.theme
      AND q.topic = qt.topic
      AND aa.answered_at IS NOT NULL
  ) stats ON true
  WHERE qt.subject_code = btrim(p_subject);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_school_competency(
  p_school_id uuid,
  p_subject text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_school_id uuid := p_school_id;
  v_account_type text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;
  IF p_subject IS NULL OR btrim(p_subject) = '' THEN
    RAISE EXCEPTION 'Subject wajib diisi.' USING ERRCODE = '22023';
  END IF;

  IF v_school_id IS NULL THEN
    SELECT p.account_type, p.school_id
    INTO v_account_type, v_school_id
    FROM public.profiles p
    WHERE p.id = v_actor;
    IF v_account_type IS DISTINCT FROM 'SCHOOL' OR v_school_id IS NULL THEN
      RAISE EXCEPTION 'Akun bukan akun sekolah yang valid.' USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM private.school_require(v_school_id, true);

  DELETE FROM public.school_competency
  WHERE school_id = v_school_id AND subject_name = btrim(p_subject);

  INSERT INTO public.school_competency (
    school_id, subject_name, theme, topic, no_of_students,
    no_of_valid_scores, average_score, competency_level
  )
  SELECT
    v_school_id,
    btrim(p_subject),
    qt.theme,
    qt.topic,
    COALESCE(stats.students, 0),
    COALESCE(stats.valid_scores, 0),
    stats.average_score,
    public.get_competency_level(COALESCE(stats.average_score, 0))
  FROM public.subject_topics qt
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS students,
      count(*) FILTER (WHERE s.score > 0)::integer AS valid_scores,
      avg(s.score) FILTER (WHERE s.score > 0) AS average_score
    FROM (
      SELECT
        ea.user_id,
        sum(
          CASE WHEN private.exam_answer_is_correct(
            qv.id, q.question_type, aa.answer_payload
          ) THEN 1 ELSE 0 END
        )::numeric * 100 / NULLIF(count(*), 0) AS score
      FROM public.exam_attempt_answers aa
      JOIN public.exam_attempts ea ON ea.id = aa.attempt_id
      JOIN public.exam_attempt_questions eaq
        ON eaq.attempt_id = aa.attempt_id
       AND eaq.question_id = aa.question_id
      JOIN public.questions q ON q.id = eaq.question_id
      JOIN public.question_versions qv ON qv.id = eaq.question_version_id
      JOIN public.profiles p ON p.id = ea.user_id
      WHERE p.school_id = v_school_id
        AND ea.attempt_status = 'SUBMITTED'
        AND ea.subject_name = btrim(p_subject)
        AND q.theme = qt.theme
        AND q.topic = qt.topic
        AND aa.answered_at IS NOT NULL
      GROUP BY ea.user_id
    ) s
  ) stats ON true
  WHERE qt.subject_code = btrim(p_subject);
END;
$$;

REVOKE ALL ON FUNCTION public.get_competency_level(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_competency_level(numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.generate_student_competency(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_student_competency(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.generate_school_competency(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_school_competency(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
