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

-- RPC onboarding sekolah (portal context, aplikasi, review, administrasi, undangan, komunikasi, transfer, workspace platform) dihapus dari repositori.

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
 AND pg_get_functiondef(p.oid) ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from|merge[[:space:]]+into)[[:space:]]+(public[.])?"?(schools|school_memberships|school_invites|classes)"?([[:space:](]|$)'
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature); END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND (p.proname LIKE 'school_%' OR p.proname='add_school_creator') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $security$;
NOTIFY pgrst, 'reload schema';
COMMIT;
