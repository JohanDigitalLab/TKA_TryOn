-- All users, imports, dependencies and archive actions are rolled back by the runner.
CREATE TEMP TABLE qa_context(k text PRIMARY KEY,v text);
GRANT SELECT,INSERT ON qa_context TO authenticated;
CREATE FUNCTION pg_temp.qa_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.qa_reject(sql text,expected_code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected_code THEN RAISE; END IF;
  rejected:=true;
 END;
 PERFORM pg_temp.qa_assert(rejected,'Expected rejection: '||expected_code);
END $$;
DO $$ DECLARE k text; u uuid; BEGIN
 FOREACH k IN ARRAY ARRAY['full','view','disabled','unverified','super'] LOOP
  u:=gen_random_uuid();
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  VALUES(u,u::text||'@archive.invalid',CASE WHEN k<>'unverified' THEN now() END,
   jsonb_build_object('full_name','Archive fixture','registration_method','independent','education_level','sd'));
  INSERT INTO qa_context VALUES(k,u::text);
  INSERT INTO public.admin_operator_accounts(user_id,is_active) VALUES(u,k<>'disabled');
  INSERT INTO public.admin_operator_permissions(user_id,permission_code)
  SELECT u,p FROM unnest(ARRAY['bank_soal.view','bank_soal.import','bank_soal.archive']) p
  WHERE k IN ('full','disabled','unverified') OR (k='view' AND p='bank_soal.view');
 END LOOP;
 INSERT INTO public.user_global_roles(user_id,role) SELECT c.v::uuid,'super_admin' FROM qa_context c WHERE c.k='super';
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT v FROM qa_context WHERE k='full'),true);
DO $$ DECLARE d jsonb; BEGIN
 d:=public.save_ai_question_draft_batch('{"fileName":"archive-fixture","metadata":{"jenjang":"sd","kelas":6,"mata_pelajaran":"Matematika","hak_penggunaan":"ORISINAL"},"questions":[{"pertanyaan":"Archive fixture satu tambah satu?","jenis_soal":"PG_TUNGGAL","options":[{"kode_respon":"A","teks_respon":"2","is_correct":true},{"kode_respon":"B","teks_respon":"3","is_correct":false}]}]}');
 INSERT INTO qa_context VALUES('batch',d->>'batch_id');
END $$;
RESET ROLE;
INSERT INTO qa_context SELECT 'question',id::text FROM public.questions WHERE import_batch_id=(SELECT v::uuid FROM qa_context WHERE k='batch');
INSERT INTO qa_context SELECT 'version',id::text FROM public.question_versions WHERE question_id=(SELECT v::uuid FROM qa_context WHERE k='question');
INSERT INTO qa_context SELECT 'status',question_status FROM public.questions WHERE id=(SELECT v::uuid FROM qa_context WHERE k='question');
INSERT INTO qa_context SELECT 'versions_before',md5(string_agg(to_jsonb(v)::text,'' ORDER BY id)) FROM public.question_versions v WHERE question_id=(SELECT c.v::uuid FROM qa_context c WHERE k='question');
SET LOCAL ROLE authenticated;
DO $$ DECLARE fixture_key text; q uuid:=(SELECT v::uuid FROM qa_context WHERE k='question'); version uuid:=(SELECT v::uuid FROM qa_context WHERE k='version'); s text:=(SELECT v FROM qa_context WHERE k='status'); d jsonb; BEGIN
 FOREACH fixture_key IN ARRAY ARRAY['view','disabled','unverified'] LOOP
  PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM qa_context WHERE qa_context.k=fixture_key),true);
  PERFORM pg_temp.qa_reject(format('SELECT public.archive_question(%L,%L,%L,''Alasan fixture'')',q,s,version),'42501');
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM qa_context WHERE qa_context.k='full'),true);
 PERFORM pg_temp.qa_reject(format('SELECT public.archive_question(%L,%L,%L,''x'')',q,s,version),'22023');
 PERFORM pg_temp.qa_reject(format('SELECT public.archive_question(%L,''PUBLISHED'',%L,''Alasan fixture'')',q,version),'40001');
 PERFORM pg_temp.qa_reject(format('SELECT public.archive_question(%L,%L,%L,''Alasan fixture'')',q,s,gen_random_uuid()),'40001');
 PERFORM pg_temp.qa_reject('UPDATE public.questions SET question_status=''ARCHIVED''','42501');
 PERFORM pg_temp.qa_reject('INSERT INTO public.question_archive_audit DEFAULT VALUES','42501');
 d:=public.archive_question(q,s,version,'Soal fixture tidak lagi digunakan.');
 PERFORM pg_temp.qa_assert((d->>'success')::boolean AND d->>'question_status'='ARCHIVED','Archive succeeded');
 PERFORM pg_temp.qa_reject(format('SELECT public.archive_question(%L,%L,%L,''Alasan fixture'')',q,s,version),'22023');
 PERFORM pg_temp.qa_assert((SELECT count(*)=1 FROM public.question_archive_audit WHERE question_id=q),'One audit receipt');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM qa_context WHERE qa_context.k='view'),true);
 PERFORM pg_temp.qa_assert((SELECT count(*)=0 FROM public.question_archive_audit WHERE question_id=q),'Audit hidden from view-only operator');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM qa_context WHERE qa_context.k='super'),true);
 PERFORM pg_temp.qa_assert(public.admin_has_permission('bank_soal.archive'),'Superadmin has archive permission');
END $$;
RESET ROLE;
SELECT pg_temp.qa_assert((SELECT md5(string_agg(to_jsonb(v)::text,'' ORDER BY id)) FROM public.question_versions v WHERE question_id=(SELECT c.v::uuid FROM qa_context c WHERE k='question'))=(SELECT v FROM qa_context WHERE k='versions_before'),'Versions unchanged');
SELECT pg_temp.qa_reject(format('UPDATE public.questions SET question_status=''PUBLISHED'' WHERE id=%L',(SELECT v FROM qa_context WHERE k='question')),'23514');
SELECT pg_temp.qa_reject(format('INSERT INTO public.question_versions SELECT (jsonb_populate_record(NULL::public.question_versions,to_jsonb(v)||jsonb_build_object(''id'',gen_random_uuid(),''version_number'',version_number+1,''is_current'',false))).* FROM public.question_versions v WHERE id=%L',(SELECT v FROM qa_context WHERE k='version')),'23514');
-- Triggers reject new use before NOT NULL/FK checks, without inserting history.
SELECT pg_temp.qa_reject(format('INSERT INTO public.exam_attempt_questions(question_id) VALUES(%L)',(SELECT v FROM qa_context WHERE k='question')),'23514');
SELECT pg_temp.qa_reject(format('INSERT INTO public.exam_attempt_answers(question_id) VALUES(%L)',(SELECT v FROM qa_context WHERE k='question')),'23514');
SELECT pg_temp.qa_reject(format('INSERT INTO public.school_assignment_questions(question_id) VALUES(%L)',(SELECT v FROM qa_context WHERE k='question')),'23514');
-- A real existing attempt dependency must be rejected, even for superadmins.
SELECT set_config('request.jwt.claim.sub',(SELECT v FROM qa_context WHERE k='super'),true);
DO $$ DECLARE q record; BEGIN
 SELECT x.id,x.question_status,v.id version INTO q FROM public.questions x
 JOIN LATERAL (SELECT id FROM public.question_versions WHERE question_id=x.id ORDER BY version_number DESC LIMIT 1) v ON true
 WHERE x.question_status<>'ARCHIVED' AND EXISTS(SELECT 1 FROM public.exam_attempt_questions e WHERE e.question_id=x.id) LIMIT 1;
 IF FOUND THEN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.qa_reject(format('SELECT public.archive_question(%L,%L,%L,''Soal masih digunakan'')',q.id,q.question_status,q.version),'23503');
  RESET ROLE;
 ELSE RAISE EXCEPTION 'Dependency fixture unavailable; test must not silently skip'; END IF;
END $$;
RESET ROLE;
