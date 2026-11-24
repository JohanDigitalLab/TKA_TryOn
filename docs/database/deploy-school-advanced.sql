-- Generated offline by scripts/build-school-advanced-deployment.cjs. Do not edit generated bodies.
-- Snapshot 2026-11-23T01:52:58.881Z; SHA256 bf6c2bc274e7def1432142c528fc800243feff4775ae245e80471ff23f99356f. Not a live-backend claim.
-- STAGING FIRST. Production only after staging evidence + separate human approval.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- HUMAN APPROVAL EDIT ZONE: change false to true ONLY after documented review.
SET LOCAL school_deploy.human_approved = 'false';
SET LOCAL school_deploy.mapping_approved = 'false';
SET LOCAL school_deploy.affiliation_writers_approved = 'false';
DO $approval$
BEGIN
 IF current_setting('school_deploy.human_approved',true) IS DISTINCT FROM 'true'
 OR current_setting('school_deploy.mapping_approved',true) IS DISTINCT FROM 'true'
 OR current_setting('school_deploy.affiliation_writers_approved',true) IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'HOLD: human approval, schools.id mapping and affiliation writer review required'; END IF;
END $approval$;
-- Reconcile both review gates only inside this approved transaction.
SET LOCAL school_blockers.school_uid_reference = 'schools.id';
SET LOCAL school_advanced.school_uid_reference = 'schools.id';
SET LOCAL school_advanced.affiliation_writers_reviewed = 'approved';
SELECT pg_advisory_xact_lock(hashtextextended('school:blockers:migration:v1',0));
SELECT pg_advisory_xact_lock(hashtextextended('school:advanced:agenda:v1',0));
LOCK TABLE public.schools, public.profiles, public.classes, public.school_memberships, public.student_academic_profiles, public.school_assignments, public.school_assignment_questions, public.school_assignment_recipients, public.scheduled_tryouts, public.scheduled_tryout_users, public.exam_attempts, public.exam_attempt_questions, public.exam_attempt_answers, public.tka_configurations, public.tka_question_set, public.questions, public.question_versions, public.question_options, public.question_category_items, public.question_stimuli, auth.users IN SHARE ROW EXCLUSIVE MODE;
DO $baseline$
DECLARE r record; f oid;
BEGIN
 FOR r IN SELECT * FROM (VALUES
('private.exam_answer_is_correct(uuid,text,jsonb)','a1c978d71703ebfb2358ecb74d07e521','p_question_version_id uuid, p_question_type text, p_answer_payload jsonb','boolean',true,false,false),
('private.exam_answer_payload_is_valid(uuid,text,jsonb)','742ab722ec6036d3bd73354623c4ca49','p_question_version_id uuid, p_question_type text, p_answer_payload jsonb','boolean',true,false,false),
('private.has_school_role(uuid,text[])','b085342c72f9dea0920279d0cd17f228','p_school_id uuid, p_roles text[]','boolean',true,false,true),
('private.learning_legacy_assignment(uuid)','0a11b15b928d994203a7ec297cc140d3','p_assignment_id uuid','jsonb',true,false,false),
('private.learning_legacy_start(integer,text,integer,integer)','fcf3bb71c915166151d699e4c45c1048','p_grade integer, p_subject_name text, p_question_count integer DEFAULT 20, p_duration_minutes integer DEFAULT 60','jsonb',true,false,false),
('private.learning_subscribed(uuid,uuid)','fe7ef8c259a65ccd567e4854bc1613b9','p_user uuid, p_school uuid DEFAULT NULL::uuid','boolean',true,false,false),
('private.load_student_exercise(uuid)','f6d60a67fe0164e94692d9a838ad271f','p_attempt_id uuid','jsonb',true,false,false),
('private.require_school_staff(uuid)','ea87d3c79281e2f713f183e9959f728b','p_school_id uuid','void',true,false,false),
('private.resume_tka_tryout(uuid)','e1f76217d47138ba7e42800afb8f6926','p_attempt_id uuid','jsonb',true,false,false),
('private.school_actor()','3b13ededd7e6b760b1b59fbb88744fbe','','uuid',true,false,false),
('private.school_require(uuid,boolean)','0d1fe29c18bdb91b31d611cf97185617','p_school uuid, p_admin boolean DEFAULT false','void',true,false,false),
('private.school_super()','d4fb4f569c04021468d408096b989a41','','boolean',true,false,false),
('private.school_text(jsonb,text,integer,integer)','3d33a9fdf81185b62b3c7a27923fbe25','p_data jsonb, p_key text, p_min integer, p_max integer','text',false,false,false),
('public.create_school_student(text,text,text,text,text,uuid)','ff8a156eb64e3433f2c78e2377f73573','p_nisn text, p_email text, p_full_name text, p_wa_number text DEFAULT NULL::text, p_password text DEFAULT NULL::text, p_school_id uuid DEFAULT NULL::uuid','jsonb',true,false,true),
('public.get_school_profile(uuid)','af295d472c115ccd6edb8f1a86c356e8','p_school_id uuid DEFAULT NULL::uuid','jsonb',true,false,true),
('public.get_student_assignments()','bc497f5d079173fd9b949fe6798bdc2e','','jsonb',true,false,true),
('public.learning_access_context()','a887365f45561e463996a8197043b4f0','','jsonb',true,false,true),
('public.reset_school_student_password(uuid,text,uuid)','1315bd68f4133b5b43fd4e5f1b3fca13','p_user_id uuid, p_password text, p_school_id uuid DEFAULT NULL::uuid','jsonb',true,false,true),
('public.resume_exam_attempt(uuid)','9c18978d8962b18857db15c68c22f294','p_attempt_id uuid','jsonb',true,false,true),
('public.save_exam_answer(uuid,uuid,jsonb)','3de93985a5616bd729b54b0336d371a1','p_attempt_id uuid, p_question_id uuid, p_answer_payload jsonb','jsonb',true,false,true),
('public.set_school_operator(uuid,boolean,uuid)','51e595553e9432c6ddd839b8e4836d78','p_user_id uuid, p_assign boolean DEFAULT true, p_school_id uuid DEFAULT NULL::uuid','jsonb',true,false,true),
('public.start_school_assignment(uuid)','02d0187a0b46d6ce396f5707f8eb6ab4','p_assignment_id uuid','jsonb',true,false,true),
('public.start_tka_tryout(text)','397f3def24c381eec2f3fca8c49ec00c','p_tka_code text','jsonb',true,false,true),
('public.submit_exam_attempt(uuid)','5c9a7df90757c70f7358e927e9a24b7c','p_attempt_id uuid','jsonb',true,false,true),
('public.update_school_profile(uuid,text,text,text,text,text,text)','80b6c5c8ba3e7fe9428366965bc55cb7','p_school_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_npsn text DEFAULT NULL::text, p_school_type_id text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_province text DEFAULT NULL::text','jsonb',true,false,true),
('public.update_school_student(uuid,text,text,uuid)','d2608f127863dd09521c1341f567e4b8','p_user_id uuid, p_full_name text, p_wa_number text DEFAULT NULL::text, p_school_id uuid DEFAULT NULL::uuid','jsonb',true,false,true),
('public.update_student_profile(text,text,text,text,text,text)','f2a58e4fbe5372fa1ca296a9565868bf','p_full_name text DEFAULT NULL::text, p_nickname text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text, p_education_level text DEFAULT NULL::text, p_nisn text DEFAULT NULL::text, p_wa_number text DEFAULT NULL::text','jsonb',true,false,true),
('public.xget_school_assignment_ranking(uuid)','962b9ccad73b925be60da0aeee704fe4','p_assignment_id uuid','jsonb',true,false,true),
('public.xget_teacher_workspace(uuid)','947829091af59561790471b3014ede03','p_school_id uuid','jsonb',true,false,true),
('public.xsave_school_assignment(uuid,uuid,text,text,integer,integer,timestamp with time zone,timestamp with time zone,uuid,timestamp with time zone)','454ce9551a33535dcb5e8d0534f465ac','p_school_id uuid, p_class_id uuid, p_title text, p_subject_name text, p_question_count integer, p_duration_minutes integer, p_opens_at timestamp with time zone, p_due_at timestamp with time zone, p_assignment_id uuid DEFAULT NULL::uuid, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone','uuid',true,false,true),
('public.xschool_admin_mutate(uuid,text,jsonb)','eb8cbb0af28e13a795ec659bfb1963b6','p_school_id uuid, p_action text, p_data jsonb','jsonb',true,false,true),
('public.xschool_coordinator_transfer(text,jsonb)','936a0773ed6dcf55ecd128d0d15b360a','p_action text, p_data jsonb','jsonb',true,false,true),
('public.xschool_invite_request(text,boolean)','cdf7b192aa277e48b26691c0f3e37ddf','p_code text, p_confirm boolean DEFAULT false','jsonb',true,false,true),
('public.xset_school_assignment_status(uuid,text)','6c665e4f834c1f8b71d559aaf08fd0ba','p_assignment_id uuid, p_status text','void',true,false,true)
 ) expected(signature,definition_md5,arguments,result,definer,anon_exec,authenticated_exec) LOOP
  f:=to_regprocedure(r.signature);
  IF f IS NULL THEN RAISE EXCEPTION 'HOLD: missing dependency %',r.signature; END IF;
  IF md5(pg_get_functiondef(f)) IS DISTINCT FROM r.definition_md5
  OR pg_get_function_arguments(f) IS DISTINCT FROM r.arguments
  OR pg_get_function_result(f) IS DISTINCT FROM r.result
  OR (SELECT prosecdef FROM pg_proc WHERE oid=f) IS DISTINCT FROM r.definer
  OR has_function_privilege('anon',f,'EXECUTE') IS DISTINCT FROM r.anon_exec
  OR has_function_privilege('authenticated',f,'EXECUTE') IS DISTINCT FROM r.authenticated_exec
  THEN RAISE EXCEPTION 'HOLD: dependency definition/signature/ACL drift %',r.signature; END IF;
 END LOOP;
 FOR r IN SELECT * FROM (VALUES ('public.schools'),('public.profiles'),('public.classes'),('public.school_memberships'),('public.student_academic_profiles'),('public.school_assignments'),('public.school_assignment_questions'),('public.school_assignment_recipients'),('public.scheduled_tryouts'),('public.scheduled_tryout_users'),('public.exam_attempts'),('public.exam_attempt_questions'),('public.exam_attempt_answers'),('public.tka_configurations'),('public.tka_question_set'),('public.questions'),('public.question_versions'),('public.question_options'),('public.question_category_items'),('public.question_stimuli')) expected(relation) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass(r.relation) AND relrowsecurity)
  THEN RAISE EXCEPTION 'HOLD: missing relation or RLS drift %',r.relation; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.scheduled_tryouts t JOIN public.profiles p ON p.id=t.school_uid WHERE p.account_type='SCHOOL')
 THEN RAISE EXCEPTION 'HOLD: ambiguous school ID/account UID profile collision'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.scheduled_tryouts'::regclass AND attname='agenda_status' AND NOT attisdropped)
 THEN RAISE EXCEPTION 'HOLD: non-idempotent deployment already installed or partial drift'; END IF;
END $baseline$;
DO $table_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES ('anon','public.classes',false,false,false,false,false),
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
('authenticated','public.tka_question_set',false,false,false,false,false)) e(role_name,relation,sel,ins,upd,del,trunc) LOOP
  IF has_table_privilege(r.role_name,r.relation,'SELECT') IS DISTINCT FROM r.sel
  OR has_table_privilege(r.role_name,r.relation,'INSERT') IS DISTINCT FROM r.ins
  OR has_table_privilege(r.role_name,r.relation,'UPDATE') IS DISTINCT FROM r.upd
  OR has_table_privilege(r.role_name,r.relation,'DELETE') IS DISTINCT FROM r.del
  OR has_table_privilege(r.role_name,r.relation,'TRUNCATE') IS DISTINCT FROM r.trunc
  THEN RAISE EXCEPTION 'HOLD: table ACL drift % %',r.role_name,r.relation; END IF;
 END LOOP;
END $table_acl$;
DO $column_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES ('anon','public.classes','academic_year',false,false),
('authenticated','public.classes','academic_year',false,false),
('anon','public.classes','created_at',false,false),
('authenticated','public.classes','created_at',false,false),
('anon','public.classes','education_level_id',false,false),
('authenticated','public.classes','education_level_id',false,false),
('anon','public.classes','grade',false,false),
('authenticated','public.classes','grade',false,false),
('anon','public.classes','homeroom_teacher_id',false,false),
('authenticated','public.classes','homeroom_teacher_id',false,false),
('anon','public.classes','id',false,false),
('authenticated','public.classes','id',false,false),
('anon','public.classes','name',false,false),
('authenticated','public.classes','name',false,false),
('anon','public.classes','onboarding_archived',false,false),
('authenticated','public.classes','onboarding_archived',false,false),
('anon','public.classes','school_id',false,false),
('authenticated','public.classes','school_id',false,false),
('anon','public.classes','updated_at',false,false),
('authenticated','public.classes','updated_at',false,false),
('anon','public.exam_attempt_answers','answer_payload',false,false),
('authenticated','public.exam_attempt_answers','answer_payload',false,false),
('anon','public.exam_attempt_answers','answered_at',false,false),
('authenticated','public.exam_attempt_answers','answered_at',false,false),
('anon','public.exam_attempt_answers','attempt_id',false,false),
('authenticated','public.exam_attempt_answers','attempt_id',false,false),
('anon','public.exam_attempt_answers','id',false,false),
('authenticated','public.exam_attempt_answers','id',false,false),
('anon','public.exam_attempt_answers','question_id',false,false),
('authenticated','public.exam_attempt_answers','question_id',false,false),
('anon','public.exam_attempt_questions','attempt_id',false,false),
('authenticated','public.exam_attempt_questions','attempt_id',false,false),
('anon','public.exam_attempt_questions','created_at',false,false),
('authenticated','public.exam_attempt_questions','created_at',false,false),
('anon','public.exam_attempt_questions','id',false,false),
('authenticated','public.exam_attempt_questions','id',false,false),
('anon','public.exam_attempt_questions','question_id',false,false),
('authenticated','public.exam_attempt_questions','question_id',false,false),
('anon','public.exam_attempt_questions','question_order',false,false),
('authenticated','public.exam_attempt_questions','question_order',false,false),
('anon','public.exam_attempt_questions','question_version_id',false,false),
('authenticated','public.exam_attempt_questions','question_version_id',false,false),
('anon','public.exam_attempts','attempt_status',false,false),
('authenticated','public.exam_attempts','attempt_status',false,false),
('anon','public.exam_attempts','attempt_type',false,false),
('authenticated','public.exam_attempts','attempt_type',false,false),
('anon','public.exam_attempts','correct_answers',false,false),
('authenticated','public.exam_attempts','correct_answers',false,false),
('anon','public.exam_attempts','created_at',false,false),
('authenticated','public.exam_attempts','created_at',false,false),
('anon','public.exam_attempts','deadline_at',false,false),
('authenticated','public.exam_attempts','deadline_at',false,false),
('anon','public.exam_attempts','duration_minutes',false,false),
('authenticated','public.exam_attempts','duration_minutes',false,false),
('anon','public.exam_attempts','education_level',false,false),
('authenticated','public.exam_attempts','education_level',false,false),
('anon','public.exam_attempts','grade',false,false),
('authenticated','public.exam_attempts','grade',false,false),
('anon','public.exam_attempts','id',false,false),
('authenticated','public.exam_attempts','id',false,false),
('anon','public.exam_attempts','score',false,false),
('authenticated','public.exam_attempts','score',false,false),
('anon','public.exam_attempts','started_at',false,false),
('authenticated','public.exam_attempts','started_at',false,false),
('anon','public.exam_attempts','subject_name',false,false),
('authenticated','public.exam_attempts','subject_name',false,false),
('anon','public.exam_attempts','submitted_at',false,false),
('authenticated','public.exam_attempts','submitted_at',false,false),
('anon','public.exam_attempts','tka_code',false,false),
('authenticated','public.exam_attempts','tka_code',false,false),
('anon','public.exam_attempts','total_questions',false,false),
('authenticated','public.exam_attempts','total_questions',false,false),
('anon','public.exam_attempts','user_id',false,false),
('authenticated','public.exam_attempts','user_id',false,false),
('anon','public.profiles','account_status',false,false),
('authenticated','public.profiles','account_status',false,false),
('anon','public.profiles','account_type',false,false),
('authenticated','public.profiles','account_type',false,false),
('anon','public.profiles','avatar_url',false,false),
('authenticated','public.profiles','avatar_url',false,false),
('anon','public.profiles','created_at',false,false),
('authenticated','public.profiles','created_at',false,false),
('anon','public.profiles','education_level',false,false),
('authenticated','public.profiles','education_level',false,false),
('anon','public.profiles','education_level_locked_at',false,false),
('authenticated','public.profiles','education_level_locked_at',false,false),
('anon','public.profiles','full_name',false,false),
('authenticated','public.profiles','full_name',false,false),
('anon','public.profiles','has_tried_exercise',false,false),
('authenticated','public.profiles','has_tried_exercise',false,false),
('anon','public.profiles','has_tried_tryout',false,false),
('authenticated','public.profiles','has_tried_tryout',false,false),
('anon','public.profiles','id',false,false),
('authenticated','public.profiles','id',false,false),
('anon','public.profiles','is_managed',false,false),
('authenticated','public.profiles','is_managed',false,false),
('anon','public.profiles','is_subscribed',false,false),
('authenticated','public.profiles','is_subscribed',false,false),
('anon','public.profiles','is_verified',false,false),
('authenticated','public.profiles','is_verified',false,false),
('anon','public.profiles','nickname',false,false),
('authenticated','public.profiles','nickname',false,false),
('anon','public.profiles','nisn',false,false),
('authenticated','public.profiles','nisn',false,false),
('anon','public.profiles','profile_completed',false,false),
('authenticated','public.profiles','profile_completed',false,false),
('anon','public.profiles','profile_completed_at',false,false),
('authenticated','public.profiles','profile_completed_at',false,false),
('anon','public.profiles','school_id',false,false),
('authenticated','public.profiles','school_id',false,false),
('anon','public.profiles','updated_at',false,false),
('authenticated','public.profiles','updated_at',false,false),
('anon','public.profiles','wa_number',false,false),
('authenticated','public.profiles','wa_number',false,false),
('anon','public.question_category_items','category_label',false,false),
('authenticated','public.question_category_items','category_label',false,false),
('anon','public.question_category_items','correct_category',false,false),
('authenticated','public.question_category_items','correct_category',false,false),
('anon','public.question_category_items','created_at',false,false),
('authenticated','public.question_category_items','created_at',false,false),
('anon','public.question_category_items','explanation',false,false),
('authenticated','public.question_category_items','explanation',false,false),
('anon','public.question_category_items','id',false,false),
('authenticated','public.question_category_items','id',false,false),
('anon','public.question_category_items','item_number',false,false),
('authenticated','public.question_category_items','item_number',false,false),
('anon','public.question_category_items','item_text',false,false),
('authenticated','public.question_category_items','item_text',false,false),
('anon','public.question_category_items','question_version_id',false,false),
('authenticated','public.question_category_items','question_version_id',false,false),
('anon','public.question_options','created_at',false,false),
('authenticated','public.question_options','created_at',false,false),
('anon','public.question_options','explanation',false,false),
('authenticated','public.question_options','explanation',false,false),
('anon','public.question_options','id',false,false),
('authenticated','public.question_options','id',false,false),
('anon','public.question_options','is_correct',false,false),
('authenticated','public.question_options','is_correct',false,false),
('anon','public.question_options','option_code',false,false),
('authenticated','public.question_options','option_code',false,false),
('anon','public.question_options','option_order',false,false),
('authenticated','public.question_options','option_order',false,false),
('anon','public.question_options','option_text',false,false),
('authenticated','public.question_options','option_text',false,false),
('anon','public.question_options','question_version_id',false,false),
('authenticated','public.question_options','question_version_id',false,false),
('anon','public.question_stimuli','content_text',false,false),
('authenticated','public.question_stimuli','content_text',false,false),
('anon','public.question_stimuli','created_at',false,false),
('authenticated','public.question_stimuli','created_at',false,false),
('anon','public.question_stimuli','created_by',false,false),
('authenticated','public.question_stimuli','created_by',false,false),
('anon','public.question_stimuli','file_url',false,false),
('authenticated','public.question_stimuli','file_url',false,false),
('anon','public.question_stimuli','id',false,false),
('authenticated','public.question_stimuli','id',false,false),
('anon','public.question_stimuli','media_description',false,false),
('authenticated','public.question_stimuli','media_description',false,false),
('anon','public.question_stimuli','source_reference',false,false),
('authenticated','public.question_stimuli','source_reference',false,false),
('anon','public.question_stimuli','stimulus_code',false,false),
('authenticated','public.question_stimuli','stimulus_code',false,false),
('anon','public.question_stimuli','stimulus_status',false,false),
('authenticated','public.question_stimuli','stimulus_status',false,false),
('anon','public.question_stimuli','stimulus_type',false,false),
('authenticated','public.question_stimuli','stimulus_type',false,false),
('anon','public.question_stimuli','title',false,false),
('authenticated','public.question_stimuli','title',false,false),
('anon','public.question_stimuli','updated_at',false,false),
('authenticated','public.question_stimuli','updated_at',false,false),
('anon','public.question_stimuli','usage_rights',false,false),
('authenticated','public.question_stimuli','usage_rights',false,false),
('anon','public.question_versions','content_hash',false,false),
('authenticated','public.question_versions','content_hash',false,false),
('anon','public.question_versions','created_at',false,false),
('authenticated','public.question_versions','created_at',false,false),
('anon','public.question_versions','created_by',false,false),
('authenticated','public.question_versions','created_by',false,false),
('anon','public.question_versions','explanation',false,false),
('authenticated','public.question_versions','explanation',false,false),
('anon','public.question_versions','id',false,false),
('authenticated','public.question_versions','id',false,false),
('anon','public.question_versions','instruction',false,false),
('authenticated','public.question_versions','instruction',false,false),
('anon','public.question_versions','is_current',false,false),
('authenticated','public.question_versions','is_current',false,false),
('anon','public.question_versions','question_id',false,false),
('authenticated','public.question_versions','question_id',false,false),
('anon','public.question_versions','question_text',false,false),
('authenticated','public.question_versions','question_text',false,false),
('anon','public.question_versions','scoring_rule',false,false),
('authenticated','public.question_versions','scoring_rule',false,false),
('anon','public.question_versions','stimulus_id',false,false),
('authenticated','public.question_versions','stimulus_id',false,false),
('anon','public.question_versions','version_number',false,false),
('authenticated','public.question_versions','version_number',false,false),
('anon','public.question_versions','version_status',false,false),
('authenticated','public.question_versions','version_status',false,false),
('anon','public.questions','cognitive_level',false,false),
('authenticated','public.questions','cognitive_level',false,false),
('anon','public.questions','competency',false,false),
('authenticated','public.questions','competency',false,false),
('anon','public.questions','created_at',false,false),
('authenticated','public.questions','created_at',false,false),
('anon','public.questions','created_by',false,false),
('authenticated','public.questions','created_by',false,false),
('anon','public.questions','curriculum_reference',false,false),
('authenticated','public.questions','curriculum_reference',false,false),
('anon','public.questions','difficulty',false,false),
('authenticated','public.questions','difficulty',false,false),
('anon','public.questions','education_level_id',false,false),
('authenticated','public.questions','education_level_id',false,false),
('anon','public.questions','element',false,false),
('authenticated','public.questions','element',false,false),
('anon','public.questions','grade',false,false),
('authenticated','public.questions','grade',false,false),
('anon','public.questions','group_order',false,false),
('authenticated','public.questions','group_order',false,false),
('anon','public.questions','id',false,false),
('authenticated','public.questions','id',false,false),
('anon','public.questions','import_batch_id',false,false),
('authenticated','public.questions','import_batch_id',false,false),
('anon','public.questions','indicator',false,false),
('authenticated','public.questions','indicator',false,false),
('anon','public.questions','material',false,false),
('authenticated','public.questions','material',false,false),
('anon','public.questions','question_code',false,false),
('authenticated','public.questions','question_code',false,false),
('anon','public.questions','question_status',false,false),
('authenticated','public.questions','question_status',false,false),
('anon','public.questions','question_structure',false,false),
('authenticated','public.questions','question_structure',false,false),
('anon','public.questions','question_type',false,false),
('authenticated','public.questions','question_type',false,false),
('anon','public.questions','school_type',false,false),
('authenticated','public.questions','school_type',false,false),
('anon','public.questions','source_reference',false,false),
('authenticated','public.questions','source_reference',false,false),
('anon','public.questions','source_type',false,false),
('authenticated','public.questions','source_type',false,false),
('anon','public.questions','sub_material',false,false),
('authenticated','public.questions','sub_material',false,false),
('anon','public.questions','subject_category',false,false),
('authenticated','public.questions','subject_category',false,false),
('anon','public.questions','subject_code',false,false),
('authenticated','public.questions','subject_code',false,false),
('anon','public.questions','subject_name',false,false),
('authenticated','public.questions','subject_name',false,false),
('anon','public.questions','theme',false,false),
('authenticated','public.questions','theme',false,false),
('anon','public.questions','topic',false,false),
('authenticated','public.questions','topic',false,false),
('anon','public.questions','updated_at',false,false),
('authenticated','public.questions','updated_at',false,false),
('anon','public.questions','usage_rights',false,false),
('authenticated','public.questions','usage_rights',false,false),
('anon','public.scheduled_tryout_users','id',false,false),
('authenticated','public.scheduled_tryout_users','id',false,false),
('anon','public.scheduled_tryout_users','scheduled_tryouts',false,false),
('authenticated','public.scheduled_tryout_users','scheduled_tryouts',false,false),
('anon','public.scheduled_tryout_users','user_id',false,false),
('authenticated','public.scheduled_tryout_users','user_id',false,false),
('anon','public.scheduled_tryouts','deadline_at',false,false),
('authenticated','public.scheduled_tryouts','deadline_at',false,false),
('anon','public.scheduled_tryouts','description',false,false),
('authenticated','public.scheduled_tryouts','description',false,false),
('anon','public.scheduled_tryouts','id',false,false),
('authenticated','public.scheduled_tryouts','id',false,false),
('anon','public.scheduled_tryouts','label',false,false),
('authenticated','public.scheduled_tryouts','label',false,false),
('anon','public.scheduled_tryouts','school_uid',false,false),
('authenticated','public.scheduled_tryouts','school_uid',false,false),
('anon','public.scheduled_tryouts','start_at',false,false),
('authenticated','public.scheduled_tryouts','start_at',false,false),
('anon','public.scheduled_tryouts','tka_code1',false,false),
('authenticated','public.scheduled_tryouts','tka_code1',false,false),
('anon','public.scheduled_tryouts','tka_code2',false,false),
('authenticated','public.scheduled_tryouts','tka_code2',false,false),
('anon','public.scheduled_tryouts','tka_code3',false,false),
('authenticated','public.scheduled_tryouts','tka_code3',false,false),
('anon','public.scheduled_tryouts','tka_code4',false,false),
('authenticated','public.scheduled_tryouts','tka_code4',false,false),
('anon','public.scheduled_tryouts','tka_code5',false,false),
('authenticated','public.scheduled_tryouts','tka_code5',false,false),
('anon','public.scheduled_tryouts','tryout_code',false,false),
('authenticated','public.scheduled_tryouts','tryout_code',false,false),
('anon','public.school_assignment_questions','assignment_id',false,false),
('authenticated','public.school_assignment_questions','assignment_id',false,false),
('anon','public.school_assignment_questions','question_id',false,false),
('authenticated','public.school_assignment_questions','question_id',false,false),
('anon','public.school_assignment_questions','question_order',false,false),
('authenticated','public.school_assignment_questions','question_order',false,false),
('anon','public.school_assignment_questions','question_version_id',false,false),
('authenticated','public.school_assignment_questions','question_version_id',false,false),
('anon','public.school_assignment_recipients','assignment_id',false,false),
('authenticated','public.school_assignment_recipients','assignment_id',false,false),
('anon','public.school_assignment_recipients','attempt_id',false,false),
('authenticated','public.school_assignment_recipients','attempt_id',false,false),
('anon','public.school_assignment_recipients','user_id',false,false),
('authenticated','public.school_assignment_recipients','user_id',false,false),
('anon','public.school_assignments','class_id',false,false),
('authenticated','public.school_assignments','class_id',false,false),
('anon','public.school_assignments','created_at',false,false),
('authenticated','public.school_assignments','created_at',false,false),
('anon','public.school_assignments','created_by',false,false),
('authenticated','public.school_assignments','created_by',false,false),
('anon','public.school_assignments','due_at',false,false),
('authenticated','public.school_assignments','due_at',false,false),
('anon','public.school_assignments','duration_minutes',false,false),
('authenticated','public.school_assignments','duration_minutes',false,false),
('anon','public.school_assignments','grade',false,false),
('authenticated','public.school_assignments','grade',false,false),
('anon','public.school_assignments','id',false,false),
('authenticated','public.school_assignments','id',false,false),
('anon','public.school_assignments','opens_at',false,false),
('authenticated','public.school_assignments','opens_at',false,false),
('anon','public.school_assignments','question_count',false,false),
('authenticated','public.school_assignments','question_count',false,false),
('anon','public.school_assignments','school_id',false,false),
('authenticated','public.school_assignments','school_id',false,false),
('anon','public.school_assignments','status',false,false),
('authenticated','public.school_assignments','status',false,false),
('anon','public.school_assignments','subject_name',false,false),
('authenticated','public.school_assignments','subject_name',false,false),
('anon','public.school_assignments','title',false,false),
('authenticated','public.school_assignments','title',false,false),
('anon','public.school_assignments','updated_at',false,false),
('authenticated','public.school_assignments','updated_at',false,false),
('anon','public.school_memberships','id',false,false),
('authenticated','public.school_memberships','id',false,false),
('anon','public.school_memberships','joined_at',false,false),
('authenticated','public.school_memberships','joined_at',false,false),
('anon','public.school_memberships','role',false,false),
('authenticated','public.school_memberships','role',false,false),
('anon','public.school_memberships','school_id',false,false),
('authenticated','public.school_memberships','school_id',false,false),
('anon','public.school_memberships','status',false,false),
('authenticated','public.school_memberships','status',false,false),
('anon','public.school_memberships','user_id',false,false),
('authenticated','public.school_memberships','user_id',false,false),
('anon','public.schools','address',false,false),
('authenticated','public.schools','address',false,false),
('anon','public.schools','city',false,false),
('authenticated','public.schools','city',false,false),
('anon','public.schools','created_at',false,false),
('authenticated','public.schools','created_at',false,false),
('anon','public.schools','created_by',false,false),
('authenticated','public.schools','created_by',false,false),
('anon','public.schools','id',false,false),
('authenticated','public.schools','id',false,false),
('anon','public.schools','name',false,false),
('authenticated','public.schools','name',false,false),
('anon','public.schools','npsn',false,false),
('authenticated','public.schools','npsn',false,false),
('anon','public.schools','province',false,false),
('authenticated','public.schools','province',false,false),
('anon','public.schools','school_type_id',false,false),
('authenticated','public.schools','school_type_id',false,false),
('anon','public.schools','status',false,false),
('authenticated','public.schools','status',false,false),
('anon','public.schools','updated_at',false,false),
('authenticated','public.schools','updated_at',false,false),
('anon','public.student_academic_profiles','academic_year',false,false),
('authenticated','public.student_academic_profiles','academic_year',true,true),
('anon','public.student_academic_profiles','class_id',false,false),
('authenticated','public.student_academic_profiles','class_id',true,true),
('anon','public.student_academic_profiles','created_at',false,false),
('authenticated','public.student_academic_profiles','created_at',true,true),
('anon','public.student_academic_profiles','education_level_id',false,false),
('authenticated','public.student_academic_profiles','education_level_id',true,true),
('anon','public.student_academic_profiles','grade',false,false),
('authenticated','public.student_academic_profiles','grade',true,true),
('anon','public.student_academic_profiles','school_id',false,false),
('authenticated','public.student_academic_profiles','school_id',true,true),
('anon','public.student_academic_profiles','school_type_id',false,false),
('authenticated','public.student_academic_profiles','school_type_id',true,true),
('anon','public.student_academic_profiles','student_number',false,false),
('authenticated','public.student_academic_profiles','student_number',true,true),
('anon','public.student_academic_profiles','updated_at',false,false),
('authenticated','public.student_academic_profiles','updated_at',true,true),
('anon','public.student_academic_profiles','user_id',false,false),
('authenticated','public.student_academic_profiles','user_id',true,true),
('anon','public.tka_configurations','duration_minutes',false,false),
('authenticated','public.tka_configurations','duration_minutes',false,false),
('anon','public.tka_configurations','education_level',false,false),
('authenticated','public.tka_configurations','education_level',false,false),
('anon','public.tka_configurations','id',false,false),
('authenticated','public.tka_configurations','id',false,false),
('anon','public.tka_configurations','is_default',false,false),
('authenticated','public.tka_configurations','is_default',false,false),
('anon','public.tka_configurations','subject_code',false,false),
('authenticated','public.tka_configurations','subject_code',false,false),
('anon','public.tka_configurations','syllabus',false,false),
('authenticated','public.tka_configurations','syllabus',false,false),
('anon','public.tka_configurations','tka_code',false,false),
('authenticated','public.tka_configurations','tka_code',false,false),
('anon','public.tka_configurations','total_questions',false,false),
('authenticated','public.tka_configurations','total_questions',false,false),
('anon','public.tka_configurations','type',false,false),
('authenticated','public.tka_configurations','type',false,false),
('anon','public.tka_question_set','id',false,false),
('authenticated','public.tka_question_set','id',false,false),
('anon','public.tka_question_set','question_code',false,false),
('authenticated','public.tka_question_set','question_code',false,false),
('anon','public.tka_question_set','tka_code',false,false),
('authenticated','public.tka_question_set','tka_code',false,false)) e(role_name,relation,col,ins,upd) LOOP
  IF has_column_privilege(r.role_name,r.relation,r.col,'INSERT') IS DISTINCT FROM r.ins
  OR has_column_privilege(r.role_name,r.relation,r.col,'UPDATE') IS DISTINCT FROM r.upd
  THEN RAISE EXCEPTION 'HOLD: column ACL drift % % %',r.role_name,r.relation,r.col; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.idx_classes_id_school_id_unique') AND indisunique AND indisvalid)
 OR NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.uq_exam_attempts_active_user_grade_subject') AND indisunique AND indisvalid)
 THEN RAISE EXCEPTION 'HOLD: required unique index missing or invalid'; END IF;
END $column_acl$;
DO $absent$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 JOIN (VALUES ('private','school_assignment_access'),('private','school_assignment_deadline'),('private','resume_school_assignment'),('private','school_advanced_scope'),('public','create_school_schedule'),('public','set_school_schedule_status'),('private','school_schedule_access'),('private','school_schedule_deadline'),('public','start_school_schedule'),('public','get_school_schedule_agenda'),('public','get_school_schedule_participants'),('private','school_agenda_freeze'),('private','school_agenda_content_freeze'),('public','get_teacher_workspace'),('public','save_school_assignment'),('public','set_school_assignment_status'),('public','get_school_assignment_ranking'),('public','school_advanced_capabilities')) e(schema_name,name) ON e.schema_name=n.nspname AND e.name=p.proname)
 THEN RAISE EXCEPTION 'HOLD: unexpected new function already exists; partial installation or catalog drift'; END IF;
END $absent$;
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
DO $gate$
BEGIN
 IF current_setting('school_advanced.school_uid_reference',true) IS DISTINCT FROM 'schools.id'
 OR current_setting('school_advanced.affiliation_writers_reviewed',true) IS DISTINCT FROM 'approved'
 THEN RAISE EXCEPTION 'HOLD: explicit schools.id mapping and affiliation writer review required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.scheduled_tryouts'::regclass AND conname='school_blockers_schedule_school_fk')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.scheduled_tryout_users'::regclass AND conname='school_blockers_schedule_recipient_unique')
 OR to_regprocedure('private.school_assignment_deadline(uuid)') IS NULL
 THEN RAISE EXCEPTION 'HOLD: blockers dependency missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.scheduled_tryouts t LEFT JOIN public.schools s ON s.id=t.school_uid WHERE s.id IS NULL)
 OR EXISTS(SELECT 1 FROM public.scheduled_tryouts t JOIN public.profiles p ON p.id=t.school_uid WHERE p.account_type='SCHOOL')
 THEN RAISE EXCEPTION 'HOLD: orphan or ambiguous school ID/account UID; explicit reconciliation required'; END IF;
END $gate$;

-- Nullable columns leave legacy rows quarantined (no status means unavailable).
ALTER TABLE public.scheduled_tryouts
 ADD COLUMN agenda_status text CHECK (agenda_status IN ('draft','published','cancelled')),
 ADD COLUMN agenda_created_by uuid REFERENCES auth.users(id),
 ADD COLUMN agenda_revision bigint,
 ADD COLUMN agenda_snapshot jsonb;
ALTER TABLE public.exam_attempts ADD COLUMN scheduled_tryout_id uuid REFERENCES public.scheduled_tryouts(id);
ALTER TABLE public.exam_attempts ADD CONSTRAINT school_agenda_one_attempt UNIQUE(scheduled_tryout_id,user_id);
ALTER TABLE public.exam_attempts ADD CONSTRAINT school_agenda_participant_fk
 FOREIGN KEY(scheduled_tryout_id,user_id) REFERENCES public.scheduled_tryout_users(scheduled_tryouts,user_id) NOT VALID;
ALTER TABLE public.exam_attempts ADD CONSTRAINT school_agenda_attempt_type
 CHECK(scheduled_tryout_id IS NULL OR (attempt_type='TRYOUT' AND tka_code IS NOT NULL AND deadline_at IS NOT NULL)) NOT VALID;

CREATE OR REPLACE FUNCTION private.school_assignment_access(p_assignment_id uuid, p_attempt_id uuid DEFAULT NULL)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE u uuid:=private.school_actor(); a public.school_assignments%ROWTYPE;
  r public.school_assignment_recipients%ROWTYPE; p public.profiles%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
  SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id;
  PERFORM private.school_advanced_scope(a.school_id,u,ARRAY['student']);
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

CREATE OR REPLACE FUNCTION public.save_exam_answer(p_attempt_id uuid, p_question_id uuid, p_answer_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_assignment_deadline timestamptz;
  v_schedule_deadline timestamptz;
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
  IF EXISTS(SELECT 1 FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=v_user_id AND scheduled_tryout_id IS NOT NULL) THEN
    v_schedule_deadline:=private.school_schedule_deadline(p_attempt_id);
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
  IF v_attempt.scheduled_tryout_id IS NOT NULL AND (v_schedule_deadline IS NULL OR v_now>=v_schedule_deadline) THEN
    RAISE EXCEPTION 'Agenda deadline reached';
  END IF;
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
  v_schedule_deadline timestamptz;
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
  IF EXISTS(SELECT 1 FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=v_user_id AND scheduled_tryout_id IS NOT NULL) THEN
    v_schedule_deadline:=private.school_schedule_deadline(p_attempt_id);
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

  IF v_attempt.scheduled_tryout_id IS NOT NULL THEN
    IF v_schedule_deadline IS NULL THEN RAISE EXCEPTION 'Invalid agenda deadline'; END IF;
    v_submitted_after_deadline:=clock_timestamp()>=v_schedule_deadline;
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

CREATE OR REPLACE FUNCTION private.school_advanced_scope(p_school uuid, p_user uuid, p_roles text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE p public.profiles%ROWTYPE;
BEGIN
 LOCK TABLE public.schools, public.profiles, public.school_memberships, auth.users IN SHARE MODE;
 PERFORM private.school_actor();
 PERFORM 1 FROM public.schools WHERE id=p_school AND status='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'School unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=p_user;
 IF NOT FOUND OR p.account_status IS DISTINCT FROM 'active'
 OR (p.school_id IS NOT NULL AND p.school_id<>p_school)
 OR ((p.is_managed IS TRUE OR p.account_type='SCHOOL') AND p.school_id IS NULL)
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
 OR NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND user_id=p_user AND status='active' AND role=ANY(p_roles))
 OR EXISTS(SELECT 1 FROM public.school_memberships WHERE user_id=p_user AND status='active' AND school_id<>p_school)
 THEN RAISE EXCEPTION 'HOLD: verified membership/profile scope required' USING ERRCODE='42501'; END IF;
END $f$;

CREATE OR REPLACE FUNCTION private.require_school_staff(p_school_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN
 PERFORM private.school_advanced_scope(p_school_id,private.school_actor(),ARRAY['teacher','school_admin']);
 PERFORM private.school_require(p_school_id,false);
END $f$;

CREATE OR REPLACE FUNCTION public.create_school_schedule(p_school_id uuid,p_label text,p_tka_code text,
 p_start_at timestamptz,p_deadline_at timestamptz,p_participant_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE sid uuid; u uuid; cfg public.tka_configurations%ROWTYPE;
BEGIN
 PERFORM private.require_school_staff(p_school_id);
 IF p_label IS NULL OR length(btrim(p_label)) NOT BETWEEN 3 AND 255
 OR p_start_at IS NULL OR p_deadline_at IS NULL OR p_start_at<=clock_timestamp() OR p_deadline_at<=p_start_at
 OR cardinality(p_participant_ids) IS NULL OR cardinality(p_participant_ids) NOT BETWEEN 1 AND 500
 OR array_ndims(p_participant_ids) IS DISTINCT FROM 1 OR array_lower(p_participant_ids,1) IS DISTINCT FROM 1
 OR EXISTS(SELECT 1 FROM unnest(p_participant_ids) x GROUP BY x HAVING x IS NULL OR count(*)>1)
 THEN RAISE EXCEPTION 'Invalid agenda or participants' USING ERRCODE='22023'; END IF;
 SELECT * INTO cfg FROM public.tka_configurations WHERE tka_code=p_tka_code FOR SHARE;
 IF NOT FOUND OR cfg.type<>'SET' OR cfg.total_questions NOT BETWEEN 1 AND 100 OR cfg.duration_minutes NOT BETWEEN 1 AND 240
 OR p_deadline_at<p_start_at+cfg.duration_minutes*interval '1 minute'
 THEN RAISE EXCEPTION 'Only one valid SET package supported'; END IF;
 FOREACH u IN ARRAY p_participant_ids LOOP
  PERFORM private.school_advanced_scope(p_school_id,u,ARRAY['student']);
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND lower(btrim(education_level))=lower(btrim(cfg.education_level)))
  THEN RAISE EXCEPTION 'Participant education mismatch'; END IF;
 END LOOP;
 INSERT INTO public.scheduled_tryouts(tryout_code,label,start_at,deadline_at,school_uid,tka_code1,agenda_status,agenda_created_by,agenda_revision)
 VALUES(gen_random_uuid()::text,btrim(p_label),p_start_at,p_deadline_at,p_school_id,p_tka_code,'draft',auth.uid(),1) RETURNING id INTO sid;
 INSERT INTO public.scheduled_tryout_users(scheduled_tryouts,user_id) SELECT sid,x FROM unnest(p_participant_ids) x;
 RETURN jsonb_build_object('schedule_id',sid,'status','draft','revision',1);
END $f$;

CREATE OR REPLACE FUNCTION public.set_school_schedule_status(p_schedule_id uuid,p_status text,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE t public.scheduled_tryouts%ROWTYPE; cfg public.tka_configurations%ROWTYPE; u uuid;
 refs jsonb; subj text; g integer; lvl text;
BEGIN
 SELECT * INTO t FROM public.scheduled_tryouts WHERE id=p_schedule_id;
 PERFORM private.require_school_staff(t.school_uid);
 SELECT * INTO t FROM public.scheduled_tryouts WHERE id=p_schedule_id FOR UPDATE;
 PERFORM private.require_school_staff(t.school_uid);
 IF t.agenda_status IS NULL OR t.agenda_revision IS DISTINCT FROM p_expected_revision
 OR p_status IS NULL OR p_status NOT IN('published','cancelled') OR t.agenda_status='cancelled'
 OR (p_status='published' AND t.agenda_status<>'draft') THEN RAISE EXCEPTION 'Invalid transition or stale revision' USING ERRCODE='22023'; END IF;
 IF t.agenda_created_by<>auth.uid() THEN PERFORM private.school_require(t.school_uid,true); END IF;
 IF p_status='published' THEN
  IF t.tka_code2 IS NOT NULL OR t.tka_code3 IS NOT NULL OR t.tka_code4 IS NOT NULL OR t.tka_code5 IS NOT NULL
  OR t.start_at<=clock_timestamp() THEN RAISE EXCEPTION 'Legacy/multi-package or elapsed agenda unavailable'; END IF;
  -- Freeze package selection atomically with concurrent authoring; no question payload/key is exposed.
  LOCK TABLE public.tka_configurations,public.tka_question_set,public.questions,public.question_versions,
   public.question_options,public.question_category_items,public.question_stimuli IN SHARE MODE;
  PERFORM pg_advisory_xact_lock(hashtextextended('school:agenda:content:v1',0));
  SELECT * INTO cfg FROM public.tka_configurations WHERE tka_code=t.tka_code1;
  lvl:=lower(btrim(cfg.education_level)); g:=CASE lvl WHEN 'sd' THEN 6 WHEN 'smp' THEN 9 WHEN 'sma' THEN 12 END;
  SELECT name INTO subj FROM public.subjects WHERE subject_code=cfg.subject_code;
  IF cfg.id IS NULL OR cfg.type<>'SET' OR g IS NULL OR subj IS NULL
  OR cfg.total_questions NOT BETWEEN 1 AND 100 OR cfg.duration_minutes NOT BETWEEN 1 AND 240
  OR t.deadline_at<t.start_at+cfg.duration_minutes*interval '1 minute' THEN RAISE EXCEPTION 'Invalid package'; END IF;
  SELECT jsonb_agg(jsonb_build_object('question_id',x.qid,'question_version_id',x.vid,'question_order',x.ord) ORDER BY x.ord) INTO refs
  FROM (SELECT q.id qid,v.id vid,row_number() OVER(ORDER BY q.id)::integer ord
   FROM public.questions q JOIN LATERAL(SELECT id FROM public.question_versions WHERE question_id=q.id AND version_status='PUBLISHED' ORDER BY version_number DESC,id DESC LIMIT 1) v ON true
   WHERE q.subject_code=cfg.subject_code AND q.grade=g AND lower(q.education_level_id)=lvl AND q.question_status='PUBLISHED'
   AND q.question_type IN('PG_TUNGGAL','PGK_MA','PGK_KATEGORI')
   AND EXISTS(SELECT 1 FROM public.tka_question_set s WHERE s.tka_code=cfg.tka_code AND s.question_code=q.question_code)
   ORDER BY q.id LIMIT cfg.total_questions) x;
  IF jsonb_array_length(coalesce(refs,'[]'::jsonb))<>cfg.total_questions THEN RAISE EXCEPTION 'Incomplete SET snapshot; no fallback pool'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.scheduled_tryout_users WHERE scheduled_tryouts=t.id) THEN RAISE EXCEPTION 'No participants'; END IF;
  FOR u IN SELECT user_id FROM public.scheduled_tryout_users WHERE scheduled_tryouts=t.id ORDER BY user_id LOOP
   PERFORM private.school_advanced_scope(t.school_uid,u,ARRAY['student']);
   IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND lower(btrim(education_level))=lvl) THEN RAISE EXCEPTION 'Participant education mismatch'; END IF;
  END LOOP;
  UPDATE public.scheduled_tryouts SET agenda_snapshot=jsonb_build_object('grade',g,'education_level',upper(lvl),'subject_name',subj,
   'duration_minutes',cfg.duration_minutes,'total_questions',cfg.total_questions,'questions',refs) WHERE id=t.id;
 END IF;
 UPDATE public.scheduled_tryouts SET agenda_status=p_status,agenda_revision=agenda_revision+1 WHERE id=t.id;
 RETURN jsonb_build_object('schedule_id',t.id,'status',p_status,'revision',t.agenda_revision+1);
END $f$;

CREATE OR REPLACE FUNCTION private.school_schedule_access(p_schedule_id uuid)
RETURNS public.scheduled_tryouts LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE u uuid:=private.school_actor(); t public.scheduled_tryouts%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
 SELECT * INTO t FROM public.scheduled_tryouts WHERE id=p_schedule_id;
 PERFORM private.school_advanced_scope(t.school_uid,u,ARRAY['student']);
 SELECT * INTO t FROM public.scheduled_tryouts WHERE id=p_schedule_id FOR SHARE;
 PERFORM private.school_advanced_scope(t.school_uid,u,ARRAY['student']);
 IF t.agenda_status IS DISTINCT FROM 'published' OR t.agenda_snapshot IS NULL OR clock_timestamp()<t.start_at
 OR NOT EXISTS(SELECT 1 FROM public.scheduled_tryout_users WHERE scheduled_tryouts=t.id AND user_id=u)
 THEN RAISE EXCEPTION 'Agenda unavailable' USING ERRCODE='42501'; END IF;
 RETURN t;
END $f$;

CREATE OR REPLACE FUNCTION private.school_schedule_deadline(p_attempt_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE u uuid:=private.school_actor(); sid uuid; t public.scheduled_tryouts%ROWTYPE; e public.exam_attempts%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
 SELECT scheduled_tryout_id INTO sid FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u;
 IF sid IS NULL THEN RAISE EXCEPTION 'Agenda attempt unavailable' USING ERRCODE='42501'; END IF;
 t:=private.school_schedule_access(sid);
 SELECT * INTO e FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u FOR UPDATE;
 IF e.attempt_type<>'TRYOUT' OR e.duration_minutes IS NULL OR e.duration_minutes<=0 OR e.started_at IS NULL OR e.deadline_at IS NULL
 THEN RAISE EXCEPTION 'Invalid agenda attempt timing'; END IF;
 RETURN least(t.deadline_at,e.deadline_at,e.started_at+e.duration_minutes*interval '1 minute');
END $f$;

CREATE OR REPLACE FUNCTION public.start_school_schedule(p_schedule_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE u uuid:=private.school_actor(); t public.scheduled_tryouts%ROWTYPE; e public.exam_attempts%ROWTYPE; s jsonb; n integer;
BEGIN
 t:=private.school_schedule_access(p_schedule_id); s:=t.agenda_snapshot;
 SELECT * INTO e FROM public.exam_attempts WHERE scheduled_tryout_id=t.id AND user_id=u;
 IF FOUND THEN RETURN private.resume_tka_tryout(e.id)||jsonb_build_object('schedule_id',t.id,'resumed',true); END IF;
 IF clock_timestamp()>=(t.deadline_at) OR clock_timestamp()+(s->>'duration_minutes')::integer*interval '1 minute'>t.deadline_at
 THEN RAISE EXCEPTION 'Insufficient full session time'; END IF;
 -- Never expire, adopt, or rewrite another historical/standalone session.
 IF EXISTS(SELECT 1 FROM public.exam_attempts WHERE user_id=u AND grade=(s->>'grade')::integer
 AND subject_name=s->>'subject_name' AND attempt_status='IN_PROGRESS') THEN RAISE EXCEPTION 'Finish or resume existing subject session'; END IF;
 INSERT INTO public.exam_attempts(user_id,education_level,grade,subject_name,duration_minutes,total_questions,attempt_type,tka_code,started_at,deadline_at,scheduled_tryout_id)
 VALUES(u,s->>'education_level',(s->>'grade')::integer,s->>'subject_name',(s->>'duration_minutes')::integer,(s->>'total_questions')::integer,
 'TRYOUT',t.tka_code1,clock_timestamp(),t.deadline_at,t.id) RETURNING * INTO e;
 INSERT INTO public.exam_attempt_questions(attempt_id,question_id,question_version_id,question_order)
 SELECT e.id,x.question_id,x.question_version_id,x.question_order FROM jsonb_to_recordset(s->'questions') AS x(question_id uuid,question_version_id uuid,question_order integer);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>e.total_questions OR n=0 THEN RAISE EXCEPTION 'Incomplete frozen snapshot'; END IF;
 RETURN private.resume_tka_tryout(e.id)||jsonb_build_object('schedule_id',t.id,'resumed',false);
END $f$;

CREATE OR REPLACE FUNCTION public.get_school_schedule_agenda(p_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE u uuid:=private.school_actor(); staff boolean; result jsonb;
BEGIN
 PERFORM private.school_require(p_school_id,false);
 staff:=private.has_school_role(p_school_id,ARRAY['teacher','school_admin']);
 PERFORM private.school_advanced_scope(p_school_id,u,CASE WHEN staff THEN ARRAY['teacher','school_admin'] ELSE ARRAY['student'] END);
 SELECT coalesce(jsonb_agg(x.row ORDER BY x.start_at DESC),'[]'::jsonb) INTO result FROM (
 SELECT t.start_at,jsonb_build_object('schedule_id',t.id,'label',t.label,'start_at',t.start_at,'deadline_at',t.deadline_at,
 'status',t.agenda_status,'revision',t.agenda_revision,'tka_code',t.tka_code1,
 'attempt_id',(SELECT e.id FROM public.exam_attempts e WHERE e.scheduled_tryout_id=t.id AND e.user_id=u)) row
 FROM public.scheduled_tryouts t WHERE t.school_uid=p_school_id AND t.agenda_status IS NOT NULL
 AND (staff OR (t.agenda_status IN('published','cancelled') AND EXISTS(SELECT 1 FROM public.scheduled_tryout_users r WHERE r.scheduled_tryouts=t.id AND r.user_id=u)))
 ORDER BY t.start_at DESC,t.id LIMIT 100) x;
 RETURN jsonb_build_object('server_now',clock_timestamp(),'schedules',result);
END $f$;

CREATE OR REPLACE FUNCTION public.get_school_schedule_participants(p_schedule_id uuid,p_limit integer DEFAULT 100,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE t public.scheduled_tryouts%ROWTYPE; rows jsonb; total bigint;
BEGIN
 SELECT * INTO t FROM public.scheduled_tryouts WHERE id=p_schedule_id;
 PERFORM private.require_school_staff(t.school_uid);
 IF t.agenda_status IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'Invalid agenda/page'; END IF;
 SELECT count(*) INTO total FROM public.scheduled_tryout_users WHERE scheduled_tryouts=t.id;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.user_id),'[]'::jsonb) INTO rows FROM (
 SELECT r.user_id,p.full_name,e.id attempt_id,e.attempt_status,e.started_at,e.submitted_at,e.deadline_at,e.score,
 (SELECT count(*) FROM public.exam_attempt_answers a WHERE a.attempt_id=e.id) answered_count
 FROM public.scheduled_tryout_users r LEFT JOIN public.profiles p ON p.id=r.user_id
 LEFT JOIN public.exam_attempts e ON e.scheduled_tryout_id=r.scheduled_tryouts AND e.user_id=r.user_id
 WHERE r.scheduled_tryouts=t.id ORDER BY r.user_id LIMIT p_limit OFFSET p_offset) x;
 RETURN jsonb_build_object('schedule_id',t.id,'status',t.agenda_status,'server_now',clock_timestamp(),'total',total,'participants',rows);
END $f$;

CREATE OR REPLACE FUNCTION private.school_agenda_freeze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE sid uuid; state text;
BEGIN
 IF TG_TABLE_NAME='scheduled_tryouts' THEN
  IF OLD.agenda_status IS NOT NULL THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Agenda history cannot be deleted'; END IF;
   IF OLD.agenda_status<>'draft' AND
    (to_jsonb(NEW)-ARRAY['agenda_status','agenda_revision']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['agenda_status','agenda_revision']) THEN RAISE EXCEPTION 'Published agenda is frozen'; END IF;
   IF OLD.agenda_status='cancelled' OR (OLD.agenda_status='published' AND NEW.agenda_status IS DISTINCT FROM 'cancelled')
   THEN RAISE EXCEPTION 'Invalid frozen agenda transition'; END IF;
  END IF;
 ELSE
  sid:=CASE WHEN TG_OP='INSERT' THEN NEW.scheduled_tryouts ELSE OLD.scheduled_tryouts END;
  SELECT agenda_status INTO state FROM public.scheduled_tryouts WHERE id=sid FOR SHARE;
  IF state IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Participant cohort is frozen or legacy'; END IF;
  IF TG_OP='UPDATE' AND NEW.scheduled_tryouts IS DISTINCT FROM OLD.scheduled_tryouts THEN RAISE EXCEPTION 'Cannot move participant history'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $f$;

CREATE OR REPLACE FUNCTION private.school_agenda_content_freeze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE oldrow jsonb; newrow jsonb; ref record; vid uuid; qid uuid; stimulus uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('school:agenda:content:v1',0));
 IF TG_OP<>'INSERT' THEN oldrow:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN newrow:=to_jsonb(NEW); END IF;
 FOR ref IN SELECT x.question_id,x.question_version_id FROM public.scheduled_tryouts t,
  LATERAL jsonb_to_recordset(t.agenda_snapshot->'questions') x(question_id uuid,question_version_id uuid)
  WHERE t.agenda_status IN('published','cancelled') LOOP
  qid:=ref.question_id; vid:=ref.question_version_id;
  SELECT stimulus_id INTO stimulus FROM public.question_versions WHERE id=vid;
  IF (TG_TABLE_NAME='questions' AND (oldrow->>'id'=qid::text OR newrow->>'id'=qid::text))
  OR (TG_TABLE_NAME='question_versions' AND (oldrow->>'id'=vid::text OR newrow->>'id'=vid::text))
  OR (TG_TABLE_NAME IN('question_options','question_category_items') AND
   (oldrow->>'question_version_id'=vid::text OR newrow->>'question_version_id'=vid::text))
  OR (TG_TABLE_NAME='question_stimuli' AND (oldrow->>'id'=stimulus::text OR newrow->>'id'=stimulus::text))
  THEN RAISE EXCEPTION 'Published agenda question content is immutable; create a new version'; END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $f$;

CREATE OR REPLACE FUNCTION private.learning_legacy_start(p_grade integer, p_subject_name text, p_question_count integer DEFAULT 20, p_duration_minutes integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_attempt public.exam_attempts%ROWTYPE;
    v_profile_level text;
    v_level text;
    v_total integer;
    v_questions jsonb;
    v_answers jsonb;
    v_deadline timestamptz;
    v_remaining integer;
    v_resumed boolean := false;
BEGIN
    PERFORM private.school_actor();
    PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||v_user_id::text,0));
    IF EXISTS(SELECT 1 FROM public.exam_attempts WHERE user_id=v_user_id AND grade=p_grade
      AND subject_name=p_subject_name AND attempt_status='IN_PROGRESS'
      AND (scheduled_tryout_id IS NOT NULL OR attempt_type='ASSIGNMENT')) THEN
      RAISE EXCEPTION 'Use the activity-specific start/resume endpoint';
    END IF;
    -- 1. Validasi pengguna
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Silakan login terlebih dahulu.';
    END IF;

    -- 2. Validasi parameter
    IF p_grade NOT IN (6, 9) THEN
        RAISE EXCEPTION 'Jenjang hanya tersedia untuk kelas 6 dan 9.';
    END IF;

    IF p_subject_name IS NULL
       OR btrim(p_subject_name) = '' THEN
        RAISE EXCEPTION 'Mata pelajaran harus diisi.';
    END IF;

    IF p_question_count IS NULL
       OR p_question_count NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'Jumlah soal harus antara 1 sampai 100.';
    END IF;

    IF p_duration_minutes IS NULL
       OR p_duration_minutes NOT BETWEEN 1 AND 240 THEN
        RAISE EXCEPTION 'Durasi ujian tidak valid.';
    END IF;

    -- 3. Validasi jenjang berdasarkan profil resmi
    SELECT lower(p.education_level)
    INTO v_profile_level
    FROM public.profiles p
    WHERE p.id = v_user_id;

    IF NOT FOUND OR v_profile_level IS NULL THEN
        RAISE EXCEPTION 'Jenjang pendidikan belum ditetapkan pada profil.';
    END IF;

    IF (v_profile_level = 'sd' AND p_grade <> 6)
       OR (v_profile_level = 'smp' AND p_grade <> 9)
       OR v_profile_level NOT IN ('sd', 'smp') THEN
        RAISE EXCEPTION
            'Kelas ujian tidak sesuai dengan jenjang pendidikan pada profil.';
    END IF;

    v_level := upper(v_profile_level);

    -- 4. Cegah dua permintaan mulai ujian bersamaan
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            v_user_id::text || ':' ||
            p_grade::text || ':' ||
            p_subject_name,
            0
        )
    );

    -- Preserve historical attempts; never expire another session automatically.
    -- 6. Cari sesi aktif yang masih berlaku
    SELECT *
    INTO v_attempt
    FROM public.exam_attempts
    WHERE user_id = v_user_id
      AND grade = p_grade
      AND subject_name = p_subject_name
      AND attempt_status = 'IN_PROGRESS'
    ORDER BY started_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        v_resumed := true;

        -- Durasi sesi lama tidak boleh berubah
        v_deadline :=
            v_attempt.started_at
            + (v_attempt.duration_minutes * interval '1 minute');

        v_remaining := GREATEST(
            0,
            CEIL(
                EXTRACT(EPOCH FROM (v_deadline - clock_timestamp()))
            )::integer
        );

        v_total := v_attempt.total_questions;

    ELSE
        -- 7. Buat attempt baru
        INSERT INTO public.exam_attempts (
            user_id,
            education_level,
            grade,
            subject_name,
            duration_minutes,
            attempt_type
        )
        VALUES (
            v_user_id,
            v_level,
            p_grade,
            p_subject_name,
            p_duration_minutes,
            'TRYOUT'
        )
        RETURNING * INTO v_attempt;

        -- 8. Ambil paket soal hanya sekali
        WITH selected_questions AS (
            SELECT
                q.id AS question_id,
                v.id AS version_id,
                row_number() OVER (
                    ORDER BY random()
                )::integer AS seq
            FROM public.questions q
            JOIN public.question_versions v
              ON v.question_id = q.id
             AND v.is_current = true
            WHERE q.grade = p_grade
              AND q.subject_name = p_subject_name
              AND q.question_status = 'PUBLISHED'
              AND q.question_type IN (
                  'PG_TUNGGAL',
                  'PGK_MA',
                  'PGK_KATEGORI'
              )
            ORDER BY random()
            LIMIT p_question_count
        )
        INSERT INTO public.exam_attempt_questions (
            attempt_id,
            question_id,
            question_version_id,
            question_order
        )
        SELECT
            v_attempt.id,
            question_id,
            version_id,
            seq
        FROM selected_questions;

        GET DIAGNOSTICS v_total = ROW_COUNT;

        IF v_total = 0 THEN
            RAISE EXCEPTION
                'Belum ditemukan soal terbit untuk kelas % mata pelajaran %.',
                p_grade,
                p_subject_name;
        END IF;

        UPDATE public.exam_attempts
        SET total_questions = v_total
        WHERE id = v_attempt.id;

        v_attempt.total_questions := v_total;

        v_deadline :=
            v_attempt.started_at
            + (v_attempt.duration_minutes * interval '1 minute');

        v_remaining := GREATEST(
            0,
            CEIL(
                EXTRACT(EPOCH FROM (v_deadline - clock_timestamp()))
            )::integer
        );
    END IF;

    -- 9. Susun kembali soal dari attempt yang tersimpan
    SELECT jsonb_agg(
        jsonb_build_object(
            'question_id', q.id,
            'version_id', v.id,
            'question_code', q.question_code,
            'question_order', aq.question_order,
            'question_type', q.question_type,
            'instruction', v.instruction,
            'question_text', v.question_text,

            'stimulus',
            CASE
                WHEN s.id IS NULL THEN NULL
                ELSE jsonb_build_object(
                    'title', s.title,
                    'content_text', s.content_text,
                    'stimulus_type', s.stimulus_type,
                    'file_url', s.file_url,
                    'media_description', s.media_description
                )
            END,

            'options', (
                SELECT COALESCE(
                    jsonb_agg(
                        jsonb_build_object(
                            'option_code', o.option_code,
                            'option_text', o.option_text,
                            'option_order', o.option_order
                        )
                        ORDER BY o.option_order
                    ),
                    '[]'::jsonb
                )
                FROM public.question_options o
                WHERE o.question_version_id = v.id
            ),

            'category_items', (
                SELECT COALESCE(
                    jsonb_agg(
                        jsonb_build_object(
                            'item_number', ci.item_number,
                            'item_text', ci.item_text,
                            'category_label', ci.category_label,
                            'category_options',
                            CASE
                                WHEN ci.category_label IS NULL
                                  OR trim(ci.category_label) = ''
                                THEN '[]'::jsonb
                                ELSE to_jsonb(
                                    regexp_split_to_array(
                                        trim(ci.category_label),
                                        '\s*/\s*'
                                    )
                                )
                            END
                        )
                        ORDER BY ci.item_number
                    ),
                    '[]'::jsonb
                )
                FROM public.question_category_items ci
                WHERE ci.question_version_id = v.id
            )
        )
        ORDER BY aq.question_order
    )
    INTO v_questions
    FROM public.exam_attempt_questions aq
    JOIN public.questions q
      ON q.id = aq.question_id
    JOIN public.question_versions v
      ON v.id = aq.question_version_id
    LEFT JOIN public.question_stimuli s
      ON s.id = v.stimulus_id
    WHERE aq.attempt_id = v_attempt.id;

    -- 10. Ambil jawaban yang sudah tersimpan
    SELECT COALESCE(
        jsonb_object_agg(
            a.question_id::text,
            a.answer_payload
        ),
        '{}'::jsonb
    )
    INTO v_answers
    FROM public.exam_attempt_answers a
    WHERE a.attempt_id = v_attempt.id;

    -- 11. Kembalikan sesi
    RETURN jsonb_build_object(
        'attempt_id', v_attempt.id,
        'education_level', v_attempt.education_level,
        'grade', v_attempt.grade,
        'subject_name', v_attempt.subject_name,
        'total_questions', v_attempt.total_questions,
        'duration_minutes', v_attempt.duration_minutes,
        'remaining_seconds', v_remaining,
        'resumed', v_resumed,
        'answers', v_answers,
        'questions', COALESCE(v_questions, '[]'::jsonb)
    );

END;
$function$;

CREATE OR REPLACE FUNCTION public.get_teacher_workspace(p_school_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$DECLARE result jsonb;
BEGIN
  PERFORM private.require_school_staff(p_school_id);
  SELECT jsonb_build_object(
    'classes', (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.grade,c.name),'[]'::jsonb) FROM public.classes c WHERE c.school_id=p_school_id),
    'assignments', (SELECT COALESCE(jsonb_agg(x.row ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
      SELECT a.created_at,jsonb_build_object('id',a.id,'title',a.title,'class_id',a.class_id,'subject_name',a.subject_name,'grade',a.grade,
        'status',a.status,'opens_at',a.opens_at,'due_at',a.due_at,'duration_minutes',a.duration_minutes,'question_count',a.question_count,
        'created_by',a.created_by,'updated_at',a.updated_at,
        'recipients',(SELECT count(*) FROM public.school_assignment_recipients r WHERE r.assignment_id=a.id),
        'submitted',(SELECT count(*) FROM public.school_assignment_recipients r JOIN public.exam_attempts e ON e.id=r.attempt_id WHERE r.assignment_id=a.id AND e.attempt_status='SUBMITTED')) AS row
      FROM public.school_assignments a WHERE a.school_id=p_school_id ORDER BY a.created_at DESC LIMIT 100
    ) x)
  ) INTO result;
  RETURN result;
END;$function$;

CREATE OR REPLACE FUNCTION public.save_school_assignment(p_school_id uuid, p_class_id uuid, p_title text, p_subject_name text, p_question_count integer, p_duration_minutes integer, p_opens_at timestamp with time zone, p_due_at timestamp with time zone, p_assignment_id uuid DEFAULT NULL::uuid, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$DECLARE c public.classes%ROWTYPE; a public.school_assignments%ROWTYPE; result uuid;
BEGIN
  PERFORM private.require_school_staff(p_school_id);
  SELECT * INTO c FROM public.classes WHERE id=p_class_id AND school_id=p_school_id FOR SHARE;
  IF NOT FOUND OR c.grade NOT IN (6,9) THEN RAISE EXCEPTION 'Pilih kelas 6 atau 9 dari sekolah ini.'; END IF;
  IF p_title IS NULL OR p_subject_name IS NULL OR p_question_count IS NULL OR p_duration_minutes IS NULL OR p_opens_at IS NULL OR p_due_at IS NULL THEN
    RAISE EXCEPTION 'Semua konfigurasi tugas wajib diisi.';
  END IF;
  IF p_due_at <= clock_timestamp() THEN RAISE EXCEPTION 'Batas waktu harus di masa depan.'; END IF;
  IF p_assignment_id IS NULL THEN
    INSERT INTO public.school_assignments(school_id,class_id,created_by,title,subject_name,grade,question_count,duration_minutes,opens_at,due_at)
    VALUES(p_school_id,c.id,auth.uid(),btrim(p_title),btrim(p_subject_name),c.grade,p_question_count,p_duration_minutes,p_opens_at,p_due_at) RETURNING id INTO result;
  ELSE
    SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id AND school_id=p_school_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tugas tidak ditemukan.'; END IF;
    IF a.created_by<>auth.uid() AND NOT private.has_school_role(p_school_id,ARRAY['school_admin']) THEN RAISE EXCEPTION 'Hanya pembuat atau admin dapat mengubah tugas.' USING ERRCODE='42501'; END IF;
    IF a.status<>'draft' THEN RAISE EXCEPTION 'Hanya draft yang dapat diubah.'; END IF;
    IF p_expected_updated_at IS NULL OR a.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'Draft berubah; muat ulang sebelum menyimpan.'; END IF;
    UPDATE public.school_assignments SET class_id=c.id,title=btrim(p_title),subject_name=btrim(p_subject_name),grade=c.grade,
      question_count=p_question_count,duration_minutes=p_duration_minutes,opens_at=p_opens_at,due_at=p_due_at,updated_at=clock_timestamp() WHERE id=a.id;
    result:=a.id;
  END IF;
  RETURN result;
END;$function$;

CREATE OR REPLACE FUNCTION public.set_school_assignment_status(p_assignment_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$DECLARE a public.school_assignments%ROWTYPE; n integer; recipient uuid;
BEGIN
  LOCK TABLE public.schools, public.profiles, public.school_memberships, auth.users IN SHARE MODE;
  SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tugas tidak ditemukan.'; END IF;
  PERFORM private.require_school_staff(a.school_id);
  IF a.created_by<>auth.uid() AND NOT private.has_school_role(a.school_id,ARRAY['school_admin']) THEN RAISE EXCEPTION 'Hanya pembuat atau admin dapat mengubah tugas.' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('published','cancelled') THEN RAISE EXCEPTION 'Status tidak valid.'; END IF;
  IF a.status=p_status THEN RETURN; END IF;
  IF a.status='cancelled' OR (p_status='published' AND a.status<>'draft') THEN RAISE EXCEPTION 'Transisi status tidak valid.'; END IF;
  IF p_status='published' THEN
    IF a.due_at < clock_timestamp()+a.duration_minutes*interval '1 minute' THEN RAISE EXCEPTION 'Waktu pengerjaan tersisa tidak cukup.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id=a.class_id AND school_id=a.school_id AND grade=a.grade) THEN RAISE EXCEPTION 'Kelas tugas telah berubah.'; END IF;
    -- Paket soal identik untuk semua penerima. Snapshot versi tidak berubah setelah publish.
    INSERT INTO public.school_assignment_questions(assignment_id,question_id,question_version_id,question_order)
    SELECT a.id,q.id,v.id,row_number() OVER (ORDER BY q.id)::integer
    FROM public.questions q JOIN public.question_versions v ON v.question_id=q.id AND v.is_current=true
    WHERE q.grade=a.grade AND q.subject_name=a.subject_name AND q.question_status='PUBLISHED'
      AND v.version_status='PUBLISHED' AND q.question_type IN ('PG_TUNGGAL','PGK_MA','PGK_KATEGORI') ORDER BY q.id LIMIT a.question_count;
    GET DIAGNOSTICS n=ROW_COUNT;
    IF n<>a.question_count THEN RAISE EXCEPTION 'Soal terbit tidak cukup: tersedia %, diperlukan %.',n,a.question_count; END IF;
    INSERT INTO public.school_assignment_recipients(assignment_id,user_id)
    SELECT a.id,p.user_id FROM public.student_academic_profiles p
    JOIN public.school_memberships m ON m.user_id=p.user_id AND m.school_id=a.school_id AND m.role='student' AND m.status='active'
    JOIN public.profiles pr ON pr.id=p.user_id AND pr.account_status='active'
    WHERE p.class_id=a.class_id AND p.school_id=a.school_id AND p.grade=a.grade;
    GET DIAGNOSTICS n=ROW_COUNT;
    IF n=0 THEN RAISE EXCEPTION 'Kelas belum memiliki siswa aktif yang sesuai.'; END IF;
    FOR recipient IN SELECT user_id FROM public.school_assignment_recipients WHERE assignment_id=a.id ORDER BY user_id LOOP
      PERFORM private.school_advanced_scope(a.school_id,recipient,ARRAY['student']);
    END LOOP;
  END IF;
  UPDATE public.school_assignments SET status=p_status,updated_at=clock_timestamp() WHERE id=a.id;
END;$function$;

CREATE OR REPLACE FUNCTION public.get_school_assignment_ranking(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$DECLARE a public.school_assignments%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tugas tidak ditemukan.'; END IF;
  PERFORM private.require_school_staff(a.school_id);
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.position),'[]'::jsonb) INTO result FROM (
    SELECT row_number() OVER (ORDER BY e.score DESC,e.submitted_at,e.id) AS position,
      COALESCE(NULLIF(p.full_name,''),'Siswa') AS student_name,e.score,e.correct_answers,e.total_questions,e.submitted_at
    FROM public.school_assignment_recipients r JOIN public.exam_attempts e ON e.id=r.attempt_id AND e.user_id=r.user_id
    LEFT JOIN public.profiles p ON p.id=r.user_id
    WHERE a.status='published' AND r.assignment_id=a.id AND e.attempt_type='ASSIGNMENT' AND e.attempt_status='SUBMITTED' AND e.score IS NOT NULL
    ORDER BY e.score DESC,e.submitted_at,e.id LIMIT 5
  ) x;
  RETURN result;
END;$function$;

CREATE OR REPLACE FUNCTION public.get_student_assignments()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE result jsonb; sid uuid;
BEGIN
  PERFORM private.school_actor();
  FOR sid IN SELECT DISTINCT a.school_id FROM public.school_assignment_recipients r
    JOIN public.school_assignments a ON a.id=r.assignment_id WHERE r.user_id=auth.uid() AND a.status<>'draft' LOOP
    PERFORM private.school_advanced_scope(sid,auth.uid(),ARRAY['student']);
  END LOOP;
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
$function$;

CREATE OR REPLACE FUNCTION private.resume_tka_tryout(p_attempt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE u uuid:=private.school_actor(); a public.exam_attempts%ROWTYPE; qs jsonb; ans jsonb; due timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
  IF EXISTS(SELECT 1 FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u AND scheduled_tryout_id IS NOT NULL) THEN
    due:=private.school_schedule_deadline(p_attempt_id);
  END IF;
  SELECT * INTO a FROM public.exam_attempts
  WHERE id=p_attempt_id AND user_id=u AND tka_code IS NOT NULL AND attempt_type='TRYOUT' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tryout unavailable' USING ERRCODE='42501'; END IF;
  IF a.attempt_status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Tryout is not active'; END IF;
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
    'started_at',a.started_at,'tka_code',a.tka_code,'questions',qs,'answers',ans,
    'deadline_at',coalesce(due,a.started_at+a.duration_minutes*interval '1 minute'),
    'remaining_seconds',greatest(0,floor(extract(epoch FROM
      (coalesce(due,a.started_at+a.duration_minutes*interval '1 minute')-clock_timestamp())))));
END $function$;

CREATE OR REPLACE FUNCTION public.start_tka_tryout(p_tka_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  u uuid:=private.school_actor(); cfg public.tka_configurations%ROWTYPE; lvl text; g integer;
  aid uuid; selected uuid[]:='{}'; more uuid[]; r record; actual integer; access jsonb; subj text;
BEGIN
  IF p_tka_code IS NULL OR btrim(p_tka_code)='' THEN RAISE EXCEPTION 'Invalid TKA code' USING ERRCODE='22023'; END IF;
  -- Share the learning engine's user lock and also serialize this user/config pair.
  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('tka:'||u::text||':'||p_tka_code,0));
  SELECT * INTO cfg FROM public.tka_configurations WHERE tka_code=p_tka_code FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TKA configuration unavailable' USING ERRCODE='22023'; END IF;
  SELECT lower(btrim(education_level)) INTO lvl FROM public.profiles WHERE id=u;
  IF lvl NOT IN('sd','smp','sma') OR lvl IS NULL OR lvl<>lower(btrim(cfg.education_level)) THEN
    RAISE EXCEPTION 'TKA education level mismatch' USING ERRCODE='42501';
  END IF;
  g:=CASE lvl WHEN 'sd' THEN 6 WHEN 'smp' THEN 9 ELSE 12 END;
  IF cfg.total_questions<=0 OR cfg.duration_minutes<=0 OR cfg.type NOT IN('RANDOM','SET') THEN
    RAISE EXCEPTION 'Invalid TKA configuration' USING ERRCODE='22023';
  END IF;
  SELECT id INTO aid FROM public.exam_attempts WHERE user_id=u AND tka_code=cfg.tka_code
    AND scheduled_tryout_id IS NULL AND attempt_type='TRYOUT' AND attempt_status='IN_PROGRESS'
    AND clock_timestamp()<started_at+duration_minutes*interval '1 minute'
    ORDER BY started_at DESC,id LIMIT 1 FOR UPDATE;
  IF aid IS NOT NULL THEN RETURN private.resume_tka_tryout(aid)||jsonb_build_object('resumed',true); END IF;
  -- Respect the installed entitlement policy; stage 9 intentionally removes subscription gates.
  access:=public.learning_access_context();
  IF NOT coalesce((access->>'unrestricted')::boolean,false)
     AND NOT coalesce((access->>'subscribed')::boolean,false) THEN
    RAISE EXCEPTION 'LEARNING_SUBSCRIPTION_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT name INTO subj FROM public.subjects WHERE subject_code=cfg.subject_code LIMIT 1;
  IF subj IS NULL THEN RAISE EXCEPTION 'TKA subject unavailable'; END IF;
  -- Keep the legacy one-active-subject index intact, without resuming a different configuration.
  -- No automatic expiration: preserve all historical and event attempts.
  IF EXISTS(SELECT 1 FROM public.exam_attempts WHERE user_id=u AND grade=g AND subject_name=subj AND attempt_status='IN_PROGRESS') THEN
    RAISE EXCEPTION 'Finish or resume the existing subject session';
  END IF;
  IF cfg.type='RANDOM' THEN
    FOR r IN SELECT * FROM public.tka_question_config WHERE tka_code=cfg.tka_code ORDER BY id LOOP
      SELECT coalesce(array_agg(x.id),'{}'::uuid[]) INTO more FROM (
        SELECT q.id FROM public.questions q WHERE q.subject_code=cfg.subject_code AND q.grade=g
          AND lower(q.education_level_id)=lvl AND q.question_status='PUBLISHED'
          AND q.theme=r.theme AND q.topic=r.topic AND NOT(q.id=ANY(selected))
          AND EXISTS(SELECT 1 FROM public.question_versions v WHERE v.question_id=q.id AND v.version_status='PUBLISHED')
        ORDER BY random() LIMIT greatest(0,least(r.no_of_questions,cfg.total_questions-cardinality(selected)))
      ) x;
      selected:=selected||more;
      EXIT WHEN cardinality(selected)>=cfg.total_questions;
    END LOOP;
  ELSE
    SELECT coalesce(array_agg(x.id),'{}'::uuid[]) INTO selected FROM (
      SELECT q.id FROM public.questions q WHERE q.subject_code=cfg.subject_code AND q.grade=g
        AND lower(q.education_level_id)=lvl AND q.question_status='PUBLISHED'
        AND EXISTS(SELECT 1 FROM public.tka_question_set s WHERE s.tka_code=cfg.tka_code AND s.question_code=q.question_code)
        AND EXISTS(SELECT 1 FROM public.question_versions v WHERE v.question_id=q.id AND v.version_status='PUBLISHED')
      ORDER BY random() LIMIT cfg.total_questions
    ) x;
  END IF;
  SELECT coalesce(array_agg(x.id),'{}'::uuid[]) INTO more FROM (
    SELECT q.id FROM public.questions q WHERE q.subject_code=cfg.subject_code AND q.grade=g
      AND lower(q.education_level_id)=lvl AND q.question_status='PUBLISHED' AND NOT(q.id=ANY(selected))
      AND EXISTS(SELECT 1 FROM public.question_versions v WHERE v.question_id=q.id AND v.version_status='PUBLISHED')
    ORDER BY random() LIMIT greatest(0,cfg.total_questions-cardinality(selected))
  ) x;
  selected:=selected||more;
  IF cardinality(selected)=0 THEN RAISE EXCEPTION 'No published questions available'; END IF;
  INSERT INTO public.exam_attempts(user_id,education_level,grade,subject_name,duration_minutes,total_questions,
    attempt_type,tka_code,started_at,deadline_at)
  VALUES(u,upper(lvl),g,subj,cfg.duration_minutes,cardinality(selected),'TRYOUT',cfg.tka_code,
    clock_timestamp(),NULL) RETURNING id INTO aid;
  INSERT INTO public.exam_attempt_questions(attempt_id,question_id,question_version_id,question_order)
  SELECT aid,q.id,v.id,row_number() OVER(ORDER BY random())::integer
  FROM public.questions q JOIN LATERAL (
    SELECT id FROM public.question_versions WHERE question_id=q.id AND version_status='PUBLISHED'
    ORDER BY version_number DESC,id DESC LIMIT 1
  ) v ON true WHERE q.id=ANY(selected);
  GET DIAGNOSTICS actual=ROW_COUNT;
  IF actual=0 THEN RAISE EXCEPTION 'No published questions available'; END IF;
  UPDATE public.exam_attempts SET total_questions=actual,
    deadline_at=started_at+duration_minutes*interval '1 minute' WHERE id=aid;
  RETURN private.resume_tka_tryout(aid)||jsonb_build_object('resumed',false);
END $function$;

CREATE OR REPLACE FUNCTION public.school_advanced_capabilities(p_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN
 PERFORM private.school_require(p_school_id,false);
 PERFORM private.school_advanced_scope(p_school_id,private.school_actor(),ARRAY['teacher','school_admin','student']);
 RETURN jsonb_build_object('capability_version','school-advanced-sql/1','school_id',p_school_id,
 'assignment_contract',1,'agenda_contract',1,'single_set_package',true,'max_attempts',1,
 'full_duration_start',true,'revocation_finalize','deny','school_reference','schools.id');
END $f$;
CREATE TRIGGER school_agenda_freeze BEFORE UPDATE OR DELETE ON public.scheduled_tryouts
 FOR EACH ROW EXECUTE FUNCTION private.school_agenda_freeze();
CREATE TRIGGER school_agenda_cohort_freeze BEFORE INSERT OR UPDATE OR DELETE ON public.scheduled_tryout_users
 FOR EACH ROW EXECUTE FUNCTION private.school_agenda_freeze();

-- Freeze referenced content, not merely IDs. All publication/content writers serialize
-- on one advisory lock so a concurrent edit cannot pass before publication commits.

CREATE TRIGGER school_agenda_content_freeze BEFORE UPDATE OR DELETE ON public.questions
 FOR EACH ROW EXECUTE FUNCTION private.school_agenda_content_freeze();
CREATE TRIGGER school_agenda_content_freeze BEFORE UPDATE OR DELETE ON public.question_versions
 FOR EACH ROW EXECUTE FUNCTION private.school_agenda_content_freeze();
CREATE TRIGGER school_agenda_content_freeze BEFORE INSERT OR UPDATE OR DELETE ON public.question_options
 FOR EACH ROW EXECUTE FUNCTION private.school_agenda_content_freeze();
CREATE TRIGGER school_agenda_content_freeze BEFORE INSERT OR UPDATE OR DELETE ON public.question_category_items
 FOR EACH ROW EXECUTE FUNCTION private.school_agenda_content_freeze();
CREATE TRIGGER school_agenda_content_freeze BEFORE UPDATE OR DELETE ON public.question_stimuli
 FOR EACH ROW EXECUTE FUNCTION private.school_agenda_content_freeze();

REVOKE ALL ON FUNCTION private.school_assignment_access(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.school_assignment_deadline(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.learning_legacy_assignment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.resume_school_assignment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_exam_answer(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_answer(uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.school_agenda_freeze() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.school_agenda_content_freeze() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.xget_teacher_workspace(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.xsave_school_assignment(uuid,uuid,text,text,integer,integer,timestamp with time zone,timestamp with time zone,uuid,timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.xset_school_assignment_status(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.xget_school_assignment_ranking(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.learning_legacy_start(integer,text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.school_advanced_scope(uuid,uuid,text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.require_school_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.school_schedule_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.school_schedule_deadline(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.resume_tka_tryout(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_teacher_workspace(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_workspace(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.save_school_assignment(uuid,uuid,text,text,integer,integer,timestamp with time zone,timestamp with time zone,uuid,timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_school_assignment(uuid,uuid,text,text,integer,integer,timestamp with time zone,timestamp with time zone,uuid,timestamp with time zone) TO authenticated;
REVOKE ALL ON FUNCTION public.set_school_assignment_status(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_school_assignment_status(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_school_assignment_ranking(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_school_assignment_ranking(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_student_assignments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_assignments() TO authenticated;
REVOKE ALL ON FUNCTION public.start_tka_tryout(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_tka_tryout(text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_school_schedule(uuid,text,text,timestamptz,timestamptz,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_school_schedule(uuid,text,text,timestamptz,timestamptz,uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.set_school_schedule_status(uuid,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_school_schedule_status(uuid,text,bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.start_school_schedule(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_school_schedule(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_school_schedule_agenda(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_school_schedule_agenda(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_school_schedule_participants(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_school_schedule_participants(uuid,integer,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.school_advanced_capabilities(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_advanced_capabilities(uuid) TO authenticated;
COMMIT;
