-- Runner owns BEGIN + SAVEPOINT; never COMMIT test fixtures.
CREATE TEMP TABLE onboarding_test_context(k text PRIMARY KEY,v text);
GRANT SELECT,INSERT,UPDATE ON onboarding_test_context TO authenticated;
CREATE FUNCTION pg_temp.ob_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.ob_denied(sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 PERFORM pg_temp.ob_assert(rejected,'Expected access denial: '||sql);
END $$;
CREATE FUNCTION pg_temp.ob_error(sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN raise_exception OR check_violation OR unique_violation OR invalid_parameter_value THEN rejected:=true; END;
 PERFORM pg_temp.ob_assert(rejected,'Expected rejection: '||sql);
END $$;
DO $$
DECLARE fixture_key text; u uuid; st text;
BEGIN
 SELECT id INTO st FROM public.school_types WHERE lower(education_level_id)='sd' LIMIT 1;
 PERFORM pg_temp.ob_assert(st IS NOT NULL,'SD school type required');
 INSERT INTO onboarding_test_context VALUES('school_type',st);
 FOREACH fixture_key IN ARRAY ARRAY['super','operator','unprivileged','owner','other','student','student2','target','unverified','disabled'] LOOP
 u:=gen_random_uuid();
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 VALUES(u,u::text||'@onboarding.invalid',CASE WHEN fixture_key<>'unverified' THEN now() END,
 jsonb_build_object('full_name','Onboarding '||fixture_key,'registration_method','independent','education_level','sd'));
 INSERT INTO onboarding_test_context VALUES(fixture_key,u::text);
 END LOOP;
 UPDATE public.profiles SET account_status='suspended' WHERE id=(SELECT v::uuid FROM onboarding_test_context WHERE k='disabled');
 INSERT INTO public.user_global_roles(user_id,role) SELECT v::uuid,'super_admin' FROM onboarding_test_context WHERE k='super';
 INSERT INTO public.admin_operator_accounts(user_id,is_active) SELECT v::uuid,true FROM onboarding_test_context WHERE k IN ('operator','unprivileged');
 INSERT INTO public.admin_operator_permissions(user_id,permission_code) SELECT v::uuid,'school_onboarding.review' FROM onboarding_test_context WHERE k='operator';
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE d jsonb; a jsonb; b jsonb; sid uuid; cid uuid; code text; request_id uuid; membership uuid; msg uuid; ticket uuid; tr uuid; other_sid uuid; n integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM pg_temp.ob_denied('SELECT public.school_portal_context()');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='unverified'),true);
 PERFORM pg_temp.ob_denied('SELECT public.school_portal_context()');
 PERFORM pg_temp.ob_denied('SELECT public.submit_school_application(''{}'')');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='disabled'),true);
 PERFORM pg_temp.ob_denied('SELECT public.school_portal_context()');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='owner'),true);
 d:=jsonb_build_object('school_name','Onboarding fixture','npsn','98172931','school_type_id',(SELECT v FROM onboarding_test_context WHERE k='school_type'),
 'address','Fixture address','city','Jakarta','province','Jakarta','teacher_name','Fixture teacher','teacher_position','Coordinator','contact_phone','08123456789','authorization_confirmed',true);
 a:=public.submit_school_application(d); b:=public.submit_school_application(d);
 PERFORM pg_temp.ob_assert(a=b,'Application retry idempotent');
 PERFORM pg_temp.ob_assert(jsonb_array_length(public.school_portal_context()->'memberships')=0,'Application must not grant membership');
 INSERT INTO onboarding_test_context VALUES('application',a->>'application_id');
 PERFORM pg_temp.ob_denied('INSERT INTO public.schools(name,created_by) VALUES(''Bypass'',auth.uid())');
 PERFORM pg_temp.ob_denied('UPDATE public.schools SET name=''Bypass''');
 PERFORM pg_temp.ob_denied('INSERT INTO public.school_memberships(school_id,user_id,role) VALUES(gen_random_uuid(),auth.uid(),''school_admin'')');
 PERFORM pg_temp.ob_denied('UPDATE public.school_invites SET used_count=0');
 PERFORM pg_temp.ob_denied('DELETE FROM public.classes');
 PERFORM pg_temp.ob_denied('TRUNCATE public.schools CASCADE');
 PERFORM pg_temp.ob_denied('SELECT * FROM public.school_applications');
 PERFORM pg_temp.ob_denied('SELECT public.review_school_application('''||(a->>'application_id')||''',''approved'',''test'')');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='unprivileged'),true);
 PERFORM pg_temp.ob_denied('SELECT public.review_school_application('''||(a->>'application_id')||''',''approved'',''test'')');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='operator'),true);
 PERFORM pg_temp.ob_assert((public.school_portal_context()->>'is_platform_admin')::boolean=false,'Operator is not superadmin');
 PERFORM pg_temp.ob_assert((public.school_portal_context()->>'can_review_applications')::boolean,'Authorized operator review');
 b:=public.review_school_application((a->>'application_id')::uuid,'approved','Verified fixture');
 sid:=(b->>'school_id')::uuid;
 PERFORM pg_temp.ob_assert(b=public.review_school_application((a->>'application_id')::uuid,'approved','Retry'),'Review retry');
 PERFORM pg_temp.ob_denied('SELECT public.school_admin_workspace('''||sid||''')');
 PERFORM pg_temp.ob_denied('SELECT public.school_coordinator_transfer(''recover'',jsonb_build_object(''school_id'','''||sid||''',''email'',''test@example.invalid'',''reason'',''Recovery fixture''))');
 PERFORM pg_temp.ob_assert(jsonb_array_length(public.platform_school_workspace()->'tickets')=0,'Operator cannot access support tickets');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='owner'),true);
 PERFORM pg_temp.ob_assert(public.school_admin_workspace(sid)->'school'->>'primary_user_id'=(SELECT v FROM onboarding_test_context WHERE k='owner'),'Provision primary');
 a:=public.school_admin_mutate(sid,'class_save','{"name":"6 A","grade":6,"academic_year":"2026/2027"}'); cid:=(a->>'class_id')::uuid;
 INSERT INTO onboarding_test_context VALUES('school',sid::text),('class',cid::text);
 PERFORM pg_temp.ob_error('SELECT public.school_admin_mutate('''||sid||''',''class_save'',''{"name":"bad","grade":9,"academic_year":"2026/2027"}'')');
 PERFORM pg_temp.ob_denied('SELECT public.school_admin_mutate('''||sid||''',''invite_create'',jsonb_build_object(''class_id'','''||cid||''',''days'',7,''max_uses'',1,''role'',''teacher''))');
 a:=public.school_admin_mutate(sid,'invite_create',jsonb_build_object('class_id',cid,'days',7,'max_uses',1)); code:=a->>'code';
 INSERT INTO onboarding_test_context VALUES('invite',a->>'invite_id'),('code',code);
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='student'),true);
 a:=public.school_invite_request(code);
 PERFORM pg_temp.ob_assert(a->>'school_name'='Onboarding fixture' AND NOT (a ? 'sender_id') AND NOT (a ? 'contact_phone'),'Minimal preview');
 a:=public.school_invite_request(code,true); b:=public.school_invite_request(code,true);
 request_id:=(a->>'request_id')::uuid;
 INSERT INTO onboarding_test_context VALUES('request',request_id::text);
 PERFORM pg_temp.ob_assert(a=b AND a->>'status'='pending','Join retry, pending');
 PERFORM pg_temp.ob_assert(jsonb_array_length(public.school_portal_context()->'memberships')=0,'Pending user not active');
 PERFORM pg_temp.ob_denied('SELECT public.school_admin_workspace('''||sid||''')');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='student2'),true);
 PERFORM pg_temp.ob_error('SELECT public.school_invite_request('''||code||''',true)');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='owner'),true);
 PERFORM public.school_admin_mutate(sid,'member_approve',jsonb_build_object('request_id',request_id));
 PERFORM public.school_admin_mutate(sid,'member_approve',jsonb_build_object('request_id',request_id));
 a:=public.school_admin_workspace(sid);
 PERFORM pg_temp.ob_assert((a->'invites'->0->>'used_count')::integer=1,'Quota consumed exactly once, approval no second increment');
 SELECT (x->>'membership_id')::uuid INTO membership FROM jsonb_array_elements(a->'members') x WHERE x->>'role'='student';
 INSERT INTO onboarding_test_context VALUES('membership',membership::text);
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='student'),true);
 a:=public.school_communication_mutate('message_send',jsonb_build_object('school_id',sid,'recipient_id',(SELECT v FROM onboarding_test_context WHERE k='owner'),'body','Private student message')); msg:=(a->>'id')::uuid;
 PERFORM pg_temp.ob_denied('SELECT public.school_communication_mutate(''message_send'',jsonb_build_object(''school_id'','''||sid||''',''body'',''Unauthorized broadcast''))');
 PERFORM pg_temp.ob_assert(jsonb_array_length(public.school_communications(sid)->'messages')=1,'Sender sees private message');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='other'),true);
 PERFORM pg_temp.ob_denied('SELECT public.school_communications('''||sid||''')');
 PERFORM pg_temp.ob_assert(jsonb_array_length(public.school_communications()->'messages')=0,'Outsider no message visibility');
 PERFORM pg_temp.ob_denied('SELECT public.school_communication_mutate(''message_read'',jsonb_build_object(''message_id'','''||msg||'''))');
 -- Second provisioned school exercises genuine cross-school class/member access.
 a:=public.submit_school_application(d||'{"npsn":"98172932","school_name":"Other fixture"}');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='super'),true);
 b:=public.review_school_application((a->>'application_id')::uuid,'approved','Other school'); other_sid:=(b->>'school_id')::uuid;
 INSERT INTO onboarding_test_context VALUES('other_school',other_sid::text);
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='other'),true);
 PERFORM pg_temp.ob_denied('SELECT public.school_admin_workspace('''||sid||''')');
 PERFORM pg_temp.ob_error('SELECT public.school_admin_mutate('''||other_sid||''',''invite_create'',jsonb_build_object(''class_id'','''||cid||''',''days'',7,''max_uses'',1))');
 PERFORM pg_temp.ob_error('SELECT public.school_admin_mutate('''||other_sid||''',''member_approve'',jsonb_build_object(''request_id'','''||request_id||'''))');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='owner'),true);
 PERFORM public.school_communication_mutate('message_read',jsonb_build_object('message_id',msg));
 PERFORM public.school_communication_mutate('message_read',jsonb_build_object('message_id',msg));
 PERFORM pg_temp.ob_assert(public.school_communications(sid)->'messages'->0->>'read_at' IS NOT NULL,'Read receipt');
 a:=public.school_communication_mutate('message_forward',jsonb_build_object('message_id',msg,'subject','Support needed')); ticket:=(a->>'id')::uuid;
 PERFORM pg_temp.ob_assert(a=public.school_communication_mutate('message_forward',jsonb_build_object('message_id',msg,'subject','Retry')),'Forward idempotent');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='student'),true);
 PERFORM pg_temp.ob_assert(jsonb_array_length(public.school_communications(sid)->'tickets')=0,'Tickets coordinator only');
 PERFORM pg_temp.ob_denied('SELECT public.school_communication_mutate(''ticket_reply'',jsonb_build_object(''ticket_id'','''||ticket||''',''body'',''Student reply''))');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='super'),true);
 PERFORM public.school_communication_mutate('ticket_reply',jsonb_build_object('ticket_id',ticket,'body','Platform support'));
 PERFORM pg_temp.ob_assert(jsonb_array_length(public.platform_school_workspace()->'tickets')>=1,'Platform forwarded ticket');
 -- Superadmin cannot silently read all school private conversations.
 PERFORM pg_temp.ob_assert(jsonb_array_length(public.school_communications()->'messages')=0,'Platform no private message backdoor');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='owner'),true);
 a:=public.school_coordinator_transfer('propose',jsonb_build_object('school_id',sid,'email',(SELECT v FROM onboarding_test_context WHERE k='target')||'@onboarding.invalid')); tr:=(a->>'transfer_id')::uuid;
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='other'),true);
 PERFORM pg_temp.ob_denied('SELECT public.school_coordinator_transfer(''accept'',jsonb_build_object(''transfer_id'','''||tr||'''))');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='target'),true);
 a:=public.school_coordinator_transfer('accept',jsonb_build_object('transfer_id',tr));
 b:=public.school_coordinator_transfer('accept',jsonb_build_object('transfer_id',tr));
 PERFORM pg_temp.ob_assert(a->>'status'='accepted' AND b->>'status'='accepted','Transfer acceptance replay');
 PERFORM pg_temp.ob_assert(public.school_admin_workspace(sid)->'school'->>'primary_user_id'=(SELECT v FROM onboarding_test_context WHERE k='target'),'Primary transferred');
 PERFORM pg_temp.ob_assert(jsonb_array_length(public.school_communications(sid)->'tickets')=1,'Ticket history retained');
 -- Private messages to the old primary do not become visible to the new primary.
 PERFORM pg_temp.ob_assert(jsonb_array_length(public.school_communications(sid)->'messages')=0,'Transfer preserves private recipient scope');
 a:=public.school_admin_mutate(sid,'class_save','{"name":"6 B","grade":6,"academic_year":"2026/2027"}');
 PERFORM public.school_admin_mutate(sid,'member_move',jsonb_build_object('membership_id',membership,'class_id',a->>'class_id'));
 PERFORM pg_temp.ob_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(public.school_admin_workspace(sid)->'members') x WHERE x->>'membership_id'=membership::text AND x->>'class_id'=a->>'class_id'),'Student moved within school');
 a:=public.school_coordinator_transfer('propose',jsonb_build_object('school_id',sid,'email','cancelled@example.invalid'));
 PERFORM public.school_coordinator_transfer('cancel',jsonb_build_object('transfer_id',a->>'transfer_id'));
 PERFORM pg_temp.ob_denied('SELECT public.school_coordinator_transfer(''accept'',jsonb_build_object(''transfer_id'','''||(a->>'transfer_id')||'''))');
 PERFORM public.school_admin_mutate(sid,'member_deactivate',jsonb_build_object('membership_id',membership));
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='student'),true);
 PERFORM pg_temp.ob_denied('SELECT public.school_communications('''||sid||''')');
 a:=public.school_invite_request(code,true);
 PERFORM pg_temp.ob_assert(a->>'status'='deactivated','Replay cannot reactivate membership');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='owner'),true);
 PERFORM pg_temp.ob_denied('SELECT public.school_admin_workspace('''||sid||''')');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='super'),true);
 a:=public.school_coordinator_transfer('recover',jsonb_build_object('school_id',sid,'email',(SELECT v FROM onboarding_test_context WHERE k='owner')||'@onboarding.invalid','reason','Verified coordinator recovery'));
 INSERT INTO onboarding_test_context VALUES('recovery',a->>'transfer_id');
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='owner'),true);
 PERFORM public.school_coordinator_transfer('accept',jsonb_build_object('transfer_id',a->>'transfer_id'));
 PERFORM public.school_admin_mutate(sid,'profile_update','{"address":"Updated address","city":"Bandung","province":"Jawa Barat","contact_phone":"08123456789","name":"Identity injection ignored","npsn":"00000000"}');
 PERFORM pg_temp.ob_assert(public.school_admin_workspace(sid)->'school'->>'npsn'='98172931','Identity immutable');
 -- Expiry/revocation and rejection do not free reserved quota.
 a:=public.school_admin_mutate(sid,'invite_create',jsonb_build_object('class_id',cid,'days',1,'max_uses',1));
 INSERT INTO onboarding_test_context VALUES('expired_invite',a->>'invite_id'),('expired_code',a->>'code');
 b:=public.school_admin_mutate(sid,'invite_create',jsonb_build_object('class_id',cid,'days',7,'max_uses',1));
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='student2'),true);
 b:=public.school_invite_request(b->>'code',true);
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='owner'),true);
 PERFORM public.school_admin_mutate(sid,'member_reject',jsonb_build_object('request_id',b->>'request_id'));
 PERFORM public.school_admin_mutate(sid,'member_reject',jsonb_build_object('request_id',b->>'request_id'));
 PERFORM public.school_admin_mutate(sid,'invite_revoke',jsonb_build_object('invite_id',a->>'invite_id'));
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='student2'),true);
 PERFORM pg_temp.ob_error('SELECT public.school_invite_request('''||(a->>'code')||''',true)');
END $$;
RESET ROLE;
DO $$
DECLARE sid uuid:=(SELECT v::uuid FROM onboarding_test_context WHERE k='school'); f text; r record;
BEGIN
 PERFORM pg_temp.ob_assert((SELECT count(*)=1 FROM public.school_memberships m JOIN public.school_onboarding_settings s ON s.school_id=m.school_id AND s.primary_user_id=m.user_id WHERE m.school_id=sid AND m.status='active' AND m.role='school_admin'),'Exactly one active designated primary');
 PERFORM pg_temp.ob_assert((SELECT count(*)=2 FROM public.school_coordinator_transfers WHERE school_id=sid AND status='accepted'),'Transfer history retained');
 PERFORM pg_temp.ob_assert((SELECT count(*)>=20 FROM public.school_onboarding_audit WHERE actor_id IN (SELECT v::uuid FROM onboarding_test_context WHERE k IN ('owner','operator','student','target','super'))),'Mutations audited');
 PERFORM pg_temp.ob_assert(NOT EXISTS(SELECT 1 FROM public.school_onboarding_audit WHERE (old_data ? 'invite_code' OR new_data ? 'invite_code')),'Bearer codes absent from audit');
 FOR r IN SELECT p.proname,pg_get_functiondef(p.oid) def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('school_admin_mutate','school_invite_request','school_coordinator_transfer','review_school_application') LOOP
 PERFORM pg_temp.ob_assert(r.def ILIKE '%FOR UPDATE%','Critical mutation row lock: '||r.proname);
 END LOOP;
 PERFORM pg_temp.ob_assert((SELECT used_count=1 FROM public.school_invites WHERE id=(SELECT v::uuid FROM onboarding_test_context WHERE k='invite')),'No overbooking');
 -- A legacy school has no designated primary; migration must not guess.
 INSERT INTO public.schools(name,created_by) VALUES('Legacy recovery fixture',(SELECT v::uuid FROM onboarding_test_context WHERE k='owner')) RETURNING id INTO sid;
 INSERT INTO onboarding_test_context VALUES('legacy',sid::text);
 PERFORM pg_temp.ob_assert(NOT EXISTS(SELECT 1 FROM public.school_onboarding_settings WHERE school_id=sid),'No arbitrary legacy primary');
 -- Expired invite rejected even while status remains active.
 UPDATE public.school_invites SET status='active',expires_at=now()-interval '1 second' WHERE id=(SELECT v::uuid FROM onboarding_test_context WHERE k='expired_invite');
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='student2'),true);
 PERFORM pg_temp.ob_error('SELECT public.school_invite_request('''||(SELECT v FROM onboarding_test_context WHERE k='expired_code')||''',true)');
END $$;
DO $$ DECLARE a jsonb; sid uuid:=(SELECT v::uuid FROM onboarding_test_context WHERE k='legacy'); BEGIN
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='super'),true);
 a:=public.school_coordinator_transfer('recover',jsonb_build_object('school_id',sid,'email',(SELECT v FROM onboarding_test_context WHERE k='target')||'@onboarding.invalid','reason','Legacy ownership verified'));
 PERFORM set_config('request.jwt.claim.sub',(SELECT v FROM onboarding_test_context WHERE k='target'),true);
 PERFORM public.school_coordinator_transfer('accept',jsonb_build_object('transfer_id',a->>'transfer_id'));
 PERFORM pg_temp.ob_assert(public.school_admin_workspace(sid)->'school'->>'primary_user_id'=(SELECT v FROM onboarding_test_context WHERE k='target'),'Explicit legacy primary recovery');
END $$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
