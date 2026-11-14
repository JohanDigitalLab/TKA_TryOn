-- Additional package, expiry and school regressions; rolled back with main fixtures.
CREATE TEMP TABLE learning_extended(user_id uuid,admin_id uuid,school_id uuid,class_id uuid,subject_one text,subject_two text,grade integer,package_id uuid,assignment_one uuid,assignment_two uuid);
GRANT SELECT,UPDATE ON learning_extended TO authenticated;
DO $$ DECLARE c learning_fixture%ROWTYPE; u uuid:=gen_random_uuid(); s text; sid uuid; cid uuid; st text; BEGIN
 SELECT * INTO c FROM learning_fixture;
 SELECT q.subject_name INTO s FROM public.questions q JOIN public.question_versions v ON v.question_id=q.id AND v.is_current
 WHERE q.grade=c.grade AND q.question_status='PUBLISHED' AND q.subject_name<>c.subject_name AND q.question_type IN('PG_TUNGGAL','PGK_MA','PGK_KATEGORI') LIMIT 1;
 IF s IS NULL THEN RAISE EXCEPTION 'Two published subjects required for package regression'; END IF;
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES(u,u::text||'@extended.invalid',clock_timestamp(),jsonb_build_object('registration_method','independent','education_level',CASE c.grade WHEN 6 THEN 'sd' ELSE 'smp' END,'full_name','Extended fixture'));
 INSERT INTO public.schools(name,created_by,status) VALUES('Access fixture school',c.admin_id,'active') RETURNING id INTO sid;
 INSERT INTO public.classes(school_id,name,education_level_id,grade) VALUES(sid,'Access fixture',CASE c.grade WHEN 6 THEN 'sd' ELSE 'smp' END,c.grade) RETURNING id INTO cid;
 INSERT INTO public.school_memberships(school_id,user_id,role,status) VALUES(sid,u,'student','active');
 SELECT id INTO st FROM public.school_types WHERE education_level_id=CASE c.grade WHEN 6 THEN 'sd' ELSE 'smp' END LIMIT 1;
 INSERT INTO public.student_academic_profiles(user_id,education_level_id,school_type_id,grade,school_id,class_id) VALUES(u,CASE c.grade WHEN 6 THEN 'sd' ELSE 'smp' END,st,c.grade,sid,cid);
 INSERT INTO learning_extended VALUES(u,c.admin_id,sid,cid,c.subject_name,s,c.grade,gen_random_uuid(),NULL,NULL);
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE c learning_extended%ROWTYPE; r jsonb; aid uuid; denied boolean; a1 uuid; a2 uuid; BEGIN
 SELECT * INTO c FROM learning_extended;
 PERFORM set_config('request.jwt.claim.sub',c.user_id::text,true);
 denied:=false;
 BEGIN PERFORM public.start_learning_attempt(c.package_id,'simulation',c.grade,ARRAY[c.subject_one,c.subject_two],c.subject_two,1,1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Subject order bypass'; END IF;
 r:=public.start_learning_attempt(c.package_id,'simulation',c.grade,ARRAY[c.subject_one,c.subject_two],c.subject_one,1,1);
 aid:=(r->>'attempt_id')::uuid;
 denied:=false;
 BEGIN PERFORM public.start_learning_attempt(c.package_id,'simulation',c.grade,ARRAY[c.subject_one,c.subject_two],c.subject_two,1,1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Parallel subject allowed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.learning_access_context()->'packages') p WHERE p->>'id'=c.package_id::text AND (p->>'current_subject_index')::integer=0) THEN RAISE EXCEPTION 'Active package unavailable'; END IF;
 PERFORM public.submit_exam_attempt(aid);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.learning_access_context()->'packages') p WHERE p->>'id'=c.package_id::text AND (p->>'current_subject_index')::integer=1) THEN RAISE EXCEPTION 'Next subject unavailable'; END IF;
 r:=public.start_learning_attempt(c.package_id,'simulation',c.grade,ARRAY[c.subject_one,c.subject_two],c.subject_two,1,1);
 PERFORM public.submit_exam_attempt((r->>'attempt_id')::uuid);
 -- Build assignments using the unchanged staff workflow.
 PERFORM set_config('request.jwt.claim.sub',c.admin_id::text,true);
 a1:=public.save_school_assignment(c.school_id,c.class_id,'Access first assignment',c.subject_one,1,1,now()-interval '1 minute',now()+interval '1 hour');
 a2:=public.save_school_assignment(c.school_id,c.class_id,'Access second assignment',c.subject_one,1,1,now()-interval '1 minute',now()+interval '1 hour');
 PERFORM public.set_school_assignment_status(a1,'published');
 PERFORM public.set_school_assignment_status(a2,'published');
 UPDATE learning_extended SET assignment_one=a1,assignment_two=a2;
 PERFORM set_config('request.jwt.claim.sub',c.user_id::text,true);
 denied:=false;
 BEGIN PERFORM public.start_school_assignment(a1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'School assignment bypassed simulation debit'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.admin_id::text,true);
 PERFORM public.learning_subscription_set(NULL,c.school_id,true,clock_timestamp()+interval '1 day',0,'School fixture activation');
 PERFORM set_config('request.jwt.claim.sub',c.user_id::text,true);
 IF NOT (public.learning_access_context()->>'subscribed')::boolean THEN RAISE EXCEPTION 'School subscription missing'; END IF;
 r:=public.start_school_assignment(a1);
 aid:=(r->>'attempt_id')::uuid;
 IF (public.start_school_assignment(a1)->>'attempt_id')::uuid<>aid THEN RAISE EXCEPTION 'School resume changed attempt'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE c learning_extended%ROWTYPE; BEGIN
 SELECT * INTO c FROM learning_extended;
 UPDATE public.learning_subscriptions SET expires_at=clock_timestamp()-interval '1 second' WHERE school_id=c.school_id;
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE c learning_extended%ROWTYPE; r jsonb; denied boolean; BEGIN
 SELECT * INTO c FROM learning_extended;
 PERFORM set_config('request.jwt.claim.sub',c.user_id::text,true);
 IF (public.learning_access_context()->>'subscribed')::boolean THEN RAISE EXCEPTION 'Expired school subscription still active'; END IF;
 r:=public.start_school_assignment(c.assignment_one);
 PERFORM public.submit_exam_attempt((r->>'attempt_id')::uuid);
 denied:=false;
 BEGIN PERFORM public.start_school_assignment(c.assignment_two); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Expired school subscription bypass'; END IF;
 PERFORM public.get_student_exam_history(20);
END $$;
RESET ROLE;
DO $$ DECLARE c learning_extended%ROWTYPE; BEGIN
 SELECT * INTO c FROM learning_extended;
 IF (SELECT count(*) FROM public.learning_trial_uses WHERE user_id=c.user_id AND mode='simulation')<>1 THEN RAISE EXCEPTION 'Multi-subject debited more than one trial'; END IF;
 IF (SELECT count(*) FROM public.learning_package_attempts WHERE package_id=c.package_id)<>2 THEN RAISE EXCEPTION 'Multi-subject mapping missing'; END IF;
END $$;
