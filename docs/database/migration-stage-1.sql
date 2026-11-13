-- Tahap 1 hardening exam engine.
-- Disetujui pengguna: scoring PGK_MA/PGK_KATEGORI, validasi payload,
-- submit atomik, dan pencabutan TRUNCATE dari anon/authenticated.
-- Histori tidak disentuh.
--
-- Jalankan sebagai satu transaksi. Jika gagal, seluruh perubahan dibatalkan.

BEGIN;
SET LOCAL search_path = public, private, pg_temp;

-- Hindari privilege TRUNCATE yang tidak diperlukan oleh client API.
DO $revoke$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS relation_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE ON TABLE %s FROM anon, authenticated',
      r.relation_name
    );
  END LOOP;
END
$revoke$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

-- Memvalidasi payload terhadap snapshot question_version yang tersimpan pada
-- attempt. Fungsi berada di schema private dan hanya dipanggil oleh RPC.
CREATE OR REPLACE FUNCTION private.exam_answer_payload_is_valid(
  p_question_version_id uuid,
  p_question_type text,
  p_answer_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  v_option_codes jsonb := COALESCE(p_answer_payload->'option_codes', '[]'::jsonb);
  v_category_answers jsonb := COALESCE(p_answer_payload->'category_answers', '{}'::jsonb);
  v_item record;
BEGIN
  IF p_answer_payload IS NULL OR jsonb_typeof(p_answer_payload) <> 'object'
     OR jsonb_typeof(v_option_codes) <> 'array'
     OR jsonb_typeof(v_category_answers) <> 'object' THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_option_codes) AS item(value)
    WHERE jsonb_typeof(item.value) <> 'string'
       OR btrim(item.value #>> '{}') = ''
  ) THEN
    RETURN false;
  END IF;

  IF (
    SELECT COUNT(*) FROM jsonb_array_elements_text(v_option_codes)
  ) <> (
    SELECT COUNT(DISTINCT value)
    FROM jsonb_array_elements_text(v_option_codes) AS x(value)
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(v_option_codes) AS x(code)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.question_options o
      WHERE o.question_version_id = p_question_version_id
        AND o.option_code = x.code
    )
  ) THEN
    RETURN false;
  END IF;

  IF p_question_type IN ('PG_TUNGGAL', 'PGK_MA')
     AND v_category_answers <> '{}'::jsonb THEN
    RETURN false;
  END IF;

  IF p_question_type = 'PG_TUNGGAL'
     AND jsonb_array_length(v_option_codes) <> 1 THEN
    RETURN false;
  END IF;

  IF p_question_type = 'PGK_KATEGORI'
     AND jsonb_array_length(v_option_codes) <> 0 THEN
    RETURN false;
  END IF;

  IF p_question_type = 'PGK_KATEGORI' THEN
    -- Jawaban parsial sah untuk autosave; kelengkapan diperiksa saat scoring.
    IF EXISTS (
      SELECT 1 FROM jsonb_each(v_category_answers) AS item(key, value)
      WHERE jsonb_typeof(item.value) <> 'string'
    ) THEN
      RETURN false;
    END IF;

    FOR v_item IN
      SELECT key AS item_number, value AS category
      FROM jsonb_each_text(v_category_answers)
    LOOP
      IF btrim(v_item.item_number) = '' OR btrim(v_item.category) = ''
         OR NOT EXISTS (
           SELECT 1
           FROM public.question_category_items ci
           WHERE ci.question_version_id = p_question_version_id
             AND ci.item_number::text = v_item.item_number
             AND EXISTS (
               SELECT 1
               FROM unnest(regexp_split_to_array(ci.category_label, '\s*/\s*')) AS allowed(category)
               WHERE btrim(allowed.category) = btrim(v_item.category)
             )
         ) THEN
        RETURN false;
      END IF;
    END LOOP;
  END IF;

  RETURN p_question_type IN ('PG_TUNGGAL', 'PGK_MA', 'PGK_KATEGORI');
END;
$function$;

CREATE OR REPLACE FUNCTION private.exam_answer_is_correct(
  p_question_version_id uuid,
  p_question_type text,
  p_answer_payload jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
  SELECT COALESCE(private.exam_answer_payload_is_valid(
    p_question_version_id, p_question_type, p_answer_payload
  ), false) AND CASE p_question_type
    WHEN 'PG_TUNGGAL' THEN
      EXISTS (SELECT 1 FROM public.question_options o
              WHERE o.question_version_id = p_question_version_id AND o.is_correct = true)
      AND COALESCE((
        SELECT array_agg(o.option_code ORDER BY o.option_code)
        FROM public.question_options o
        WHERE o.question_version_id = p_question_version_id
          AND o.is_correct = true
      ), ARRAY[]::text[])
      = COALESCE((
        SELECT array_agg(x.code ORDER BY x.code)
        FROM jsonb_array_elements_text(COALESCE(p_answer_payload->'option_codes','[]'::jsonb)) AS x(code)
      ), ARRAY[]::text[])
    WHEN 'PGK_MA' THEN
      EXISTS (SELECT 1 FROM public.question_options o
              WHERE o.question_version_id = p_question_version_id AND o.is_correct = true)
      AND COALESCE((
        SELECT array_agg(o.option_code ORDER BY o.option_code)
        FROM public.question_options o
        WHERE o.question_version_id = p_question_version_id
          AND o.is_correct = true
      ), ARRAY[]::text[])
      = COALESCE((
        SELECT array_agg(x.code ORDER BY x.code)
        FROM jsonb_array_elements_text(COALESCE(p_answer_payload->'option_codes','[]'::jsonb)) AS x(code)
      ), ARRAY[]::text[])
    WHEN 'PGK_KATEGORI' THEN
      EXISTS (SELECT 1 FROM public.question_category_items ci
              WHERE ci.question_version_id = p_question_version_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.question_category_items ci
        WHERE ci.question_version_id = p_question_version_id
          AND (p_answer_payload->'category_answers'->>ci.item_number::text)
              IS DISTINCT FROM ci.correct_category
      )
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.save_exam_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_answer_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
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
  IF v_attempt.attempt_status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Sesi ujian sudah selesai atau tidak aktif.';
  END IF;
  v_now := clock_timestamp();
  IF v_attempt.started_at IS NULL OR v_attempt.duration_minutes IS NULL
     OR v_attempt.duration_minutes <= 0
     OR v_now >= v_attempt.started_at + (v_attempt.duration_minutes * interval '1 minute') THEN
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
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

  IF NOT FOUND OR v_attempt.attempt_status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Sesi ujian tidak ditemukan atau sudah selesai.';
  END IF;

  -- Submit setelah deadline adalah auto-submit: nilai dihitung hanya dari
  -- jawaban yang sudah tersimpan. save_exam_answer tetap menolak jawaban baru.
  IF v_attempt.started_at IS NULL OR v_attempt.duration_minutes IS NULL
     OR v_attempt.duration_minutes <= 0 THEN
    RAISE EXCEPTION 'Konfigurasi waktu ujian tidak valid.';
  END IF;
  v_submitted_after_deadline := clock_timestamp() >=
    v_attempt.started_at + (v_attempt.duration_minutes * interval '1 minute');

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

REVOKE ALL ON FUNCTION private.exam_answer_payload_is_valid(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.exam_answer_is_correct(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_exam_answer(uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_exam_answer(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid) TO authenticated;

COMMIT;
