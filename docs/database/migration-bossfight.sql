-- Pending manual deployment. Never apply automatically.
BEGIN;
SET LOCAL lock_timeout='10s';
ALTER TABLE public.exam_attempts ALTER COLUMN attempt_type TYPE varchar(20);

CREATE TABLE IF NOT EXISTS private.bossfight_sessions (
 attempt_id uuid PRIMARY KEY REFERENCES public.exam_attempts(id), user_id uuid NOT NULL,
 settings jsonb NOT NULL, pool jsonb NOT NULL, records jsonb NOT NULL DEFAULT '[]',
 hp integer[] NOT NULL DEFAULT ARRAY[100,100], combo integer[] NOT NULL DEFAULT ARRAY[0,0],
 healed boolean[] NOT NULL DEFAULT ARRAY[false,false], correct integer NOT NULL DEFAULT 0,
 terminal boolean NOT NULL DEFAULT false, result jsonb
);
ALTER TABLE private.bossfight_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.bossfight_sessions FROM PUBLIC,anon,authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS bossfight_one_active ON private.bossfight_sessions(user_id) WHERE result IS NULL;
ALTER TABLE private.bossfight_sessions ADD COLUMN IF NOT EXISTS writing_results boolean NOT NULL DEFAULT false;

-- Private transactional gate also blocks writes through unrelated legacy RPCs/RLS.
CREATE OR REPLACE FUNCTION private.bossfight_guard_exam() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE aid uuid; allowed boolean;
BEGIN
 IF TG_TABLE_NAME='exam_attempts' THEN
  aid:=OLD.id;
 ELSE
  aid:=CASE WHEN TG_OP='DELETE' THEN OLD.attempt_id ELSE NEW.attempt_id END;
  IF TG_OP='UPDATE' AND NEW.attempt_id IS DISTINCT FROM OLD.attempt_id AND EXISTS(SELECT 1 FROM private.bossfight_sessions WHERE attempt_id=OLD.attempt_id) THEN
   RAISE EXCEPTION 'BossFight records are immutable' USING ERRCODE='42501';
  END IF;
 END IF;
 SELECT writing_results INTO allowed FROM private.bossfight_sessions WHERE attempt_id=aid FOR UPDATE;
 IF FOUND AND NOT allowed THEN RAISE EXCEPTION 'Use BossFight endpoint' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bossfight_guard ON public.exam_attempts;
CREATE TRIGGER bossfight_guard BEFORE UPDATE OR DELETE ON public.exam_attempts FOR EACH ROW EXECUTE FUNCTION private.bossfight_guard_exam();
DROP TRIGGER IF EXISTS bossfight_guard ON public.exam_attempt_questions;
CREATE TRIGGER bossfight_guard BEFORE INSERT OR UPDATE OR DELETE ON public.exam_attempt_questions FOR EACH ROW EXECUTE FUNCTION private.bossfight_guard_exam();
DROP TRIGGER IF EXISTS bossfight_guard ON public.exam_attempt_answers;
CREATE TRIGGER bossfight_guard BEFORE INSERT OR UPDATE OR DELETE ON public.exam_attempt_answers FOR EACH ROW EXECUTE FUNCTION private.bossfight_guard_exam();
REVOKE ALL ON FUNCTION private.bossfight_guard_exam() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.bossfight_settings(p_patch jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=auth.uid(); k text; val text; d jsonb:='{"SHOW_TIPS":"1","SUBJECT":"Matematika","IS_PVP":"0","FIGHT_MODE":"Maksimal jumlah soal","MAX_QUESTIONS":"10","P2_NAME":"Player2"}'; s jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('bossfight:settings:'||u::text,0));
 FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
  IF NOT(d ? k) OR jsonb_typeof(p_patch->k)<>'string' THEN RAISE EXCEPTION 'Invalid setting' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR k,val IN SELECT key,value FROM jsonb_each_text(d) LOOP
  SELECT value INTO val FROM public.user_settings WHERE user_id=u AND "group"='BOSSFIGHT' AND name=k ORDER BY id LIMIT 1;
  val:=coalesce(p_patch->>k,val,d->>k);
  IF length(val)>255 OR btrim(val)='' OR (k IN('SHOW_TIPS','IS_PVP') AND val NOT IN('0','1'))
   OR (k='MAX_QUESTIONS' AND (val !~ '^[0-9]{1,3}$'))
   OR (k='FIGHT_MODE' AND val NOT IN('Maksimal jumlah soal','Fight to Death')) THEN
   RAISE EXCEPTION 'Invalid setting value' USING ERRCODE='22023'; END IF;
  IF k='MAX_QUESTIONS' AND val::integer NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid question limit' USING ERRCODE='22023'; END IF;
  UPDATE public.user_settings SET value=val WHERE user_id=u AND "group"='BOSSFIGHT' AND name=k;
  IF NOT FOUND THEN INSERT INTO public.user_settings(user_id,"group",name,value) VALUES(u,'BOSSFIGHT',k,val); END IF;
  d:=jsonb_set(d,ARRAY[k],to_jsonb(val));
 END LOOP;
 RETURN d;
END $$;

CREATE OR REPLACE FUNCTION private.bossfight_view(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s private.bossfight_sessions%ROWTYPE; n integer; q jsonb;
BEGIN
 SELECT * INTO STRICT s FROM private.bossfight_sessions WHERE attempt_id=p_id AND user_id=auth.uid();
 n:=jsonb_array_length(s.records);
 SELECT coalesce(jsonb_agg((value-'answer_keys')||jsonb_build_object('order',ordinality,'player',CASE WHEN s.settings->>'IS_PVP'='1' THEN (ordinality-1)%2+1 ELSE 1 END) ORDER BY ordinality),'[]'::jsonb) INTO q
 FROM jsonb_array_elements(s.pool) WITH ORDINALITY WHERE NOT s.terminal AND ordinality>n;
 RETURN jsonb_build_object('attempt_id',p_id,'settings',s.settings,'hp',s.hp,'combo',s.combo,'healed',s.healed,'used',n,'correct',s.correct,'terminal',s.terminal,'questions',q,'result',s.result);
END $$;

-- Trusted operator configuration, never supplied by the client.
CREATE TABLE IF NOT EXISTS private.bossfight_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 death_initial integer NOT NULL DEFAULT 10 CHECK(death_initial BETWEEN 1 AND 100),
 death_additional integer NOT NULL DEFAULT 10 CHECK(death_additional BETWEEN 1 AND 100)
);
INSERT INTO private.bossfight_config(singleton) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE private.bossfight_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.bossfight_config FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.bossfight_pool(p_subject text,p_level text,p_limit integer,p_excluded jsonb DEFAULT '[]') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_agg(x.doc ORDER BY x.shuffle) INTO result FROM (
   SELECT random() shuffle,jsonb_build_object('id',q.id,'version',v.id,'type',q.question_type,'text',v.question_text,'instruction',v.instruction,
    'stimulus',(SELECT jsonb_build_object('title',st.title,'content_text',st.content_text,'file_url',st.file_url,'media_description',st.media_description) FROM public.question_stimuli st WHERE st.id=v.stimulus_id),
    'options',coalesce((SELECT jsonb_agg(jsonb_build_object('option_code',o.option_code,'option_text',o.option_text) ORDER BY o.option_order,o.option_code) FROM public.question_options o WHERE o.question_version_id=v.id),'[]'),
    'category_items',coalesce((SELECT jsonb_agg(jsonb_build_object('item_number',c.item_number,'item_text',c.item_text,'category_label',c.category_label) ORDER BY c.item_number) FROM public.question_category_items c WHERE c.question_version_id=v.id),'[]')
   ) doc
   FROM public.questions q JOIN LATERAL(SELECT * FROM public.question_versions WHERE question_id=q.id AND version_status='PUBLISHED' AND estimate_minutes>0 AND estimate_minutes<=5 ORDER BY version_number DESC,id DESC LIMIT 1) v ON true
   WHERE q.subject_code=p_subject AND lower(q.education_level_id)=p_level AND q.question_status='PUBLISHED' AND q.question_type IN('PG_TUNGGAL','PGK_MA','PGK_KATEGORI')
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_excluded) e WHERE e->>'id'=q.id::text)
   ORDER BY random() LIMIT p_limit
  ) x;
 RETURN coalesce(result,'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION private.bossfight_pool(text,text,integer,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bossfight(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 u uuid:=auth.uid(); cfg jsonb; lvl text; subj text; sc text; aid uuid; pool jsonb;
 s private.bossfight_sessions%ROWTYPE; r jsonb; q jsonb; n integer; pos integer; actor integer; opponent integer;
 ok boolean; timeout boolean; heal boolean; payload jsonb; victory boolean; winner integer; xp integer; nick text; batch_limit integer; extra jsonb; previous_pos integer:=-1;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>65536 THEN RAISE EXCEPTION 'Invalid payload' USING ERRCODE='22023'; END IF;
 IF p_action IN('bootstrap','settings') THEN
  cfg:=private.bossfight_settings(CASE WHEN p_action='settings' THEN coalesce(p_payload->'settings','{}') ELSE '{}' END);
  RETURN jsonb_build_object('settings',cfg,'tip',CASE WHEN cfg->>'SHOW_TIPS'='1' THEN
   (SELECT jsonb_build_object('id',id,'message',message) FROM public.gamification_tips WHERE application='BOSSFIGHT' AND is_active ORDER BY random() LIMIT 1) ELSE NULL END);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('bossfight:session:'||u::text,0));
 IF p_action='start' THEN
  SELECT attempt_id INTO aid FROM private.bossfight_sessions WHERE user_id=u AND result IS NULL;
  IF FOUND THEN RETURN private.bossfight_view(aid); END IF;
  cfg:=private.bossfight_settings();
  SELECT lower(btrim(education_level)) INTO lvl FROM public.profiles WHERE id=u;
  IF lvl IS NULL OR lvl NOT IN('sd','smp','sma') THEN RAISE EXCEPTION 'Education unavailable' USING ERRCODE='42501'; END IF;
  SELECT subject_code,name INTO sc,subj FROM public.subjects WHERE name=cfg->>'SUBJECT' AND right(lower(subject_code),length(lvl)+1)='-'||lvl ORDER BY subject_code LIMIT 1;
  IF sc IS NULL THEN RAISE EXCEPTION 'Subject unavailable' USING ERRCODE='22023'; END IF;
  SELECT death_initial INTO batch_limit FROM private.bossfight_config WHERE singleton;
  pool:=private.bossfight_pool(sc,lvl,CASE WHEN cfg->>'FIGHT_MODE'='Maksimal jumlah soal' THEN (cfg->>'MAX_QUESTIONS')::integer ELSE batch_limit END);
  IF jsonb_array_length(pool)=0 THEN RAISE EXCEPTION 'No published questions' USING ERRCODE='P0001'; END IF;
  INSERT INTO public.exam_attempts(user_id,education_level,grade,subject_name,duration_minutes,total_questions,attempt_type,gamification_app,started_at,deadline_at)
   VALUES(u,upper(lvl),CASE lvl WHEN 'sd' THEN 6 WHEN 'smp' THEN 9 ELSE 12 END,subj,60,0,'GAMIFICATION','BOSSFIGHT',clock_timestamp(),NULL) RETURNING id INTO aid;
  INSERT INTO private.bossfight_sessions(attempt_id,user_id,settings,pool) VALUES(aid,u,cfg,pool);
  RETURN private.bossfight_view(aid);
 END IF;
 IF p_action NOT IN('batch','finish') THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 aid:=(p_payload->>'attempt_id')::uuid;
 SELECT * INTO s FROM private.bossfight_sessions WHERE attempt_id=aid AND user_id=u FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE='42501'; END IF;
 IF s.result IS NOT NULL THEN RETURN private.bossfight_view(aid); END IF;
 IF jsonb_typeof(coalesce(p_payload->'records','[]'))<>'array' OR jsonb_array_length(coalesce(p_payload->'records','[]'))>100 THEN RAISE EXCEPTION 'At most 100 ordered records required' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'records','[]')) LOOP
  n:=jsonb_array_length(s.records);
  SELECT ordinality::integer-1 INTO pos FROM jsonb_array_elements(s.pool) WITH ORDINALITY x(value,ordinality) WHERE value->>'id'=r->>'question_id';
  IF pos IS NULL OR pos>n THEN RAISE EXCEPTION 'Question order conflict'; END IF;
  IF pos<=previous_pos THEN RAISE EXCEPTION 'Question order conflict'; END IF;
  previous_pos:=pos;
  IF pos<n THEN
   IF s.records->pos->'input' IS DISTINCT FROM r THEN RAISE EXCEPTION 'Answer already locked'; END IF;
   CONTINUE;
  END IF;
  IF s.terminal THEN RAISE EXCEPTION 'Session terminal'; END IF;
  q:=s.pool->n; payload:=r->'answer_payload';
  IF jsonb_typeof(r->'is_timeout') IS DISTINCT FROM 'boolean' OR jsonb_typeof(r->'heal') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Boolean flags required' USING ERRCODE='22023'; END IF;
  timeout:=(r->>'is_timeout')::boolean; heal:=(r->>'heal')::boolean;
  IF timeout THEN
   IF payload IS DISTINCT FROM '{}'::jsonb THEN RAISE EXCEPTION 'Timeout payload must be empty' USING ERRCODE='22023'; END IF;
  ELSIF NOT coalesce(private.exam_answer_payload_is_valid((q->>'version')::uuid,q->>'type',payload),false) THEN RAISE EXCEPTION 'Invalid answer' USING ERRCODE='22023'; END IF;
  ok:=NOT timeout AND private.exam_answer_is_correct((q->>'version')::uuid,q->>'type',payload);
  actor:=CASE WHEN s.settings->>'IS_PVP'='1' THEN n%2+1 ELSE 1 END; opponent:=3-actor;
  IF heal THEN
   IF s.healed[actor] THEN RAISE EXCEPTION 'Heal already used'; END IF;
   s.healed[actor]:=true; s.hp[actor]:=least(100,s.hp[actor]+20);
  END IF;
  IF ok THEN
   s.correct:=s.correct+1; s.combo[actor]:=s.combo[actor]+1;
   s.hp[opponent]:=greatest(0,s.hp[opponent]-CASE WHEN s.combo[actor]>=3 THEN 30 ELSE 20 END);
  ELSE s.combo[actor]:=0; s.hp[actor]:=greatest(0,s.hp[actor]-20); END IF;
  s.records:=s.records||jsonb_build_array(jsonb_build_object('input',r,'correct',ok,'answered_at',clock_timestamp()));
  s.terminal:=s.hp[1]=0 OR s.hp[2]=0 OR (s.settings->>'FIGHT_MODE'='Maksimal jumlah soal' AND n+1=jsonb_array_length(s.pool));
 END LOOP;
 IF NOT s.terminal AND jsonb_array_length(s.records)=jsonb_array_length(s.pool) THEN
  SELECT lower(btrim(education_level)),subject_name INTO lvl,subj FROM public.exam_attempts WHERE id=aid;
  SELECT subject_code INTO sc FROM public.subjects WHERE name=subj AND right(lower(subject_code),length(lvl)+1)='-'||lvl ORDER BY subject_code LIMIT 1;
  SELECT death_additional INTO batch_limit FROM private.bossfight_config WHERE singleton;
  extra:=private.bossfight_pool(sc,lvl,batch_limit,s.pool);
  s.pool:=s.pool||extra;
  s.terminal:=jsonb_array_length(extra)=0;
 END IF;
 UPDATE private.bossfight_sessions SET pool=s.pool,records=s.records,hp=s.hp,combo=s.combo,healed=s.healed,correct=s.correct,terminal=s.terminal WHERE attempt_id=aid;
 IF p_action='finish' THEN
  IF NOT s.terminal THEN RAISE EXCEPTION 'Session not terminal'; END IF;
  n:=jsonb_array_length(s.records);
  IF s.settings->>'IS_PVP'='1' THEN winner:=CASE WHEN s.hp[1]>s.hp[2] THEN 1 WHEN s.hp[2]>s.hp[1] THEN 2 ELSE 0 END;
  ELSE winner:=CASE WHEN s.hp[1]>0 AND (s.hp[2]=0 OR (s.settings->>'FIGHT_MODE'='Maksimal jumlah soal' AND s.correct*2>n)) THEN 1 ELSE 2 END; END IF;
  victory:=winner=1; xp:=CASE WHEN victory THEN 1 ELSE 0 END;
  UPDATE private.bossfight_sessions SET writing_results=true WHERE attempt_id=aid;
  FOR pos IN 0..n-1 LOOP
   q:=s.pool->pos; r:=s.records->pos;
   INSERT INTO public.exam_attempt_questions(attempt_id,question_id,question_version_id,question_order) VALUES(aid,(q->>'id')::uuid,(q->>'version')::uuid,pos+1);
   INSERT INTO public.exam_attempt_answers(attempt_id,question_id,answer_payload,answered_at,is_timeout) VALUES(aid,(q->>'id')::uuid,r->'input'->'answer_payload',(r->>'answered_at')::timestamptz,(r->'input'->>'is_timeout')::boolean);
  END LOOP;
  UPDATE public.exam_attempts SET attempt_status='SUBMITTED',total_questions=n,correct_answers=s.correct,score=round(s.correct*100.0/n,2),submitted_at=clock_timestamp() WHERE id=aid AND user_id=u;
  IF victory THEN
   UPDATE public.profiles SET xp_score=xp_score+xp WHERE id=u RETURNING coalesce(to_jsonb(profiles)->>'nickname',to_jsonb(profiles)->>'full_name','Player 1') INTO nick;
   INSERT INTO public.gamification_log(user_id,activity,xp_score) VALUES(u,nick||' bertarung melawan Boss '||CASE WHEN s.settings->>'IS_PVP'='1' THEN s.settings->>'P2_NAME' ELSE s.settings->>'SUBJECT' END||' dan menang',xp);
  END IF;
  UPDATE private.bossfight_sessions SET writing_results=false,result=jsonb_build_object('victory',victory,'winner',winner,'xp',xp,'correct',s.correct,'used',n,'hp',s.hp) WHERE attempt_id=aid;
 END IF;
 RETURN private.bossfight_view(aid);
END $$;
REVOKE ALL ON FUNCTION private.bossfight_settings(jsonb),private.bossfight_view(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bossfight(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bossfight(text,jsonb) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
