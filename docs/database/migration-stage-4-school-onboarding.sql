-- Stage 4. Run only through the guarded runner; stages 1-3 are prerequisites.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtextextended('school-onboarding-stage-4',0));

CREATE TABLE IF NOT EXISTS public.school_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES auth.users(id),
  school_name text NOT NULL CHECK(length(school_name) BETWEEN 3 AND 160),
  npsn text NOT NULL CHECK(npsn ~ '^[0-9]{8}$'),
  school_type_id text NOT NULL REFERENCES public.school_types(id),
  address text NOT NULL CHECK(length(address) BETWEEN 3 AND 500),
  city text NOT NULL CHECK(length(city) BETWEEN 2 AND 100),
  province text NOT NULL CHECK(length(province) BETWEEN 2 AND 100),
  teacher_name text NOT NULL CHECK(length(teacher_name) BETWEEN 2 AND 160),
  teacher_position text NOT NULL CHECK(length(teacher_position) BETWEEN 2 AND 100),
  contact_phone text NOT NULL CHECK(length(contact_phone) BETWEEN 6 AND 30),
  authorization_confirmed boolean NOT NULL CHECK(authorization_confirmed),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  school_id uuid REFERENCES public.schools(id),
  reviewed_by uuid REFERENCES auth.users(id), review_note text CHECK(length(review_note)<=2000),
  created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
  CHECK((status='approved')=(school_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS school_application_pending_npsn ON public.school_applications(npsn) WHERE status='pending';
CREATE UNIQUE INDEX IF NOT EXISTS school_application_pending_user ON public.school_applications(applicant_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS public.school_onboarding_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id),
  primary_user_id uuid REFERENCES auth.users(id),
  application_id uuid UNIQUE REFERENCES public.school_applications(id),
  contact_phone text CHECK(length(contact_phone)<=30)
);
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS onboarding_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.school_invites ADD COLUMN IF NOT EXISTS onboarding_class_id uuid REFERENCES public.classes(id);
CREATE TABLE IF NOT EXISTS public.school_invite_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.school_invites(id),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  class_id uuid NOT NULL REFERENCES public.classes(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','deactivated')),
  created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
  UNIQUE(invite_id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS school_request_pending_user ON public.school_invite_requests(user_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS public.school_coordinator_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES public.schools(id),
  from_user_id uuid REFERENCES auth.users(id), target_email text NOT NULL CHECK(length(target_email) BETWEEN 3 AND 254),
  proposed_by uuid NOT NULL REFERENCES auth.users(id),
  recovery boolean NOT NULL DEFAULT false, reason text CHECK(length(reason)<=2000),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','cancelled')),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  accepted_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS school_transfer_pending ON public.school_coordinator_transfers(school_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS public.school_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES public.schools(id),
  sender_id uuid NOT NULL REFERENCES auth.users(id), recipient_id uuid REFERENCES auth.users(id),
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
  platform_origin boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.school_message_reads (
  message_id uuid NOT NULL REFERENCES public.school_messages(id), user_id uuid NOT NULL REFERENCES auth.users(id),
  read_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(message_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.school_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES public.schools(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  subject text NOT NULL CHECK(length(subject) BETWEEN 3 AND 160),
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
  forwarded_message_id uuid REFERENCES public.school_messages(id),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS school_ticket_forward_once ON public.school_support_tickets(forwarded_message_id) WHERE forwarded_message_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.school_ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES public.school_support_tickets(id),
  sender_id uuid NOT NULL REFERENCES auth.users(id), body text NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
  platform_origin boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.school_onboarding_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid, table_name text NOT NULL, row_id text NOT NULL, operation text NOT NULL,
  old_data jsonb, new_data jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS school_invite_requests_school ON public.school_invite_requests(school_id,created_at);
CREATE INDEX IF NOT EXISTS school_messages_school ON public.school_messages(school_id,created_at DESC);
CREATE INDEX IF NOT EXISTS school_tickets_school ON public.school_support_tickets(school_id,created_at DESC);
CREATE INDEX IF NOT EXISTS school_replies_ticket ON public.school_ticket_replies(ticket_id,created_at);

-- Permissions use the existing superadmin-managed operator permission store.
CREATE OR REPLACE FUNCTION private.valid_admin_permissions()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
 SELECT ARRAY['bank_soal.view','bank_soal.review','bank_soal.edit','bank_soal.moderate','bank_soal.publish','bank_soal.import','education_level.review','school_onboarding.review']::text[];
$$;
CREATE OR REPLACE FUNCTION private.school_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users a JOIN public.profiles p ON p.id=a.id
 WHERE a.id=u AND a.email_confirmed_at IS NOT NULL AND a.deleted_at IS NULL
 AND (a.banned_until IS NULL OR a.banned_until<=now()) AND p.account_status='active') THEN
 RAISE EXCEPTION 'Active verified account required' USING ERRCODE='42501'; END IF;
 RETURN u;
END $$;
CREATE OR REPLACE FUNCTION private.school_super()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_global_roles WHERE user_id=auth.uid() AND role='super_admin');
$$;
CREATE OR REPLACE FUNCTION private.school_reviewer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT private.school_super() OR EXISTS(SELECT 1 FROM public.admin_operator_accounts a
 JOIN public.admin_operator_permissions p ON p.user_id=a.user_id
 WHERE a.user_id=auth.uid() AND a.is_active AND p.permission_code='school_onboarding.review');
$$;
CREATE OR REPLACE FUNCTION private.school_role(p_school uuid,p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.school_memberships m JOIN public.schools s ON s.id=m.school_id
 WHERE m.school_id=p_school AND m.user_id=auth.uid() AND m.status='active' AND m.role=ANY(p_roles) AND s.status='active');
$$;
CREATE OR REPLACE FUNCTION private.school_require(p_school uuid,p_admin boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 PERFORM private.school_actor();
 -- SHARE prevents deactivation and role changes while a mutation is in flight.
 PERFORM 1 FROM public.schools WHERE id=p_school AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'School access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.school_memberships WHERE school_id=p_school AND user_id=auth.uid() AND status='active'
 AND (NOT p_admin OR role='school_admin') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'School access denied' USING ERRCODE='42501'; END IF;
END $$;
CREATE OR REPLACE FUNCTION private.school_text(p_data jsonb,p_key text,p_min integer,p_max integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v text:=btrim(p_data->>p_key);
BEGIN
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR jsonb_typeof(p_data->p_key) IS DISTINCT FROM 'string'
 OR length(v) NOT BETWEEN p_min AND p_max THEN RAISE EXCEPTION 'Invalid field: %',p_key USING ERRCODE='22023'; END IF;
 RETURN v;
END $$;
CREATE OR REPLACE FUNCTION private.school_audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE o jsonb; n jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN o:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN n:=to_jsonb(NEW); END IF;
 -- Never retain bearer invite codes in the audit log.
 INSERT INTO public.school_onboarding_audit(actor_id,table_name,row_id,operation,old_data,new_data)
 VALUES(auth.uid(),TG_TABLE_NAME,COALESCE(n->>'id',n->>'school_id',n->>'user_id',o->>'id',o->>'school_id',o->>'user_id',n->>'message_id'),TG_OP,o-'invite_code',n-'invite_code');
 RETURN NULL;
END $$;

-- Exactly one designated active primary for stage-4 provisioned schools.
-- Legacy schools are deliberately not assigned an arbitrary primary.
CREATE OR REPLACE FUNCTION private.school_primary_constraint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE sid uuid;
BEGIN
 IF TG_TABLE_NAME='school_onboarding_settings' THEN sid:=COALESCE(NEW.school_id,OLD.school_id);
 ELSE sid:=COALESCE(NEW.school_id,OLD.school_id); END IF;
 IF EXISTS(SELECT 1 FROM public.school_onboarding_settings x WHERE x.school_id=sid
 AND (x.application_id IS NOT NULL OR x.primary_user_id IS NOT NULL)
 AND (x.primary_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.school_memberships m
 WHERE m.school_id=sid AND m.user_id=x.primary_user_id AND m.status='active' AND m.role='school_admin'))) THEN
 RAISE EXCEPTION 'Primary coordinator must remain active'; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS onboarding_primary_settings ON public.school_onboarding_settings;
CREATE CONSTRAINT TRIGGER onboarding_primary_settings AFTER INSERT OR UPDATE OR DELETE ON public.school_onboarding_settings
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.school_primary_constraint();
DROP TRIGGER IF EXISTS onboarding_primary_membership ON public.school_memberships;
CREATE CONSTRAINT TRIGGER onboarding_primary_membership AFTER INSERT OR UPDATE OR DELETE ON public.school_memberships
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.school_primary_constraint();

CREATE OR REPLACE FUNCTION public.school_portal_context()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid:=private.school_actor();
BEGIN
 RETURN jsonb_build_object(
 'is_platform_admin',private.school_super(),'can_review_applications',private.school_reviewer(),
 'school_types',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name,'education_level_id',education_level_id) ORDER BY name),'[]') FROM public.school_types),
 'applications',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'school_name',school_name,'npsn',npsn,'school_type_id',school_type_id,
 'status',status,'review_note',review_note,'school_id',school_id,'created_at',created_at) ORDER BY created_at DESC),'[]') FROM public.school_applications WHERE applicant_id=u),
 'memberships',(SELECT COALESCE(jsonb_agg(jsonb_build_object('school_id',s.id,'school_name',s.name,'role',m.role,
 'is_primary',COALESCE(x.primary_user_id=u,false)) ORDER BY s.name),'[]') FROM public.school_memberships m JOIN public.schools s ON s.id=m.school_id
 LEFT JOIN public.school_onboarding_settings x ON x.school_id=s.id WHERE m.user_id=u AND m.status='active' AND s.status='active'),
 'transfers',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'school_id',t.school_id,'school_name',s.name,'expires_at',t.expires_at)),'[]')
 FROM public.school_coordinator_transfers t JOIN public.schools s ON s.id=t.school_id JOIN auth.users a ON a.id=u
 WHERE t.status='pending' AND t.expires_at>now() AND s.status='active' AND lower(a.email)=t.target_email));
END $$;

CREATE OR REPLACE FUNCTION public.submit_school_application(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); a public.school_applications%ROWTYPE; v_npsn text;
BEGIN
 v_npsn:=private.school_text(p_data,'npsn',8,8);
 PERFORM pg_advisory_xact_lock(hashtextextended('application:'||v_npsn,0));
 IF (p_data->'authorization_confirmed') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Authorization required'; END IF;
 SELECT * INTO a FROM public.school_applications WHERE applicant_id=u AND npsn=v_npsn AND status='pending';
 IF FOUND THEN RETURN jsonb_build_object('application_id',a.id,'status',a.status); END IF;
 IF EXISTS(SELECT 1 FROM public.schools WHERE npsn=v_npsn) THEN RAISE EXCEPTION 'School already registered'; END IF;
 INSERT INTO public.school_applications(applicant_id,school_name,npsn,school_type_id,address,city,province,teacher_name,teacher_position,contact_phone,authorization_confirmed)
 VALUES(u,private.school_text(p_data,'school_name',3,160),v_npsn,private.school_text(p_data,'school_type_id',1,50),
 private.school_text(p_data,'address',3,500),private.school_text(p_data,'city',2,100),private.school_text(p_data,'province',2,100),
 private.school_text(p_data,'teacher_name',2,160),private.school_text(p_data,'teacher_position',2,100),private.school_text(p_data,'contact_phone',6,30),true) RETURNING * INTO a;
 RETURN jsonb_build_object('application_id',a.id,'status',a.status);
END $$;

CREATE OR REPLACE FUNCTION public.review_school_application(p_application_id uuid,p_decision text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); a public.school_applications%ROWTYPE; sid uuid;
BEGIN
 IF NOT private.school_reviewer() THEN RAISE EXCEPTION 'Reviewer permission required' USING ERRCODE='42501'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') OR length(COALESCE(p_note,''))>2000 THEN RAISE EXCEPTION 'Invalid review'; END IF;
 SELECT * INTO a FROM public.school_applications WHERE id=p_application_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Application unavailable'; END IF;
 IF a.applicant_id=u THEN RAISE EXCEPTION 'Self review denied' USING ERRCODE='42501'; END IF;
 IF a.status=p_decision THEN RETURN jsonb_build_object('application_id',a.id,'status',a.status,'school_id',a.school_id); END IF;
 IF a.status<>'pending' THEN RAISE EXCEPTION 'Application already reviewed'; END IF;
 IF p_decision='approved' THEN
 PERFORM 1 FROM auth.users au JOIN public.profiles pr ON pr.id=au.id WHERE au.id=a.applicant_id AND pr.account_status='active'
 AND au.email_confirmed_at IS NOT NULL AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now()) FOR SHARE OF au,pr;
 IF NOT FOUND THEN RAISE EXCEPTION 'Applicant no longer eligible'; END IF;
 INSERT INTO public.schools(name,npsn,school_type_id,address,city,province,created_by,status)
 VALUES(a.school_name,a.npsn,a.school_type_id,a.address,a.city,a.province,a.applicant_id,'active') RETURNING id INTO sid;
 -- Existing creator trigger is intentionally retained, but can only fire after review.
 INSERT INTO public.school_memberships(school_id,user_id,role,status) VALUES(sid,a.applicant_id,'school_admin','active')
 ON CONFLICT(school_id,user_id) DO UPDATE SET role='school_admin',status='active';
 INSERT INTO public.school_onboarding_settings(school_id,primary_user_id,application_id,contact_phone) VALUES(sid,a.applicant_id,a.id,a.contact_phone);
 END IF;
 UPDATE public.school_applications SET status=p_decision,school_id=sid,reviewed_by=u,review_note=btrim(p_note),reviewed_at=clock_timestamp() WHERE id=a.id;
 RETURN jsonb_build_object('application_id',a.id,'status',p_decision,'school_id',sid);
END $$;

CREATE OR REPLACE FUNCTION public.school_admin_workspace(p_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 PERFORM private.school_require(p_school_id,true);
 RETURN jsonb_build_object(
 'school',(SELECT jsonb_build_object('id',s.id,'name',s.name,'npsn',s.npsn,'school_type_id',s.school_type_id,'address',s.address,'city',s.city,'province',s.province,'contact_phone',x.contact_phone,'primary_user_id',x.primary_user_id)
 FROM public.schools s LEFT JOIN public.school_onboarding_settings x ON x.school_id=s.id WHERE s.id=p_school_id),
 'classes',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name,'grade',grade,'academic_year',academic_year,'education_level_id',education_level_id,'archived',onboarding_archived) ORDER BY grade,name),'[]') FROM public.classes WHERE school_id=p_school_id),
 'members',(SELECT COALESCE(jsonb_agg(jsonb_build_object('membership_id',m.id,'user_id',m.user_id,'name',p.full_name,'role',m.role,'status',m.status,'class_id',ap.class_id) ORDER BY p.full_name),'[]')
 FROM public.school_memberships m JOIN public.profiles p ON p.id=m.user_id LEFT JOIN public.student_academic_profiles ap ON ap.user_id=m.user_id AND ap.school_id=m.school_id WHERE m.school_id=p_school_id),
 'requests',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'name',p.full_name,'class_id',r.class_id,'status',r.status,'created_at',r.created_at) ORDER BY r.created_at),'[]')
 FROM public.school_invite_requests r JOIN public.profiles p ON p.id=r.user_id WHERE r.school_id=p_school_id),
 'invites',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'code',invite_code,'class_id',onboarding_class_id,'expires_at',expires_at,'max_uses',max_uses,'used_count',used_count,'status',status) ORDER BY created_at DESC),'[]') FROM public.school_invites WHERE school_id=p_school_id AND role='student' AND onboarding_class_id IS NOT NULL),
 'transfers',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'target_email',target_email,'status',status,'expires_at',expires_at) ORDER BY created_at DESC),'[]') FROM public.school_coordinator_transfers WHERE school_id=p_school_id));
END $$;

CREATE OR REPLACE FUNCTION public.school_admin_mutate(p_school_id uuid,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); cid uuid; rid uuid; mid uuid; v_days integer; v_max integer; lvl text;
 c public.classes%ROWTYPE; r public.school_invite_requests%ROWTYPE; m public.school_memberships%ROWTYPE; inv public.school_invites%ROWTYPE;
BEGIN
 -- All school management locks school first, then user/profile, invite/request/member.
 PERFORM 1 FROM public.schools WHERE id=p_school_id FOR UPDATE;
 PERFORM private.school_require(p_school_id,true);
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Object required'; END IF;
 IF p_action='profile_update' THEN
 UPDATE public.schools SET address=private.school_text(p_data,'address',3,500),city=private.school_text(p_data,'city',2,100),province=private.school_text(p_data,'province',2,100) WHERE id=p_school_id;
 INSERT INTO public.school_onboarding_settings(school_id,contact_phone) VALUES(p_school_id,private.school_text(p_data,'contact_phone',6,30))
 ON CONFLICT(school_id) DO UPDATE SET contact_phone=EXCLUDED.contact_phone;
 ELSIF p_action='class_save' THEN
 SELECT st.education_level_id INTO lvl FROM public.schools s JOIN public.school_types st ON st.id=s.school_type_id WHERE s.id=p_school_id;
 IF lvl IS NULL OR NOT ((lower(lvl)='sd' AND (p_data->>'grade')::integer BETWEEN 1 AND 6) OR (lower(lvl)='smp' AND (p_data->>'grade')::integer BETWEEN 7 AND 9)
 OR (lower(lvl)='sma' AND (p_data->>'grade')::integer BETWEEN 10 AND 12)) THEN RAISE EXCEPTION 'Grade incompatible with school'; END IF;
 IF (p_data->>'academic_year') IS NULL OR (p_data->>'academic_year') !~ '^[0-9]{4}/[0-9]{4}$'
 OR split_part(p_data->>'academic_year','/',2)::integer<>split_part(p_data->>'academic_year','/',1)::integer+1 THEN RAISE EXCEPTION 'Invalid academic year'; END IF;
 cid:=(p_data->>'class_id')::uuid;
 IF cid IS NULL THEN
 INSERT INTO public.classes(school_id,name,education_level_id,grade,academic_year) VALUES(p_school_id,private.school_text(p_data,'name',1,100),lvl,(p_data->>'grade')::integer,p_data->>'academic_year') RETURNING id INTO cid;
 ELSE
 SELECT * INTO c FROM public.classes WHERE id=cid AND school_id=p_school_id FOR UPDATE;
 IF NOT FOUND OR c.onboarding_archived THEN RAISE EXCEPTION 'Class unavailable'; END IF;
 -- Grade/year immutable: assignments and academic history must not drift.
 IF c.grade<>(p_data->>'grade')::integer OR c.academic_year IS DISTINCT FROM p_data->>'academic_year' THEN RAISE EXCEPTION 'Create a new class for grade/year changes'; END IF;
 UPDATE public.classes SET name=private.school_text(p_data,'name',1,100) WHERE id=cid;
 END IF;
 RETURN jsonb_build_object('class_id',cid);
 ELSIF p_action='class_archive' THEN
 cid:=(p_data->>'class_id')::uuid;
 IF EXISTS(SELECT 1 FROM public.student_academic_profiles WHERE class_id=cid) OR EXISTS(SELECT 1 FROM public.school_invite_requests WHERE class_id=cid AND status='pending') THEN RAISE EXCEPTION 'Class still has students or pending requests'; END IF;
 UPDATE public.classes SET onboarding_archived=true WHERE id=cid AND school_id=p_school_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Class unavailable'; END IF;
 UPDATE public.school_invites SET status='inactive' WHERE onboarding_class_id=cid AND school_id=p_school_id;
 ELSIF p_action='invite_create' THEN
 IF p_data ? 'role' AND p_data->>'role' IS DISTINCT FROM 'student' THEN RAISE EXCEPTION 'Staff invitations disabled' USING ERRCODE='42501'; END IF;
 cid:=(p_data->>'class_id')::uuid; v_days:=(p_data->>'days')::integer; v_max:=(p_data->>'max_uses')::integer;
 IF v_days IS NULL OR v_days NOT BETWEEN 1 AND 30 OR v_max IS NULL OR v_max NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid invite limits'; END IF;
 PERFORM 1 FROM public.classes WHERE id=cid AND school_id=p_school_id AND NOT onboarding_archived;
 IF NOT FOUND THEN RAISE EXCEPTION 'Class unavailable'; END IF;
 INSERT INTO public.school_invites(school_id,invite_code,role,expires_at,max_uses,created_by,onboarding_class_id)
 VALUES(p_school_id,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'student',clock_timestamp()+v_days*interval '1 day',v_max,u,cid) RETURNING * INTO inv;
 RETURN jsonb_build_object('invite_id',inv.id,'code',inv.invite_code,'expires_at',inv.expires_at);
 ELSIF p_action='invite_revoke' THEN
 UPDATE public.school_invites SET status='inactive' WHERE id=(p_data->>'invite_id')::uuid AND school_id=p_school_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invite unavailable'; END IF;
 ELSIF p_action IN ('member_approve','member_reject') THEN
 rid:=(p_data->>'request_id')::uuid;
 SELECT * INTO r FROM public.school_invite_requests WHERE id=rid AND school_id=p_school_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable'; END IF;
 IF r.status=(CASE p_action WHEN 'member_approve' THEN 'approved' ELSE 'rejected' END) THEN RETURN jsonb_build_object('request_id',r.id,'status',r.status); END IF;
 IF r.status<>'pending' THEN RAISE EXCEPTION 'Request already resolved'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=r.user_id FOR UPDATE;
 IF p_action='member_approve' THEN
 SELECT * INTO inv FROM public.school_invites WHERE id=r.invite_id FOR UPDATE;
 IF inv.status<>'active' OR inv.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Invite revoked or expired'; END IF;
 SELECT * INTO c FROM public.classes WHERE id=r.class_id AND school_id=p_school_id AND NOT onboarding_archived;
 IF NOT FOUND THEN RAISE EXCEPTION 'Class unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users a JOIN public.profiles p ON p.id=a.id WHERE a.id=r.user_id AND a.email_confirmed_at IS NOT NULL AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until<=now()) AND p.account_status='active' AND lower(p.education_level)=lower(c.education_level_id)) THEN RAISE EXCEPTION 'Student account or education level ineligible'; END IF;
 IF EXISTS(SELECT 1 FROM public.school_memberships WHERE user_id=r.user_id AND status='active' AND school_id<>p_school_id)
 OR EXISTS(SELECT 1 FROM public.student_academic_profiles WHERE user_id=r.user_id AND school_id IS NOT NULL AND school_id<>p_school_id) THEN RAISE EXCEPTION 'Student belongs to another school'; END IF;
 IF EXISTS(SELECT 1 FROM public.school_memberships WHERE user_id=r.user_id AND school_id=p_school_id AND role<>'student') THEN RAISE EXCEPTION 'Staff role cannot be changed'; END IF;
 INSERT INTO public.school_memberships(school_id,user_id,role,status) VALUES(p_school_id,r.user_id,'student','active') ON CONFLICT(school_id,user_id) DO UPDATE SET status='active';
 INSERT INTO public.student_academic_profiles(user_id,education_level_id,school_type_id,grade,school_id,class_id,academic_year)
 SELECT r.user_id,c.education_level_id,s.school_type_id,c.grade,s.id,c.id,c.academic_year FROM public.schools s WHERE s.id=p_school_id
 ON CONFLICT(user_id) DO UPDATE SET education_level_id=EXCLUDED.education_level_id,school_type_id=EXCLUDED.school_type_id,grade=EXCLUDED.grade,school_id=EXCLUDED.school_id,class_id=EXCLUDED.class_id,academic_year=EXCLUDED.academic_year;
 END IF;
 UPDATE public.school_invite_requests SET status=CASE p_action WHEN 'member_approve' THEN 'approved' ELSE 'rejected' END,reviewed_at=clock_timestamp() WHERE id=r.id;
 ELSIF p_action IN ('member_deactivate','member_move') THEN
 SELECT * INTO m FROM public.school_memberships WHERE id=(p_data->>'membership_id')::uuid AND school_id=p_school_id FOR UPDATE;
 IF NOT FOUND OR m.role<>'student' THEN RAISE EXCEPTION 'Only student memberships can be managed here'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=m.user_id FOR UPDATE;
 IF p_action='member_deactivate' THEN
 UPDATE public.school_memberships SET status='inactive' WHERE id=m.id;
 UPDATE public.student_academic_profiles SET school_id=NULL,class_id=NULL WHERE user_id=m.user_id AND school_id=p_school_id;
 UPDATE public.school_invite_requests SET status='deactivated',reviewed_at=clock_timestamp() WHERE school_id=p_school_id AND user_id=m.user_id AND status='approved';
 ELSE
 SELECT * INTO c FROM public.classes WHERE id=(p_data->>'class_id')::uuid AND school_id=p_school_id AND NOT onboarding_archived;
 IF NOT FOUND OR m.status<>'active' THEN RAISE EXCEPTION 'Class or membership unavailable'; END IF;
 UPDATE public.student_academic_profiles SET class_id=c.id,grade=c.grade,academic_year=c.academic_year WHERE user_id=m.user_id AND school_id=p_school_id AND education_level_id=c.education_level_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Academic profile incompatible'; END IF;
 END IF;
 ELSE RAISE EXCEPTION 'Unknown school action' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.school_invite_request(p_code text,p_confirm boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); inv public.school_invites%ROWTYPE; c public.classes%ROWTYPE; r public.school_invite_requests%ROWTYPE; sid uuid; nm text;
BEGIN
 IF p_code IS NULL OR length(p_code)<>64 THEN RAISE EXCEPTION 'Invite unavailable'; END IF;
 SELECT school_id INTO sid FROM public.school_invites WHERE invite_code=p_code;
 -- Lock school first, same order as management; serializes quota reservations/revocation.
 SELECT name INTO nm FROM public.schools WHERE id=sid AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invite unavailable'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=u FOR UPDATE;
 SELECT * INTO inv FROM public.school_invites WHERE invite_code=p_code FOR UPDATE;
 IF NOT FOUND OR inv.role<>'student' OR inv.onboarding_class_id IS NULL THEN RAISE EXCEPTION 'Invite unavailable'; END IF;
 SELECT * INTO c FROM public.classes WHERE id=inv.onboarding_class_id AND school_id=sid AND NOT onboarding_archived;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invite unavailable'; END IF;
 SELECT * INTO r FROM public.school_invite_requests WHERE invite_id=inv.id AND user_id=u;
 -- A replay never consumes another slot; it does not resurrect rejected/inactive membership.
 IF p_confirm IS TRUE AND r.id IS NOT NULL THEN RETURN jsonb_build_object('request_id',r.id,'status',r.status); END IF;
 IF inv.status<>'active' OR inv.expires_at IS NULL OR inv.expires_at<=clock_timestamp() OR inv.max_uses IS NULL OR inv.used_count>=inv.max_uses THEN RAISE EXCEPTION 'Invite unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND lower(education_level)=lower(c.education_level_id)) THEN RAISE EXCEPTION 'Education level mismatch'; END IF;
 IF p_confirm IS DISTINCT FROM true THEN RETURN jsonb_build_object('school_name',nm,'class_name',c.name,'grade',c.grade,'academic_year',c.academic_year,'expires_at',inv.expires_at,'requires_approval',true); END IF;
 IF EXISTS(SELECT 1 FROM public.school_memberships WHERE user_id=u AND status='active') OR EXISTS(SELECT 1 FROM public.student_academic_profiles WHERE user_id=u AND school_id IS NOT NULL) THEN RAISE EXCEPTION 'Already affiliated with a school'; END IF;
 INSERT INTO public.school_invite_requests(invite_id,school_id,class_id,user_id) VALUES(inv.id,sid,c.id,u) RETURNING * INTO r;
 UPDATE public.school_invites SET used_count=used_count+1 WHERE id=inv.id AND used_count<max_uses;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invite quota exhausted'; END IF;
 RETURN jsonb_build_object('request_id',r.id,'status',r.status);
END $$;

CREATE OR REPLACE FUNCTION private.school_message_visible(p_message uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.school_messages m WHERE m.id=p_message
 AND private.school_role(m.school_id,ARRAY['school_admin','teacher','student'])
 AND (m.recipient_id IS NULL OR m.recipient_id=auth.uid() OR m.sender_id=auth.uid()));
$$;
CREATE OR REPLACE FUNCTION public.school_communications(p_school_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid:=private.school_actor();
BEGIN
 IF p_school_id IS NOT NULL THEN PERFORM private.school_require(p_school_id); END IF;
 RETURN jsonb_build_object(
 'messages',(SELECT COALESCE(jsonb_agg(x.item ORDER BY x.created_at DESC),'[]') FROM (
 SELECT m.created_at,jsonb_build_object('id',m.id,'school_id',m.school_id,'sender_id',m.sender_id,'recipient_id',m.recipient_id,
 'body',m.body,'platform_origin',m.platform_origin,'created_at',m.created_at,
 'read_at',(SELECT read_at FROM public.school_message_reads WHERE message_id=m.id AND user_id=u)) item
 FROM public.school_messages m WHERE (p_school_id IS NULL OR m.school_id=p_school_id) AND private.school_message_visible(m.id)
 ORDER BY m.created_at DESC LIMIT 200) x),
 'tickets',(SELECT COALESCE(jsonb_agg(x.item ORDER BY x.created_at DESC),'[]') FROM (
 SELECT t.created_at,jsonb_build_object('id',t.id,'school_id',t.school_id,'subject',t.subject,'body',t.body,'status',t.status,'created_at',t.created_at,
 'replies',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'sender_id',r.sender_id,'platform_origin',r.platform_origin,'created_at',r.created_at) ORDER BY r.created_at),'[]') FROM public.school_ticket_replies r WHERE r.ticket_id=t.id)) item
 FROM public.school_support_tickets t WHERE (p_school_id IS NULL OR t.school_id=p_school_id)
 AND private.school_role(t.school_id,ARRAY['school_admin']) ORDER BY t.created_at DESC LIMIT 100) x));
END $$;

CREATE OR REPLACE FUNCTION public.school_communication_mutate(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); sid uuid; target uuid; result_id uuid;
 msg public.school_messages%ROWTYPE; ticket public.school_support_tickets%ROWTYPE;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Object required'; END IF;
 IF p_action IN ('message_send','platform_message') THEN
 sid:=(p_data->>'school_id')::uuid; target:=(p_data->>'recipient_id')::uuid;
 IF p_action='platform_message' THEN
 IF NOT private.school_super() THEN RAISE EXCEPTION 'Superadmin required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.schools WHERE id=sid AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'School unavailable'; END IF;
 ELSE
 PERFORM private.school_require(sid);
 -- Non-admin members can contact an admin, never broadcast or contact peers.
 IF NOT private.school_role(sid,ARRAY['school_admin']) AND (target IS NULL OR NOT EXISTS(
 SELECT 1 FROM public.school_memberships WHERE school_id=sid AND user_id=target AND role='school_admin' AND status='active')) THEN
 RAISE EXCEPTION 'Only coordinator contact allowed' USING ERRCODE='42501'; END IF;
 END IF;
 IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.school_memberships m JOIN public.profiles p ON p.id=m.user_id
 WHERE m.school_id=sid AND m.user_id=target AND m.status='active' AND p.account_status='active') THEN RAISE EXCEPTION 'Recipient unavailable'; END IF;
 INSERT INTO public.school_messages(school_id,sender_id,recipient_id,body,platform_origin)
 VALUES(sid,u,target,private.school_text(p_data,'body',1,5000),p_action='platform_message') RETURNING id INTO result_id;
 ELSIF p_action='message_read' THEN
 SELECT * INTO msg FROM public.school_messages WHERE id=(p_data->>'message_id')::uuid;
 IF NOT FOUND OR NOT private.school_message_visible(msg.id) THEN RAISE EXCEPTION 'Message access denied' USING ERRCODE='42501'; END IF;
 PERFORM private.school_require(msg.school_id);
 INSERT INTO public.school_message_reads(message_id,user_id) VALUES(msg.id,u) ON CONFLICT DO NOTHING;
 result_id:=msg.id;
 ELSIF p_action IN ('ticket_create','message_forward') THEN
 IF p_action='message_forward' THEN
 SELECT * INTO msg FROM public.school_messages WHERE id=(p_data->>'message_id')::uuid;
 IF NOT FOUND OR NOT private.school_message_visible(msg.id) THEN RAISE EXCEPTION 'Message access denied' USING ERRCODE='42501'; END IF;
 sid:=msg.school_id;
 ELSE sid:=(p_data->>'school_id')::uuid; END IF;
 PERFORM private.school_require(sid,true);
 IF p_action='message_forward' THEN
 INSERT INTO public.school_support_tickets(school_id,created_by,subject,body,forwarded_message_id)
 VALUES(sid,u,private.school_text(p_data,'subject',3,160),msg.body,msg.id)
 ON CONFLICT(forwarded_message_id) WHERE forwarded_message_id IS NOT NULL DO NOTHING RETURNING id INTO result_id;
 IF result_id IS NULL THEN SELECT id INTO result_id FROM public.school_support_tickets WHERE forwarded_message_id=msg.id; END IF;
 ELSE
 INSERT INTO public.school_support_tickets(school_id,created_by,subject,body) VALUES(sid,u,private.school_text(p_data,'subject',3,160),private.school_text(p_data,'body',1,5000)) RETURNING id INTO result_id;
 END IF;
 ELSIF p_action IN ('ticket_reply','ticket_close') THEN
 SELECT * INTO ticket FROM public.school_support_tickets WHERE id=(p_data->>'ticket_id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ticket unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.schools WHERE id=ticket.school_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'School unavailable'; END IF;
 IF NOT private.school_super() THEN PERFORM private.school_require(ticket.school_id,true); END IF;
 SELECT * INTO ticket FROM public.school_support_tickets WHERE id=ticket.id FOR UPDATE;
 IF p_action='ticket_close' THEN
 UPDATE public.school_support_tickets SET status='closed' WHERE id=ticket.id; result_id:=ticket.id;
 ELSE
 IF ticket.status<>'open' THEN RAISE EXCEPTION 'Ticket closed'; END IF;
 INSERT INTO public.school_ticket_replies(ticket_id,sender_id,body,platform_origin)
 VALUES(ticket.id,u,private.school_text(p_data,'body',1,5000),private.school_super()) RETURNING id INTO result_id;
 END IF;
 ELSE RAISE EXCEPTION 'Unknown communication action' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('id',result_id);
END $$;

CREATE OR REPLACE FUNCTION public.school_coordinator_transfer(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); sid uuid; v_email text; tid uuid; previous uuid; target uuid;
 tr public.school_coordinator_transfers%ROWTYPE; cfg public.school_onboarding_settings%ROWTYPE;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Object required'; END IF;
 IF p_action IN ('propose','recover') THEN sid:=(p_data->>'school_id')::uuid;
 ELSE SELECT school_id INTO sid FROM public.school_coordinator_transfers WHERE id=(p_data->>'transfer_id')::uuid; END IF;
 PERFORM 1 FROM public.schools WHERE id=sid AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'School unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM public.school_onboarding_settings WHERE school_id=sid FOR UPDATE;
 previous:=cfg.primary_user_id;
 IF p_action IN ('propose','recover') THEN
 IF p_action='recover' THEN
 IF NOT private.school_super() THEN RAISE EXCEPTION 'Superadmin recovery required' USING ERRCODE='42501'; END IF;
 PERFORM private.school_text(p_data,'reason',10,2000);
 ELSE
 PERFORM private.school_require(sid,true);
 IF previous IS DISTINCT FROM u THEN RAISE EXCEPTION 'Only primary coordinator can propose' USING ERRCODE='42501'; END IF;
 END IF;
 v_email:=lower(private.school_text(p_data,'email',3,254));
 IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'Invalid email'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users a WHERE a.id=previous AND lower(a.email)=v_email) THEN RAISE EXCEPTION 'Target already primary'; END IF;
 SELECT * INTO tr FROM public.school_coordinator_transfers WHERE school_id=sid AND status='pending' FOR UPDATE;
 IF tr.id IS NOT NULL AND tr.target_email=v_email AND tr.proposed_by=u AND tr.recovery=(p_action='recover') AND tr.expires_at>clock_timestamp() THEN
 RETURN jsonb_build_object('transfer_id',tr.id,'status',tr.status,'expires_at',tr.expires_at); END IF;
 UPDATE public.school_coordinator_transfers SET status='cancelled',resolved_at=clock_timestamp() WHERE school_id=sid AND status='pending';
 INSERT INTO public.school_coordinator_transfers(school_id,from_user_id,target_email,proposed_by,recovery,reason)
 VALUES(sid,previous,v_email,u,p_action='recover',CASE WHEN p_action='recover' THEN btrim(p_data->>'reason') END) RETURNING * INTO tr;
 ELSIF p_action IN ('accept','cancel') THEN
 SELECT * INTO tr FROM public.school_coordinator_transfers WHERE id=(p_data->>'transfer_id')::uuid AND school_id=sid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Transfer unavailable'; END IF;
 IF p_action='cancel' THEN
 IF NOT private.school_super() THEN
 PERFORM private.school_require(sid,true);
 IF previous IS DISTINCT FROM u THEN RAISE EXCEPTION 'Primary required' USING ERRCODE='42501'; END IF;
 END IF;
 IF tr.status='cancelled' THEN RETURN jsonb_build_object('transfer_id',tr.id,'status',tr.status); END IF;
 IF tr.status<>'pending' THEN RAISE EXCEPTION 'Transfer resolved'; END IF;
 UPDATE public.school_coordinator_transfers SET status='cancelled',resolved_at=clock_timestamp() WHERE id=tr.id RETURNING * INTO tr;
 ELSE
 -- Verified email is read from auth.users, never JWT/user metadata or client input.
 SELECT lower(a.email) INTO v_email FROM auth.users a WHERE a.id=u FOR SHARE;
 IF v_email IS DISTINCT FROM tr.target_email THEN RAISE EXCEPTION 'Verified target email required' USING ERRCODE='42501'; END IF;
 IF tr.status='accepted' AND tr.accepted_by=u THEN RETURN jsonb_build_object('transfer_id',tr.id,'status',tr.status); END IF;
 IF tr.status<>'pending' OR tr.expires_at<=clock_timestamp() OR tr.from_user_id IS DISTINCT FROM previous THEN RAISE EXCEPTION 'Transfer expired or stale'; END IF;
 IF EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=sid AND user_id=u AND role='student') THEN RAISE EXCEPTION 'Student cannot become coordinator'; END IF;
 INSERT INTO public.school_memberships(school_id,user_id,role,status) VALUES(sid,u,'school_admin','active')
 ON CONFLICT(school_id,user_id) DO UPDATE SET role='school_admin',status='active';
 INSERT INTO public.school_onboarding_settings(school_id,primary_user_id) VALUES(sid,u)
 ON CONFLICT(school_id) DO UPDATE SET primary_user_id=u;
 -- Previous coordinator is disabled, not converted to unrestricted teacher. History/FKs remain.
 IF previous IS NOT NULL AND previous<>u THEN UPDATE public.school_memberships SET status='inactive' WHERE school_id=sid AND user_id=previous; END IF;
 UPDATE public.school_coordinator_transfers SET status='accepted',accepted_by=u,resolved_at=clock_timestamp() WHERE id=tr.id RETURNING * INTO tr;
 END IF;
 ELSE RAISE EXCEPTION 'Unknown transfer action' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('transfer_id',tr.id,'status',tr.status,'expires_at',tr.expires_at);
END $$;

CREATE OR REPLACE FUNCTION public.platform_school_workspace()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid:=private.school_actor();
BEGIN
 IF NOT private.school_reviewer() THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'applications',(SELECT COALESCE(jsonb_agg(x.item ORDER BY x.created_at DESC),'[]') FROM (
 SELECT a.created_at,jsonb_build_object('id',a.id,'applicant_id',a.applicant_id,'school_name',a.school_name,'npsn',a.npsn,'school_type_id',a.school_type_id,
 'address',a.address,'city',a.city,'province',a.province,'teacher_name',a.teacher_name,'teacher_position',a.teacher_position,
 'contact_phone',a.contact_phone,'authorization_confirmed',a.authorization_confirmed,'status',a.status,'review_note',a.review_note,'school_id',a.school_id,'created_at',a.created_at) item
 FROM public.school_applications a ORDER BY a.created_at DESC LIMIT 200) x),
 'schools',(SELECT COALESCE(jsonb_agg(x.item ORDER BY x.name),'[]') FROM (
 SELECT s.name,jsonb_build_object('id',s.id,'name',s.name,'npsn',s.npsn,'school_type_id',s.school_type_id,'status',s.status,'primary_user_id',x.primary_user_id,'needs_primary_recovery',x.primary_user_id IS NULL) item
 FROM public.schools s LEFT JOIN public.school_onboarding_settings x ON x.school_id=s.id ORDER BY s.name LIMIT 500) x),
 'tickets',CASE WHEN private.school_super() THEN (SELECT COALESCE(jsonb_agg(x.item ORDER BY x.created_at DESC),'[]') FROM (
 SELECT t.created_at,jsonb_build_object('id',t.id,'school_id',t.school_id,'subject',t.subject,'body',t.body,'status',t.status,'created_at',t.created_at,
 'replies',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'sender_id',r.sender_id,'platform_origin',r.platform_origin,'created_at',r.created_at) ORDER BY r.created_at),'[]') FROM public.school_ticket_replies r WHERE r.ticket_id=t.id)) item
 FROM public.school_support_tickets t ORDER BY t.created_at DESC LIMIT 200) x) ELSE '[]'::jsonb END);
END $$;

-- New tables are RPC-only. Existing SELECT grants/policies are preserved.
DO $security$
DECLARE t text; pol record; col record; f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['schools','school_memberships','school_invites','classes'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.%I FROM PUBLIC,anon,authenticated',t);
 FOR col IN SELECT a.attname FROM pg_attribute a WHERE a.attrelid=format('public.%I',t)::regclass AND a.attnum>0 AND NOT a.attisdropped LOOP
 EXECUTE format('REVOKE INSERT(%I),UPDATE(%I),REFERENCES(%I) ON public.%I FROM PUBLIC,anon,authenticated',col.attname,col.attname,col.attname,t);
 END LOOP;
 FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t AND cmd<>'SELECT' LOOP
 EXECUTE format('DROP POLICY %I ON public.%I',pol.policyname,t);
 END LOOP;
 END LOOP;
 -- Staff academic writes would bypass membership_move; independent self-service stays.
 DROP POLICY IF EXISTS student_profile_insert_school_staff ON public.student_academic_profiles;
 DROP POLICY IF EXISTS student_profile_update_school_staff ON public.student_academic_profiles;
 FOREACH t IN ARRAY ARRAY['school_applications','school_onboarding_settings','school_invite_requests','school_coordinator_transfers','school_messages','school_message_reads','school_support_tickets','school_ticket_replies','school_onboarding_audit'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
 REVOKE ALL ON SEQUENCE public.school_onboarding_audit_id_seq FROM PUBLIC,anon,authenticated;
 FOREACH t IN ARRAY ARRAY['schools','school_memberships','school_invites','classes','student_academic_profiles','school_applications','school_onboarding_settings','school_invite_requests','school_coordinator_transfers','school_messages','school_message_reads','school_support_tickets','school_ticket_replies'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS onboarding_audit ON public.%I',t);
 EXECUTE format('CREATE TRIGGER onboarding_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.school_audit_trigger()',t);
 END LOOP;
 -- Close legacy SECURITY DEFINER mutators discovered in either public or private.
 -- Assignment/CBT functions write other tables and remain untouched.
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private') AND p.prokind='f'
 AND p.proname NOT IN ('school_portal_context','submit_school_application','review_school_application','school_admin_workspace','school_admin_mutate','school_invite_request','school_communications','school_communication_mutate','school_coordinator_transfer','platform_school_workspace')
 AND pg_get_functiondef(p.oid) ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from|merge[[:space:]]+into)[[:space:]]+(public[.])?"?(schools|school_memberships|school_invites|classes)"?([[:space:](]|$)'
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature); END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND (p.proname LIKE 'school_%' OR p.proname='add_school_creator') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('school_portal_context','submit_school_application','review_school_application','school_admin_workspace','school_admin_mutate','school_invite_request','school_communications','school_communication_mutate','school_coordinator_transfer','platform_school_workspace') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $security$;
NOTIFY pgrst, 'reload schema';
COMMIT;
