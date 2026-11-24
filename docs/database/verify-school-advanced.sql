-- Read-only catalog checks, caller privileges only (security invoker; no function installed).
-- Run manually AFTER successful install. Every ok must be true. No auth spoofing.
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
WITH expected(signature,body_md5,authenticated_exec) AS (VALUES
('private.school_assignment_access(uuid,uuid)','0b5366c3897e6dbd295d9549bd0a6a2a',false),
('private.school_assignment_deadline(uuid)','16be7f19299cb7feafa68551de1afb30',false),
('private.learning_legacy_assignment(uuid)','b59553898e52ebeacac102ac58f27198',false),
('private.resume_school_assignment(uuid)','a3e53fec3017f70c2d19aa206122d9a9',false),
('public.save_exam_answer(uuid,uuid,jsonb)','dd916c5c2b1c8dc11ddf12fac2a40150',true),
('public.submit_exam_attempt(uuid)','31f968e89a122b39c96abfd54ad14ed0',true),
('private.school_advanced_scope(uuid,uuid,text[])','8537e27ee6195f8380cd115c60e9e89b',false),
('private.require_school_staff(uuid)','e8d240514619e72cf2316646c645fce4',false),
('public.create_school_schedule(uuid,text,text,timestamptz,timestamptz,uuid[])','c5d9dbf41555fd1eca67684fcea0b0ef',true),
('public.set_school_schedule_status(uuid,text,bigint)','fe7c83acc3646a8f6d24a821a7b57614',true),
('private.school_schedule_access(uuid)','0517ff01d2457813366aa17a4d452202',false),
('private.school_schedule_deadline(uuid)','e450dcc1a96df747b3f161f7bc0724c6',false),
('public.start_school_schedule(uuid)','671ce336239407a6efddacaf3c9ab6f6',true),
('public.get_school_schedule_agenda(uuid)','5008c3f79ab46502edae6f4d3bc98669',true),
('public.get_school_schedule_participants(uuid,integer,integer)','c09da4896e2566d124afb825dc8355cf',true),
('private.school_agenda_freeze()','9f744ff8c3c923586e0e2cb260db8db1',false),
('private.school_agenda_content_freeze()','088216dc3a83d3b8137b0628ba8817c8',false),
('private.learning_legacy_start(integer,text,integer,integer)','dd9c0876f423c4377bc399feee7b1ab7',false),
('public.get_teacher_workspace(uuid)','c8557b2760f48d3b8d8693c7268cfba7',true),
('public.save_school_assignment(uuid,uuid,text,text,integer,integer,timestamp with time zone,timestamp with time zone,uuid,timestamp with time zone)','ecd5b28303b44eb307753c637e13ce96',true),
('public.set_school_assignment_status(uuid,text)','e335677f72bf404e406a003dbfd373f4',true),
('public.get_school_assignment_ranking(uuid)','89191394b1bd1fbb8c186843ea78ded5',true),
('public.get_student_assignments()','b10aa25d6d2533440cb68d93af13d51f',true),
('private.resume_tka_tryout(uuid)','35f19c4cd144fc1227f2da1fab169db7',false),
('public.start_tka_tryout(text)','66463c58a5dfed7e5a43867a3ef0bfd0',true),
('public.school_advanced_capabilities(uuid)','34ced777ebf464376df87109d032041c',true)
)
SELECT e.signature, p.oid IS NOT NULL AND p.prosecdef
 AND p.proconfig @> ARRAY['search_path=pg_catalog']
 AND md5(p.prosrc)=e.body_md5
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND has_function_privilege('authenticated',p.oid,'EXECUTE')=e.authenticated_exec
 AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS ok,
 pg_get_function_arguments(p.oid) AS arguments,pg_get_function_result(p.oid) AS result,pg_get_userbyid(p.proowner) AS owner
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);
SELECT c.conname,c.convalidated,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c WHERE c.conname IN ('school_blockers_schedule_school_fk','school_blockers_schedule_recipient_unique','school_blockers_recipient_schedule_fk','school_blockers_recipient_user_fk','school_blockers_assignment_class_school_fk','school_blockers_profile_school_fk','school_agenda_one_attempt','school_agenda_participant_fk','school_agenda_attempt_type') ORDER BY c.conname;
-- Expect 9 named constraints; five blocker FKs + two agenda checks/FKs remain NOT VALID.
WITH expected(relation) AS (VALUES ('public.schools'),('public.profiles'),('public.classes'),('public.school_memberships'),('public.student_academic_profiles'),('public.school_assignments'),('public.school_assignment_questions'),('public.school_assignment_recipients'),('public.scheduled_tryouts'),('public.scheduled_tryout_users'),('public.exam_attempts'),('public.exam_attempt_questions'),('public.exam_attempt_answers'),('public.tka_configurations'),('public.tka_question_set'),('public.questions'),('public.question_versions'),('public.question_options'),('public.question_category_items'),('public.question_stimuli'))
SELECT e.relation,coalesce(c.relrowsecurity,false) AS ok,c.relforcerowsecurity,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_select,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select
FROM expected e LEFT JOIN pg_class c ON c.oid=to_regclass(e.relation);
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('schools','profiles','classes','school_memberships','student_academic_profiles','school_assignments','school_assignment_questions','school_assignment_recipients','scheduled_tryouts','scheduled_tryout_users','exam_attempts','exam_attempt_questions','exam_attempt_answers','tka_configurations','tka_question_set','questions','question_versions','question_options','question_category_items','question_stimuli') ORDER BY tablename,policyname;
SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND t.tgname LIKE 'school_agenda_%' ORDER BY c.relname,t.tgname;
-- Existing dispatchers/ACL remain pinned by deployment preflight; x aliases must remain closed.
SELECT p.oid::regprocedure AS signature,NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AS ok FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('xget_teacher_workspace','xsave_school_assignment','xset_school_assignment_status','xget_school_assignment_ranking');

-- Structural checks: exact local/referenced keys, validation state, no cascading FK actions.
WITH expected(relation,name,kind,keys,target,target_keys,validated) AS (VALUES ('public.scheduled_tryouts','school_blockers_schedule_school_fk','f','school_uid','public.schools','id',false),
('public.scheduled_tryout_users','school_blockers_schedule_recipient_unique','u','scheduled_tryouts,user_id',NULL,NULL,true),
('public.scheduled_tryout_users','school_blockers_recipient_schedule_fk','f','scheduled_tryouts','public.scheduled_tryouts','id',false),
('public.scheduled_tryout_users','school_blockers_recipient_user_fk','f','user_id','auth.users','id',false),
('public.school_assignments','school_blockers_assignment_class_school_fk','f','class_id,school_id','public.classes','id,school_id',false),
('public.profiles','school_blockers_profile_school_fk','f','school_id','public.schools','id',false),
('public.exam_attempts','school_agenda_one_attempt','u','scheduled_tryout_id,user_id',NULL,NULL,true),
('public.exam_attempts','school_agenda_participant_fk','f','scheduled_tryout_id,user_id','public.scheduled_tryout_users','scheduled_tryouts,user_id',false),
('public.exam_attempts','school_agenda_attempt_type','c','scheduled_tryout_id,attempt_type,tka_code,deadline_at',NULL,NULL,false))
SELECT e.name,coalesce(c.contype::text=e.kind AND c.convalidated=e.validated
 AND (e.kind='c' OR (SELECT string_agg(a.attname,',' ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num)=e.keys)
 AND (e.kind<>'f' OR (c.confrelid=to_regclass(e.target) AND c.confupdtype='a' AND c.confdeltype='a'
 AND (SELECT string_agg(a.attname,',' ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num)=e.target_keys)),false) AS ok,
 pg_get_constraintdef(c.oid) AS definition
FROM expected e LEFT JOIN pg_constraint c ON c.conrelid=to_regclass(e.relation) AND c.conname=e.name;
WITH expected(role_name,relation,sel,ins,upd,del,trunc) AS (VALUES ('anon','public.classes',false,false,false,false,false),
('authenticated','public.classes',false,false,false,false,false),
('anon','public.exam_attempt_answers',true,false,false,false,false),
('authenticated','public.exam_attempt_answers',false,false,false,false,false),
('anon','public.exam_attempt_questions',true,false,false,false,false),
('authenticated','public.exam_attempt_questions',false,false,false,false,false),
('anon','public.exam_attempts',true,false,false,false,false),
('authenticated','public.exam_attempts',false,false,false,false,false),
('anon','public.profiles',true,false,false,false,false),
('authenticated','public.profiles',true,false,false,false,false),
('anon','public.question_category_items',true,false,false,false,false),
('authenticated','public.question_category_items',true,false,false,false,false),
('anon','public.question_options',true,false,false,false,false),
('authenticated','public.question_options',true,false,false,false,false),
('anon','public.question_stimuli',false,false,false,false,false),
('authenticated','public.question_stimuli',true,false,false,false,false),
('anon','public.question_versions',true,false,false,false,false),
('authenticated','public.question_versions',true,false,false,false,false),
('anon','public.questions',true,false,false,false,false),
('authenticated','public.questions',true,false,false,false,false),
('anon','public.scheduled_tryout_users',false,false,false,false,false),
('authenticated','public.scheduled_tryout_users',false,false,false,false,false),
('anon','public.scheduled_tryouts',false,false,false,false,false),
('authenticated','public.scheduled_tryouts',false,false,false,false,false),
('anon','public.school_assignment_questions',false,false,false,false,false),
('authenticated','public.school_assignment_questions',false,false,false,false,false),
('anon','public.school_assignment_recipients',false,false,false,false,false),
('authenticated','public.school_assignment_recipients',false,false,false,false,false),
('anon','public.school_assignments',false,false,false,false,false),
('authenticated','public.school_assignments',false,false,false,false,false),
('anon','public.school_memberships',false,false,false,false,false),
('authenticated','public.school_memberships',false,false,false,false,false),
('anon','public.schools',false,false,false,false,false),
('authenticated','public.schools',false,false,false,false,false),
('anon','public.student_academic_profiles',false,false,false,false,false),
('authenticated','public.student_academic_profiles',true,true,true,false,false),
('anon','public.tka_configurations',false,false,false,false,false),
('authenticated','public.tka_configurations',false,false,false,false,false),
('anon','public.tka_question_set',false,false,false,false,false),
('authenticated','public.tka_question_set',false,false,false,false,false))
SELECT e.role_name,e.relation,has_table_privilege(e.role_name,e.relation,'SELECT')=e.sel
 AND has_table_privilege(e.role_name,e.relation,'INSERT')=e.ins
 AND has_table_privilege(e.role_name,e.relation,'UPDATE')=e.upd
 AND has_table_privilege(e.role_name,e.relation,'DELETE')=e.del
 AND has_table_privilege(e.role_name,e.relation,'TRUNCATE')=e.trunc AS ok FROM expected e;
-- Trigger coverage must produce seven true rows.
WITH expected(relation,name,helper) AS (VALUES
 ('public.scheduled_tryouts','school_agenda_freeze','private.school_agenda_freeze()'),
 ('public.scheduled_tryout_users','school_agenda_cohort_freeze','private.school_agenda_freeze()'),
 ('public.questions','school_agenda_content_freeze','private.school_agenda_content_freeze()'),
('public.question_versions','school_agenda_content_freeze','private.school_agenda_content_freeze()'),
('public.question_options','school_agenda_content_freeze','private.school_agenda_content_freeze()'),
('public.question_category_items','school_agenda_content_freeze','private.school_agenda_content_freeze()'),
('public.question_stimuli','school_agenda_content_freeze','private.school_agenda_content_freeze()'))
SELECT e.relation,e.name,coalesce(t.tgenabled='O' AND t.tgfoid=to_regprocedure(e.helper),false) AS ok
FROM expected e LEFT JOIN pg_trigger t ON t.tgrelid=to_regclass(e.relation) AND t.tgname=e.name;

-- Include inline agenda status/creator/attempt FK constraints and preserved existing constraints.
SELECT c.conrelid::regclass AS relation,c.conname,c.convalidated,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c WHERE c.conrelid IN ('public.scheduled_tryouts'::regclass,'public.exam_attempts'::regclass) ORDER BY c.conrelid,c.conname;
COMMIT;
