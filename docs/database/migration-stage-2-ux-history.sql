-- Tahap 2 UX: histori hasil permanen, resume attempt, dan review scoring.
-- Seluruh RPC membatasi data berdasarkan auth.uid().

BEGIN;
SET LOCAL search_path = public, private, pg_temp;

CREATE OR REPLACE FUNCTION public.get_student_exam_history(
  p_limit integer DEFAULT 50,
  p_before timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_rows jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.';
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC, id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      a.id,
      a.id AS attempt_id,
      a.education_level,
      a.grade,
      a.subject_name,
      a.attempt_status,
      a.duration_minutes,
      a.total_questions,
      a.correct_answers,
      a.score,
      a.started_at,
      a.submitted_at,
      a.created_at,
      jsonb_build_object(
        'attempt_id', a.id,
        'subject', a.subject_name,
        'grade', a.grade,
        'education_level', a.education_level,
        'status', a.attempt_status,
        'total_questions', a.total_questions,
        'correct_answers', COALESCE(a.correct_answers, 0),
        'incorrect_or_unanswered', GREATEST(a.total_questions - COALESCE(a.correct_answers, 0), 0),
        'score', COALESCE(a.score, 0),
        'started_at', a.started_at,
        'submitted_at', a.submitted_at,
        'created_at', a.created_at
      ) AS row_data
    FROM public.exam_attempts a
    WHERE a.user_id = v_user_id
      AND (p_before IS NULL OR (a.created_at, a.id) < (p_before, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT v_limit
  ) history;

  RETURN v_rows;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_student_active_attempts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.';
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      a.created_at,
      jsonb_build_object(
        'attempt_id', a.id,
        'subject', a.subject_name,
        'grade', a.grade,
        'education_level', a.education_level,
        'status', a.attempt_status,
        'duration_minutes', a.duration_minutes,
        'total_questions', a.total_questions,
        'started_at', a.started_at,
        'created_at', a.created_at,
        'remaining_seconds', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
          a.started_at + (a.duration_minutes * interval '1 minute') - clock_timestamp()
        )))::integer)
      ) AS row_data
    FROM public.exam_attempts a
    WHERE a.user_id = v_user_id
      AND a.attempt_status = 'IN_PROGRESS'
      AND a.started_at + (a.duration_minutes * interval '1 minute') > clock_timestamp()
    ORDER BY a.created_at DESC
  ) active_attempts;

  RETURN v_rows;
END;
$function$;

-- Pastikan review kategori memakai helper scoring yang sama dengan submit.
-- Ini mencegah review menampilkan status berbeda dari nilai final.
-- Fungsi asli dipertahankan kontraknya dan hanya status correctness yang diselaraskan.
CREATE OR REPLACE FUNCTION public.get_exam_attempt_review(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_attempt public.exam_attempts%ROWTYPE;
  v_review jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.';
  END IF;

  SELECT * INTO v_attempt
  FROM public.exam_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi ujian tidak ditemukan.';
  END IF;
  IF v_attempt.attempt_status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'Pembahasan hanya tersedia setelah ujian diakhiri.';
  END IF;

  SELECT jsonb_build_object(
    'attempt_id', p_attempt_id,
    'status', v_attempt.attempt_status,
    'score', COALESCE(v_attempt.score, 0),
    'total_questions', v_attempt.total_questions,
    'correct_answers', COALESCE(v_attempt.correct_answers, 0),
    'submitted_at', v_attempt.submitted_at,
    'questions', COALESCE(jsonb_agg(
      jsonb_build_object(
        'question_id', q.id,
        'question_code', q.question_code,
        'question_order', aq.question_order,
        'question_type', q.question_type,
        'question_text', v.question_text,
        'instruction', v.instruction,
        'explanation', v.explanation,
        'is_correct', private.exam_answer_is_correct(
          aq.question_version_id,
          q.question_type,
          COALESCE(a.answer_payload, '{}'::jsonb)
        ),
        'stimulus', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
          'title', s.title, 'content_text', s.content_text, 'file_url', s.file_url
        ) END,
        'answer_payload', COALESCE(a.answer_payload, '{}'::jsonb),
        'options', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'option_code', o.option_code, 'option_text', o.option_text,
          'is_correct', o.is_correct, 'explanation', o.explanation
        ) ORDER BY o.option_order) FROM public.question_options o
          WHERE o.question_version_id = aq.question_version_id), '[]'::jsonb),
        'category_items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'item_number', ci.item_number, 'item_text', ci.item_text,
          'category_label', ci.category_label, 'category_options', ci.category_options,
          'correct_category', ci.correct_category, 'explanation', ci.explanation
        ) ORDER BY ci.item_number) FROM public.question_category_items ci
          WHERE ci.question_version_id = aq.question_version_id), '[]'::jsonb)
      ) ORDER BY aq.question_order
    ), '[]'::jsonb)
  )
  INTO v_review
  FROM public.exam_attempt_questions aq
  JOIN public.questions q ON q.id = aq.question_id
  JOIN public.question_versions v ON v.id = aq.question_version_id
  LEFT JOIN public.question_stimuli s ON s.id = v.stimulus_id
  LEFT JOIN public.exam_attempt_answers a
    ON a.attempt_id = aq.attempt_id AND a.question_id = aq.question_id
  WHERE aq.attempt_id = p_attempt_id;

  RETURN v_review;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_exam_history(integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_student_active_attempts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_exam_attempt_review(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_exam_history(integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_active_attempts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_attempt_review(uuid) TO authenticated;

COMMIT;
