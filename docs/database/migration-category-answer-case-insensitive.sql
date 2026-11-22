-- Scoring PGK_KATEGORI harus toleran terhadap perbedaan huruf besar/kecil.
-- Jawaban siswa dikirim UI dalam bentuk BENAR/SALAH, sementara correct_category
-- dapat tersimpan dalam variasi kapitalisasi (mis. "Benar") hasil import.
-- Perbandingan sebelumnya case-sensitive sehingga jawaban yang secara kategori
-- benar tetap dinilai salah.

BEGIN;

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
      -- Semua pernyataan harus terjawab dan cocok secara kategori.
      -- Perbandingan upper(btrim(...)) membuat penilaian tidak peka kapitalisasi.
      AND NOT EXISTS (
        SELECT 1
        FROM public.question_category_items ci
        WHERE ci.question_version_id = p_question_version_id
          AND (
            (p_answer_payload->'category_answers'->>ci.item_number::text) IS NULL
            OR upper(btrim(p_answer_payload->'category_answers'->>ci.item_number::text))
               IS DISTINCT FROM upper(btrim(ci.correct_category))
          )
      )
    ELSE false
  END;
$function$;

COMMIT;
