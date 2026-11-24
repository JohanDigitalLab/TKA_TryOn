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
               WHERE upper(btrim(allowed.category)) = upper(btrim(v_item.category))
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

-- public.submit_exam_attempt / public.save_exam_answer / public.resume_exam_attempt
-- TIDAK lagi didefinisikan maupun diberi ACL di sini.
-- Sumber tunggal: docs/database/migration_generic_exam_attempt.sql.

REVOKE ALL ON FUNCTION private.exam_answer_payload_is_valid(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.exam_answer_is_correct(uuid, text, jsonb) FROM PUBLIC;

COMMIT;
