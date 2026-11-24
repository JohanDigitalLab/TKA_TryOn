-- MANUAL DEPLOY ONLY. See ../virtualpet-deployment.md. Never connect/apply automatically.
-- Foundation remains authoritative: type/name/xp_score map to pet_type/pet_name/xp.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.exam_attempts ALTER COLUMN attempt_type TYPE varchar(20);
-- Fail closed on existing duplicates; never discard pets or inventory silently.
CREATE UNIQUE INDEX IF NOT EXISTS virtualpet_one_active_pet
  ON public.virtual_pets(user_id) WHERE is_active;
CREATE UNIQUE INDEX IF NOT EXISTS virtualpet_one_inventory
  ON public.virtual_pet_items(virtual_pet_id);
CREATE UNIQUE INDEX IF NOT EXISTS virtualpet_one_show_tips
  ON public.user_settings(user_id,"group",name)
  WHERE "group"='VIRTUALPET' AND name='SHOW_TIPS';
REVOKE ALL ON public.virtual_pets,public.virtual_pet_items FROM PUBLIC,anon,authenticated;
ALTER TABLE public.virtual_pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_pet_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS private.virtualpet_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  hunger_per_hour numeric NOT NULL DEFAULT 4 CHECK(hunger_per_hour BETWEEN 0 AND 100),
  hydration_per_hour numeric NOT NULL DEFAULT 6 CHECK(hydration_per_hour BETWEEN 0 AND 100)
);
INSERT INTO private.virtualpet_config(singleton) VALUES(true) ON CONFLICT DO NOTHING;
-- Fractional point carry plus whole elapsed minutes prevents frequent bootstrap
-- requests from erasing decay. Foundation last_updated_at is timestamp, assumed UTC.
CREATE TABLE IF NOT EXISTS private.virtualpet_decay (
  pet_id uuid PRIMARY KEY REFERENCES public.virtual_pets(id),
  hunger_carry numeric NOT NULL DEFAULT 0 CHECK(hunger_carry>=0 AND hunger_carry<1),
  hydration_carry numeric NOT NULL DEFAULT 0 CHECK(hydration_carry>=0 AND hydration_carry<1)
);
CREATE TABLE IF NOT EXISTS private.virtualpet_sessions (
  attempt_id uuid PRIMARY KEY REFERENCES public.exam_attempts(id) DEFERRABLE INITIALLY DEFERRED,
  user_id uuid NOT NULL,
  pet_id uuid NOT NULL REFERENCES public.virtual_pets(id),
  scenario text NOT NULL CHECK(scenario IN('KUIZ','HOTS','PENYELAMATAN')),
  pool jsonb NOT NULL CHECK(jsonb_typeof(pool)='array'),
  result jsonb,
  writing_results boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS virtualpet_one_active_session
  ON private.virtualpet_sessions(user_id) WHERE result IS NULL;
ALTER TABLE private.virtualpet_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.virtualpet_decay ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.virtualpet_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.virtualpet_config,private.virtualpet_decay,private.virtualpet_sessions FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.virtualpet_status(p_hunger integer,p_hydration integer,p_happiness integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE WHEN least(p_hunger,p_hydration)<=0 THEN 'fainted'
    WHEN least(p_hunger,p_hydration)<=15 THEN 'sick'
    WHEN least(p_hunger,p_hydration)<40 THEN 'hungry_thirsty'
    WHEN least(p_hunger,p_hydration)>=70 AND p_happiness>=70 THEN 'happy'
    ELSE 'normal' END;
$$;

-- Caller holds virtualpet:user advisory lock BEFORE any pet/session row lock.
CREATE OR REPLACE FUNCTION private.virtualpet_apply_decay(p_pet_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p public.virtual_pets%ROWTYPE; c private.virtualpet_config%ROWTYPE;
  d private.virtualpet_decay%ROWTYPE; t timestamp:=clock_timestamp() AT TIME ZONE 'UTC';
  m bigint; h numeric; w numeric;
BEGIN
  SELECT * INTO STRICT p FROM public.virtual_pets WHERE id=p_pet_id AND user_id=auth.uid() AND is_active FOR UPDATE;
  SELECT * INTO STRICT c FROM private.virtualpet_config WHERE singleton;
  INSERT INTO private.virtualpet_decay(pet_id) VALUES(p.id) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT d FROM private.virtualpet_decay WHERE pet_id=p.id FOR UPDATE;
  m:=greatest(0,floor(extract(epoch FROM (t-coalesce(p.last_updated_at,t)))/60))::bigint;
  h:=m*c.hunger_per_hour/60+d.hunger_carry;
  w:=m*c.hydration_per_hour/60+d.hydration_carry;
  p.hunger:=greatest(0,least(100,p.hunger)-least(100,floor(h))::integer);
  p.hydration:=greatest(0,least(100,p.hydration)-least(100,floor(w))::integer);
  UPDATE public.virtual_pets SET hunger=p.hunger,hydration=p.hydration,
    happiness=greatest(0,least(100,p.happiness)),
    status=private.virtualpet_status(p.hunger,p.hydration,greatest(0,least(100,p.happiness))),
    last_updated_at=CASE WHEN p.last_updated_at IS NULL OR p.last_updated_at>t THEN t
      ELSE p.last_updated_at + m*interval '1 minute' END WHERE id=p.id;
  UPDATE private.virtualpet_decay SET hunger_carry=h-floor(h),hydration_carry=w-floor(w) WHERE pet_id=p.id;
END $$;

CREATE OR REPLACE FUNCTION private.virtualpet_settings(p_patch jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE val text;
BEGIN
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k<>'SHOW_TIPS') THEN
    RAISE EXCEPTION 'Only SHOW_TIPS is supported' USING ERRCODE='22023'; END IF;
  IF p_patch ? 'SHOW_TIPS' THEN
    IF jsonb_typeof(p_patch->'SHOW_TIPS') IS DISTINCT FROM 'string' OR p_patch->>'SHOW_TIPS' NOT IN('0','1') THEN
      RAISE EXCEPTION 'SHOW_TIPS must be string 0 or 1' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO public.user_settings(user_id,"group",name,value)
    VALUES(auth.uid(),'VIRTUALPET','SHOW_TIPS','1') ON CONFLICT DO NOTHING;
  IF p_patch ? 'SHOW_TIPS' THEN
    UPDATE public.user_settings SET value=p_patch->>'SHOW_TIPS'
      WHERE user_id=auth.uid() AND "group"='VIRTUALPET' AND name='SHOW_TIPS';
  END IF;
  SELECT value INTO STRICT val FROM public.user_settings
    WHERE user_id=auth.uid() AND "group"='VIRTUALPET' AND name='SHOW_TIPS';
  IF val NOT IN('0','1') THEN RAISE EXCEPTION 'Invalid persisted SHOW_TIPS; operator repair required' USING ERRCODE='P0001'; END IF;
  RETURN jsonb_build_object('SHOW_TIPS',val);
END $$;

-- Snapshot-only grading: never reads mutable question/option/key tables.
-- Throws on malformed/incomplete answers, returns false only for a valid wrong answer.
CREATE OR REPLACE FUNCTION private.virtualpet_grade(p_question jsonb,p_answer jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE codes jsonb; cats jsonb; item jsonb; k text; val text; correct boolean:=true;
BEGIN
  IF jsonb_typeof(p_answer) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Answer must be an object' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_answer) x WHERE x NOT IN('option_codes','category_answers')) THEN
    RAISE EXCEPTION 'Unknown answer field' USING ERRCODE='22023'; END IF;
  codes:=coalesce(p_answer->'option_codes','[]'); cats:=coalesce(p_answer->'category_answers','{}');
  IF jsonb_typeof(codes)<>'array' OR jsonb_typeof(cats)<>'object' THEN RAISE EXCEPTION 'Invalid answer structure' USING ERRCODE='22023'; END IF;
  IF p_question->>'type' IN('PG_TUNGGAL','PGK_MA') THEN
    IF cats<>'{}' OR (p_question->>'type'='PG_TUNGGAL' AND jsonb_array_length(codes)<>1)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(codes) x WHERE jsonb_typeof(x)<>'string')
      OR (SELECT count(*) FROM jsonb_array_elements(codes))<>(SELECT count(DISTINCT x) FROM jsonb_array_elements(codes) x)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(codes) x WHERE NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(p_question->'options') o WHERE o->>'option_code'=x)) THEN
      RAISE EXCEPTION 'Invalid option selection' USING ERRCODE='22023'; END IF;
    RETURN (SELECT coalesce(jsonb_agg(x ORDER BY x),'[]') FROM jsonb_array_elements_text(codes) x)
      = (SELECT coalesce(jsonb_agg(x ORDER BY x),'[]') FROM jsonb_array_elements_text(p_question->'answer_keys'->'option_codes') x);
  ELSIF p_question->>'type'='PGK_KATEGORI' THEN
    IF codes<>'[]' OR (SELECT count(*) FROM jsonb_object_keys(cats))<>jsonb_array_length(p_question->'category_items') THEN
      RAISE EXCEPTION 'Every category item must be answered exactly once' USING ERRCODE='22023'; END IF;
    FOR k,val IN SELECT key,value FROM jsonb_each_text(cats) LOOP
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_question->'category_items') c WHERE c->>'item_number'=k) THEN
        RAISE EXCEPTION 'Unknown category item' USING ERRCODE='22023'; END IF;
    END LOOP;
    FOR item IN SELECT value FROM jsonb_array_elements(p_question->'category_items') LOOP
      k:=item->>'item_number'; val:=cats->>k;
      IF jsonb_typeof(cats->k) IS DISTINCT FROM 'string' OR NOT EXISTS(
        SELECT 1 FROM regexp_split_to_table(item->>'category_label','\s*/\s*') allowed
        WHERE upper(btrim(allowed))=upper(btrim(val))) THEN
        RAISE EXCEPTION 'Invalid category selection' USING ERRCODE='22023'; END IF;
      correct:=correct AND upper(btrim(val))=upper(btrim(p_question->'answer_keys'->'category_answers'->>k));
    END LOOP;
    RETURN correct;
  END IF;
  RAISE EXCEPTION 'Unsupported question type' USING ERRCODE='22023';
END $$;

CREATE OR REPLACE FUNCTION private.virtualpet_pool(p_level text,p_scenario text,p_count integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pool jsonb;
BEGIN
  WITH candidates AS MATERIALIZED (
    SELECT q.id, q.question_type, upper(btrim(q.difficulty)) difficulty,v.estimate_minutes,
      jsonb_build_object('id',q.id,'version',v.id,'type',q.question_type,'text',v.question_text,
        'instruction',v.instruction,'subject',q.subject_name,'difficulty',q.difficulty,'estimate_minutes',v.estimate_minutes,
        'stimulus',(SELECT jsonb_build_object('title',s.title,'content_text',s.content_text,'file_url',s.file_url,'media_description',s.media_description)
          FROM public.question_stimuli s WHERE s.id=v.stimulus_id),
        'options',coalesce((SELECT jsonb_agg(jsonb_build_object('option_code',o.option_code,'option_text',o.option_text) ORDER BY o.option_order,o.option_code)
          FROM public.question_options o WHERE o.question_version_id=v.id),'[]'),
        'category_items',coalesce((SELECT jsonb_agg(jsonb_build_object('item_number',c.item_number,'item_text',c.item_text,'category_label',c.category_label) ORDER BY c.item_number)
          FROM public.question_category_items c WHERE c.question_version_id=v.id),'[]'),
        'answer_keys',jsonb_build_object(
          'option_codes',coalesce((SELECT jsonb_agg(o.option_code ORDER BY o.option_code) FROM public.question_options o WHERE o.question_version_id=v.id AND o.is_correct),'[]'),
          'category_answers',coalesce((SELECT jsonb_object_agg(c.item_number::text,c.correct_category) FROM public.question_category_items c WHERE c.question_version_id=v.id),'{}'))
      ) doc
    FROM public.questions q
    JOIN LATERAL(SELECT * FROM public.question_versions WHERE question_id=q.id AND version_status='PUBLISHED'
      ORDER BY version_number DESC,id DESC LIMIT 1) v ON true
    WHERE lower(btrim(q.education_level_id))=p_level AND q.question_status='PUBLISHED'
      AND q.question_type IN('PG_TUNGGAL','PGK_MA','PGK_KATEGORI')
  ), usable AS (
    SELECT * FROM candidates WHERE CASE WHEN question_type IN('PG_TUNGGAL','PGK_MA') THEN
      jsonb_array_length(doc->'options')>=2
      AND (SELECT count(DISTINCT o->>'option_code') FROM jsonb_array_elements(doc->'options') o)=jsonb_array_length(doc->'options')
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'options') o WHERE nullif(btrim(o->>'option_code'),'') IS NULL)
      AND CASE WHEN question_type='PG_TUNGGAL' THEN jsonb_array_length(doc->'answer_keys'->'option_codes')=1
        ELSE jsonb_array_length(doc->'answer_keys'->'option_codes')>=1 END
    ELSE jsonb_array_length(doc->'category_items')>0
      AND (SELECT count(DISTINCT c->>'item_number') FROM jsonb_array_elements(doc->'category_items') c)=jsonb_array_length(doc->'category_items')
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'category_items') c WHERE
        nullif(btrim(doc->'answer_keys'->'category_answers'->>(c->>'item_number')),'') IS NULL
        OR NOT EXISTS(SELECT 1 FROM regexp_split_to_table(c->>'category_label','\s*/\s*') allowed
          WHERE upper(btrim(allowed))=upper(btrim(doc->'answer_keys'->'category_answers'->>(c->>'item_number'))))) END
  ), chosen AS (
    -- Only HOTS may fall back to the remaining valid bank. Other scenarios
    -- require the easy/medium AND <=5-minute intersection, or fail exact count.
    SELECT doc FROM usable
    WHERE p_scenario='HOTS' OR (difficulty IN('MUDAH','SEDANG') AND estimate_minutes<=5)
    ORDER BY CASE WHEN p_scenario='HOTS' AND coalesce(difficulty='SULIT' OR estimate_minutes>5,false)
      THEN 0 ELSE 1 END,random()
    LIMIT p_count
  )
  SELECT coalesce(jsonb_agg(doc ORDER BY random()),'[]') INTO pool FROM chosen;
  IF jsonb_array_length(pool)<>p_count THEN
    RAISE EXCEPTION 'Soal published valid tidak cukup untuk %: dibutuhkan %, tersedia % pada jenjang %',p_scenario,p_count,jsonb_array_length(pool),p_level USING ERRCODE='P0001';
  END IF;
  RETURN pool;
END $$;

-- Both old and new membership are protected. No GUC supplied by a client is trusted.
-- Only the private session write window can authorize writes, including initial INSERT.
CREATE OR REPLACE FUNCTION private.virtualpet_guard_exam() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ids uuid[]:='{}'; aid uuid; tagged boolean:=false; s private.virtualpet_sessions%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='exam_attempts' THEN
    IF TG_OP<>'INSERT' THEN ids:=array_append(ids,OLD.id); tagged:=OLD.gamification_app='VIRTUALPET'; END IF;
    IF TG_OP<>'DELETE' THEN ids:=array_append(ids,NEW.id); tagged:=coalesce(tagged,false) OR NEW.gamification_app='VIRTUALPET'; END IF;
  ELSE
    IF TG_OP<>'INSERT' THEN ids:=array_append(ids,OLD.attempt_id); END IF;
    IF TG_OP<>'DELETE' THEN ids:=array_append(ids,NEW.attempt_id); END IF;
  END IF;
  FOREACH aid IN ARRAY ids LOOP
    SELECT * INTO s FROM private.virtualpet_sessions WHERE attempt_id=aid;
    IF FOUND OR coalesce(tagged,false) OR EXISTS(SELECT 1 FROM public.exam_attempts WHERE id=aid AND gamification_app='VIRTUALPET') THEN
      IF s.attempt_id IS NULL OR NOT s.writing_results OR s.result IS NOT NULL OR s.user_id IS DISTINCT FROM auth.uid() OR TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Use VirtualPet RPC; exam snapshot is immutable' USING ERRCODE='42501'; END IF;
      IF TG_TABLE_NAME='exam_attempts' THEN
        IF NEW.id<>s.attempt_id OR NEW.user_id<>s.user_id OR NEW.attempt_type<>'GAMIFICATION'
          OR NEW.gamification_app IS DISTINCT FROM 'VIRTUALPET' OR NEW.deadline_at IS NOT NULL THEN
          RAISE EXCEPTION 'Invalid VirtualPet exam identity' USING ERRCODE='42501'; END IF;
      END IF;
    END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS virtualpet_guard ON public.exam_attempts;
CREATE TRIGGER virtualpet_guard BEFORE INSERT OR UPDATE OR DELETE ON public.exam_attempts FOR EACH ROW EXECUTE FUNCTION private.virtualpet_guard_exam();
DROP TRIGGER IF EXISTS virtualpet_guard ON public.exam_attempt_questions;
CREATE TRIGGER virtualpet_guard BEFORE INSERT OR UPDATE OR DELETE ON public.exam_attempt_questions FOR EACH ROW EXECUTE FUNCTION private.virtualpet_guard_exam();
DROP TRIGGER IF EXISTS virtualpet_guard ON public.exam_attempt_answers;
CREATE TRIGGER virtualpet_guard BEFORE INSERT OR UPDATE OR DELETE ON public.exam_attempt_answers FOR EACH ROW EXECUTE FUNCTION private.virtualpet_guard_exam();
REVOKE TRUNCATE ON public.exam_attempts,public.exam_attempt_questions,public.exam_attempt_answers FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.virtualpet_state() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p public.virtual_pets%ROWTYPE; cfg jsonb; pet jsonb; inv jsonb; active jsonb;
BEGIN
  cfg:=private.virtualpet_settings();
  SELECT * INTO p FROM public.virtual_pets WHERE user_id=auth.uid() AND is_active;
  IF FOUND THEN
    pet:=(to_jsonb(p)-'type'-'name'-'xp_score')||jsonb_build_object('pet_type',p.type,'pet_name',p.name,'xp',p.xp_score);
    SELECT to_jsonb(i)-'id'-'virtual_pet_id' INTO inv FROM public.virtual_pet_items i WHERE virtual_pet_id=p.id;
  END IF;
  SELECT jsonb_build_object('attempt_id',s.attempt_id,'pet_id',s.pet_id,'scenario',s.scenario,
    'questions',s.pool,'total',jsonb_array_length(s.pool),'deadline_at',NULL,'remaining_seconds',NULL)
    INTO active FROM private.virtualpet_sessions s WHERE s.user_id=auth.uid() AND s.result IS NULL;
  RETURN jsonb_build_object('pet',pet,'inventory',inv,'settings',cfg,'session',active,
    'profile_xp',(SELECT xp_score FROM public.profiles WHERE id=auth.uid()),
    'tip',CASE WHEN cfg->>'SHOW_TIPS'='1' THEN (SELECT jsonb_build_object('id',id,'message',message)
      FROM public.gamification_tips WHERE application='VIRTUALPET' AND is_active ORDER BY random() LIMIT 1) ELSE NULL END);
END $$;

CREATE OR REPLACE FUNCTION public.virtualpet(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=auth.uid(); lvl text; pid uuid; aid uuid; p public.virtual_pets%ROWTYPE;
  s private.virtualpet_sessions%ROWTYPE; inv public.virtual_pet_items%ROWTYPE;
  pool jsonb; scenario text; n integer; correct integer:=0; passed boolean; xp integer:=0;
  q jsonb; a jsonb; r jsonb; rewards jsonb; snack text; snacks jsonb:='[]'; i integer; item text;
  nick text; log_text text;
BEGIN
  IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles pr JOIN auth.users au ON au.id=pr.id
    WHERE pr.id=u AND upper(btrim(pr.account_type))='STUDENT' AND pr.account_status='active'
      AND au.email_confirmed_at IS NOT NULL AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now())) THEN
    RAISE EXCEPTION 'Active authenticated STUDENT account required' USING ERRCODE='42501'; END IF;
  IF p_action IS NULL OR p_action NOT IN('bootstrap','settings','adopt','feed','start','finish') THEN
    RAISE EXCEPTION 'Invalid VirtualPet action' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>131072 THEN
    RAISE EXCEPTION 'Invalid VirtualPet payload' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT(k=ANY(CASE p_action
    WHEN 'bootstrap' THEN ARRAY[]::text[] WHEN 'settings' THEN ARRAY['settings']
    WHEN 'adopt' THEN ARRAY['pet_type','pet_name'] WHEN 'feed' THEN ARRAY['item']
    WHEN 'start' THEN ARRAY['scenario'] ELSE ARRAY['attempt_id','answers'] END))) THEN
    RAISE EXCEPTION 'Unknown payload field; client scores/rewards are not accepted' USING ERRCODE='22023'; END IF;
  -- Universal lock ordering for every action: user advisory -> pet -> session -> exam.
  PERFORM pg_advisory_xact_lock(hashtextextended('virtualpet:user:'||u::text,0));
  SELECT id INTO pid FROM public.virtual_pets WHERE user_id=u AND is_active FOR UPDATE;
  IF pid IS NOT NULL THEN
    PERFORM private.virtualpet_apply_decay(pid);
    INSERT INTO public.virtual_pet_items(virtual_pet_id) VALUES(pid) ON CONFLICT DO NOTHING;
    SELECT * INTO STRICT p FROM public.virtual_pets WHERE id=pid;
  END IF;
  IF p_action='settings' THEN
    PERFORM private.virtualpet_settings(coalesce(p_payload->'settings','{}'));
  ELSIF p_action='adopt' THEN
    IF jsonb_typeof(p_payload->'pet_type') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'pet_name') IS DISTINCT FROM 'string'
      OR length(btrim(p_payload->>'pet_type')) NOT BETWEEN 1 AND 50 OR length(btrim(p_payload->>'pet_name')) NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION 'pet_type and pet_name must contain 1..50 characters' USING ERRCODE='22023'; END IF;
    IF pid IS NULL THEN
      IF EXISTS(SELECT 1 FROM public.virtual_pets WHERE user_id=u)
        OR EXISTS(SELECT 1 FROM private.virtualpet_sessions WHERE user_id=u AND result IS NULL) THEN
        RAISE EXCEPTION 'Existing pet requires operator recovery; adoption cannot reset it' USING ERRCODE='P0001'; END IF;
      INSERT INTO public.virtual_pets(user_id,type,name,level,xp_score,hunger,hydration,happiness,status,last_updated_at)
        VALUES(u,btrim(p_payload->>'pet_type'),btrim(p_payload->>'pet_name'),0,0,100,100,100,'happy',clock_timestamp() AT TIME ZONE 'UTC') RETURNING id INTO pid;
      INSERT INTO public.virtual_pet_items(virtual_pet_id) VALUES(pid); -- All six counts zero by foundation default.
    ELSE
      UPDATE public.virtual_pets SET type=btrim(p_payload->>'pet_type'),name=btrim(p_payload->>'pet_name') WHERE id=pid;
    END IF;
  ELSIF p_action='feed' THEN
    IF pid IS NULL THEN RAISE EXCEPTION 'Adopt a pet first' USING ERRCODE='P0001'; END IF;
    item:=p_payload->>'item';
    IF jsonb_typeof(p_payload->'item') IS DISTINCT FROM 'string' OR item NOT IN('water','rice','apple','donut','cake','vitamin') THEN
      RAISE EXCEPTION 'Invalid inventory item' USING ERRCODE='22023'; END IF;
    SELECT * INTO STRICT inv FROM public.virtual_pet_items WHERE virtual_pet_id=pid FOR UPDATE;
    IF (to_jsonb(inv)->>item)::integer<=0 THEN RAISE EXCEPTION 'Item inventory is empty' USING ERRCODE='P0001'; END IF;
    UPDATE public.virtual_pet_items SET water=water-CASE WHEN item='water' THEN 1 ELSE 0 END,
      rice=rice-CASE WHEN item='rice' THEN 1 ELSE 0 END,apple=apple-CASE WHEN item='apple' THEN 1 ELSE 0 END,
      donut=donut-CASE WHEN item='donut' THEN 1 ELSE 0 END,cake=cake-CASE WHEN item='cake' THEN 1 ELSE 0 END,
      vitamin=vitamin-CASE WHEN item='vitamin' THEN 1 ELSE 0 END WHERE virtual_pet_id=pid;
    UPDATE public.virtual_pets SET
      hunger=least(100,hunger+CASE item WHEN 'rice' THEN 30 WHEN 'apple' THEN 10 WHEN 'donut' THEN 15 WHEN 'cake' THEN 20 WHEN 'vitamin' THEN 5 ELSE 0 END),
      hydration=least(100,hydration+CASE item WHEN 'water' THEN 30 WHEN 'apple' THEN 10 WHEN 'vitamin' THEN 5 ELSE 0 END),
      happiness=least(100,happiness+CASE item WHEN 'apple' THEN 10 WHEN 'donut' THEN 15 WHEN 'cake' THEN 20 WHEN 'vitamin' THEN 5 ELSE 0 END)
      WHERE id=pid;
    PERFORM private.virtualpet_apply_decay(pid); -- Recompute canonical status; does not reset time/carry.
  ELSIF p_action='start' THEN
    IF pid IS NULL THEN RAISE EXCEPTION 'Adopt a pet first' USING ERRCODE='P0001'; END IF;
    SELECT * INTO s FROM private.virtualpet_sessions WHERE user_id=u AND result IS NULL FOR UPDATE;
    IF FOUND THEN RETURN private.virtualpet_state()||jsonb_build_object('resumed',true); END IF;
    scenario:=p_payload->>'scenario';
    IF jsonb_typeof(p_payload->'scenario') IS DISTINCT FROM 'string' OR scenario NOT IN('KUIZ','HOTS','PENYELAMATAN') THEN
      RAISE EXCEPTION 'Scenario must be KUIZ, HOTS or PENYELAMATAN' USING ERRCODE='22023'; END IF;
    SELECT lower(btrim(education_level)) INTO lvl FROM public.profiles WHERE id=u;
    IF lvl IS NULL OR lvl NOT IN('sd','smp','sma') THEN RAISE EXCEPTION 'Persisted education level unavailable' USING ERRCODE='P0001'; END IF;
    n:=CASE WHEN scenario='PENYELAMATAN' THEN 15 ELSE 10 END;
    pool:=private.virtualpet_pool(lvl,scenario,n); aid:=gen_random_uuid();
    -- Deferred FK allows the private authorization row to precede guarded exam INSERT.
    INSERT INTO private.virtualpet_sessions(attempt_id,user_id,pet_id,scenario,pool,writing_results) VALUES(aid,u,pid,scenario,pool,true);
    INSERT INTO public.exam_attempts(id,user_id,education_level,grade,subject_name,duration_minutes,total_questions,attempt_type,gamification_app,started_at,deadline_at)
      VALUES(aid,u,upper(lvl),CASE lvl WHEN 'sd' THEN 6 WHEN 'smp' THEN 9 ELSE 12 END,'VirtualPet',60,n,'GAMIFICATION','VIRTUALPET',clock_timestamp(),NULL);
    INSERT INTO public.exam_attempt_questions(attempt_id,question_id,question_version_id,question_order)
      SELECT aid,(value->>'id')::uuid,(value->>'version')::uuid,ordinality::integer FROM jsonb_array_elements(pool) WITH ORDINALITY;
    UPDATE private.virtualpet_sessions SET writing_results=false WHERE attempt_id=aid;
    RETURN private.virtualpet_state()||jsonb_build_object('resumed',false);
  ELSIF p_action='finish' THEN
    IF jsonb_typeof(p_payload->'attempt_id') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'attempt_id required' USING ERRCODE='22023'; END IF;
    aid:=(p_payload->>'attempt_id')::uuid;
    SELECT * INTO s FROM private.virtualpet_sessions WHERE attempt_id=aid AND user_id=u FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VirtualPet session unavailable' USING ERRCODE='42501'; END IF;
    IF s.result IS NOT NULL THEN RETURN s.result||private.virtualpet_state(); END IF;
    IF pid IS DISTINCT FROM s.pet_id THEN RAISE EXCEPTION 'Session pet unavailable; operator recovery required' USING ERRCODE='P0001'; END IF;
    n:=jsonb_array_length(s.pool);
    IF jsonb_typeof(p_payload->'answers') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'answers array required' USING ERRCODE='22023'; END IF;
    IF jsonb_array_length(p_payload->'answers')<>n THEN RAISE EXCEPTION 'Exactly one answer per question required' USING ERRCODE='22023'; END IF;
    FOR a IN SELECT value FROM jsonb_array_elements(p_payload->'answers') LOOP
      IF jsonb_typeof(a) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid answer record' USING ERRCODE='22023'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_object_keys(a) k WHERE k NOT IN('question_id','answer_payload')) OR jsonb_typeof(a->'question_id') IS DISTINCT FROM 'string'
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.pool) x WHERE x->>'id'=a->>'question_id') THEN
        RAISE EXCEPTION 'Answer does not belong to frozen question pool' USING ERRCODE='22023'; END IF;
    END LOOP;
    IF (SELECT count(DISTINCT value->>'question_id') FROM jsonb_array_elements(p_payload->'answers'))<>n THEN
      RAISE EXCEPTION 'Duplicate question answers are forbidden' USING ERRCODE='22023'; END IF;
    -- Validate and grade the WHOLE input before persisting any exam or reward writes.
    FOR q IN SELECT value FROM jsonb_array_elements(s.pool) LOOP
      SELECT value->'answer_payload' INTO a FROM jsonb_array_elements(p_payload->'answers') WHERE value->>'question_id'=q->>'id';
      IF private.virtualpet_grade(q,a) THEN correct:=correct+1; END IF;
    END LOOP;
    PERFORM 1 FROM public.exam_attempts WHERE id=aid AND user_id=u AND attempt_type='GAMIFICATION'
      AND gamification_app='VIRTUALPET' AND attempt_status='IN_PROGRESS' AND deadline_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VirtualPet exam integrity violation' USING ERRCODE='P0001'; END IF;
    passed:=correct*100>=n*80;
    rewards:='{"water":0,"rice":0,"apple":0,"donut":0,"cake":0,"vitamin":0,"hunger":0,"hydration":0,"profile_xp":0}';
    IF passed THEN
      xp:=CASE s.scenario WHEN 'KUIZ' THEN 1 WHEN 'HOTS' THEN 5 ELSE 2 END;
      rewards:=jsonb_set(rewards,'{profile_xp}',to_jsonb(xp));
      IF s.scenario='KUIZ' THEN
        UPDATE public.virtual_pet_items SET water=water+1,rice=rice+1 WHERE virtual_pet_id=pid;
        rewards:=rewards||'{"water":1,"rice":1}';
      ELSIF s.scenario='HOTS' THEN
        FOR i IN 1..2 LOOP
          snack:=(ARRAY['apple','donut','cake','vitamin'])[1+floor(random()*4)::integer];
          snacks:=snacks||jsonb_build_array(snack);
          rewards:=jsonb_set(rewards,ARRAY[snack],to_jsonb((rewards->>snack)::integer+1));
        END LOOP;
        UPDATE public.virtual_pet_items SET apple=apple+(rewards->>'apple')::integer,donut=donut+(rewards->>'donut')::integer,
          cake=cake+(rewards->>'cake')::integer,vitamin=vitamin+(rewards->>'vitamin')::integer WHERE virtual_pet_id=pid;
      ELSE
        UPDATE public.virtual_pets SET hunger=least(100,hunger+50),hydration=least(100,hydration+50) WHERE id=pid;
        rewards:=rewards||jsonb_build_object('hunger',least(50,100-p.hunger),'hydration',least(50,100-p.hydration));
      END IF;
      UPDATE public.profiles SET xp_score=xp_score+xp WHERE id=u;
      -- gamification_log has no application column (foundation contract); the app context
      -- lives in the Indonesian activity sentence. Nickname falls back to full name/Siswa.
      SELECT coalesce(nullif(btrim(pr.nickname),''),nullif(btrim(pr.full_name),''),'Siswa') INTO nick
        FROM public.profiles pr WHERE pr.id=u;
      log_text:=CASE s.scenario
        WHEN 'KUIZ' THEN nick||' menyelesaikan quiz bersama '||p.name||'.'
        WHEN 'HOTS' THEN nick||' menyelesaikan soal-soal HOTS bersama '||p.name||'.'
        ELSE nick||' menyelamatkan '||p.name||' dari kepingsanan.' END;
      INSERT INTO public.gamification_log(user_id,activity,xp_score) VALUES(u,log_text,xp);
    END IF;
    UPDATE private.virtualpet_sessions SET writing_results=true WHERE attempt_id=aid;
    INSERT INTO public.exam_attempt_answers(attempt_id,question_id,answer_payload,answered_at,is_timeout)
      SELECT aid,(value->>'question_id')::uuid,value->'answer_payload',clock_timestamp(),false FROM jsonb_array_elements(p_payload->'answers');
    UPDATE public.exam_attempts SET attempt_status='SUBMITTED',correct_answers=correct,score=round(correct*100.0/n,2),submitted_at=clock_timestamp() WHERE id=aid;
    r:=jsonb_build_object('attempt_id',aid,'scenario',s.scenario,'score',round(correct*100.0/n,2),'correct',correct,'total',n,'passed',passed,'rewards',rewards,'snacks',snacks);
    UPDATE private.virtualpet_sessions SET result=r,writing_results=false WHERE attempt_id=aid;
    PERFORM private.virtualpet_apply_decay(pid);
    RETURN r||private.virtualpet_state();
  END IF;
  RETURN private.virtualpet_state();
END $$;

REVOKE ALL ON FUNCTION private.virtualpet_status(integer,integer,integer),private.virtualpet_apply_decay(uuid),
  private.virtualpet_settings(jsonb),private.virtualpet_grade(jsonb,jsonb),private.virtualpet_pool(text,text,integer),
  private.virtualpet_guard_exam(),private.virtualpet_state() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.virtualpet(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.virtualpet(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
