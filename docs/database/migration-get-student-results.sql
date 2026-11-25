-- Halaman Hasil & Evaluasi: satu RPC pembaca data untuk siswa, sekolah, dan admin.
-- Apply di Supabase SQL Editor sebelum halaman /student/results versi baru digunakan.
-- Tidak mengubah tabel, RLS, maupun grant existing. Tidak ada DROP pada objek lain.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_student_results(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_type text;
  v_actor_school uuid;
  v_target uuid;
  v_target_type text;
  v_target_name text;
  v_target_school uuid;
  v_target_level text;
  v_students jsonb := '[]'::jsonb;
  v_subjects jsonb := '[]'::jsonb;
  v_attempts jsonb := '[]'::jsonb;
  v_competency jsonb := '[]'::jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(p.account_type)), p.school_id
    INTO v_actor_type, v_actor_school
  FROM public.profiles p
  WHERE p.id = v_actor;

  IF v_actor_type IS NULL THEN
    RAISE EXCEPTION 'Profil akun tidak ditemukan.' USING ERRCODE = '42501';
  END IF;

  -- Akun siswa selalu membaca dirinya sendiri; sekolah/admin wajib menyebut target.
  -- v_actor_type sudah lowercase (lihat SELECT di atas), jadi literal pembanding ikut lowercase.
  v_target := COALESCE(
    p_user_id,
    CASE WHEN v_actor_type IN ('school', 'admin') THEN NULL ELSE v_actor END
  );

  IF v_target IS NOT NULL AND v_target <> v_actor THEN
    IF v_actor_type = 'admin' THEN
      NULL;
    ELSIF v_actor_type = 'school' AND v_actor_school IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles t
        WHERE t.id = v_target
          AND lower(btrim(t.account_type)) = 'student'
          AND t.school_id = v_actor_school
      ) THEN
        RAISE EXCEPTION 'Siswa berada di luar sekolahmu.' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'Tidak berwenang melihat hasil siswa lain.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Daftar siswa hanya disertakan untuk akun sekolah/admin sebagai sumber pemilih.
  IF v_actor_type = 'school' AND v_actor_school IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(row_to_json(s)::jsonb ORDER BY s.full_name, s.id), '[]'::jsonb)
      INTO v_students
    FROM (
      SELECT p.id, nullif(btrim(p.full_name), '') AS full_name, p.nisn,
             lower(btrim(coalesce(p.education_level, ''))) AS education_level
      FROM public.profiles p
      WHERE lower(btrim(p.account_type)) = 'student'
        AND p.school_id = v_actor_school
    ) s;
  ELSIF v_actor_type = 'admin' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(s)::jsonb ORDER BY s.full_name, s.id), '[]'::jsonb)
      INTO v_students
    FROM (
      SELECT p.id, nullif(btrim(p.full_name), '') AS full_name, p.nisn,
             lower(btrim(coalesce(p.education_level, ''))) AS education_level
      FROM public.profiles p
      WHERE lower(btrim(p.account_type)) = 'student'
      ORDER BY p.full_name, p.id
      LIMIT 500
    ) s;
  END IF;

  -- Sekolah/admin yang belum memilih siswa memperoleh daftar siswa saja.
  IF v_target IS NULL THEN
    RETURN jsonb_build_object(
      'viewer', NULL,
      'students', v_students,
      'subjects', '[]'::jsonb,
      'attempts', '[]'::jsonb,
      'competency', '[]'::jsonb
    );
  END IF;

  SELECT lower(btrim(p.account_type)), nullif(btrim(p.full_name), ''), p.school_id,
         lower(btrim(coalesce(p.education_level, '')))
    INTO v_target_type, v_target_name, v_target_school, v_target_level
  FROM public.profiles p
  WHERE p.id = v_target;

  IF v_target_type IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'Hasil hanya tersedia untuk akun siswa.' USING ERRCODE = '22023';
  END IF;

  IF v_target_level IN ('sd', 'smp', 'sma') THEN
    SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.name, x.subject_code), '[]'::jsonb)
      INTO v_subjects
    FROM (
      SELECT s.name, s.subject_code
      FROM public.subjects s
      WHERE s.subject_code ILIKE '%-' || v_target_level
    ) x;
  END IF;

  SELECT COALESCE(jsonb_agg(a.item ORDER BY a.started_at, a.attempt_id), '[]'::jsonb)
    INTO v_attempts
  FROM (
    SELECT e.started_at,
           e.id AS attempt_id,
           jsonb_build_object(
             'attempt_id', e.id,
             'attempt_type', e.attempt_type,
             'subject_name', e.subject_name,
             'grade', e.grade,
             'score', e.score,
             'total_questions', e.total_questions,
             'correct_answers', e.correct_answers,
             'started_at', e.started_at,
             'submitted_at', e.submitted_at
           ) AS item
    FROM public.exam_attempts e
    WHERE e.user_id = v_target
      AND e.attempt_status = 'SUBMITTED'
      -- Jangan tampilkan hasil gamifikasi di halaman Hasil. 
      -- Riwayat gamifikasi tetap bisa dilihat di halaman Gamifikasi.
      AND e.attempt_type IN ('TRYOUT', 'PRACTICE', 'ASSIGNMENT')
    ORDER BY e.started_at DESC, e.id DESC
    LIMIT 200
  ) a;

  SELECT COALESCE(jsonb_agg(c.item ORDER BY c.theme, c.topic), '[]'::jsonb)
    INTO v_competency
  FROM (
    SELECT sc.theme, sc.topic,
           jsonb_build_object(
             'subject', sc.subject,
             'theme', sc.theme,
             'topic', sc.topic,
             'no_of_questions', sc.no_of_questions,
             'correct_answers', sc.correct_anwers,
             'score', sc.score,
             'competency_level', sc.competency_level
           ) AS item
    FROM public.student_competency sc
    WHERE sc.user_id = v_target
  ) c;

  RETURN jsonb_build_object(
    'viewer', jsonb_build_object(
      'user_id', v_target,
      'full_name', v_target_name,
      'education_level', NULLIF(v_target_level, ''),
      'school_id', v_target_school
    ),
    'students', v_students,
    'subjects', v_subjects,
    'attempts', v_attempts,
    'competency', v_competency
  );
END;
$$;

COMMENT ON FUNCTION public.get_student_results(uuid) IS
  'Hasil dan kompetensi satu siswa untuk pemilik akun, sekolah asal, atau admin.';

REVOKE ALL ON FUNCTION public.get_student_results(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_results(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
