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
-- RPC langganan pembelajaran serta seluruh jalur start mandiri/legacy tidak lagi didefinisikan di repositori.
-- Engine assignment tetap privat.
DO $$ BEGIN
 IF to_regprocedure('private.learning_legacy_assignment(uuid)') IS NULL THEN
 ALTER FUNCTION public.start_school_assignment(uuid) SET SCHEMA private;
 ALTER FUNCTION private.start_school_assignment(uuid) RENAME TO learning_legacy_assignment;
 END IF;
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
 (n.nspname='private' AND p.proname LIKE 'learning_%') OR (n.nspname='public' AND p.proname IN('learning_access_context','start_school_assignment')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.learning_access_context(), public.start_school_assignment(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
