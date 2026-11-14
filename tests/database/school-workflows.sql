-- Selalu dijalankan di SAVEPOINT oleh runner, fixture tidak pernah di-commit.
CREATE TEMP TABLE workflow_test_context(admin_id uuid,teacher_id uuid,student_id uuid,outsider_id uuid,school_id uuid,other_school_id uuid,class_id uuid,assignment_id uuid,subject_name text,grade integer);
GRANT SELECT,UPDATE ON workflow_test_context TO authenticated;
DO $$
DECLARE admin_id uuid:=gen_random_uuid(); teacher_id uuid:=gen_random_uuid(); student_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid();
  school_id uuid; other_school_id uuid; class_id uuid; subject_name text; grade integer; level_id text; school_type text;
BEGIN
  SELECT q.subject_name,q.grade INTO subject_name,grade FROM public.questions q JOIN public.question_versions v ON v.question_id=q.id AND v.is_current
    WHERE q.grade IN(6,9) AND q.question_status='PUBLISHED' AND q.question_type IN('PG_TUNGGAL','PGK_MA','PGK_KATEGORI') LIMIT 1;
  IF grade IS NULL THEN RAISE EXCEPTION 'Test membutuhkan minimal satu soal terbit kelas 6/9.'; END IF;
  SELECT st.id,st.education_level_id INTO school_type,level_id FROM public.school_types st
    WHERE lower(st.education_level_id)=CASE grade WHEN 6 THEN 'sd' ELSE 'smp' END LIMIT 1;
  IF school_type IS NULL THEN RAISE EXCEPTION 'School type SD/SMP tidak ditemukan.'; END IF;
  INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT id,id::text||'@workflow.invalid',jsonb_build_object('registration_method','independent','education_level',CASE grade WHEN 6 THEN 'sd' ELSE 'smp' END,'full_name','Workflow fixture')
    FROM unnest(ARRAY[admin_id,teacher_id,student_id,outsider_id]) id;
  INSERT INTO public.schools(name,created_by) VALUES('Workflow fixture',admin_id) RETURNING id INTO school_id;
  INSERT INTO public.schools(name,created_by) VALUES('Other workflow fixture',outsider_id) RETURNING id INTO other_school_id;
  INSERT INTO public.school_memberships(school_id,user_id,role,status) VALUES(school_id,teacher_id,'teacher','active'),(school_id,student_id,'student','active');
  INSERT INTO public.classes(school_id,name,education_level_id,grade) VALUES(school_id,'Workflow fixture',level_id,grade) RETURNING id INTO class_id;
  INSERT INTO public.student_academic_profiles(user_id,education_level_id,school_type_id,grade,school_id,class_id)
    VALUES(student_id,level_id,school_type,grade,school_id,class_id);
  INSERT INTO workflow_test_context VALUES(admin_id,teacher_id,student_id,outsider_id,school_id,other_school_id,class_id,NULL,subject_name,grade);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE c workflow_test_context%ROWTYPE; v_assignment_id uuid; result jsonb; started jsonb; resumed jsonb; denied boolean;
BEGIN
  SELECT * INTO c FROM workflow_test_context;
  PERFORM set_config('request.jwt.claim.sub',c.teacher_id::text,true);
  PERFORM public.get_teacher_workspace(c.school_id);
  denied:=false;
  BEGIN PERFORM public.get_teacher_workspace(c.other_school_id); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Cross-school workspace leak'; END IF;
  v_assignment_id:=public.save_school_assignment(c.school_id,c.class_id,'Fixture assignment',c.subject_name,1,1,now()-interval '1 minute',now()+interval '1 hour');
  UPDATE workflow_test_context SET assignment_id=v_assignment_id;
  PERFORM public.set_school_assignment_status(v_assignment_id,'published');
  PERFORM public.set_school_assignment_status(v_assignment_id,'published');
  result:=public.get_teacher_workspace(c.school_id);
  IF (result->'assignments'->0->>'recipients')::integer<>1 THEN RAISE EXCEPTION 'Recipient snapshot invalid'; END IF;
  denied:=false;
  BEGIN PERFORM public.save_school_assignment(c.school_id,c.class_id,'Changed assignment',c.subject_name,1,1,now(),now()+interval '1 hour',v_assignment_id,now());
    EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Published assignment editable'; END IF;
  PERFORM set_config('request.jwt.claim.sub',c.outsider_id::text,true);
  denied:=false;
  BEGIN PERFORM public.get_school_assignment_ranking(v_assignment_id); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Ranking cross-school leak'; END IF;
  denied:=false;
  BEGIN PERFORM public.start_school_assignment(v_assignment_id); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Non-recipient allowed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',c.student_id::text,true);
  result:=public.get_student_assignments();
  IF jsonb_array_length(result)<>1 THEN RAISE EXCEPTION 'Student assignment visibility invalid'; END IF;
  denied:=false;
  BEGIN PERFORM public.get_teacher_workspace(c.school_id); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Student staff escalation'; END IF;
  denied:=false;
  BEGIN EXECUTE 'SELECT * FROM public.school_assignment_questions'; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Snapshot exposed directly'; END IF;
  started:=public.start_school_assignment(v_assignment_id);
  resumed:=public.start_school_assignment(v_assignment_id);
  IF started->>'attempt_id'<>resumed->>'attempt_id' THEN RAISE EXCEPTION 'Start not idempotent'; END IF;
  IF jsonb_array_length(started->'questions')<>1 THEN RAISE EXCEPTION 'Question snapshot missing'; END IF;
  IF (started->'questions'->0->'options'->0) ? 'is_correct' THEN RAISE EXCEPTION 'Answer key leaked'; END IF;
  result:=public.submit_exam_attempt((started->>'attempt_id')::uuid);
  IF result->>'status'<>'SUBMITTED' THEN RAISE EXCEPTION 'Submit failed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',c.teacher_id::text,true);
  result:=public.get_school_assignment_ranking(v_assignment_id);
  IF jsonb_array_length(result)<>1 OR (result->0->>'score')::numeric<>0 THEN RAISE EXCEPTION 'Ranking invalid'; END IF;
  PERFORM public.set_school_assignment_status(v_assignment_id,'cancelled');
  result:=public.get_school_assignment_ranking(v_assignment_id);
  IF jsonb_array_length(result)<>1 THEN RAISE EXCEPTION 'Cancellation erased history'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  denied:=false;
  BEGIN PERFORM public.get_student_assignments(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Unauthenticated read allowed'; END IF;
END $$;
RESET ROLE;
