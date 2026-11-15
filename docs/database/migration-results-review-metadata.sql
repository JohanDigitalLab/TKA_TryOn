-- Repair review independently of optional A02 installation.
CREATE OR REPLACE FUNCTION public.get_exam_attempt_review(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_attempt public.exam_attempts%ROWTYPE;
  v_review jsonb;
  v_context jsonb := '{}'::jsonb;
  v_snapshots jsonb := '{}'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_attempt FROM public.exam_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi ujian tidak ditemukan.' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.attempt_status IS DISTINCT FROM 'SUBMITTED' THEN
    RAISE EXCEPTION 'Pembahasan hanya tersedia setelah ujian diakhiri.' USING ERRCODE = '42501';
  END IF;

  -- Optional snapshots are queried dynamically: no dependency on absent tables.
  IF to_regclass('public.a02_attempt_context') IS NOT NULL THEN
    EXECUTE 'SELECT jsonb_build_object(''mode'', mode, ''config_snapshot'', config_snapshot) FROM public.a02_attempt_context WHERE attempt_id = $1'
      INTO v_context USING p_attempt_id;
  END IF;
  IF to_regclass('public.a02_attempt_metadata') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(jsonb_object_agg(question_id::text, snapshot), ''{}''::jsonb) FROM public.a02_attempt_metadata WHERE attempt_id = $1'
      INTO v_snapshots USING p_attempt_id;
  END IF;

  SELECT jsonb_build_object(
    'attempt_id', p_attempt_id,
    'status', v_attempt.attempt_status,
    'score', coalesce(v_attempt.score, 0),
    'total_questions', v_attempt.total_questions,
    'correct_answers', coalesce(v_attempt.correct_answers, 0),
    'submitted_at', v_attempt.submitted_at,
    'mode', coalesce(v_context->>'mode', 'legacy'),
    'config_snapshot', v_context->'config_snapshot',
    'questions', coalesce(jsonb_agg(jsonb_build_object(
      'question_id', q.id,
      'question_version_id', aq.question_version_id,
      'question_code', q.question_code,
      'question_order', aq.question_order,
      'question_type', q.question_type,
      'question_text', v.question_text,
      'instruction', v.instruction,
      'explanation', v.explanation,
      'source_metadata', jsonb_set(
        jsonb_build_object(
          'material', q.material,
          'sub_material', q.sub_material,
          'provenance', 'question_metadata'
        ) || coalesce(nullif(v.scoring_rule->'source_metadata', 'null'::jsonb), '{}'::jsonb),
        '{element}',
        to_jsonb(coalesce(q.element, v.scoring_rule->'source_metadata'->>'element')),
        true
      ),
      'classification', coalesce(v_snapshots->(q.id::text),
        jsonb_build_object('provenance', 'legacy_unclassified', 'historical_classification_available', false)),
      'is_correct', private.exam_answer_is_correct(aq.question_version_id, q.question_type, coalesce(a.answer_payload, '{}'::jsonb)),
      'stimulus', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
        'title', s.title, 'content_text', s.content_text, 'file_url', s.file_url) END,
      'answer_payload', coalesce(a.answer_payload, '{}'::jsonb),
      'options', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'option_code', o.option_code, 'option_text', o.option_text,
        'is_correct', o.is_correct, 'explanation', o.explanation
      ) ORDER BY o.option_order) FROM public.question_options o
        WHERE o.question_version_id = aq.question_version_id), '[]'::jsonb),
      'category_items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'item_number', ci.item_number, 'item_text', ci.item_text,
        'category_label', ci.category_label, 'category_options', to_jsonb(ci)->'category_options',
        'correct_category', ci.correct_category, 'explanation', ci.explanation
      ) ORDER BY ci.item_number) FROM public.question_category_items ci
        WHERE ci.question_version_id = aq.question_version_id), '[]'::jsonb)
    ) ORDER BY aq.question_order), '[]'::jsonb)
  ) INTO v_review
  FROM public.exam_attempt_questions aq
  JOIN public.questions q ON q.id = aq.question_id
  JOIN public.question_versions v ON v.id = aq.question_version_id
  LEFT JOIN public.question_stimuli s ON s.id = v.stimulus_id
  LEFT JOIN public.exam_attempt_answers a ON a.attempt_id = aq.attempt_id AND a.question_id = aq.question_id
  WHERE aq.attempt_id = p_attempt_id;
  RETURN v_review;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_exam_attempt_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_attempt_review(uuid) TO authenticated;
