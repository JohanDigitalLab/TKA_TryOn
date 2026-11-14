-- Tahap 3: tugas kelas, snapshot soal, workflow guru, ranking privat staf.
-- Prasyarat: schema live yang diaudit + migration tahap 1 dan 2.
BEGIN;
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.school_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  class_id uuid NOT NULL REFERENCES public.classes(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  subject_name text NOT NULL CHECK (length(btrim(subject_name)) BETWEEN 1 AND 100),
  grade integer NOT NULL CHECK (grade IN (6,9)),
  question_count integer NOT NULL CHECK (question_count BETWEEN 1 AND 100),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 240),
  opens_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_at >= opens_at + duration_minutes * interval '1 minute')
);
CREATE INDEX IF NOT EXISTS school_assignments_school_idx ON public.school_assignments(school_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.school_assignment_questions (
  assignment_id uuid NOT NULL REFERENCES public.school_assignments(id),
  question_id uuid NOT NULL REFERENCES public.questions(id),
  question_version_id uuid NOT NULL REFERENCES public.question_versions(id),
  question_order integer NOT NULL CHECK (question_order > 0),
  PRIMARY KEY (assignment_id, question_id),
  UNIQUE (assignment_id, question_order)
);
CREATE TABLE IF NOT EXISTS public.school_assignment_recipients (
  assignment_id uuid NOT NULL REFERENCES public.school_assignments(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  attempt_id uuid UNIQUE REFERENCES public.exam_attempts(id),
  PRIMARY KEY (assignment_id, user_id)
);
CREATE INDEX IF NOT EXISTS school_assignment_recipients_user_idx ON public.school_assignment_recipients(user_id);
ALTER TABLE public.school_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_assignment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_assignment_recipients ENABLE ROW LEVEL SECURITY;
-- Semua akses melalui RPC terotorisasi, tidak ada DML maupun SELECT langsung.
REVOKE ALL ON public.school_assignments, public.school_assignment_questions, public.school_assignment_recipients FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.require_school_staff(p_school_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.school_memberships m JOIN public.profiles p ON p.id=m.user_id
    WHERE m.school_id=p_school_id AND m.user_id=auth.uid() AND m.status='active'
      AND m.role IN ('school_admin','teacher') AND p.account_status='active'
  ) THEN RAISE EXCEPTION 'Akses staf sekolah aktif diperlukan.' USING ERRCODE='42501'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.require_school_staff(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_teacher_workspace(p_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  PERFORM private.require_school_staff(p_school_id);
  SELECT jsonb_build_object(
    'classes', (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.grade,c.name),'[]'::jsonb) FROM public.classes c WHERE c.school_id=p_school_id),
    'assignments', (SELECT COALESCE(jsonb_agg(x.row ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
      SELECT a.created_at,jsonb_build_object('id',a.id,'title',a.title,'class_id',a.class_id,'subject_name',a.subject_name,'grade',a.grade,
        'status',a.status,'opens_at',a.opens_at,'due_at',a.due_at,'duration_minutes',a.duration_minutes,'question_count',a.question_count,
        'created_by',a.created_by,'updated_at',a.updated_at,
        'recipients',(SELECT count(*) FROM public.school_assignment_recipients r WHERE r.assignment_id=a.id),
        'submitted',(SELECT count(*) FROM public.school_assignment_recipients r JOIN public.exam_attempts e ON e.id=r.attempt_id WHERE r.assignment_id=a.id AND e.attempt_status='SUBMITTED')) AS row
      FROM public.school_assignments a WHERE a.school_id=p_school_id ORDER BY a.created_at DESC LIMIT 100
    ) x)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_school_assignment(
  p_school_id uuid, p_class_id uuid, p_title text, p_subject_name text,
  p_question_count integer, p_duration_minutes integer, p_opens_at timestamptz, p_due_at timestamptz,
  p_assignment_id uuid DEFAULT NULL, p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.classes%ROWTYPE; a public.school_assignments%ROWTYPE; result uuid;
BEGIN
  PERFORM private.require_school_staff(p_school_id);
  SELECT * INTO c FROM public.classes WHERE id=p_class_id AND school_id=p_school_id FOR SHARE;
  IF NOT FOUND OR c.grade NOT IN (6,9) THEN RAISE EXCEPTION 'Pilih kelas 6 atau 9 dari sekolah ini.'; END IF;
  IF p_title IS NULL OR p_subject_name IS NULL OR p_question_count IS NULL OR p_duration_minutes IS NULL OR p_opens_at IS NULL OR p_due_at IS NULL THEN
    RAISE EXCEPTION 'Semua konfigurasi tugas wajib diisi.';
  END IF;
  IF p_due_at <= clock_timestamp() THEN RAISE EXCEPTION 'Batas waktu harus di masa depan.'; END IF;
  IF p_assignment_id IS NULL THEN
    INSERT INTO public.school_assignments(school_id,class_id,created_by,title,subject_name,grade,question_count,duration_minutes,opens_at,due_at)
    VALUES(p_school_id,c.id,auth.uid(),btrim(p_title),btrim(p_subject_name),c.grade,p_question_count,p_duration_minutes,p_opens_at,p_due_at) RETURNING id INTO result;
  ELSE
    SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id AND school_id=p_school_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tugas tidak ditemukan.'; END IF;
    IF a.created_by<>auth.uid() AND NOT private.has_school_role(p_school_id,ARRAY['school_admin']) THEN RAISE EXCEPTION 'Hanya pembuat atau admin dapat mengubah tugas.' USING ERRCODE='42501'; END IF;
    IF a.status<>'draft' THEN RAISE EXCEPTION 'Hanya draft yang dapat diubah.'; END IF;
    IF p_expected_updated_at IS NULL OR a.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'Draft berubah; muat ulang sebelum menyimpan.'; END IF;
    UPDATE public.school_assignments SET class_id=c.id,title=btrim(p_title),subject_name=btrim(p_subject_name),grade=c.grade,
      question_count=p_question_count,duration_minutes=p_duration_minutes,opens_at=p_opens_at,due_at=p_due_at,updated_at=clock_timestamp() WHERE id=a.id;
    result:=a.id;
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_school_assignment_status(p_assignment_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.school_assignments%ROWTYPE; n integer;
BEGIN
  SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tugas tidak ditemukan.'; END IF;
  PERFORM private.require_school_staff(a.school_id);
  IF a.created_by<>auth.uid() AND NOT private.has_school_role(a.school_id,ARRAY['school_admin']) THEN RAISE EXCEPTION 'Hanya pembuat atau admin dapat mengubah tugas.' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('published','cancelled') THEN RAISE EXCEPTION 'Status tidak valid.'; END IF;
  IF a.status=p_status THEN RETURN; END IF;
  IF a.status='cancelled' OR (p_status='published' AND a.status<>'draft') THEN RAISE EXCEPTION 'Transisi status tidak valid.'; END IF;
  IF p_status='published' THEN
    IF a.due_at < clock_timestamp()+a.duration_minutes*interval '1 minute' THEN RAISE EXCEPTION 'Waktu pengerjaan tersisa tidak cukup.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id=a.class_id AND school_id=a.school_id AND grade=a.grade) THEN RAISE EXCEPTION 'Kelas tugas telah berubah.'; END IF;
    -- Paket soal identik untuk semua penerima. Snapshot versi tidak berubah setelah publish.
    INSERT INTO public.school_assignment_questions(assignment_id,question_id,question_version_id,question_order)
    SELECT a.id,q.id,v.id,row_number() OVER (ORDER BY q.id)::integer
    FROM public.questions q JOIN public.question_versions v ON v.question_id=q.id AND v.is_current=true
    WHERE q.grade=a.grade AND q.subject_name=a.subject_name AND q.question_status='PUBLISHED'
      AND q.question_type IN ('PG_TUNGGAL','PGK_MA','PGK_KATEGORI') ORDER BY q.id LIMIT a.question_count;
    GET DIAGNOSTICS n=ROW_COUNT;
    IF n<>a.question_count THEN RAISE EXCEPTION 'Soal terbit tidak cukup: tersedia %, diperlukan %.',n,a.question_count; END IF;
    INSERT INTO public.school_assignment_recipients(assignment_id,user_id)
    SELECT a.id,p.user_id FROM public.student_academic_profiles p
    JOIN public.school_memberships m ON m.user_id=p.user_id AND m.school_id=a.school_id AND m.role='student' AND m.status='active'
    JOIN public.profiles pr ON pr.id=p.user_id AND pr.account_status='active'
    WHERE p.class_id=a.class_id AND p.school_id=a.school_id AND p.grade=a.grade;
    GET DIAGNOSTICS n=ROW_COUNT;
    IF n=0 THEN RAISE EXCEPTION 'Kelas belum memiliki siswa aktif yang sesuai.'; END IF;
  END IF;
  UPDATE public.school_assignments SET status=p_status,updated_at=clock_timestamp() WHERE id=a.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_assignments()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Silakan login.' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(x.row ORDER BY x.due_at DESC),'[]'::jsonb) INTO result FROM (
    SELECT a.due_at,jsonb_build_object('id',a.id,'title',a.title,'school_name',s.name,'subject_name',a.subject_name,
      'status',a.status,'opens_at',a.opens_at,'due_at',a.due_at,'question_count',a.question_count,'duration_minutes',a.duration_minutes,
      'attempt_id',e.id,'attempt_status',e.attempt_status,'score',CASE WHEN e.attempt_status='SUBMITTED' THEN e.score END) AS row
    FROM public.school_assignment_recipients r JOIN public.school_assignments a ON a.id=r.assignment_id
    JOIN public.schools s ON s.id=a.school_id LEFT JOIN public.exam_attempts e ON e.id=r.attempt_id
    WHERE r.user_id=auth.uid() AND a.status<>'draft'
      AND EXISTS(SELECT 1 FROM public.school_memberships m JOIN public.profiles p ON p.id=m.user_id WHERE m.school_id=a.school_id AND m.user_id=auth.uid() AND m.role='student' AND m.status='active' AND p.account_status='active')
    ORDER BY a.due_at DESC LIMIT 100
  ) x;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_school_assignment(p_assignment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.school_assignments%ROWTYPE; r public.school_assignment_recipients%ROWTYPE; e public.exam_attempts%ROWTYPE; result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Silakan login.' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tugas tidak ditemukan.'; END IF;
  SELECT * INTO r FROM public.school_assignment_recipients WHERE assignment_id=a.id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.school_memberships m JOIN public.profiles p ON p.id=m.user_id
    WHERE m.school_id=a.school_id AND m.user_id=auth.uid() AND m.role='student' AND m.status='active' AND p.account_status='active') THEN
    RAISE EXCEPTION 'Anda bukan penerima tugas aktif.' USING ERRCODE='42501'; END IF;
  IF a.status<>'published' THEN RAISE EXCEPTION 'Tugas tidak tersedia.'; END IF;
  IF r.attempt_id IS NOT NULL THEN
    SELECT * INTO e FROM public.exam_attempts WHERE id=r.attempt_id AND user_id=auth.uid();
    IF e.attempt_status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Tugas sudah dikerjakan atau berakhir.'; END IF;
    RETURN public.resume_exam_attempt(r.attempt_id);
  END IF;
  IF clock_timestamp()<a.opens_at OR clock_timestamp()+a.duration_minutes*interval '1 minute'>a.due_at THEN
    RAISE EXCEPTION 'Tugas belum dibuka atau waktu tersisa tidak cukup untuk memulai.'; END IF;
  -- Lock identik dengan start_exam_attempt untuk menghindari race dengan sesi mandiri.
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||a.grade::text||':'||a.subject_name,0));
  IF EXISTS(SELECT 1 FROM public.exam_attempts WHERE user_id=auth.uid() AND grade=a.grade AND subject_name=a.subject_name
    AND attempt_status='IN_PROGRESS' AND started_at+duration_minutes*interval '1 minute'>clock_timestamp()) THEN
    RAISE EXCEPTION 'Selesaikan sesi aktif mata pelajaran ini terlebih dahulu.'; END IF;
  UPDATE public.exam_attempts SET attempt_status='EXPIRED' WHERE user_id=auth.uid() AND grade=a.grade AND subject_name=a.subject_name
    AND attempt_status='IN_PROGRESS' AND started_at+duration_minutes*interval '1 minute'<=clock_timestamp();
  INSERT INTO public.exam_attempts(user_id,education_level,grade,subject_name,duration_minutes,total_questions)
    VALUES(auth.uid(),CASE a.grade WHEN 6 THEN 'SD' ELSE 'SMP' END,a.grade,a.subject_name,a.duration_minutes,a.question_count) RETURNING * INTO e;
  INSERT INTO public.exam_attempt_questions(attempt_id,question_id,question_version_id,question_order)
    SELECT e.id,q.question_id,q.question_version_id,q.question_order FROM public.school_assignment_questions q WHERE q.assignment_id=a.id;
  UPDATE public.school_assignment_recipients SET attempt_id=e.id WHERE assignment_id=a.id AND user_id=auth.uid();
  result:=public.resume_exam_attempt(e.id);
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_school_assignment_ranking(p_assignment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.school_assignments%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tugas tidak ditemukan.'; END IF;
  PERFORM private.require_school_staff(a.school_id);
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.position),'[]'::jsonb) INTO result FROM (
    SELECT row_number() OVER (ORDER BY e.score DESC,e.submitted_at,e.id) AS position,
      COALESCE(NULLIF(p.full_name,''),'Siswa') AS student_name,e.score,e.correct_answers,e.total_questions,e.submitted_at
    FROM public.school_assignment_recipients r JOIN public.exam_attempts e ON e.id=r.attempt_id AND e.user_id=r.user_id
    LEFT JOIN public.profiles p ON p.id=r.user_id
    WHERE r.assignment_id=a.id AND e.attempt_status='SUBMITTED' AND e.score IS NOT NULL
    ORDER BY e.score DESC,e.submitted_at,e.id LIMIT 5
  ) x;
  RETURN result;
END;
$$;

-- Tutup privilege default PUBLIC untuk SEMUA RPC baru, termasuk overload.
DO $$ DECLARE f regprocedure; BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('get_teacher_workspace','save_school_assignment','set_school_assignment_status','get_student_assignments','start_school_assignment','get_school_assignment_ranking')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
