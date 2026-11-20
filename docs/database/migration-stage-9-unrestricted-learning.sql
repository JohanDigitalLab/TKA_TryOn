-- Revoke the one-trial-before-subscription policy.
-- Existing subscription/trial tables are retained for history and future reporting,
-- but they no longer block learning activity.
BEGIN;

CREATE OR REPLACE FUNCTION public.learning_access_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=private.school_actor();
BEGIN
  RETURN jsonb_build_object(
    'subscribed',private.learning_subscribed(u),
    'unrestricted',true,
    'individual',(SELECT jsonb_build_object('active',active,'expires_at',expires_at)
      FROM public.learning_subscriptions WHERE user_id=u),
    'packages',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT p.id,p.mode,p.grade,p.subjects,p.question_count,p.duration_minutes,p.expires_at,
        n.subject_index-1 AS current_subject_index
      FROM public.learning_packages p CROSS JOIN LATERAL (
        SELECT s.subject_index FROM unnest(p.subjects) WITH ORDINALITY s(subject_name,subject_index)
        LEFT JOIN public.learning_package_attempts pa ON pa.package_id=p.id AND pa.subject_name=s.subject_name
        LEFT JOIN public.exam_attempts a ON a.id=pa.attempt_id
        WHERE a.id IS NULL OR (a.attempt_status='IN_PROGRESS'
          AND a.started_at+a.duration_minutes*interval '1 minute'>statement_timestamp())
        ORDER BY s.subject_index LIMIT 1
      ) n WHERE p.user_id=u AND p.expires_at>statement_timestamp()
      ORDER BY p.created_at DESC LIMIT 20
    ) x),'[]'::jsonb)
  );
END $$;

-- RPC sesi belajar paket dan pembungkus start mandiri tidak lagi didefinisikan di repositori.

CREATE OR REPLACE FUNCTION public.start_school_assignment(p_assignment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=private.school_actor(); result jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));
  result:=private.learning_legacy_assignment(p_assignment_id);
  RETURN result;
END $$;

-- The older addendum path is also made non-blocking when it is installed.
CREATE OR REPLACE FUNCTION private.a02_entitle(p_attempt_id uuid,p_mode text,p_school_id uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  -- Deliberately unrestricted: trial/subscription entitlement is no longer a gate.
  RETURN;
END $$;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='public' AND p.proname IN('learning_access_context','start_school_assignment'))
       OR (n.nspname='private' AND p.proname='a02_entitle') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.learning_access_context(),public.start_school_assignment(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
