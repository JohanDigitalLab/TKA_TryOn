-- Runner owns outer rollback. Never run fixtures in an autocommit session.
CREATE TEMP TABLE a02_test_ctx(admin_id uuid,reviewer_id uuid,student_id uuid,other_id uuid,taxonomy_id uuid,topic_id uuid,node_ids uuid[],blueprint_id uuid,question_id uuid,version_id uuid,attempt_id uuid);
GRANT SELECT,UPDATE ON a02_test_ctx TO authenticated;
DO $$ DECLARE a uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); denied boolean:=false;
BEGIN
 BEGIN INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(gen_random_uuid(),'invalid@a02.invalid','{"whatsapp_number":"+12025550123"}'); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Invalid signup WA accepted'; END IF;
 INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT id,id::text||'@a02.invalid',jsonb_build_object('whatsapp_number','081234567890','registration_method','independent','education_level','sd','full_name','A02 fixture') FROM unnest(ARRAY[a,r,s,o]) id;
 INSERT INTO public.user_global_roles(user_id,role) VALUES(a,'super_admin'),(r,'super_admin');
 INSERT INTO a02_test_ctx(admin_id,reviewer_id,student_id,other_id) VALUES(a,r,s,o);
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE c a02_test_ctx%ROWTYPE; result jsonb; denied boolean; rid uuid;
BEGIN
 SELECT * INTO c FROM a02_test_ctx;
 PERFORM set_config('request.jwt.claim.sub',c.student_id::text,true);
 result:=public.a02_profile('{"whatsapp_number":"6281234567890","whatsapp_consent":true}');
 IF result->>'whatsapp_number'<>'+6281234567890' OR (result->>'contact_verified')::boolean THEN RAISE EXCEPTION 'WA normalization/verification invalid'; END IF;
 denied:=false; BEGIN PERFORM public.a02_profile('{"whatsapp_verified":true}'); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Client verified contact'; END IF;
 denied:=false; BEGIN PERFORM public.a02_inventory(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Student inventory access'; END IF;
 denied:=false; BEGIN PERFORM public.a02_subscription_set(c.student_id,NULL,'active',NULL,0,'Forbidden'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Subscription escalation'; END IF;
 denied:=false; BEGIN PERFORM public.a02_start(gen_random_uuid(),true); EXCEPTION WHEN feature_not_supported THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Adaptive pretended supported'; END IF;
 rid:=public.a02_subscription_request();
 IF rid IS DISTINCT FROM public.a02_subscription_request() THEN RAISE EXCEPTION 'Request not idempotent'; END IF;
 IF (public.a02_subscription_context()->>'subscribed')::boolean THEN RAISE EXCEPTION 'Request granted entitlement'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.admin_id::text,true);
 IF jsonb_array_length(public.a02_inventory())<>4 THEN RAISE EXCEPTION 'Inventory groups invalid'; END IF;
 result:=public.a02_registry_mutate('taxonomy','{"code":"A02-TEST-SD-MATH","grade":6,"subject_name":"Matematika","source_code":"BSKAP-047-2025","pdf_pages":"13-15","status":"draft"}');
 UPDATE a02_test_ctx SET taxonomy_id=(result->>'id')::uuid;
END $$;
RESET ROLE;
-- Complete real-draft -> independent human approval -> strict allocation lifecycle.
SET LOCAL ROLE authenticated;
DO $$ DECLARE c a02_test_ctx%ROWTYPE; n jsonb; nodes uuid[]:='{}'; topic uuid; t uuid; b uuid; payload jsonb; res jsonb; vid uuid; qid uuid; aid uuid; denied boolean; d text;
BEGIN
 SELECT * INTO c FROM a02_test_ctx; t:=c.taxonomy_id;
 PERFORM set_config('request.jwt.claim.sub',c.admin_id::text,true);
 FOREACH d IN ARRAY ARRAY['math_domain','math_subdomain','competency','indicator','cognitive_level','topic'] LOOP
 n:=public.a02_registry_mutate('node',jsonb_build_object('taxonomy_id',t,'code',d,'dimension',d,'label','Fixture '||d,'pdf_pages','13-15','active',true));
 nodes:=array_append(nodes,(n->>'id')::uuid); IF d='topic' THEN topic:=(n->>'id')::uuid; END IF;
 END LOOP;
 PERFORM public.a02_registry_mutate('taxonomy',jsonb_build_object('id',t,'expected_revision',1,'status','active'));
 n:=public.a02_registry_mutate('blueprint',jsonb_build_object('code','A02-TEST-SIM','version',1,'taxonomy_id',t,'mode','simulation','total_questions',1,'duration_minutes',30,'topic_counts',jsonb_build_array(jsonb_build_object('topic_id',topic,'count',1)),'status','active','policy_kind','product'));
 b:=(n->>'id')::uuid;
 PERFORM set_config('request.jwt.claim.sub',c.student_id::text,true);
 denied:=false; BEGIN PERFORM public.a02_start(b); EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'A02_INVENTORY_SHORTAGE' THEN RAISE; END IF; denied:=true; END;
 IF NOT denied OR NOT(public.a02_subscription_context()->'trials'->>'simulation')::boolean THEN RAISE EXCEPTION 'Shortage consumed trial'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.admin_id::text,true);
 payload:=jsonb_build_object('metadata',jsonb_build_object('jenjang','SD','kelas','6','mata_pelajaran','Matematika'),'questions',jsonb_build_array(jsonb_build_object(
 'pertanyaan','Fixture 1 + 1 = ?','pembahasan','Satu ditambah satu adalah dua.','sumber_referensi','Fixture original test only','hak_penggunaan','ORISINAL','difficulty','MUDAH',
 'options',jsonb_build_array(jsonb_build_object('kode_respon','A','teks_respon','2','is_correct',true),jsonb_build_object('kode_respon','B','teks_respon','3','is_correct',false)),
 'classification',jsonb_build_object('taxonomy_id',t,'topic_id',topic,'node_ids',to_jsonb(nodes)))));
 res:=public.a02_import(payload); vid:=(res->'rows'->0->>'version_id')::uuid; qid:=(res->'rows'->0->>'question_id')::uuid;
 res:=public.a02_question_metadata(vid,1,'{"difficulty":"SEDANG"}');
 IF (res->>'classification_revision')::integer<>2 OR (public.a02_editorial_context(vid)->>'metadata_valid')::boolean THEN RAISE EXCEPTION 'Metadata invalidation/token failed'; END IF;
 denied:=false; BEGIN PERFORM public.a02_classify(vid,1,t,topic,nodes); EXCEPTION WHEN serialization_failure THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Stale metadata classification accepted'; END IF;
 PERFORM public.a02_classify(vid,2,t,topic,nodes);
 PERFORM public.a02_editorial(vid,'DRAFT',3,'submit','Ready for independent review');
 denied:=false; BEGIN PERFORM public.a02_editorial(vid,'PENDING_REVIEW',3,'approve','Self review forbidden'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Self approval accepted'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.reviewer_id::text,true);
 denied:=false; BEGIN PERFORM public.a02_editorial(vid,'DRAFT',1,'approve','Stale status'); EXCEPTION WHEN serialization_failure THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Stale review accepted'; END IF;
 PERFORM public.a02_editorial(vid,'PENDING_REVIEW',3,'approve','Independent review complete');
 PERFORM public.a02_editorial(vid,'APPROVED',3,'publish','Publish reviewed exact version');
 denied:=false; BEGIN PERFORM public.a02_classify(vid,1,t,topic,nodes); EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Published classification changed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.student_id::text,true);
 res:=public.a02_start(b); aid:=(res->>'attempt_id')::uuid;
 IF aid IS NULL OR jsonb_array_length(res->'questions')<>1 OR res::text LIKE '%is_correct%' THEN RAISE EXCEPTION 'Start/key projection invalid'; END IF;
 IF public.a02_start(b)->>'attempt_id' IS DISTINCT FROM aid::text THEN RAISE EXCEPTION 'Resume charged/replaced session'; END IF;
 denied:=false; BEGIN PERFORM public.get_exam_attempt_review(aid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Review available before submission'; END IF;
 PERFORM public.save_exam_answer(aid,qid,'{"option_codes":["A"],"category_answers":{}}');
 PERFORM public.submit_exam_attempt(aid);
 res:=public.get_exam_attempt_review(aid);
 IF res->'questions'->0->'classification'->>'provenance'<>'version_snapshot' OR res->>'mode'<>'simulation' THEN RAISE EXCEPTION 'Historical classification missing'; END IF;
 IF public.get_student_exam_history()->0->>'mode'<>'simulation' THEN RAISE EXCEPTION 'History mode missing'; END IF;
 denied:=false; BEGIN PERFORM public.a02_start(b); EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'A02_TRIAL_EXHAUSTED' THEN RAISE; END IF; denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Trial reused'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.admin_id::text,true);
 PERFORM public.a02_subscription_set(c.student_id,NULL,'active',now()+interval '1 day',0,'Fixture subscriber');
 PERFORM set_config('request.jwt.claim.sub',c.student_id::text,true);
 PERFORM public.a02_start(b);
 UPDATE a02_test_ctx SET topic_id=topic,node_ids=nodes,blueprint_id=b,question_id=qid,version_id=vid,attempt_id=aid;
END $$;
RESET ROLE;
DO $$ DECLARE c a02_test_ctx%ROWTYPE; denied boolean;
BEGIN
 SELECT * INTO c FROM a02_test_ctx;
 IF (SELECT count(*) FROM public.a02_trial_uses WHERE user_id=c.student_id AND mode='simulation')<>1 THEN RAISE EXCEPTION 'Trial uniqueness failed'; END IF;
 denied:=false; BEGIN UPDATE public.question_versions SET question_text='tamper' WHERE id=c.version_id; EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Historical text changed'; END IF;
 denied:=false; BEGIN INSERT INTO public.question_options(question_version_id,option_code,option_text,is_correct) VALUES(c.version_id,'Z','Tamper',false); EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Historical option inserted'; END IF;
 denied:=false; BEGIN UPDATE public.a02_attempt_metadata SET snapshot='{}' WHERE attempt_id=c.attempt_id; EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Attempt snapshot changed'; END IF;
END $$;
-- School authorization and valid-answer aggregation, including ignored unanswered attempts.
CREATE TEMP TABLE a02_school_ctx(school_id uuid,other_school_id uuid,teacher_id uuid,school_attempt uuid);
GRANT SELECT ON a02_school_ctx TO authenticated;
DO $$ DECLARE c a02_test_ctx%ROWTYPE; sid uuid; other_sid uuid; aid uuid; ignored uuid;
BEGIN
 SELECT * INTO c FROM a02_test_ctx;
 INSERT INTO public.schools(name,created_by,status) VALUES('A02 scope fixture',c.admin_id,'active') RETURNING id INTO sid;
 INSERT INTO public.schools(name,created_by,status) VALUES('A02 other fixture',c.admin_id,'active') RETURNING id INTO other_sid;
 INSERT INTO public.school_memberships(school_id,user_id,role,status) VALUES(sid,c.student_id,'student','active'),(sid,c.reviewer_id,'teacher','active');
 INSERT INTO public.exam_attempts(user_id,education_level,grade,subject_name,duration_minutes,total_questions,attempt_status,submitted_at) VALUES(c.student_id,'SD',6,'Matematika',30,1,'SUBMITTED',now()+interval '1 second') RETURNING id INTO aid;
 INSERT INTO public.exam_attempt_questions(attempt_id,question_id,question_version_id,question_order) VALUES(aid,c.question_id,c.version_id,1);
 INSERT INTO public.exam_attempt_answers(attempt_id,question_id,answer_payload) VALUES(aid,c.question_id,'{"option_codes":["A"],"category_answers":{}}');
 INSERT INTO public.a02_attempt_context(attempt_id,mode,school_id,config_snapshot) VALUES(aid,'school',sid,'{}');
 INSERT INTO public.a02_attempt_metadata(attempt_id,question_id,version_id,snapshot) SELECT aid,c.question_id,c.version_id,snapshot FROM public.a02_classifications WHERE version_id=c.version_id;
 INSERT INTO public.exam_attempts(user_id,education_level,grade,subject_name,duration_minutes,total_questions,attempt_status,submitted_at) VALUES(c.student_id,'SD',6,'Matematika',30,1,'SUBMITTED',now()+interval '1 second') RETURNING id INTO ignored;
 INSERT INTO public.exam_attempt_questions(attempt_id,question_id,question_version_id,question_order) VALUES(ignored,c.question_id,c.version_id,1);
 INSERT INTO public.a02_attempt_context(attempt_id,mode,school_id,config_snapshot) VALUES(ignored,'school',sid,'{}');
 INSERT INTO a02_school_ctx VALUES(sid,other_sid,c.reviewer_id,aid);
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE c a02_test_ctx%ROWTYPE; s a02_school_ctx%ROWTYPE; res jsonb; denied boolean; b uuid; aid uuid;
BEGIN
 SELECT * INTO c FROM a02_test_ctx; SELECT * INTO s FROM a02_school_ctx;
 PERFORM set_config('request.jwt.claim.sub',s.teacher_id::text,true);
 res:=public.a02_evaluation(s.school_id,6);
 IF (res->'topics'->0->>'answered')::integer<>1 OR (res->>'top5_average')::numeric<>100 OR (res->'students'->0->>'attempts')::integer<>1 THEN RAISE EXCEPTION 'Evaluation counted unanswered/incorrect scope'; END IF;
 IF res::text LIKE '%option_codes%' OR res::text LIKE '%@%' THEN RAISE EXCEPTION 'Evaluation payload/directory leak'; END IF;
 denied:=false; BEGIN PERFORM public.a02_evaluation(s.other_school_id,6); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Staff cross-school evaluation'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.student_id::text,true);
 res:=public.a02_evaluation(s.school_id,6);
 IF res->>'scope'<>'self' OR res->'top5'<>'[]'::jsonb OR res->'students'<>'[]'::jsonb THEN RAISE EXCEPTION 'Student school directory'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.other_id::text,true);
 denied:=false; BEGIN PERFORM public.a02_evaluation(s.school_id,6); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Outsider school evaluation'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.admin_id::text,true);
 PERFORM public.a02_business_config('{"legacy_start_enforcement":true}',1);
 PERFORM set_config('request.jwt.claim.sub',c.student_id::text,true);
 -- Existing in-progress subscriber session resumes even after contact/entitlement changes.
 aid:=(public.a02_start(c.blueprint_id)->>'attempt_id')::uuid;
 PERFORM public.a02_profile('{"whatsapp_consent":false}');
 IF public.start_exam_attempt(6,'Matematika',1,30)->>'attempt_id' IS DISTINCT FROM aid::text THEN RAISE EXCEPTION 'Rollout blocked resume'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.other_id::text,true);
 denied:=false; BEGIN PERFORM public.start_exam_attempt(6,'Matematika',1,30); EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'A02_CONFIGURED_START_REQUIRED' THEN RAISE; END IF; denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Rollout legacy bypass'; END IF;
 PERFORM public.a02_profile('{"whatsapp_consent":true}');
 PERFORM set_config('request.jwt.claim.sub',c.admin_id::text,true);
 res:=public.a02_registry_mutate('blueprint',jsonb_build_object('code','A02-TEST-MISSION','version',1,'taxonomy_id',c.taxonomy_id,'mode','mission','total_questions',1,'duration_minutes',10,'topic_counts',jsonb_build_array(jsonb_build_object('topic_id',c.topic_id,'count',1)),'status','active','policy_kind','product'));
 b:=(res->>'id')::uuid;
 PERFORM set_config('request.jwt.claim.sub',c.other_id::text,true);
 aid:=(public.a02_start(b)->>'attempt_id')::uuid; PERFORM public.submit_exam_attempt(aid);
 res:=public.a02_subscription_context();
 IF (res->'trials'->>'mission')::boolean OR NOT(res->'trials'->>'simulation')::boolean THEN RAISE EXCEPTION 'Trial modes not independent'; END IF;
END $$;
RESET ROLE;
-- Guarded school starts require institution entitlement, never an individual subscription.
CREATE TEMP TABLE a02_assignment_ctx(id uuid);
GRANT SELECT ON a02_assignment_ctx TO authenticated;
DO $$ DECLARE c a02_test_ctx%ROWTYPE; s a02_school_ctx%ROWTYPE; cid uuid; aid uuid;
BEGIN
 SELECT * INTO c FROM a02_test_ctx; SELECT * INTO s FROM a02_school_ctx;
 INSERT INTO public.classes(school_id,name,education_level_id,grade) VALUES(s.school_id,'A02 class','sd',6) RETURNING id INTO cid;
 INSERT INTO public.school_assignments(school_id,class_id,created_by,title,subject_name,grade,question_count,duration_minutes,opens_at,due_at,status)
 VALUES(s.school_id,cid,c.reviewer_id,'A02 guarded school','Matematika',6,1,10,now()-interval '1 minute',now()+interval '1 day','published') RETURNING id INTO aid;
 INSERT INTO public.school_assignment_questions(assignment_id,question_id,question_version_id,question_order) VALUES(aid,c.question_id,c.version_id,1);
 INSERT INTO public.school_assignment_recipients(assignment_id,user_id) VALUES(aid,c.student_id);
 INSERT INTO a02_assignment_ctx VALUES(aid);
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE c a02_test_ctx%ROWTYPE; s a02_school_ctx%ROWTYPE; assignment uuid; aid uuid; res jsonb; denied boolean:=false;
BEGIN
 SELECT * INTO c FROM a02_test_ctx; SELECT * INTO s FROM a02_school_ctx; SELECT id INTO assignment FROM a02_assignment_ctx;
 PERFORM set_config('request.jwt.claim.sub',c.student_id::text,true);
 aid:=(public.start_exam_attempt(6,'Matematika',1,30)->>'attempt_id')::uuid;
 PERFORM public.submit_exam_attempt(aid);
 PERFORM public.a02_profile('{"whatsapp_consent":true}');
 BEGIN PERFORM public.start_school_assignment(assignment); EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'A02_SCHOOL_SUBSCRIPTION_REQUIRED' THEN RAISE; END IF; denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Individual subscription bypassed school entitlement'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.admin_id::text,true);
 PERFORM public.a02_subscription_set(NULL,s.school_id,'active',NULL,0,'School entitlement fixture');
 PERFORM set_config('request.jwt.claim.sub',c.student_id::text,true);
 aid:=(public.start_school_assignment(assignment)->>'attempt_id')::uuid;
 PERFORM public.a02_profile('{"whatsapp_consent":false}');
 PERFORM set_config('request.jwt.claim.sub',c.admin_id::text,true);
 PERFORM public.a02_subscription_set(NULL,s.school_id,'inactive',NULL,1,'Disable after start fixture');
 PERFORM set_config('request.jwt.claim.sub',c.student_id::text,true);
 IF public.start_school_assignment(assignment)->>'attempt_id' IS DISTINCT FROM aid::text THEN RAISE EXCEPTION 'School resume rechecked entitlement/contact'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.a02_trial_uses WHERE user_id=(SELECT student_id FROM a02_test_ctx))<>1 THEN RAISE EXCEPTION 'School start debited trial'; END IF;
END $$;
