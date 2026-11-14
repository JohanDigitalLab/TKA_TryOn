-- Isolated learning-access rollout. Stage 5 is deliberately not a prerequisite.
BEGIN;
CREATE TABLE IF NOT EXISTS public.learning_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE REFERENCES public.profiles(id),
 school_id uuid UNIQUE REFERENCES public.schools(id), active boolean NOT NULL DEFAULT false,
 expires_at timestamptz, revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by uuid NOT NULL REFERENCES public.profiles(id), CHECK ((user_id IS NULL) <> (school_id IS NULL))
);
CREATE TABLE IF NOT EXISTS public.learning_subscription_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid NOT NULL REFERENCES public.learning_subscriptions(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id), reason text NOT NULL, old_data jsonb, new_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.learning_packages (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id), mode text NOT NULL CHECK(mode IN ('simulation','mission')),
 grade integer NOT NULL, subjects text[] NOT NULL, question_count integer NOT NULL, duration_minutes integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '24 hours'
);
CREATE TABLE IF NOT EXISTS public.learning_package_attempts (
 package_id uuid NOT NULL REFERENCES public.learning_packages(id), subject_name text NOT NULL,
 attempt_id uuid NOT NULL UNIQUE REFERENCES public.exam_attempts(id), PRIMARY KEY(package_id,subject_name)
);
CREATE TABLE IF NOT EXISTS public.learning_trial_uses (
 user_id uuid NOT NULL REFERENCES public.profiles(id), mode text NOT NULL CHECK(mode IN ('simulation','mission')),
 package_id uuid REFERENCES public.learning_packages(id), assignment_id uuid REFERENCES public.school_assignments(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(user_id,mode),
 CHECK ((package_id IS NULL) <> (assignment_id IS NULL))
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['learning_subscriptions','learning_subscription_audit','learning_packages','learning_package_attempts','learning_trial_uses'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION private.learning_subscribed(p_user uuid,p_school uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.learning_subscriptions s WHERE s.active AND (s.expires_at IS NULL OR s.expires_at>statement_timestamp())
 AND ((s.user_id=p_user) OR (s.school_id IS NOT NULL AND (p_school IS NULL OR s.school_id=p_school)
 AND EXISTS(SELECT 1 FROM public.schools sc JOIN public.school_memberships m ON m.school_id=sc.id
 WHERE sc.id=s.school_id AND sc.status='active' AND m.user_id=p_user AND m.status='active' AND m.role='student'))))
$$;
CREATE OR REPLACE FUNCTION public.learning_access_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); BEGIN
 RETURN jsonb_build_object('subscribed',private.learning_subscribed(u),'trials',jsonb_build_object(
 'simulation',NOT EXISTS(SELECT 1 FROM public.learning_trial_uses WHERE user_id=u AND mode='simulation'),
 'mission',NOT EXISTS(SELECT 1 FROM public.learning_trial_uses WHERE user_id=u AND mode='mission')),
 'individual',(SELECT jsonb_build_object('active',active,'expires_at',expires_at) FROM public.learning_subscriptions WHERE user_id=u),
 'packages',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
 SELECT p.id,p.mode,p.grade,p.subjects,p.question_count,p.duration_minutes,p.expires_at,n.subject_index-1 AS current_subject_index
 FROM public.learning_packages p CROSS JOIN LATERAL (
 SELECT s.subject_index FROM unnest(p.subjects) WITH ORDINALITY s(subject_name,subject_index)
 LEFT JOIN public.learning_package_attempts pa ON pa.package_id=p.id AND pa.subject_name=s.subject_name
 LEFT JOIN public.exam_attempts a ON a.id=pa.attempt_id
 WHERE a.id IS NULL OR (a.attempt_status='IN_PROGRESS' AND a.started_at+a.duration_minutes*interval '1 minute'>statement_timestamp()) ORDER BY s.subject_index LIMIT 1
 ) n WHERE p.user_id=u AND p.expires_at>statement_timestamp() ORDER BY p.created_at DESC LIMIT 20
 ) x),'[]'::jsonb));
END $$;
CREATE OR REPLACE FUNCTION public.learning_subscription_set(p_user_id uuid,p_school_id uuid,p_active boolean,p_expires_at timestamptz,p_expected_revision integer,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); s public.learning_subscriptions%ROWTYPE; old jsonb; BEGIN
 IF NOT private.is_super_admin() THEN RAISE EXCEPTION 'Superadmin required' USING ERRCODE='42501'; END IF;
 IF (p_user_id IS NULL)=(p_school_id IS NULL) OR p_active IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 2000
 OR (p_active AND p_expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'Invalid subscription'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('learning:subscription:'||coalesce(p_user_id,p_school_id)::text,0));
 SELECT * INTO s FROM public.learning_subscriptions WHERE user_id=p_user_id OR school_id=p_school_id FOR UPDATE;
 IF coalesce(s.revision,0) IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Subscription changed; reload' USING ERRCODE='40001'; END IF;
 old:=to_jsonb(s);
 IF s.id IS NULL THEN INSERT INTO public.learning_subscriptions(user_id,school_id,active,expires_at,updated_by)
 VALUES(p_user_id,p_school_id,p_active,p_expires_at,u) RETURNING * INTO s;
 ELSE UPDATE public.learning_subscriptions SET active=p_active,expires_at=p_expires_at,revision=revision+1,updated_at=clock_timestamp(),updated_by=u WHERE id=s.id RETURNING * INTO s; END IF;
 INSERT INTO public.learning_subscription_audit(subscription_id,actor_id,reason,old_data,new_data) VALUES(s.id,u,btrim(p_reason),old,to_jsonb(s));
 RETURN to_jsonb(s);
END $$;
CREATE OR REPLACE FUNCTION public.learning_subscription_workspace() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); BEGIN
 IF NOT private.is_super_admin() THEN RAISE EXCEPTION 'Superadmin required' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM public.learning_subscriptions ORDER BY updated_at DESC LIMIT 500) s),'[]'::jsonb);
END $$;
-- Keep legacy engine private; scoring, deadlines, snapshots and resume stay unchanged.
DO $$ BEGIN
 IF to_regprocedure('private.learning_legacy_start(integer,text,integer,integer)') IS NULL THEN
 ALTER FUNCTION public.start_exam_attempt(integer,text,integer,integer) SET SCHEMA private;
 ALTER FUNCTION private.start_exam_attempt(integer,text,integer,integer) RENAME TO learning_legacy_start;
 END IF;
 IF to_regprocedure('private.learning_legacy_assignment(uuid)') IS NULL THEN
 ALTER FUNCTION public.start_school_assignment(uuid) SET SCHEMA private;
 ALTER FUNCTION private.start_school_assignment(uuid) RENAME TO learning_legacy_assignment;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.start_learning_attempt(p_package_id uuid,p_mode text,p_grade integer,p_subjects text[],p_subject_name text,p_question_count integer DEFAULT 20,p_duration_minutes integer DEFAULT 60) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); pkg public.learning_packages%ROWTYPE; aid uuid; result jsonb; idx integer; trial boolean; BEGIN
 IF p_package_id IS NULL OR p_mode IS NULL OR p_mode NOT IN('simulation','mission') OR p_grade IS NULL OR p_grade NOT IN(6,9)
 OR p_subjects IS NULL OR cardinality(p_subjects) NOT BETWEEN 1 AND 5 OR array_ndims(p_subjects)<>1 OR array_lower(p_subjects,1)<>1
 OR array_position(p_subjects,NULL) IS NOT NULL OR cardinality(p_subjects)<>(SELECT count(DISTINCT x) FROM unnest(p_subjects) x)
 OR p_subject_name IS NULL OR NOT p_subject_name=ANY(p_subjects) OR p_question_count IS NULL OR p_question_count NOT BETWEEN 1 AND 100
 OR p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'Invalid learning package' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
 SELECT * INTO pkg FROM public.learning_packages WHERE id=p_package_id FOR UPDATE;
 IF FOUND THEN
 IF pkg.user_id<>u THEN RAISE EXCEPTION 'Package unavailable' USING ERRCODE='42501'; END IF;
 IF (pkg.mode,pkg.grade,pkg.subjects,pkg.question_count,pkg.duration_minutes) IS DISTINCT FROM (p_mode,p_grade,p_subjects,p_question_count,p_duration_minutes) THEN RAISE EXCEPTION 'Package settings are fixed' USING ERRCODE='22023'; END IF;
 SELECT attempt_id INTO aid FROM public.learning_package_attempts WHERE package_id=pkg.id AND subject_name=p_subject_name;
 IF aid IS NOT NULL THEN RETURN public.resume_exam_attempt(aid); END IF;
 IF pkg.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'LEARNING_PACKAGE_EXPIRED'; END IF;
 ELSE
 IF EXISTS(SELECT 1 FROM unnest(p_subjects) s WHERE NOT EXISTS(SELECT 1 FROM public.questions q WHERE q.subject_name=s AND q.grade=p_grade AND q.question_status='PUBLISHED')) THEN RAISE EXCEPTION 'Published questions unavailable'; END IF;
 INSERT INTO public.learning_packages(id,user_id,mode,grade,subjects,question_count,duration_minutes) VALUES(p_package_id,u,p_mode,p_grade,p_subjects,p_question_count,p_duration_minutes) RETURNING * INTO pkg;
 END IF;
 idx:=array_position(pkg.subjects,p_subject_name);
 IF idx>1 AND EXISTS(SELECT 1 FROM unnest(pkg.subjects[1:idx-1]) s LEFT JOIN public.learning_package_attempts pa ON pa.package_id=pkg.id AND pa.subject_name=s
 LEFT JOIN public.exam_attempts a ON a.id=pa.attempt_id WHERE a.id IS NULL OR (a.attempt_status='IN_PROGRESS' AND a.started_at+a.duration_minutes*interval '1 minute'>clock_timestamp())) THEN RAISE EXCEPTION 'Finish previous subject first'; END IF;
 trial:=NOT private.learning_subscribed(u);
 IF trial AND NOT EXISTS(SELECT 1 FROM public.learning_package_attempts WHERE package_id=pkg.id) THEN
 INSERT INTO public.learning_trial_uses(user_id,mode,package_id) VALUES(u,p_mode,pkg.id) ON CONFLICT(user_id,mode) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.learning_trial_uses WHERE user_id=u AND mode=p_mode AND package_id=pkg.id) THEN RAISE EXCEPTION 'LEARNING_SUBSCRIPTION_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
 result:=private.learning_legacy_start(p_grade,p_subject_name,p_question_count,p_duration_minutes);
 aid:=(result->>'attempt_id')::uuid;
 IF EXISTS(SELECT 1 FROM public.learning_package_attempts WHERE attempt_id=aid) THEN RAISE EXCEPTION 'Finish or resume the existing package'; END IF;
 INSERT INTO public.learning_package_attempts VALUES(pkg.id,p_subject_name,aid);
 RETURN result||jsonb_build_object('package_id',pkg.id,'mode',pkg.mode);
END $$;
-- Old clients remain safe: one-subject simulation trial, never unlimited legacy starts.
CREATE OR REPLACE FUNCTION public.start_exam_attempt(p_grade integer,p_subject_name text,p_question_count integer DEFAULT 20,p_duration_minutes integer DEFAULT 60) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); aid uuid; BEGIN
 SELECT id INTO aid FROM public.exam_attempts WHERE user_id=u AND grade=p_grade AND subject_name=p_subject_name AND attempt_status='IN_PROGRESS'
 AND started_at+duration_minutes*interval '1 minute'>clock_timestamp() ORDER BY started_at DESC LIMIT 1;
 IF aid IS NOT NULL THEN RETURN public.resume_exam_attempt(aid); END IF;
 RETURN public.start_learning_attempt(gen_random_uuid(),'simulation',p_grade,ARRAY[p_subject_name],p_subject_name,p_question_count,p_duration_minutes);
END $$;
CREATE OR REPLACE FUNCTION public.start_school_assignment(p_assignment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); result jsonb; aid uuid; sid uuid; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
 SELECT school_id INTO sid FROM public.school_assignments WHERE id=p_assignment_id;
 -- Existing assignments may be resumed regardless of current subscription.
 SELECT a.id INTO aid FROM public.exam_attempts a JOIN public.school_assignment_recipients r ON r.attempt_id=a.id
 WHERE r.assignment_id=p_assignment_id AND r.user_id=u LIMIT 1;
 IF aid IS NULL AND NOT private.learning_subscribed(u,sid) THEN
 INSERT INTO public.learning_trial_uses(user_id,mode,assignment_id) VALUES(u,'simulation',p_assignment_id) ON CONFLICT(user_id,mode) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.learning_trial_uses WHERE user_id=u AND mode='simulation' AND assignment_id=p_assignment_id) THEN RAISE EXCEPTION 'LEARNING_SUBSCRIPTION_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
 result:=private.learning_legacy_assignment(p_assignment_id);
 RETURN result;
END $$;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
 (n.nspname='private' AND p.proname LIKE 'learning_%') OR (n.nspname='public' AND p.proname IN('learning_access_context','learning_subscription_set','learning_subscription_workspace','start_learning_attempt','start_exam_attempt','start_school_assignment')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.learning_access_context(), public.learning_subscription_workspace(), public.learning_subscription_set(uuid,uuid,boolean,timestamptz,integer,text),public.start_learning_attempt(uuid,text,integer,text[],text,integer,integer),public.start_exam_attempt(integer,text,integer,integer),public.start_school_assignment(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
