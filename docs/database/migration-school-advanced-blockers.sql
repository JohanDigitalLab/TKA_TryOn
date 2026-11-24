-- REVIEW-ONLY. Tidak dieksekusi oleh aplikasi; berakhir ROLLBACK dengan sengaja.
-- Basis: snapshot lokal 2026-11-23, SHA256
-- bf6c2bc274e7def1432142c528fc800243feff4775ae245e80471ff23f99356f.
-- Gate reviewer: school_uid harus dipastikan bermakna schools.id, bukan UID akun SCHOOL.
-- Set school_blockers.school_uid_reference = 'schools.id' hanya setelah review mapping.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('school:blockers:migration:v1',0));
-- Blokir penulis selama preflight + pemasangan constraint agar tidak ada TOCTOU.
LOCK TABLE public.schools, public.profiles, public.classes, public.school_memberships,
  public.school_assignments, public.school_assignment_recipients,
  public.scheduled_tryouts, public.scheduled_tryout_users, public.exam_attempts, auth.users
  IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
BEGIN
  IF current_setting('school_blockers.school_uid_reference',true) IS DISTINCT FROM 'schools.id' THEN
    RAISE EXCEPTION 'HOLD: review school_uid mapping (school ID versus managed account UID) required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.scheduled_tryouts t LEFT JOIN public.schools s ON s.id=t.school_uid WHERE s.id IS NULL)
  OR EXISTS (SELECT 1 FROM public.scheduled_tryout_users x LEFT JOIN public.scheduled_tryouts t ON t.id=x.scheduled_tryouts WHERE t.id IS NULL)
  OR EXISTS (SELECT 1 FROM public.scheduled_tryout_users x LEFT JOIN auth.users u ON u.id=x.user_id WHERE u.id IS NULL)
  OR EXISTS (SELECT 1 FROM public.profiles p LEFT JOIN public.schools s ON s.id=p.school_id WHERE p.school_id IS NOT NULL AND s.id IS NULL)
  OR EXISTS (SELECT 1 FROM public.school_assignments a LEFT JOIN public.classes c ON (c.id,c.school_id)=(a.class_id,a.school_id) WHERE c.id IS NULL)
  THEN RAISE EXCEPTION 'HOLD: orphan or cross-school class; reconcile explicitly, no automatic repair'; END IF;
  IF EXISTS (SELECT 1 FROM public.scheduled_tryout_users GROUP BY scheduled_tryouts,user_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'HOLD: duplicate scheduled recipients; no automatic deduplication';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.exam_attempts'::regclass
    AND attname='attempt_type' AND attnotnull AND NOT atthasdef AND NOT attisdropped) THEN
    RAISE EXCEPTION 'HOLD: attempt_type invariant drift';
  END IF;
  IF EXISTS (SELECT 1 FROM public.school_assignment_recipients r JOIN public.exam_attempts e ON e.id=r.attempt_id
    WHERE e.attempt_type IS DISTINCT FROM 'ASSIGNMENT' OR e.user_id IS DISTINCT FROM r.user_id)
  OR EXISTS (SELECT 1 FROM public.exam_attempts e WHERE e.attempt_type='ASSIGNMENT'
    AND NOT EXISTS (SELECT 1 FROM public.school_assignment_recipients r WHERE r.attempt_id=e.id AND r.user_id=e.user_id)) THEN
    RAISE EXCEPTION 'HOLD: inconsistent assignment attempts; never rewrite historical results';
  END IF;
END
$preflight$;

-- NOT VALID: pasang proteksi write baru, bukan validasi/destruksi sejarah diam-diam.
-- Nama sengaja spesifik; re-run/constraint drift gagal dan harus direview, bukan dilewati.
ALTER TABLE public.scheduled_tryouts ADD CONSTRAINT school_blockers_schedule_school_fk
  FOREIGN KEY (school_uid) REFERENCES public.schools(id) NOT VALID;
ALTER TABLE public.scheduled_tryout_users ADD CONSTRAINT school_blockers_schedule_recipient_unique
  UNIQUE (scheduled_tryouts,user_id);
ALTER TABLE public.scheduled_tryout_users ADD CONSTRAINT school_blockers_recipient_schedule_fk
  FOREIGN KEY (scheduled_tryouts) REFERENCES public.scheduled_tryouts(id) NOT VALID;
ALTER TABLE public.scheduled_tryout_users ADD CONSTRAINT school_blockers_recipient_user_fk
  FOREIGN KEY (user_id) REFERENCES auth.users(id) NOT VALID;
-- Reuse idx_classes_id_school_id_unique; academic-profile composite FK sudah ada.
ALTER TABLE public.school_assignments ADD CONSTRAINT school_blockers_assignment_class_school_fk
  FOREIGN KEY (class_id,school_id) REFERENCES public.classes(id,school_id) NOT VALID;
ALTER TABLE public.profiles ADD CONSTRAINT school_blockers_profile_school_fk
  FOREIGN KEY (school_id) REFERENCES public.schools(id) NOT VALID;

-- Otoritas: membership siswa aktif + sekolah/akun aktif. Profil hanya veto konflik.
-- Tidak membuat membership dari profil terkelola; mapping terkelola tetap gate deployment.
-- Urutan lock setiap jalur: learning:user advisory -> assignment SHARE -> recipient
-- UPDATE -> school/profile/membership SHARE -> attempt UPDATE. Tidak lock attempt dahulu.
CREATE OR REPLACE FUNCTION private.school_assignment_access(p_assignment_id uuid, p_attempt_id uuid DEFAULT NULL)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE u uuid:=private.school_actor(); a public.school_assignments%ROWTYPE;
  r public.school_assignment_recipients%ROWTYPE; p public.profiles%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
  SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id FOR SHARE;
  IF NOT FOUND OR a.status<>'published' OR clock_timestamp()<a.opens_at THEN
    RAISE EXCEPTION 'Assignment unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.school_assignment_recipients
    WHERE assignment_id=a.id AND user_id=u FOR UPDATE;
  IF NOT FOUND OR (p_attempt_id IS NOT NULL AND r.attempt_id IS DISTINCT FROM p_attempt_id) THEN
    RAISE EXCEPTION 'Recipient unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.schools WHERE id=a.school_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School inactive' USING ERRCODE='42501'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id=u FOR SHARE;
  IF NOT FOUND OR p.account_status<>'active'
    OR (p.school_id IS NOT NULL AND p.school_id<>a.school_id)
    OR ((p.is_managed IS TRUE OR p.account_type='SCHOOL') AND p.school_id IS NULL) THEN
    RAISE EXCEPTION 'HOLD: conflicting or unmapped profile affiliation' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.school_memberships
    WHERE school_id=a.school_id AND user_id=u AND role='student' AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active student membership required' USING ERRCODE='42501'; END IF;
  -- Ambiguitas afiliasi lintas sekolah ditolak, bukan memilih salah satunya.
  IF EXISTS (SELECT 1 FROM public.school_memberships WHERE user_id=u AND status='active' AND school_id<>a.school_id) THEN
    RAISE EXCEPTION 'HOLD: conflicting active memberships' USING ERRCODE='42501'; END IF;
  RETURN a.due_at;
END
$function$;

CREATE OR REPLACE FUNCTION private.school_assignment_deadline(p_attempt_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE u uuid:=private.school_actor(); aid uuid; due timestamptz; e public.exam_attempts%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
  SELECT assignment_id INTO aid FROM public.school_assignment_recipients WHERE attempt_id=p_attempt_id AND user_id=u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment attempt unavailable' USING ERRCODE='42501'; END IF;
  due:=private.school_assignment_access(aid,p_attempt_id);
  SELECT * INTO e FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u FOR UPDATE;
  IF NOT FOUND OR e.attempt_type<>'ASSIGNMENT' OR e.started_at IS NULL
    OR e.duration_minutes IS NULL OR e.duration_minutes<=0 OR due IS NULL THEN
    RAISE EXCEPTION 'Invalid assignment timing or owner' USING ERRCODE='42501'; END IF;
  RETURN least(due,e.started_at+e.duration_minutes*interval '1 minute',e.deadline_at);
END
$function$;

CREATE OR REPLACE FUNCTION private.learning_legacy_assignment(p_assignment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE u uuid:=private.school_actor(); a public.school_assignments%ROWTYPE;
  r public.school_assignment_recipients%ROWTYPE; e public.exam_attempts%ROWTYPE; actual integer;
BEGIN
  PERFORM private.school_assignment_access(p_assignment_id);
  SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id;
  SELECT * INTO r FROM public.school_assignment_recipients WHERE assignment_id=a.id AND user_id=u;
  IF r.attempt_id IS NOT NULL THEN RETURN private.resume_school_assignment(r.attempt_id); END IF;
  -- Kebijakan lama dipertahankan: mulai hanya jika durasi penuh masih tersedia.
  IF clock_timestamp()+a.duration_minutes*interval '1 minute'>a.due_at THEN
    RAISE EXCEPTION 'Insufficient assignment time'; END IF;
  -- Lock kompatibel dengan engine historis; advisory learning:user sudah diambil lebih dulu.
  PERFORM pg_advisory_xact_lock(hashtextextended(u::text||':'||a.grade::text||':'||a.subject_name,0));
  -- Jangan expire/ubah attempt lain otomatis, termasuk hasil siswa.
  IF EXISTS (SELECT 1 FROM public.exam_attempts WHERE user_id=u AND grade=a.grade
    AND subject_name=a.subject_name AND attempt_status='IN_PROGRESS') THEN
    RAISE EXCEPTION 'Finish or resume existing subject session'; END IF;
  INSERT INTO public.exam_attempts(user_id,education_level,grade,subject_name,duration_minutes,total_questions,attempt_type,started_at,deadline_at)
  VALUES(u,CASE a.grade WHEN 6 THEN 'SD' ELSE 'SMP' END,a.grade,a.subject_name,a.duration_minutes,a.question_count,
    'ASSIGNMENT',clock_timestamp(),a.due_at) RETURNING * INTO e;
  INSERT INTO public.exam_attempt_questions(attempt_id,question_id,question_version_id,question_order)
    SELECT e.id,q.question_id,q.question_version_id,q.question_order
    FROM public.school_assignment_questions q WHERE q.assignment_id=a.id;
  GET DIAGNOSTICS actual=ROW_COUNT;
  IF actual<>a.question_count OR actual=0 THEN RAISE EXCEPTION 'Assignment snapshot incomplete'; END IF;
  UPDATE public.school_assignment_recipients SET attempt_id=e.id WHERE assignment_id=a.id AND user_id=u;
  RETURN private.resume_school_assignment(e.id);
END
$function$;

-- Resume dan save/submit di bawah disalin dari engine snapshot, bukan scoring baru.
CREATE OR REPLACE FUNCTION private.resume_school_assignment(p_attempt_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
DECLARE u uuid:=private.school_actor(); a public.exam_attempts%ROWTYPE; qs jsonb; ans jsonb; due timestamptz;
BEGIN
  due:=private.school_assignment_deadline(p_attempt_id);
  SELECT * INTO a FROM public.exam_attempts
  WHERE id=p_attempt_id AND user_id=u AND attempt_type='ASSIGNMENT' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment unavailable' USING ERRCODE='42501'; END IF;
  IF a.attempt_status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Assignment is not active'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'question_id',q.id,'question_version_id',v.id,'question_order',aq.question_order,
    'question_type',q.question_type,'question_text',v.question_text,'instruction',v.instruction,
    'stimulus',(SELECT jsonb_build_object('title',s.title,'content_text',s.content_text,
      'file_url',s.file_url,'media_description',s.media_description) FROM public.question_stimuli s WHERE s.id=v.stimulus_id),
    'options',coalesce((SELECT jsonb_agg(jsonb_build_object('option_code',o.option_code,'option_text',o.option_text)
      ORDER BY o.option_order,o.option_code) FROM public.question_options o WHERE o.question_version_id=v.id),'[]'::jsonb),
    'category_items',coalesce((SELECT jsonb_agg(jsonb_build_object('item_number',c.item_number,
      'item_text',c.item_text,'category_label',c.category_label) ORDER BY c.item_number)
      FROM public.question_category_items c WHERE c.question_version_id=v.id),'[]'::jsonb)
  ) ORDER BY aq.question_order),'[]'::jsonb) INTO qs
  FROM public.exam_attempt_questions aq JOIN public.questions q ON q.id=aq.question_id
  JOIN public.question_versions v ON v.id=aq.question_version_id AND v.question_id=q.id
  WHERE aq.attempt_id=a.id;
  SELECT coalesce(jsonb_object_agg(x.question_id::text,x.answer_payload),'{}'::jsonb) INTO ans
  FROM public.exam_attempt_answers x WHERE x.attempt_id=a.id;
  RETURN jsonb_build_object('attempt_id',a.id,'subject_name',a.subject_name,'grade',a.grade,
    'education_level',a.education_level,'attempt_type',a.attempt_type,'duration_minutes',a.duration_minutes,'total_questions',a.total_questions,
    'started_at',a.started_at,'deadline_at',due,'questions',qs,'answers',ans,
    'remaining_seconds',greatest(0,floor(extract(epoch FROM (due-clock_timestamp())))));
END $function$;

CREATE OR REPLACE FUNCTION public.save_exam_answer(p_attempt_id uuid, p_question_id uuid, p_answer_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_assignment_deadline timestamptz;
  v_attempt public.exam_attempts%ROWTYPE;
  v_question_type text;
  v_question_version_id uuid;
  v_now timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||v_user_id::text,0));
  IF EXISTS (SELECT 1 FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=v_user_id AND attempt_type='ASSIGNMENT') THEN
    v_assignment_deadline:=private.school_assignment_deadline(p_attempt_id);
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
  IF v_attempt.attempt_type = 'TRYOUT'
     AND (v_attempt.started_at IS NULL OR v_attempt.duration_minutes IS NULL
       OR v_attempt.duration_minutes <= 0
       OR v_now >= v_attempt.started_at + (v_attempt.duration_minutes * interval '1 minute')) THEN
    RAISE EXCEPTION 'Waktu ujian telah habis.';
  END IF;
  IF v_attempt.attempt_type='ASSIGNMENT' AND
    (v_assignment_deadline IS NULL OR v_now>=v_assignment_deadline) THEN
    RAISE EXCEPTION 'Waktu tugas telah habis.';
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
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_assignment_deadline timestamptz;
  v_attempt public.exam_attempts%ROWTYPE;
  v_total integer;
  v_correct integer;
  v_score numeric(6,2);
  v_submitted_after_deadline boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||v_user_id::text,0));
  IF EXISTS (SELECT 1 FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=v_user_id AND attempt_type='ASSIGNMENT') THEN
    v_assignment_deadline:=private.school_assignment_deadline(p_attempt_id);
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
  IF v_attempt.attempt_type = 'TRYOUT'
     AND (v_attempt.started_at IS NULL OR v_attempt.duration_minutes IS NULL
       OR v_attempt.duration_minutes <= 0) THEN
    RAISE EXCEPTION 'Konfigurasi waktu ujian tidak valid.';
  END IF;
  v_submitted_after_deadline := v_attempt.attempt_type = 'TRYOUT'
    AND clock_timestamp() >= v_attempt.started_at
      + (v_attempt.duration_minutes * interval '1 minute');
  IF v_attempt.attempt_type='ASSIGNMENT' THEN
    IF v_assignment_deadline IS NULL THEN RAISE EXCEPTION 'Invalid assignment deadline'; END IF;
    v_submitted_after_deadline:=clock_timestamp()>=v_assignment_deadline;
  END IF;

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

REVOKE ALL ON FUNCTION private.school_assignment_access(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.school_assignment_deadline(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.learning_legacy_assignment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.resume_school_assignment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_exam_answer(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_answer(uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid) TO authenticated;

-- Dispatcher resume dan start_school_assignment tetap memakai signature/grant yang ada.
-- Tidak reaktivasi x RPC, default tipe, backfill profil, atau rewrite hasil.
-- VALIDATE CONSTRAINT hanya pada deployment terpisah setelah staging dan review.
ROLLBACK; -- REVIEW-ONLY: ganti terminator hanya dalam deployment yang disetujui.
