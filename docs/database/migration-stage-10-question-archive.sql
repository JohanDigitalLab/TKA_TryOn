-- Soft archive only. Existing question content and historical rows are never deleted.
BEGIN;
CREATE OR REPLACE FUNCTION private.valid_admin_permissions()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT ARRAY['bank_soal.view','bank_soal.review','bank_soal.edit','bank_soal.moderate','bank_soal.publish','bank_soal.import','bank_soal.archive','education_level.review','school_onboarding.review']::text[];
$$;
CREATE OR REPLACE FUNCTION public.admin_has_permission(p_permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT auth.uid() IS NOT NULL AND p_permission_code = ANY(ARRAY['bank_soal.view','bank_soal.review','bank_soal.edit','bank_soal.moderate','bank_soal.publish','bank_soal.import','bank_soal.archive']::text[])
 AND private.has_admin_permission(p_permission_code);
$$;
REVOKE ALL ON FUNCTION public.admin_has_permission(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_has_permission(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.question_archive_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 question_id uuid NOT NULL UNIQUE REFERENCES public.questions(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 2000),
 previous_status text NOT NULL CHECK(previous_status<>'ARCHIVED'),
 latest_version_id uuid REFERENCES public.question_versions(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.question_archive_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_archive_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.question_archive_audit TO authenticated;
DROP POLICY IF EXISTS question_archive_audit_select ON public.question_archive_audit;
CREATE POLICY question_archive_audit_select ON public.question_archive_audit FOR SELECT TO authenticated
 USING(private.has_admin_permission('bank_soal.view') AND private.has_admin_permission('bank_soal.archive'));

-- A shared row lock synchronizes new dependency insertion with archival's FOR UPDATE.
-- The audit marker limits this new guard to this rollout, preserving legacy histories.
CREATE OR REPLACE FUNCTION private.guard_archived_question_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s text;
BEGIN
 SELECT question_status INTO s FROM public.questions WHERE id=NEW.question_id FOR SHARE;
 IF s='ARCHIVED' AND EXISTS(SELECT 1 FROM public.question_archive_audit WHERE question_id=NEW.question_id) THEN
  RAISE EXCEPTION 'Soal telah diarsipkan. Pilih soal lain.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_archived_question_reference() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['exam_attempt_questions','exam_attempt_answers','school_assignment_questions','question_versions'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS question_archive_reference_guard ON public.%I',t);
  EXECUTE format('CREATE TRIGGER question_archive_reference_guard BEFORE INSERT OR UPDATE OF question_id ON public.%I FOR EACH ROW EXECUTE FUNCTION private.guard_archived_question_reference()',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.archive_question(p_question_id uuid,p_expected_status text,p_expected_version_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE u uuid:=private.school_actor(); q public.questions%ROWTYPE; latest uuid; audit_id uuid;
BEGIN
 IF NOT private.has_admin_permission('bank_soal.view') OR NOT private.has_admin_permission('bank_soal.archive') THEN
  RAISE EXCEPTION 'Izin arsip soal tidak mencukupi.' USING ERRCODE='42501';
 END IF;
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'Pengarsipan memerlukan isolasi read committed.' USING ERRCODE='25000';
 END IF;
 IF p_question_id IS NULL OR p_expected_status IS NULL OR p_expected_version_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 2000 THEN
  RAISE EXCEPTION 'Identitas, versi, status dan alasan 5–2000 karakter wajib diisi.' USING ERRCODE='22023';
 END IF;
 SELECT * INTO q FROM public.questions WHERE id=p_question_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Soal tidak ditemukan.' USING ERRCODE='P0002'; END IF;
 IF q.question_status='ARCHIVED' THEN RAISE EXCEPTION 'Soal sudah diarsipkan.' USING ERRCODE='22023'; END IF;
 SELECT id INTO latest FROM public.question_versions WHERE question_id=q.id ORDER BY version_number DESC LIMIT 1;
 IF q.question_status IS DISTINCT FROM p_expected_status OR latest IS DISTINCT FROM p_expected_version_id THEN
  RAISE EXCEPTION 'Soal telah berubah. Muat ulang sebelum mengarsipkan.' USING ERRCODE='40001';
 END IF;
 IF EXISTS(SELECT 1 FROM public.exam_attempt_questions WHERE question_id=q.id)
 OR EXISTS(SELECT 1 FROM public.exam_attempt_answers WHERE question_id=q.id)
 OR EXISTS(SELECT 1 FROM public.school_assignment_questions WHERE question_id=q.id) THEN
  RAISE EXCEPTION 'Soal terkait attempt, jawaban, atau assignment tidak boleh diarsipkan.' USING ERRCODE='23503';
 END IF;
 INSERT INTO public.question_archive_audit(question_id,actor_id,reason,previous_status,latest_version_id)
 VALUES(q.id,u,btrim(p_reason),q.question_status,latest) RETURNING id INTO audit_id;
 UPDATE public.questions SET question_status='ARCHIVED' WHERE id=q.id;
 RETURN jsonb_build_object('success',true,'question_id',q.id,'question_status','ARCHIVED','audit_id',audit_id);
END $$;
REVOKE ALL ON FUNCTION public.archive_question(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.archive_question(uuid,text,uuid,text) TO authenticated;

-- Prevent old revision engines or import paths from reviving an archived question.
CREATE OR REPLACE FUNCTION private.guard_question_archive_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.question_status='ARCHIVED' AND NEW.question_status IS DISTINCT FROM OLD.question_status
 AND EXISTS(SELECT 1 FROM public.question_archive_audit WHERE question_id=OLD.id) THEN
  RAISE EXCEPTION 'Soal arsip tidak dapat diterbitkan kembali melalui workflow biasa.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_question_archive_status() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS question_archive_status_guard ON public.questions;
CREATE TRIGGER question_archive_status_guard BEFORE UPDATE OF question_status ON public.questions
 FOR EACH ROW EXECUTE FUNCTION private.guard_question_archive_status();
NOTIFY pgrst,'reload schema';
COMMIT;
