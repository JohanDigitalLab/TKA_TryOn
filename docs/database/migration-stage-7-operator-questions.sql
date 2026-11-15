-- Isolated operator workflow. Run via guarded runner; no stage 5/6 dependency.
BEGIN;
CREATE OR REPLACE FUNCTION private.has_admin_permission(p_permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
 SELECT p_permission_code = ANY(private.valid_admin_permissions()) AND EXISTS (
 SELECT 1 FROM auth.users u JOIN public.profiles pr ON pr.id=u.id
 WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
 AND (u.banned_until IS NULL OR u.banned_until<=now()) AND pr.account_status='active'
 AND (private.is_super_admin() OR EXISTS (
 SELECT 1 FROM public.admin_operator_accounts a JOIN public.admin_operator_permissions p ON p.user_id=a.user_id
 WHERE a.user_id=u.id AND a.is_active AND p.permission_code=p_permission_code)))
$f$;

-- Preserve the audited import engines and validation; replace only their role guard.
DO $patch$
DECLARE n text; original text; patched text;
BEGIN
 FOREACH n IN ARRAY ARRAY['save_ai_question_draft_batch','save_question_import_batch'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO STRICT original FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname=n AND pg_get_function_identity_arguments(p.oid)='p_payload jsonb';
  IF strpos(original, 'private.has_admin_permission(''bank_soal.import'')')=0 THEN
   patched:=regexp_replace(original,
    'IF NOT EXISTS \(\s*SELECT 1\s+FROM public\.user_global_roles r\s+WHERE r\.user_id = v_uid\s+AND r\.role = ''super_admin''\s*\) THEN',
    'IF NOT private.has_admin_permission(''bank_soal.import'') THEN', 's');
   IF patched=original OR strpos(patched,'r.role = ''super_admin''')>0 THEN
    RAISE EXCEPTION 'Import engine contract changed: %',n;
   END IF;
   -- Use the existing SOAL audit sheet; AI origin remains in scoring_rule/batch metadata.
   IF n='save_ai_question_draft_batch' THEN
    patched:=replace(patched, E'v_batch_id,\r\n      ''SMART_IMPORT_AI'',', E'v_batch_id,\r\n      ''SOAL'',');
    patched:=replace(patched, E'v_batch_id,\n      ''SMART_IMPORT_AI'',', E'v_batch_id,\n      ''SOAL'',');
   END IF;
   EXECUTE patched;
  END IF;
 END LOOP;
END $patch$;

CREATE TABLE IF NOT EXISTS public.question_workflow_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 question_id uuid NOT NULL REFERENCES public.questions(id),
 question_version_id uuid NOT NULL REFERENCES public.question_versions(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL CHECK(action IN ('REVIEW','APPROVE','REQUEST_REVISION','PUBLISH')),
 notes text NOT NULL CHECK(length(btrim(notes)) BETWEEN 5 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.question_workflow_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_workflow_audit FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS question_workflow_audit_version_idx ON public.question_workflow_audit(question_version_id,created_at);

CREATE OR REPLACE FUNCTION public.review_question_version(p_question_id uuid,p_version_id uuid,p_action text,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE u uuid; q public.questions%ROWTYPE; v public.question_versions%ROWTYPE; perm text; target text;
BEGIN
 u:=private.school_actor();
 perm:=CASE p_action WHEN 'REVIEW' THEN 'bank_soal.review'
 WHEN 'APPROVE' THEN 'bank_soal.moderate' WHEN 'REQUEST_REVISION' THEN 'bank_soal.moderate'
 WHEN 'PUBLISH' THEN 'bank_soal.publish' END;
 IF perm IS NULL OR NOT private.has_admin_permission(perm) OR NOT private.has_admin_permission('bank_soal.view') THEN
 RAISE EXCEPTION 'Izin tindakan tidak mencukupi.' USING ERRCODE='42501'; END IF;
 IF p_notes IS NULL OR length(btrim(p_notes)) NOT BETWEEN 5 AND 4000 THEN RAISE EXCEPTION 'Catatan harus berisi 5–4000 karakter.'; END IF;
 SELECT * INTO q FROM public.questions WHERE id=p_question_id FOR UPDATE;
 IF NOT FOUND OR q.question_status='ARCHIVED' THEN RAISE EXCEPTION 'Soal tidak tersedia.'; END IF;
 SELECT * INTO v FROM public.question_versions WHERE id=p_version_id AND question_id=q.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Versi soal tidak ditemukan.'; END IF;
 IF EXISTS(SELECT 1 FROM public.question_versions WHERE question_id=q.id AND version_number>v.version_number) THEN
 RAISE EXCEPTION 'Versi telah berubah. Muat ulang dan periksa versi terbaru.'; END IF;
 IF p_action='REVIEW' AND v.version_status NOT IN ('DRAFT','PENDING_REVIEW','NEEDS_REVISION') THEN RAISE EXCEPTION 'Versi tidak sedang menunggu telaah.'; END IF;
 IF p_action IN ('APPROVE','REQUEST_REVISION') THEN
  IF v.version_status NOT IN ('DRAFT','PENDING_REVIEW') THEN RAISE EXCEPTION 'Versi tidak sedang menunggu moderasi.'; END IF;
  IF p_action='APPROVE' AND NOT EXISTS(SELECT 1 FROM public.question_workflow_audit WHERE question_version_id=v.id AND action='REVIEW') THEN
   RAISE EXCEPTION 'Versi harus ditelaah sebelum disetujui.'; END IF;
 END IF;
 IF p_action='PUBLISH' AND (v.version_status<>'APPROVED' OR NOT EXISTS(
 SELECT 1 FROM public.question_workflow_audit WHERE question_version_id=v.id AND action='APPROVE')) THEN
 RAISE EXCEPTION 'Hanya versi yang disetujui yang dapat diterbitkan.'; END IF;
 IF p_action IN ('APPROVE','PUBLISH') THEN
  IF btrim(coalesce(v.question_text,''))='' THEN RAISE EXCEPTION 'Pertanyaan belum diisi.'; END IF;
  IF q.question_type IN ('PG_TUNGGAL','PGK_MA') THEN
   IF (SELECT count(*) FROM public.question_options WHERE question_version_id=v.id)<2 OR
    EXISTS(SELECT 1 FROM public.question_options WHERE question_version_id=v.id AND btrim(coalesce(option_text,''))='') OR
    (SELECT count(*) FROM public.question_options WHERE question_version_id=v.id AND is_correct)<1 OR
    (q.question_type='PG_TUNGGAL' AND (SELECT count(*) FROM public.question_options WHERE question_version_id=v.id AND is_correct)<>1)
   THEN RAISE EXCEPTION 'Pilihan dan kunci jawaban belum valid.'; END IF;
  ELSIF q.question_type='PGK_KATEGORI' THEN
   IF NOT EXISTS(SELECT 1 FROM public.question_category_items WHERE question_version_id=v.id) OR EXISTS(
   SELECT 1 FROM public.question_category_items c WHERE c.question_version_id=v.id AND (
   btrim(coalesce(c.item_text,''))='' OR btrim(coalesce(c.correct_category,''))='' OR NOT EXISTS(
   SELECT 1 FROM unnest(regexp_split_to_array(c.category_label,'\s*/\s*')) label WHERE btrim(label)=btrim(c.correct_category))))
   THEN RAISE EXCEPTION 'Pernyataan dan kunci kategori belum valid.'; END IF;
  ELSE RAISE EXCEPTION 'Jenis soal tidak didukung.'; END IF;
 END IF;
 target:=CASE p_action WHEN 'REVIEW' THEN 'PENDING_REVIEW' WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REQUEST_REVISION' THEN 'NEEDS_REVISION' WHEN 'PUBLISH' THEN 'PUBLISHED' END;
 IF p_action='PUBLISH' THEN
  UPDATE public.question_versions SET is_current=false,version_status=CASE WHEN version_status='PUBLISHED' THEN 'SUPERSEDED' ELSE version_status END WHERE question_id=q.id AND id<>v.id AND is_current;
  UPDATE public.question_versions SET version_status=target,is_current=true WHERE id=v.id;
  UPDATE public.questions SET question_status='PUBLISHED' WHERE id=q.id;
 ELSE
  UPDATE public.question_versions SET version_status=target WHERE id=v.id;
  -- Keep an existing published version available while reviewing its replacement.
  IF q.question_status<>'PUBLISHED' THEN UPDATE public.questions SET question_status=target WHERE id=q.id; END IF;
 END IF;
 INSERT INTO public.question_workflow_audit(question_id,question_version_id,actor_id,action,notes) VALUES(q.id,v.id,u,p_action,btrim(p_notes));
 INSERT INTO public.question_reviews(question_id,question_version_id,reviewer_id,review_action,review_notes)
 VALUES(q.id,v.id,u,CASE WHEN p_action IN ('REVIEW','PUBLISH') THEN 'COMMENT' ELSE p_action END,p_action||': '||btrim(p_notes));
 RETURN jsonb_build_object('success',true,'version_id',v.id,'version_status',target);
END $f$;
REVOKE ALL ON FUNCTION public.review_question_version(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_question_version(uuid,uuid,text,text) TO authenticated;

-- Moderators/publishers need answer keys too, but view-only access remains insufficient.
DROP POLICY IF EXISTS question_options_select_admin ON public.question_options;
CREATE POLICY question_options_select_admin ON public.question_options FOR SELECT TO authenticated USING (
 private.has_admin_permission('bank_soal.review') OR private.has_admin_permission('bank_soal.edit') OR private.has_admin_permission('bank_soal.moderate') OR private.has_admin_permission('bank_soal.publish'));
DROP POLICY IF EXISTS question_category_items_select_admin ON public.question_category_items;
CREATE POLICY question_category_items_select_admin ON public.question_category_items FOR SELECT TO authenticated USING (
 private.has_admin_permission('bank_soal.review') OR private.has_admin_permission('bank_soal.edit') OR private.has_admin_permission('bank_soal.moderate') OR private.has_admin_permission('bank_soal.publish'));
NOTIFY pgrst,'reload schema';
COMMIT;
