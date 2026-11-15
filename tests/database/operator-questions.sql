-- Executed in a savepoint owned by the guarded runner.
CREATE TEMP TABLE oq_context(k text PRIMARY KEY,v text);
GRANT SELECT,INSERT ON oq_context TO authenticated;
CREATE FUNCTION pg_temp.oq_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.oq_reject(sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN rejected:=true; END;
 PERFORM pg_temp.oq_assert(rejected,'Expected rejection');
END $$;
DO $$
DECLARE k text; u uuid;
BEGIN
 FOREACH k IN ARRAY ARRAY['full','import','view','disabled','unverified','super'] LOOP
  u:=gen_random_uuid();
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  VALUES(u,u::text||'@operator.invalid',CASE WHEN k<>'unverified' THEN now() END,
   jsonb_build_object('full_name','Operator fixture','registration_method','independent','education_level','sd'));
  INSERT INTO oq_context VALUES(k,u::text);
  INSERT INTO public.admin_operator_accounts(user_id,is_active) VALUES(u,k<>'disabled');
  INSERT INTO public.admin_operator_permissions(user_id,permission_code)
  SELECT u,p FROM unnest(ARRAY['bank_soal.view','bank_soal.review','bank_soal.edit','bank_soal.moderate','bank_soal.publish','bank_soal.import']) p
  WHERE k IN ('full','disabled','unverified') OR (k='view' AND p='bank_soal.view') OR (k='import' AND p='bank_soal.import');
 END LOOP;
 INSERT INTO public.user_global_roles(user_id,role) SELECT c.v::uuid,'super_admin' FROM oq_context c WHERE c.k='super';
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE payload jsonb; d jsonb; q uuid; v uuid; next_v uuid; fixture_key text;
BEGIN
 payload:='{"fileName":"operator-fixture","metadata":{"jenjang":"sd","kelas":6,"mata_pelajaran":"Matematika","hak_penggunaan":"ORISINAL"},"questions":[{"pertanyaan":"Berapakah satu tambah satu?","jenis_soal":"PG_TUNGGAL","options":[{"kode_respon":"A","teks_respon":"2","is_correct":true},{"kode_respon":"B","teks_respon":"3","is_correct":false}]}]}';
 FOREACH fixture_key IN ARRAY ARRAY['view','disabled','unverified'] LOOP
  PERFORM set_config('request.jwt.claim.sub',(SELECT c.v FROM oq_context c WHERE c.k=fixture_key),true);
  PERFORM pg_temp.oq_reject(format('SELECT public.save_ai_question_draft_batch(%L::jsonb)',payload));
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',(SELECT c.v FROM oq_context c WHERE c.k='import'),true);
 d:=public.save_ai_question_draft_batch(payload);
 PERFORM pg_temp.oq_assert((d->>'success')::boolean,'Import-only draft saved');
 INSERT INTO oq_context VALUES('batch',d->>'batch_id');
END $$;
RESET ROLE;
INSERT INTO oq_context SELECT 'question',id::text FROM public.questions WHERE import_batch_id=(SELECT v::uuid FROM oq_context WHERE k='batch');
INSERT INTO oq_context SELECT 'version',id::text FROM public.question_versions WHERE question_id=(SELECT v::uuid FROM oq_context WHERE k='question');
SET LOCAL ROLE authenticated;
DO $$
DECLARE q uuid:=(SELECT c.v::uuid FROM oq_context c WHERE c.k='question'); v uuid:=(SELECT c.v::uuid FROM oq_context c WHERE c.k='version'); fixture_key text; d jsonb;
BEGIN
 PERFORM pg_temp.oq_assert(q IS NOT NULL AND v IS NOT NULL,'Imported question exists');
 FOREACH fixture_key IN ARRAY ARRAY['import','view','disabled','unverified'] LOOP
  PERFORM set_config('request.jwt.claim.sub',(SELECT c.v FROM oq_context c WHERE c.k=fixture_key),true);
  PERFORM pg_temp.oq_reject(format('SELECT public.review_question_version(%L,%L,''PUBLISH'',''Fixture notes'')',q,v));
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',(SELECT c.v FROM oq_context c WHERE c.k='full'),true);
 PERFORM pg_temp.oq_reject(format('SELECT public.review_question_version(%L,%L,''PUBLISH'',''Fixture notes'')',q,v));
 PERFORM pg_temp.oq_reject(format('SELECT public.review_question_version(%L,%L,''APPROVE'',''Fixture notes'')',q,v));
 PERFORM public.review_question_version(q,v,'REVIEW','Isi dan kunci telah diperiksa.');
 PERFORM public.review_question_version(q,v,'APPROVE','Kualitas akademik disetujui.');
 PERFORM public.review_question_version(q,v,'PUBLISH','Versi siap digunakan siswa.');
 PERFORM pg_temp.oq_assert(EXISTS(SELECT 1 FROM public.questions WHERE id=q AND question_status='PUBLISHED'),'Question published');
 d:=public.save_question_revision(q,'{"question_text":"Revisi satu tambah satu?","options":[{"option_code":"A","option_text":"2","is_correct":true},{"option_code":"B","option_text":"3","is_correct":false}],"category_items":[]}');
 INSERT INTO oq_context VALUES('revision',d->>'version_id');
 PERFORM pg_temp.oq_assert(EXISTS(SELECT 1 FROM public.question_versions WHERE id=v AND is_current AND version_status='PUBLISHED'),'Revision preserves published current');
 PERFORM pg_temp.oq_reject(format('SELECT public.review_question_version(%L,%L,''PUBLISH'',''Fixture notes'')',q,v));
 PERFORM pg_temp.oq_reject('UPDATE public.questions SET question_status=''PUBLISHED''');
 PERFORM pg_temp.oq_reject('INSERT INTO public.question_workflow_audit DEFAULT VALUES');
END $$;
RESET ROLE;
UPDATE public.admin_operator_accounts SET is_active=false WHERE user_id=(SELECT v::uuid FROM oq_context WHERE k='full');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT v FROM oq_context WHERE k='full'),true);
SELECT pg_temp.oq_assert(NOT public.admin_has_permission('bank_soal.publish'),'Revoked operator fails closed');
SELECT pg_temp.oq_reject(format('SELECT public.review_question_version(%L,%L,''REVIEW'',''Fixture notes'')',(SELECT v FROM oq_context WHERE k='question'),(SELECT v FROM oq_context WHERE k='revision')));
SELECT set_config('request.jwt.claim.sub',(SELECT v FROM oq_context WHERE k='super'),true);
SELECT pg_temp.oq_assert(public.admin_has_permission('bank_soal.publish'),'Superadmin preserved');
RESET ROLE;
-- Invalid keys cannot be approved; repairing a revision still requires explicit approval/publication.
UPDATE public.question_options SET is_correct=false WHERE question_version_id=(SELECT v::uuid FROM oq_context WHERE k='revision');
SET LOCAL ROLE authenticated;
DO $$
DECLARE q uuid:=(SELECT c.v::uuid FROM oq_context c WHERE c.k='question');
 v uuid:=(SELECT c.v::uuid FROM oq_context c WHERE c.k='revision');
BEGIN
 PERFORM public.review_question_version(q,v,'REVIEW','Periksa kunci pada versi revisi.');
 PERFORM pg_temp.oq_reject(format('SELECT public.review_question_version(%L,%L,''APPROVE'',''Fixture notes'')',q,v));
END $$;
RESET ROLE;
UPDATE public.question_options SET is_correct=(option_code='A') WHERE question_version_id=(SELECT v::uuid FROM oq_context WHERE k='revision');
SET LOCAL ROLE authenticated;
DO $$
DECLARE q uuid:=(SELECT c.v::uuid FROM oq_context c WHERE c.k='question');
 v uuid:=(SELECT c.v::uuid FROM oq_context c WHERE c.k='revision');
BEGIN
 PERFORM public.review_question_version(q,v,'APPROVE','Kunci dan revisi telah diperiksa.');
 PERFORM public.review_question_version(q,v,'PUBLISH','Terbitkan revisi yang disetujui.');
 PERFORM pg_temp.oq_assert(EXISTS(SELECT 1 FROM public.question_versions WHERE id=v AND is_current AND version_status='PUBLISHED'),'Revision promoted');
 PERFORM pg_temp.oq_assert((SELECT count(*)=1 FROM public.question_versions WHERE question_id=q AND is_current),'Exactly one current version');
 PERFORM pg_temp.oq_assert(EXISTS(SELECT 1 FROM public.question_versions WHERE id=(SELECT c.v::uuid FROM oq_context c WHERE c.k='version') AND NOT is_current AND version_status='SUPERSEDED'),'Previous version retained');
END $$;
RESET ROLE;
