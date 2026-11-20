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

-- Fungsi workspace guru (pembuatan/penerbitan tugas dan ranking) dipensiunkan dari repositori.
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
  -- Lock identik dengan sesi mandiri untuk menghindari race antar jalur start.
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

-- Ranking privat tugas dipensiunkan bersama fungsi workspace guru di atas.

-- Tutup privilege default PUBLIC untuk SEMUA RPC baru, termasuk overload.
DO $$ DECLARE f regprocedure; BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('get_student_assignments','start_school_assignment')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
