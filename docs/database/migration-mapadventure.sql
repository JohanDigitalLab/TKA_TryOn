-- MANUAL DEPLOY ONLY; see ../mapadventure-deployment.md. No live DB automation.
-- Requires foundation + VirtualPet (snapshot grader) + existing exam schema.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
CREATE SCHEMA IF NOT EXISTS private;
ALTER TABLE public.exam_attempts ALTER COLUMN attempt_type TYPE varchar(20);
ALTER TABLE public.map_adventure_themes
  ADD COLUMN IF NOT EXISTS education_level text,
  ADD COLUMN IF NOT EXISTS subject_code text,
  ADD COLUMN IF NOT EXISTS stars integer NOT NULL DEFAULT 0;
ALTER TABLE public.map_adventure_topics
  ADD COLUMN IF NOT EXISTS education_level text,
  ADD COLUMN IF NOT EXISTS subject_code text,
  ADD COLUMN IF NOT EXISTS theme_id uuid REFERENCES public.map_adventure_themes(id),
  ADD COLUMN IF NOT EXISTS subject_topic_id uuid REFERENCES public.subject_topics(id),
  ADD COLUMN IF NOT EXISTS order_number integer,
  ADD COLUMN IF NOT EXISTS material_stars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS practice_stars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sidequest_stars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gatekeeper_stars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chest_reward jsonb;
-- Resolve old textual progress only with authoritative profile/subject/catalog data.
UPDATE public.map_adventure_themes t SET education_level=lower(btrim(p.education_level)),subject_code=s.subject_code
FROM public.profiles p,public.subjects s
WHERE t.user_id=p.id AND s.name=t.subject AND lower(s.education_level_id)=lower(btrim(p.education_level))
  AND (t.education_level IS NULL OR t.subject_code IS NULL);
UPDATE public.map_adventure_topics t SET education_level=lower(btrim(p.education_level)),subject_code=s.subject_code
FROM public.profiles p,public.subjects s
WHERE t.user_id=p.id AND s.name=t.subject AND lower(s.education_level_id)=lower(btrim(p.education_level))
  AND (t.education_level IS NULL OR t.subject_code IS NULL);
UPDATE public.map_adventure_topics t SET theme_id=h.id,subject_topic_id=c.id
FROM public.map_adventure_themes h,public.subject_topics c
WHERE h.user_id=t.user_id AND h.education_level=t.education_level AND h.subject_code=t.subject_code AND h.theme=t.theme
  AND c.subject_code=t.subject_code AND c.theme=t.theme AND c.topic=t.topic
  AND (t.theme_id IS NULL OR t.subject_topic_id IS NULL);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.map_adventure_themes WHERE education_level IS NULL OR subject_code IS NULL)
    OR EXISTS(SELECT 1 FROM public.map_adventure_topics WHERE education_level IS NULL OR subject_code IS NULL OR theme_id IS NULL OR subject_topic_id IS NULL)
    OR EXISTS(SELECT 1 FROM public.subject_topics GROUP BY subject_code,theme,topic HAVING count(*)>1)
    OR EXISTS(SELECT 1 FROM public.subjects GROUP BY name,lower(education_level_id) HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Ambiguous/unresolved MapAdventure legacy progress/catalog; operator reconciliation required';
  END IF;
END $$;
ALTER TABLE public.map_adventure_themes ALTER COLUMN education_level SET NOT NULL,ALTER COLUMN subject_code SET NOT NULL;
ALTER TABLE public.map_adventure_topics ALTER COLUMN education_level SET NOT NULL,ALTER COLUMN subject_code SET NOT NULL,
  ALTER COLUMN theme_id SET NOT NULL,ALTER COLUMN subject_topic_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mapadventure_theme_identity ON public.map_adventure_themes(user_id,education_level,subject_code,theme);
CREATE UNIQUE INDEX IF NOT EXISTS mapadventure_topic_identity ON public.map_adventure_topics(user_id,education_level,subject_topic_id);
CREATE UNIQUE INDEX IF NOT EXISTS mapadventure_status_identity ON public.map_adventure_status(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS mapadventure_tools_identity ON public.map_adventure_tools(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS mapadventure_settings_identity ON public.user_settings(user_id,"group",name) WHERE "group"='MAPADVENTURE';
-- Repair the previous MapAdventure-only typo without resetting a saved preference.
-- If both keys exist, the canonical key wins. Other feature groups are untouched.
INSERT INTO public.user_settings(user_id,"group",name,value)
 SELECT user_id,'MAPADVENTURE','SHOW_TIPS',value FROM public.user_settings
 WHERE "group"='MAPADVENTURE' AND name='SHOW_TIPS1'
 ON CONFLICT DO NOTHING;
DELETE FROM public.user_settings WHERE "group"='MAPADVENTURE' AND name='SHOW_TIPS1';
-- Existing incompatible wallets must fail explicitly, never silently reinterpret balances.
CREATE TABLE IF NOT EXISTS public.user_wallet(user_id uuid PRIMARY KEY,points integer NOT NULL DEFAULT 0 CHECK(points>=0));
DO $$ BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='user_wallet')<>2
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_wallet' AND column_name='user_id' AND data_type='uuid' AND is_nullable='NO')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_wallet' AND column_name='points' AND data_type='integer' AND is_nullable='NO')
    OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.user_wallet'::regclass AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (user_id)') THEN
    RAISE EXCEPTION 'Incompatible user_wallet; explicit operator migration required'; END IF;
  IF EXISTS(SELECT 1 FROM public.user_wallet w JOIN public.map_adventure_status s USING(user_id) WHERE w.points<>s.points)
    OR EXISTS(SELECT 1 FROM public.map_adventure_status WHERE points<0) THEN
    RAISE EXCEPTION 'Wallet/status balance conflict; explicit reconciliation required'; END IF;
END $$;
INSERT INTO public.user_wallet(user_id,points) SELECT user_id,points FROM public.map_adventure_status ON CONFLICT DO NOTHING;
INSERT INTO public.map_adventure_status(user_id,points) SELECT user_id,points FROM public.user_wallet ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS private.mapadventure_reads(
  node_id uuid PRIMARY KEY REFERENCES public.map_adventure_topics(id),user_id uuid NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),opened_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS private.mapadventure_sessions(
  attempt_id uuid PRIMARY KEY REFERENCES public.exam_attempts(id) DEFERRABLE INITIALLY DEFERRED,
  user_id uuid NOT NULL,node_id uuid NOT NULL REFERENCES public.map_adventure_topics(id),
  stage text NOT NULL CHECK(stage IN('practice','sidequest','gatekeeper')),
  pool jsonb NOT NULL,seen_ids jsonb NOT NULL,records jsonb NOT NULL DEFAULT '[]',
  tools jsonb NOT NULL DEFAULT '[]',effects jsonb NOT NULL DEFAULT '{}',
  result jsonb,writing_results boolean NOT NULL DEFAULT false
);
-- NULL on legacy active sessions: initialize on first resume, never during deployment.
ALTER TABLE private.mapadventure_sessions ADD COLUMN IF NOT EXISTS question_deadline_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS mapadventure_active_session ON private.mapadventure_sessions(user_id) WHERE result IS NULL;
ALTER TABLE private.mapadventure_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.mapadventure_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_adventure_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_adventure_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_adventure_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_adventure_status ENABLE ROW LEVEL SECURITY;
-- Recreated by name for rerunnable validation, preserving every existing row.
ALTER TABLE public.user_wallet DROP CONSTRAINT IF EXISTS mapadventure_wallet_nonnegative;
ALTER TABLE public.user_wallet ADD CONSTRAINT mapadventure_wallet_nonnegative CHECK(points>=0);
ALTER TABLE public.map_adventure_status DROP CONSTRAINT IF EXISTS mapadventure_status_nonnegative;
ALTER TABLE public.map_adventure_status ADD CONSTRAINT mapadventure_status_nonnegative CHECK(points>=0 AND stars>=0);
ALTER TABLE public.map_adventure_tools DROP CONSTRAINT IF EXISTS mapadventure_tools_nonnegative;
ALTER TABLE public.map_adventure_tools ADD CONSTRAINT mapadventure_tools_nonnegative CHECK(least(clue,freezetime,fiftyfifty,skipreplace,secondchance)>=0);
REVOKE ALL ON private.mapadventure_reads,private.mapadventure_sessions,public.user_wallet,
 public.map_adventure_themes,public.map_adventure_topics,public.map_adventure_tools,public.map_adventure_status FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.mapadventure_settings(p_patch jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cfg jsonb;
BEGIN
 IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN('SHOW_TIPS','SUBJECT')) THEN
  RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'SHOW_TIPS' AND (jsonb_typeof(p_patch->'SHOW_TIPS')<>'string' OR p_patch->>'SHOW_TIPS' NOT IN('0','1')) THEN
  RAISE EXCEPTION 'SHOW_TIPS must be string 0 or 1' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'SUBJECT' AND (jsonb_typeof(p_patch->'SUBJECT')<>'string' OR NOT EXISTS(
  SELECT 1 FROM public.subjects s JOIN public.profiles p ON p.id=auth.uid()
  WHERE s.name=p_patch->>'SUBJECT' AND lower(s.education_level_id)=lower(btrim(p.education_level)) AND s.is_active)) THEN
  RAISE EXCEPTION 'Subject unavailable for profile level' USING ERRCODE='22023'; END IF;
 INSERT INTO public.user_settings(user_id,"group",name,value) VALUES(auth.uid(),'MAPADVENTURE','SHOW_TIPS','1'),(auth.uid(),'MAPADVENTURE','SUBJECT','Matematika') ON CONFLICT DO NOTHING;
 UPDATE public.user_settings s SET value=p.value FROM jsonb_each_text(p_patch) p WHERE s.user_id=auth.uid() AND s."group"='MAPADVENTURE' AND s.name=p.key;
 SELECT jsonb_object_agg(name,value) INTO cfg FROM public.user_settings WHERE user_id=auth.uid() AND "group"='MAPADVENTURE' AND name IN('SHOW_TIPS','SUBJECT');
 IF cfg->>'SHOW_TIPS' IS NULL OR cfg->>'SHOW_TIPS' NOT IN('0','1') THEN RAISE EXCEPTION 'Invalid persisted settings'; END IF;
 RETURN cfg;
END $$;

-- Exact subject code + level + questions.theme/topic, matching student exercise.
-- Legacy material/sub_material are not catalog identities. No broad fallback.
CREATE OR REPLACE FUNCTION private.mapadventure_pool(p_node uuid,p_stage text,p_count integer,p_excluded jsonb DEFAULT '[]') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pool jsonb;
BEGIN
 WITH candidates AS MATERIALIZED (
 SELECT q.question_type,upper(btrim(q.difficulty)) difficulty,v.estimate_minutes,
 jsonb_build_object('id',q.id,'version',v.id,'type',q.question_type,'text',v.question_text,'instruction',v.instruction,'clue',v.clue,
  'difficulty',q.difficulty,'estimate_minutes',v.estimate_minutes,'subject_code',q.subject_code,'education_level',q.education_level_id,'theme',q.theme,'topic',q.topic,
  'stimulus',(SELECT jsonb_build_object('title',s.title,'content_text',s.content_text,'file_url',s.file_url,'media_description',s.media_description) FROM public.question_stimuli s WHERE s.id=v.stimulus_id),
  'options',coalesce((SELECT jsonb_agg(jsonb_build_object('option_code',o.option_code,'option_text',o.option_text) ORDER BY o.option_order,o.option_code) FROM public.question_options o WHERE o.question_version_id=v.id),'[]'),
  'category_items',coalesce((SELECT jsonb_agg(jsonb_build_object('item_number',c.item_number,'item_text',c.item_text,'category_label',c.category_label) ORDER BY c.item_number) FROM public.question_category_items c WHERE c.question_version_id=v.id),'[]'),
  'answer_keys',jsonb_build_object('option_codes',coalesce((SELECT jsonb_agg(o.option_code ORDER BY o.option_code) FROM public.question_options o WHERE o.question_version_id=v.id AND o.is_correct),'[]'),
   'category_answers',coalesce((SELECT jsonb_object_agg(c.item_number::text,c.correct_category) FROM public.question_category_items c WHERE c.question_version_id=v.id),'{}'))) doc
 FROM public.map_adventure_topics n JOIN public.questions q ON q.subject_code=n.subject_code AND lower(btrim(q.education_level_id))=n.education_level AND q.theme=n.theme AND q.topic=n.topic
 JOIN LATERAL(SELECT * FROM public.question_versions WHERE question_id=q.id AND version_status='PUBLISHED' ORDER BY version_number DESC,id DESC LIMIT 1) v ON true
 WHERE n.id=p_node AND q.question_status='PUBLISHED' AND q.question_type IN('PG_TUNGGAL','PGK_MA','PGK_KATEGORI')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_excluded) e WHERE e=q.id::text)
 ), usable AS (
 SELECT * FROM candidates WHERE CASE WHEN question_type IN('PG_TUNGGAL','PGK_MA') THEN
 jsonb_array_length(doc->'options')>=2
 AND (SELECT count(DISTINCT o->>'option_code') FROM jsonb_array_elements(doc->'options') o)=jsonb_array_length(doc->'options')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'options') o WHERE nullif(btrim(o->>'option_code'),'') IS NULL)
 AND CASE WHEN question_type='PG_TUNGGAL' THEN jsonb_array_length(doc->'answer_keys'->'option_codes')=1 ELSE jsonb_array_length(doc->'answer_keys'->'option_codes')>=1 END
 ELSE jsonb_array_length(doc->'category_items')>0
 AND (SELECT count(DISTINCT c->>'item_number') FROM jsonb_array_elements(doc->'category_items') c)=jsonb_array_length(doc->'category_items')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'category_items') c WHERE nullif(btrim(doc->'answer_keys'->'category_answers'->>(c->>'item_number')),'') IS NULL
 OR NOT EXISTS(SELECT 1 FROM regexp_split_to_table(c->>'category_label','\s*/\s*') a WHERE upper(btrim(a))=upper(btrim(doc->'answer_keys'->'category_answers'->>(c->>'item_number'))))) END
 ), chosen AS (
 SELECT doc FROM usable WHERE CASE WHEN p_stage='practice' THEN difficulty IN('MUDAH','SEDANG')
  WHEN p_stage='sidequest' THEN difficulty IN('SUSAH','SULIT','SEDANG')
  ELSE difficulty='SEDANG' END
 ORDER BY CASE WHEN (p_stage='practice' AND difficulty='MUDAH')
  OR (p_stage='sidequest' AND (difficulty IN('SUSAH','SULIT') OR (difficulty='SEDANG' AND estimate_minutes>5)))
  THEN 0 ELSE 1 END,random() LIMIT p_count
 ) SELECT coalesce(jsonb_agg(doc),'[]') INTO pool FROM chosen;
 IF jsonb_array_length(pool)<>p_count THEN RAISE EXCEPTION 'Insufficient published questions: need %, available %',p_count,jsonb_array_length(pool) USING ERRCODE='P0001'; END IF;
 RETURN pool;
END $$;

CREATE OR REPLACE FUNCTION private.mapadventure_seed(p_level text,p_code text,p_subject text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h record; c record; pos integer; tid uuid; prev boolean:=true;
BEGIN
 IF EXISTS(SELECT 1 FROM public.subject_topics WHERE subject_code=p_code GROUP BY theme,topic HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Ambiguous duplicate subject topic catalog; operator reconciliation required'; END IF;
 -- Preserve existing orders; new catalog rows append deterministically, never reset progress.
 SELECT coalesce(max(order_number),0) INTO pos FROM public.map_adventure_themes WHERE user_id=auth.uid() AND education_level=p_level AND subject_code=p_code;
 FOR h IN SELECT theme FROM (SELECT theme FROM public.subject_themes WHERE subject=p_code UNION SELECT theme FROM public.subject_topics WHERE subject_code=p_code) x ORDER BY theme LOOP
  IF NOT EXISTS(SELECT 1 FROM public.subject_topics WHERE subject_code=p_code AND theme=h.theme) THEN CONTINUE; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.map_adventure_themes WHERE user_id=auth.uid() AND education_level=p_level AND subject_code=p_code AND theme=h.theme) THEN
   pos:=pos+1;
   INSERT INTO public.map_adventure_themes(user_id,education_level,subject_code,subject,theme,order_number) VALUES(auth.uid(),p_level,p_code,p_subject,h.theme,pos);
  END IF;
 END LOOP;
 -- Assign missing legacy orders, not completed state.
 WITH ranked AS (SELECT id,row_number() OVER(ORDER BY theme,id)::integer r FROM public.map_adventure_themes WHERE user_id=auth.uid() AND education_level=p_level AND subject_code=p_code AND order_number IS NULL)
 UPDATE public.map_adventure_themes t SET order_number=pos+r.r FROM ranked r WHERE t.id=r.id;
 FOR h IN SELECT * FROM public.map_adventure_themes WHERE user_id=auth.uid() AND education_level=p_level AND subject_code=p_code ORDER BY order_number,id LOOP
  SELECT coalesce(max(order_number),0) INTO pos FROM public.map_adventure_topics WHERE theme_id=h.id;
  FOR c IN SELECT * FROM public.subject_topics WHERE subject_code=p_code AND theme=h.theme ORDER BY topic,id LOOP
   IF NOT EXISTS(SELECT 1 FROM public.map_adventure_topics WHERE user_id=auth.uid() AND education_level=p_level AND subject_topic_id=c.id) THEN
    pos:=pos+1;
    INSERT INTO public.map_adventure_topics(user_id,education_level,subject_code,subject,theme,topic,theme_id,subject_topic_id,order_number)
     VALUES(auth.uid(),p_level,p_code,p_subject,h.theme,c.topic,h.id,c.id,pos);
   END IF;
  END LOOP;
  WITH ranked AS (SELECT id,row_number() OVER(ORDER BY topic,id)::integer r FROM public.map_adventure_topics WHERE theme_id=h.id AND order_number IS NULL)
  UPDATE public.map_adventure_topics t SET order_number=pos+r.r FROM ranked r WHERE t.id=r.id;
  IF prev THEN
   UPDATE public.map_adventure_themes SET status='UNLOCKED' WHERE id=h.id AND status='LOCKED';
   UPDATE public.map_adventure_topics t SET material_status='UNLOCKED' WHERE t.theme_id=h.id AND t.material_status='LOCKED'
    AND NOT EXISTS(SELECT 1 FROM public.map_adventure_topics b WHERE b.theme_id=h.id AND (b.order_number,b.id)<(t.order_number,t.id) AND b.gatekeeper_status<>'COMPLETED');
  END IF;
  prev:=h.status='COMPLETED';
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.mapadventure_credit(p_points integer,p_xp integer,p_activity text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM public.user_wallet WHERE user_id=auth.uid() FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.user_wallet w JOIN public.map_adventure_status s USING(user_id) WHERE w.user_id=auth.uid() AND w.points<>s.points) THEN RAISE EXCEPTION 'Wallet/status balance conflict'; END IF;
 UPDATE public.user_wallet SET points=points+p_points WHERE user_id=auth.uid() AND points+p_points>=0;
 IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient points'; END IF;
 UPDATE public.map_adventure_status SET points=points+p_points WHERE user_id=auth.uid();
 IF p_xp>0 THEN
  UPDATE public.profiles SET xp_score=xp_score+p_xp WHERE id=auth.uid();
 END IF;
 -- NULL activity is used for financial movements, not activity events.
 IF p_activity IS NOT NULL THEN
  INSERT INTO public.gamification_log(user_id,activity,xp_score) VALUES(auth.uid(),p_activity,p_xp);
 END IF;
END $$;
CREATE OR REPLACE FUNCTION private.mapadventure_progress(p_node uuid,p_stage text,p_stars integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n public.map_adventure_topics%ROWTYPE; nickname text;
BEGIN
 SELECT coalesce(nullif(btrim(p.nickname),''),nullif(btrim(p.full_name),''),'Siswa') INTO nickname FROM public.profiles p WHERE p.id=auth.uid();
 SELECT * INTO STRICT n FROM public.map_adventure_topics WHERE id=p_node AND user_id=auth.uid() FOR UPDATE;
 IF to_jsonb(n)->>(p_stage||'_status')='COMPLETED' THEN RETURN; END IF;
 IF to_jsonb(n)->>(p_stage||'_status') IS DISTINCT FROM 'UNLOCKED' THEN RAISE EXCEPTION 'Node locked'; END IF;
 IF p_stage='material' THEN UPDATE public.map_adventure_topics SET material_status='COMPLETED',material_stars=3,material_completed_at=clock_timestamp(),practice_status='UNLOCKED' WHERE id=n.id;
 ELSIF p_stage='practice' THEN UPDATE public.map_adventure_topics SET practice_status='COMPLETED',practice_stars=p_stars,sidequest_status='UNLOCKED' WHERE id=n.id;
 ELSIF p_stage='sidequest' THEN UPDATE public.map_adventure_topics SET sidequest_status='COMPLETED',sidequest_stars=p_stars,mysterychest_status='UNLOCKED' WHERE id=n.id;
 ELSIF p_stage='gatekeeper' THEN
  UPDATE public.map_adventure_topics SET gatekeeper_status='COMPLETED',gatekeeper_stars=p_stars WHERE id=n.id;
  UPDATE public.map_adventure_themes h SET stars=(SELECT coalesce(sum(gatekeeper_stars),0) FROM public.map_adventure_topics WHERE theme_id=h.id) WHERE h.id=n.theme_id;
  UPDATE public.map_adventure_themes h SET status='COMPLETED',completed_at=clock_timestamp() WHERE h.id=n.theme_id
   AND h.status<>'COMPLETED'
   AND NOT EXISTS(SELECT 1 FROM public.map_adventure_topics WHERE theme_id=h.id AND gatekeeper_status<>'COMPLETED');
  IF FOUND THEN PERFORM private.mapadventure_credit(0,0,nickname||' selesai menjelajahi pulau '||n.theme); END IF;
 END IF;
 UPDATE public.map_adventure_status SET stars=stars+p_stars WHERE user_id=auth.uid();
 PERFORM private.mapadventure_credit(CASE WHEN p_stage IN('sidequest','gatekeeper') THEN 50 ELSE 25 END,CASE WHEN p_stage='sidequest' THEN 5 ELSE 1 END,
  nickname||' melewati '||CASE p_stage WHEN 'material' THEN 'Kemah Ilmu' WHEN 'practice' THEN 'Latihan' WHEN 'sidequest' THEN 'Misi Sampingan' ELSE 'Pos Penjaga' END||' di pulau '||n.theme);
 PERFORM private.mapadventure_seed(n.education_level,n.subject_code,n.subject);
END $$;

CREATE OR REPLACE FUNCTION private.mapadventure_guard_exam() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ids uuid[]:='{}'; aid uuid; tagged boolean:=false; s private.mapadventure_sessions%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='exam_attempts' THEN
  IF TG_OP<>'INSERT' THEN ids:=array_append(ids,OLD.id); tagged:=OLD.gamification_app='MAPADVENTURE'; END IF;
  IF TG_OP<>'DELETE' THEN ids:=array_append(ids,NEW.id); tagged:=coalesce(tagged,false) OR NEW.gamification_app='MAPADVENTURE'; END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN ids:=array_append(ids,OLD.attempt_id); END IF;
  IF TG_OP<>'DELETE' THEN ids:=array_append(ids,NEW.attempt_id); END IF;
 END IF;
 FOREACH aid IN ARRAY ids LOOP
  SELECT * INTO s FROM private.mapadventure_sessions WHERE attempt_id=aid;
  IF FOUND OR coalesce(tagged,false) OR EXISTS(SELECT 1 FROM public.exam_attempts WHERE id=aid AND gamification_app='MAPADVENTURE') THEN
   IF s.attempt_id IS NULL OR NOT s.writing_results OR s.result IS NOT NULL OR s.user_id IS DISTINCT FROM auth.uid() OR TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Use MapAdventure RPC; immutable exam session' USING ERRCODE='42501'; END IF;
   IF TG_TABLE_NAME='exam_attempts' THEN
    IF NEW.id<>s.attempt_id OR NEW.user_id<>s.user_id OR NEW.attempt_type<>'GAMIFICATION' OR NEW.gamification_app IS DISTINCT FROM 'MAPADVENTURE' OR NEW.deadline_at IS NOT NULL THEN
     RAISE EXCEPTION 'Invalid MapAdventure exam identity' USING ERRCODE='42501'; END IF;
   END IF;
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mapadventure_guard ON public.exam_attempts;
CREATE TRIGGER mapadventure_guard BEFORE INSERT OR UPDATE OR DELETE ON public.exam_attempts FOR EACH ROW EXECUTE FUNCTION private.mapadventure_guard_exam();
DROP TRIGGER IF EXISTS mapadventure_guard ON public.exam_attempt_questions;
CREATE TRIGGER mapadventure_guard BEFORE INSERT OR UPDATE OR DELETE ON public.exam_attempt_questions FOR EACH ROW EXECUTE FUNCTION private.mapadventure_guard_exam();
DROP TRIGGER IF EXISTS mapadventure_guard ON public.exam_attempt_answers;
CREATE TRIGGER mapadventure_guard BEFORE INSERT OR UPDATE OR DELETE ON public.exam_attempt_answers FOR EACH ROW EXECUTE FUNCTION private.mapadventure_guard_exam();
REVOKE TRUNCATE ON public.exam_attempts,public.exam_attempt_questions,public.exam_attempt_answers FROM PUBLIC,anon,authenticated;

-- Canonical per-question clock; caller timestamps are never accepted.
CREATE OR REPLACE FUNCTION private.mapadventure_timer(p_attempt uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s private.mapadventure_sessions%ROWTYPE; i integer; minutes numeric;
BEGIN
 SELECT * INTO s FROM private.mapadventure_sessions WHERE attempt_id=p_attempt AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR s.result IS NOT NULL OR s.stage='practice' THEN RETURN; END IF;
 i:=jsonb_array_length(s.records);
 IF i>=jsonb_array_length(s.pool) OR s.question_deadline_at IS NOT NULL THEN RETURN; END IF;
 -- Old snapshots did not carry estimates. Resolve their frozen version once, safely.
 SELECT coalesce(jsonb_agg(CASE WHEN x ? 'estimate_minutes' THEN x ELSE
  x||jsonb_build_object('estimate_minutes',coalesce((SELECT v.estimate_minutes FROM public.question_versions v WHERE v.id=(x->>'version')::uuid),2)) END ORDER BY ord),'[]')
 INTO s.pool FROM jsonb_array_elements(s.pool) WITH ORDINALITY e(x,ord);
 minutes:=greatest(1.0/60,coalesce((s.pool->i->>'estimate_minutes')::numeric,2));
 UPDATE private.mapadventure_sessions SET pool=s.pool,question_deadline_at=clock_timestamp()+minutes*interval '60 seconds' WHERE attempt_id=p_attempt;
END $$;

CREATE OR REPLACE FUNCTION private.mapadventure_state() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cfg jsonb; lvl text; sc text; active jsonb; s private.mapadventure_sessions%ROWTYPE; q jsonb; idx integer;
BEGIN
 cfg:=private.mapadventure_settings();
 SELECT lower(btrim(education_level)) INTO lvl FROM public.profiles WHERE id=auth.uid();
 SELECT subject_code INTO STRICT sc FROM public.subjects WHERE name=cfg->>'SUBJECT' AND lower(education_level_id)=lvl AND is_active;
 PERFORM private.mapadventure_timer(attempt_id) FROM private.mapadventure_sessions WHERE user_id=auth.uid() AND result IS NULL;
 SELECT * INTO s FROM private.mapadventure_sessions WHERE user_id=auth.uid() AND result IS NULL;
 IF FOUND THEN
  idx:=jsonb_array_length(s.records); q:=s.pool->idx;
  active:=jsonb_build_object('attempt_id',s.attempt_id,'nodeId',s.node_id,'stage',s.stage,'index',idx,'total',jsonb_array_length(s.pool),
   'question',q-'answer_keys'-'clue','tools',s.tools,'effects',s.effects-'first_answer','answered',idx,
   'deadline_at',s.question_deadline_at,'server_now',clock_timestamp(),
   'remaining_seconds',CASE WHEN s.question_deadline_at IS NOT NULL THEN greatest(0,extract(epoch FROM s.question_deadline_at-clock_timestamp())) ELSE NULL END);
 END IF;
 RETURN jsonb_build_object('settings',cfg,'education_level',lvl,'subject_code',sc,
  'subjects',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'subject_code',subject_code) ORDER BY name),'[]') FROM public.subjects WHERE lower(education_level_id)=lvl AND is_active),
  'islands',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.order_number,h.id),'[]') FROM public.map_adventure_themes h WHERE user_id=auth.uid() AND education_level=lvl AND subject_code=sc),
  'nodes',(SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY h.order_number,n.order_number,n.id),'[]') FROM public.map_adventure_topics n JOIN public.map_adventure_themes h ON h.id=n.theme_id WHERE n.user_id=auth.uid() AND n.education_level=lvl AND n.subject_code=sc),
  'status',(SELECT jsonb_build_object('points',points,'stars',stars) FROM public.map_adventure_status WHERE user_id=auth.uid()),
  'wallet',(SELECT jsonb_build_object('points',points) FROM public.user_wallet WHERE user_id=auth.uid()),
  'inventory',(SELECT to_jsonb(t)-'id'-'user_id' FROM public.map_adventure_tools t WHERE user_id=auth.uid()),
  'profile_xp',(SELECT xp_score FROM public.profiles WHERE id=auth.uid()),'session',active,
  'tip',CASE WHEN cfg->>'SHOW_TIPS'='1' THEN (SELECT jsonb_build_object('id',id,'message',message) FROM public.gamification_tips WHERE application='MAPADVENTURE' AND is_active ORDER BY random() LIMIT 1) ELSE NULL END);
END $$;

CREATE OR REPLACE FUNCTION public.mapadventure(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=auth.uid(); lvl text; sc text; cfg jsonb; n public.map_adventure_topics%ROWTYPE; s private.mapadventure_sessions%ROWTYPE;
 aid uuid; pool jsonb; q jsonb; a jsonb; r jsonb; effect jsonb; tool text; stage text; idx integer; total integer; correct integer; stars integer; pts integer; xp integer;
 ok boolean; passed boolean; token uuid; tier text; draw double precision; amount integer; rewards jsonb; eliminated jsonb; price integer; timed_out boolean; nickname text;
BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users au ON au.id=p.id WHERE p.id=u AND upper(btrim(p.account_type))='STUDENT' AND p.account_status='active'
 AND au.email_confirmed_at IS NOT NULL AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now())) THEN
  RAISE EXCEPTION 'Active authenticated STUDENT account required' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN('bootstrap','settings','material','read_complete','start','answer','timeout','use_tool','complete_node','complete_island','gacha','buy') THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>65536 THEN RAISE EXCEPTION 'Invalid payload' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT(k=ANY(CASE p_action
 WHEN 'bootstrap' THEN ARRAY[]::text[] WHEN 'settings' THEN ARRAY['settings'] WHEN 'material' THEN ARRAY['nodeId'] WHEN 'read_complete' THEN ARRAY['nodeId','readToken']
 WHEN 'start' THEN ARRAY['nodeId','stage'] WHEN 'answer' THEN ARRAY['attempt_id','question_id','answer_payload'] WHEN 'timeout' THEN ARRAY['attempt_id','question_id'] WHEN 'use_tool' THEN ARRAY['attempt_id','question_id','tool']
 WHEN 'complete_node' THEN ARRAY['attempt_id'] WHEN 'complete_island' THEN ARRAY['islandId'] WHEN 'gacha' THEN ARRAY['nodeId','chestTier'] ELSE ARRAY['tool'] END))) THEN
  RAISE EXCEPTION 'Unknown payload field; client scores/user/tools/tier overrides forbidden' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mapadventure:user:'||u::text,0));
 SELECT lower(btrim(education_level)) INTO lvl FROM public.profiles WHERE id=u;
 IF lvl IS NULL OR lvl NOT IN('sd','smp','sma') THEN RAISE EXCEPTION 'Persisted education level unavailable'; END IF;
 IF p_action='settings' THEN
  IF EXISTS(SELECT 1 FROM private.mapadventure_sessions WHERE user_id=u AND result IS NULL) AND p_payload->'settings' ? 'SUBJECT' THEN RAISE EXCEPTION 'Finish active session before changing subject'; END IF;
  cfg:=private.mapadventure_settings(coalesce(p_payload->'settings','{}'));
 ELSE cfg:=private.mapadventure_settings(); END IF;
 SELECT subject_code INTO sc FROM public.subjects WHERE name=cfg->>'SUBJECT' AND lower(education_level_id)=lvl AND is_active;
 IF sc IS NULL THEN RAISE EXCEPTION 'Selected subject unavailable for profile level'; END IF;
 INSERT INTO public.map_adventure_status(user_id) VALUES(u) ON CONFLICT DO NOTHING;
 INSERT INTO public.map_adventure_tools(user_id) VALUES(u) ON CONFLICT DO NOTHING;
 INSERT INTO public.user_wallet(user_id,points) SELECT u,points FROM public.map_adventure_status WHERE user_id=u ON CONFLICT DO NOTHING;
 PERFORM private.mapadventure_seed(lvl,sc,cfg->>'SUBJECT');
 IF p_action IN('material','read_complete','start','gacha') THEN
  SELECT * INTO n FROM public.map_adventure_topics WHERE id=(p_payload->>'nodeId')::uuid AND user_id=u AND education_level=lvl AND subject_code=sc FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Node unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_action='material' THEN
  IF n.material_status='LOCKED' THEN RAISE EXCEPTION 'Node locked'; END IF;
  INSERT INTO private.mapadventure_reads(node_id,user_id) VALUES(n.id,u) ON CONFLICT DO NOTHING;
  SELECT r1.token INTO token FROM private.mapadventure_reads r1 WHERE node_id=n.id AND user_id=u;
  RETURN private.mapadventure_state()||jsonb_build_object('material',(SELECT jsonb_build_object('nodeId',n.id,'text',learning_material,'url',learning_material_url,'readToken',token) FROM public.subject_topics WHERE id=n.subject_topic_id));
 ELSIF p_action='read_complete' THEN
  IF NOT EXISTS(SELECT 1 FROM private.mapadventure_reads rd WHERE rd.node_id=n.id AND rd.user_id=u AND rd.token=(p_payload->>'readToken')::uuid) THEN RAISE EXCEPTION 'Open material first; valid readToken required' USING ERRCODE='42501'; END IF;
  PERFORM private.mapadventure_progress(n.id,'material',3);
 ELSIF p_action='start' THEN
  stage:=p_payload->>'stage';
  IF stage IS NULL OR stage NOT IN('practice','sidequest','gatekeeper') THEN RAISE EXCEPTION 'Invalid stage' USING ERRCODE='22023'; END IF;
  SELECT * INTO s FROM private.mapadventure_sessions WHERE user_id=u AND result IS NULL FOR UPDATE;
  IF FOUND THEN
   IF s.node_id<>n.id OR s.stage<>stage THEN RAISE EXCEPTION 'Different session already active'; END IF;
   RETURN private.mapadventure_state()||jsonb_build_object('resumed',true);
  END IF;
  IF to_jsonb(n)->>(stage||'_status') IS DISTINCT FROM 'UNLOCKED' THEN RAISE EXCEPTION 'Node locked or already completed'; END IF;
  total:=CASE WHEN stage='practice' THEN 3 ELSE 5 END;
  pool:=private.mapadventure_pool(n.id,stage,total); aid:=gen_random_uuid();
  INSERT INTO private.mapadventure_sessions(attempt_id,user_id,node_id,stage,pool,seen_ids,writing_results)
   VALUES(aid,u,n.id,stage,pool,(SELECT jsonb_agg(x->'id') FROM jsonb_array_elements(pool) x),true);
  INSERT INTO public.exam_attempts(id,user_id,education_level,grade,subject_name,duration_minutes,total_questions,attempt_type,gamification_app,started_at,deadline_at)
   VALUES(aid,u,upper(lvl),CASE lvl WHEN 'sd' THEN 6 WHEN 'smp' THEN 9 ELSE 12 END,cfg->>'SUBJECT',60,total,'GAMIFICATION','MAPADVENTURE',clock_timestamp(),NULL);
  INSERT INTO public.exam_attempt_questions(attempt_id,question_id,question_version_id,question_order)
   SELECT aid,(value->>'id')::uuid,(value->>'version')::uuid,ordinality::integer FROM jsonb_array_elements(pool) WITH ORDINALITY;
  UPDATE private.mapadventure_sessions SET writing_results=false WHERE attempt_id=aid;
  RETURN private.mapadventure_state()||jsonb_build_object('resumed',false);
 ELSIF p_action IN('answer','timeout','use_tool','complete_node') THEN
  aid:=(p_payload->>'attempt_id')::uuid;
  IF aid IS NULL OR (p_action IN('answer','timeout','use_tool') AND (p_payload->>'question_id') IS NULL) THEN RAISE EXCEPTION 'Missing session/question keys' USING ERRCODE='22023'; END IF;
  PERFORM private.mapadventure_timer(aid);
  SELECT * INTO s FROM private.mapadventure_sessions WHERE attempt_id=aid AND user_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE='42501'; END IF;
  IF p_action='complete_node' AND s.result IS NOT NULL THEN RETURN private.mapadventure_state()||jsonb_build_object('result',s.result); END IF;
  IF s.result IS NOT NULL THEN RAISE EXCEPTION 'Session already finished'; END IF;
  SELECT * INTO STRICT n FROM public.map_adventure_topics WHERE id=s.node_id AND user_id=u;
  IF n.education_level<>lvl OR n.subject_code<>sc THEN RAISE EXCEPTION 'Session profile/subject changed'; END IF;
  idx:=jsonb_array_length(s.records); total:=jsonb_array_length(s.pool); q:=s.pool->idx;
  IF p_action IN('answer','timeout','use_tool') THEN
   IF q IS NULL OR q->>'id' IS DISTINCT FROM p_payload->>'question_id' THEN RAISE EXCEPTION 'Only current frozen question may be used' USING ERRCODE='22023'; END IF;
  END IF;
  timed_out:=s.stage<>'practice' AND s.question_deadline_at<=clock_timestamp();
  IF p_action='timeout' AND NOT coalesce(timed_out,false) THEN RAISE EXCEPTION 'Current question has not expired' USING ERRCODE='22023'; END IF;
  IF p_action IN('answer','timeout') OR (p_action='use_tool' AND timed_out) THEN
   IF timed_out THEN a:='{}'; ok:=false;
   ELSE a:=p_payload->'answer_payload'; ok:=private.virtualpet_grade(q,a); END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(s.effects->'eliminated','[]')) e JOIN jsonb_array_elements_text(coalesce(a->'option_codes','[]')) c ON c=e) THEN RAISE EXCEPTION 'Eliminated option cannot be selected'; END IF;
   IF NOT timed_out AND NOT ok AND coalesce((s.effects->>'secondchance')::boolean,false) AND NOT coalesce((s.effects->>'retried')::boolean,false) THEN
    UPDATE private.mapadventure_sessions SET effects=effects||jsonb_build_object('retried',true,'first_answer',a) WHERE attempt_id=aid;
    RETURN private.mapadventure_state()||'{"answer":{"accepted":false,"retry":true}}'::jsonb;
   END IF;
   UPDATE private.mapadventure_sessions SET writing_results=true WHERE attempt_id=aid;
   INSERT INTO public.exam_attempt_answers(attempt_id,question_id,answer_payload,answered_at,is_timeout) VALUES(aid,(q->>'id')::uuid,a,clock_timestamp(),coalesce(timed_out,false));
   UPDATE private.mapadventure_sessions SET records=records||jsonb_build_array(jsonb_build_object('question_id',q->>'id','answer_payload',a,'correct',ok,'is_timeout',coalesce(timed_out,false),'first_answer',s.effects->'first_answer')),effects='{}',question_deadline_at=NULL,writing_results=false WHERE attempt_id=aid;
   RETURN private.mapadventure_state()||jsonb_build_object('answer',jsonb_build_object('accepted',true,'retry',false,'is_timeout',coalesce(timed_out,false)));
  ELSIF p_action='use_tool' THEN
   tool:=p_payload->>'tool';
   IF tool IS NULL OR tool NOT IN('clue','freezetime','fiftyfifty','skipreplace','secondchance') THEN RAISE EXCEPTION 'Invalid tool'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(s.tools) x WHERE (x->>'question_id'=q->>'id' OR (x->>'question_index')::integer=idx) AND x->>'tool'=tool) THEN RAISE EXCEPTION 'Tool already used on question'; END IF;
   IF tool='freezetime' AND s.stage='practice' THEN RAISE EXCEPTION 'Practice is untimed; freezetime unavailable'; END IF;
   effect:='{}';
   IF tool='freezetime' THEN
    UPDATE private.mapadventure_sessions SET question_deadline_at=question_deadline_at+interval '30 seconds' WHERE attempt_id=aid;
   ELSIF tool='clue' THEN
    IF nullif(btrim(q->>'clue'),'') IS NULL THEN RAISE EXCEPTION 'No clue available'; END IF;
    effect:=jsonb_build_object('clue',q->>'clue');
   ELSIF tool='fiftyfifty' THEN
    IF q->>'type'<>'PG_TUNGGAL' THEN RAISE EXCEPTION 'fiftyfifty only supports PG_TUNGGAL'; END IF;
    SELECT coalesce(jsonb_agg(code),'[]') INTO eliminated FROM (SELECT o->>'option_code' code FROM jsonb_array_elements(q->'options') o
     WHERE NOT (q->'answer_keys'->'option_codes' ? (o->>'option_code')) ORDER BY random() LIMIT greatest(1,(jsonb_array_length(q->'options')-1)/2)) x;
    effect:=jsonb_build_object('eliminated',eliminated);
   ELSIF tool='secondchance' THEN effect:='{"secondchance":true}';
   ELSIF tool='skipreplace' THEN
    pool:=private.mapadventure_pool(n.id,s.stage,1,s.seen_ids);
    UPDATE private.mapadventure_sessions SET writing_results=true WHERE attempt_id=aid;
    -- Keep skipped frozen membership for audit; replacement has a distinct order.
    INSERT INTO public.exam_attempt_questions(attempt_id,question_id,question_version_id,question_order)
     VALUES(aid,(pool->0->>'id')::uuid,(pool->0->>'version')::uuid,total+jsonb_array_length(s.seen_ids)+1);
    r:=pool->0;
    UPDATE private.mapadventure_sessions SET pool=jsonb_set(s.pool,ARRAY[idx::text],r),seen_ids=seen_ids||jsonb_build_array(r->'id'),effects='{}',writing_results=false WHERE attempt_id=aid;
   END IF;
   PERFORM 1 FROM public.map_adventure_tools WHERE user_id=u FOR UPDATE;
   IF (SELECT (to_jsonb(t)->>tool)::integer FROM public.map_adventure_tools t WHERE user_id=u)<=0 THEN RAISE EXCEPTION 'Tool inventory empty'; END IF;
   UPDATE public.map_adventure_tools SET freezetime=freezetime-CASE WHEN tool='freezetime' THEN 1 ELSE 0 END,clue=clue-CASE WHEN tool='clue' THEN 1 ELSE 0 END,fiftyfifty=fiftyfifty-CASE WHEN tool='fiftyfifty' THEN 1 ELSE 0 END,
    skipreplace=skipreplace-CASE WHEN tool='skipreplace' THEN 1 ELSE 0 END,secondchance=secondchance-CASE WHEN tool='secondchance' THEN 1 ELSE 0 END WHERE user_id=u;
   UPDATE private.mapadventure_sessions SET tools=tools||jsonb_build_array(jsonb_build_object('tool',tool,'question_id',q->>'id','question_index',idx)),effects=effects||effect WHERE attempt_id=aid;
   RETURN private.mapadventure_state();
  ELSE
   IF idx<>total THEN RAISE EXCEPTION 'All questions must be answered'; END IF;
   -- Regrade stored private records against immutable keys, not client result fields.
   correct:=0;
   FOR q IN SELECT value FROM jsonb_array_elements(s.pool) LOOP
    SELECT value INTO r FROM jsonb_array_elements(s.records) WHERE value->>'question_id'=q->>'id';
    IF NOT coalesce((r->>'is_timeout')::boolean,false) THEN
     IF private.virtualpet_grade(q,r->'answer_payload') THEN correct:=correct+1; END IF;
    END IF;
   END LOOP;
   -- Practice and sidequest require every answer correct; gatekeeper allows 80%.
   passed:=CASE WHEN s.stage='gatekeeper' THEN correct*100>=total*80 ELSE correct=total END;
   stars:=CASE WHEN NOT passed THEN 0 WHEN jsonb_array_length(s.tools)>0 THEN 2 ELSE 3 END;
   UPDATE private.mapadventure_sessions SET writing_results=true WHERE attempt_id=aid;
   UPDATE public.exam_attempts SET attempt_status='SUBMITTED',correct_answers=correct,score=round(correct*100.0/total,2),submitted_at=clock_timestamp() WHERE id=aid;
   IF passed THEN
    PERFORM private.mapadventure_progress(n.id,s.stage,stars);
    IF s.stage='practice' THEN UPDATE public.map_adventure_topics SET practice_attempt_id=aid WHERE id=n.id;
    ELSIF s.stage='sidequest' THEN UPDATE public.map_adventure_topics SET sidequest_attempt_id=aid WHERE id=n.id;
    ELSE UPDATE public.map_adventure_topics SET gatekeeper_attempt_id=aid WHERE id=n.id; END IF;
   END IF;
   r:=jsonb_build_object('attempt_id',aid,'nodeId',n.id,'stage',s.stage,'passed',passed,'correct',correct,'total',total,'score',round(correct*100.0/total,2),'stars',stars,
    'tools',s.tools,'points',CASE WHEN NOT passed THEN 0 WHEN s.stage='practice' THEN 25 ELSE 50 END,'xp',CASE WHEN NOT passed THEN 0 WHEN s.stage='sidequest' THEN 5 ELSE 1 END);
   UPDATE private.mapadventure_sessions SET result=r,writing_results=false WHERE attempt_id=aid;
   RETURN private.mapadventure_state()||jsonb_build_object('result',r);
  END IF;
 ELSIF p_action='gacha' THEN
  IF n.mysterychest_status='COMPLETED' THEN RETURN private.mapadventure_state()||jsonb_build_object('reward',n.chest_reward); END IF;
  IF n.mysterychest_status<>'UNLOCKED' THEN RAISE EXCEPTION 'Chest locked'; END IF;
  SELECT CASE WHEN order_number=1 THEN 'wooden' WHEN order_number=2 THEN 'silver' ELSE 'golden' END INTO tier FROM public.map_adventure_themes WHERE id=n.theme_id;
  draw:=random(); rewards:=jsonb_build_object('tier',tier,'points',0,'tools','{}'::jsonb);
  IF (tier='wooden' AND draw<0.7) OR (tier='silver' AND draw<0.6) OR (tier='golden' AND draw<0.5) THEN
   amount:=CASE tier WHEN 'wooden' THEN 20+floor(random()*41)::integer WHEN 'silver' THEN 75+floor(random()*76)::integer ELSE 200+floor(random()*301)::integer END;
   PERFORM private.mapadventure_credit(amount,0,NULL); rewards:=jsonb_set(rewards,'{points}',to_jsonb(amount));
  ELSE
   IF tier='wooden' THEN tool:=CASE WHEN random()<0.5 THEN 'clue' ELSE 'freezetime' END; effect:=jsonb_build_object(tool,1);
   ELSIF tier='silver' THEN tool:=CASE WHEN random()<0.5 THEN 'fiftyfifty' ELSE 'skipreplace' END; effect:=jsonb_build_object(tool,1);
   ELSE effect:=CASE WHEN random()<0.5 THEN '{"secondchance":1}'::jsonb ELSE '{"fiftyfifty":1,"clue":1}'::jsonb END; END IF;
   UPDATE public.map_adventure_tools SET clue=clue+coalesce((effect->>'clue')::integer,0),freezetime=freezetime+coalesce((effect->>'freezetime')::integer,0),
    fiftyfifty=fiftyfifty+coalesce((effect->>'fiftyfifty')::integer,0),skipreplace=skipreplace+coalesce((effect->>'skipreplace')::integer,0),secondchance=secondchance+coalesce((effect->>'secondchance')::integer,0) WHERE user_id=u;
   rewards:=jsonb_set(rewards,'{tools}',effect);
  END IF;
  SELECT coalesce(nullif(btrim(p.nickname),''),nullif(btrim(p.full_name),''),'Siswa') INTO nickname FROM public.profiles p WHERE p.id=u;
  PERFORM private.mapadventure_credit(0,0,nickname||' menemukan kotak misteri di pulau '||n.theme);
  UPDATE public.map_adventure_topics SET mysterychest_status='COMPLETED',mysterychest_completed_at=clock_timestamp(),chest_reward=rewards,gatekeeper_status='UNLOCKED' WHERE id=n.id;
  RETURN private.mapadventure_state()||jsonb_build_object('reward',rewards);
 ELSIF p_action='buy' THEN
  tool:=p_payload->>'tool'; price:=CASE tool WHEN 'clue' THEN 30 WHEN 'freezetime' THEN 40 WHEN 'fiftyfifty' THEN 50 WHEN 'skipreplace' THEN 60 WHEN 'secondchance' THEN 80 ELSE NULL END;
  IF price IS NULL THEN RAISE EXCEPTION 'Tool not for sale'; END IF;
  PERFORM private.mapadventure_credit(-price,0,NULL);
  UPDATE public.map_adventure_tools SET freezetime=freezetime+CASE WHEN tool='freezetime' THEN 1 ELSE 0 END,clue=clue+CASE WHEN tool='clue' THEN 1 ELSE 0 END,fiftyfifty=fiftyfifty+CASE WHEN tool='fiftyfifty' THEN 1 ELSE 0 END,
   skipreplace=skipreplace+CASE WHEN tool='skipreplace' THEN 1 ELSE 0 END,secondchance=secondchance+CASE WHEN tool='secondchance' THEN 1 ELSE 0 END WHERE user_id=u;
 ELSIF p_action='complete_island' THEN
  IF NOT EXISTS(SELECT 1 FROM public.map_adventure_themes WHERE id=(p_payload->>'islandId')::uuid AND user_id=u AND education_level=lvl AND subject_code=sc AND status='COMPLETED') THEN RAISE EXCEPTION 'Island not complete or unavailable'; END IF;
  -- Gatekeepers already finalized island and unlocked next theme; no extra reward.
 END IF;
 RETURN private.mapadventure_state();
END $$;

REVOKE ALL ON FUNCTION private.mapadventure_settings(jsonb),private.mapadventure_pool(uuid,text,integer,jsonb),private.mapadventure_seed(text,text,text),
 private.mapadventure_credit(integer,integer,text),private.mapadventure_progress(uuid,text,integer),private.mapadventure_guard_exam(),private.mapadventure_timer(uuid),private.mapadventure_state() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mapadventure(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mapadventure(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
