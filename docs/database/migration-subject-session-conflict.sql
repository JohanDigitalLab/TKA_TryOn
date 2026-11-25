-- Pending manual deployment. Apply BEFORE the updated start RPCs.
-- Preserve all indexes/constraints and student snapshots; never infer game timing.
BEGIN;

CREATE OR REPLACE FUNCTION private.is_game_exam_attempt(p_attempt_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rel text; linked boolean;
BEGIN
  IF EXISTS(SELECT 1 FROM public.exam_attempts WHERE id=p_attempt_id AND attempt_type='GAMIFICATION') THEN
    RETURN true;
  END IF;
  -- Older game attempts may still be tagged EXERCISE or TRYOUT.
  FOREACH rel IN ARRAY ARRAY['private.bossfight_sessions','private.virtualpet_sessions','private.mapadventure_sessions'] LOOP
    IF to_regclass(rel) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE attempt_id=$1)',rel)
        INTO linked USING p_attempt_id;
      IF linked THEN RETURN true; END IF;
    END IF;
  END LOOP;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION private.subject_session_conflict(p_user_id uuid,p_grade integer,p_subject text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.exam_attempts%ROWTYPE; conflict jsonb; game boolean;
BEGIN
  -- Internal only. Callers validate actor/access and share this lock with starts.
  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||p_user_id::text,0));
  FOR a IN SELECT * FROM public.exam_attempts
    WHERE user_id=p_user_id AND grade=p_grade AND subject_name=p_subject AND attempt_status='IN_PROGRESS'
    ORDER BY started_at DESC,id FOR UPDATE
  LOOP
    game:=private.is_game_exam_attempt(a.id);
    IF NOT game AND a.attempt_type='TRYOUT' AND a.started_at IS NOT NULL
       AND a.duration_minutes>0
       AND a.started_at+a.duration_minutes*interval '1 minute'<=clock_timestamp() THEN
      UPDATE public.exam_attempts SET attempt_status='EXPIRED' WHERE id=a.id;
      CONTINUE;
    END IF;
    -- Do not return a game attempt ID to the generic CBT route, even with legacy tags.
    IF game THEN
      RETURN jsonb_build_object('status','SUBJECT_SESSION_ACTIVE','reason','GAME_SESSION_ACTIVE');
    END IF;
    IF conflict IS NULL THEN
      conflict:=jsonb_build_object('status','SUBJECT_SESSION_ACTIVE','reason','EXISTING_SESSION',
        'existing_session',jsonb_build_object('attempt_id',a.id,'attempt_type',a.attempt_type,
          'subject_name',a.subject_name,'tka_code',a.tka_code,
          'can_resume',a.attempt_type IN('EXERCISE','ASSIGNMENT') OR (a.attempt_type='TRYOUT' AND a.tka_code IS NOT NULL)));
    END IF;
  END LOOP;
  RETURN conflict;
END $$;

REVOKE ALL ON FUNCTION private.is_game_exam_attempt(uuid),private.subject_session_conflict(uuid,integer,text) FROM PUBLIC,anon,authenticated;
COMMIT;
