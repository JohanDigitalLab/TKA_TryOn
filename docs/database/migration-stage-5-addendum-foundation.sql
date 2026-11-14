-- Stage 5; requires deployed stage 1-3 only. Runner owns transaction; no COMMIT here.
-- No question approval/backfill, no official exam-count or duration guesses.
-- Existing AI import persists SMART_IMPORT_AI rows, absent from its legacy sheet constraint.
ALTER TABLE public.question_import_rows DROP CONSTRAINT IF EXISTS question_import_rows_sheet_name_check;
ALTER TABLE public.question_import_rows ADD CONSTRAINT question_import_rows_sheet_name_check CHECK(sheet_name IN('MATA_PELAJARAN','STIMULUS','SOAL','RESPON_KUNCI','SMART_IMPORT_AI'));
CREATE TABLE IF NOT EXISTS public.a02_sources (
  code text PRIMARY KEY CHECK(length(btrim(code)) BETWEEN 1 AND 100), title text NOT NULL,
  url text NOT NULL CHECK(url ~ '^https://'), sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  issued_on date, verified_at timestamptz NOT NULL, evidence text NOT NULL, active boolean NOT NULL DEFAULT true
);
INSERT INTO public.a02_sources(code,title,url,sha256,issued_on,verified_at,evidence) VALUES
 ('BSKAP-047-2025','Peraturan Kepala BSKAP 047/H/AN/2025',
 'https://pusmendik.kemendikdasmen.go.id/tka/files/07180.pdf',
 '25f2dd0e292108893298a9684004dcaf3c003fe8ee6b2e1ecff243ceccd8d04b','2025-07-24','2026-11-14T09:37:12Z',
 'Audit 14 November 2026; PDF fisik 46 halaman. BI SD 8-10; Mat SD 10-15 (matriks 13-15); BI SMP 15-17; Mat SMP 18-25 (matriks 20-25); bentuk soal 7. Bukan verifikasi jumlah/durasi ujian.')
ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.a02_taxonomy_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, grade integer NOT NULL CHECK(grade IN(6,9)),
 subject_name text NOT NULL CHECK(subject_name IN('Bahasa Indonesia','Matematika')), source_code text NOT NULL REFERENCES public.a02_sources(code),
 pdf_pages text NOT NULL CHECK(length(btrim(pdf_pages))>0), status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','inactive')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_by uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.a02_taxonomy_nodes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), taxonomy_id uuid NOT NULL REFERENCES public.a02_taxonomy_versions(id),
 code text NOT NULL, dimension text NOT NULL CHECK(dimension IN('math_domain','math_subdomain','reading_competency','reading_subcompetency','text_type','competency','indicator','cognitive_level','topic')),
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 1000), parent_id uuid REFERENCES public.a02_taxonomy_nodes(id),
 pdf_pages text NOT NULL CHECK(length(btrim(pdf_pages))>0), active boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1,
 UNIQUE(taxonomy_id,code)
);
CREATE TABLE IF NOT EXISTS public.a02_classifications (
 version_id uuid PRIMARY KEY REFERENCES public.question_versions(id), taxonomy_id uuid NOT NULL REFERENCES public.a02_taxonomy_versions(id),
 topic_id uuid NOT NULL REFERENCES public.a02_taxonomy_nodes(id), node_ids uuid[] NOT NULL,
 snapshot jsonb NOT NULL, revision integer NOT NULL DEFAULT 1, updated_by uuid NOT NULL REFERENCES public.profiles(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.a02_editorial_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid NOT NULL REFERENCES public.questions(id),
 version_id uuid NOT NULL REFERENCES public.question_versions(id), action text NOT NULL CHECK(action IN('submit','approve','request_revision','publish','archive')),
 actor_id uuid NOT NULL REFERENCES public.profiles(id), note text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.a02_blueprints (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL, version integer NOT NULL CHECK(version>0),
 taxonomy_id uuid NOT NULL REFERENCES public.a02_taxonomy_versions(id), mode text NOT NULL CHECK(mode IN('simulation','mission')),
 total_questions integer CHECK(total_questions BETWEEN 1 AND 100), duration_minutes integer CHECK(duration_minutes BETWEEN 1 AND 240),
 topic_counts jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'pending_validation' CHECK(status IN('pending_validation','active','inactive')),
 policy_kind text NOT NULL CHECK(policy_kind IN('product','official')), official_evidence text, revision integer NOT NULL DEFAULT 1,
 created_by uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(code,version),
 CHECK(policy_kind<>'official' OR status<>'active' OR length(btrim(official_evidence))>20),
 CHECK(status<>'active' OR (total_questions IS NOT NULL AND duration_minutes IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.a02_attempt_context (
 attempt_id uuid PRIMARY KEY REFERENCES public.exam_attempts(id), mode text NOT NULL CHECK(mode IN('simulation','mission','school','legacy')),
 blueprint_id uuid REFERENCES public.a02_blueprints(id), config_snapshot jsonb NOT NULL, school_id uuid REFERENCES public.schools(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.a02_attempt_metadata (
 attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id), question_id uuid NOT NULL REFERENCES public.questions(id),
 version_id uuid NOT NULL REFERENCES public.question_versions(id), snapshot jsonb NOT NULL, PRIMARY KEY(attempt_id,question_id)
);
CREATE TABLE IF NOT EXISTS public.a02_business_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), manager_whatsapp text CHECK(manager_whatsapp ~ '^\+628[1-9][0-9]{7,10}$'),
 individual_price_label text NOT NULL DEFAULT 'Hubungi pengelola', school_price_label text NOT NULL DEFAULT 'Hubungi pengelola',
 individual_template text NOT NULL DEFAULT 'Saya ingin informasi langganan individu.', school_template text NOT NULL DEFAULT 'Saya ingin informasi langganan sekolah.',
 legacy_start_enforcement boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1
);
INSERT INTO public.a02_business_settings(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.a02_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE REFERENCES public.profiles(id), school_id uuid UNIQUE REFERENCES public.schools(id),
 status text NOT NULL CHECK(status IN('none','pending','active','inactive')), expires_at timestamptz, revision integer NOT NULL DEFAULT 1,
 updated_by uuid NOT NULL REFERENCES public.profiles(id), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((user_id IS NULL)<>(school_id IS NULL))
);
CREATE TABLE IF NOT EXISTS public.a02_subscription_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid NOT NULL REFERENCES public.a02_subscriptions(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id), old_data jsonb, new_data jsonb NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.a02_subscription_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id), school_id uuid REFERENCES public.schools(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','closed')), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS a02_pending_individual_request ON public.a02_subscription_requests(user_id) WHERE status='pending' AND school_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS a02_pending_school_request ON public.a02_subscription_requests(school_id) WHERE status='pending' AND school_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.a02_trial_uses (
 user_id uuid NOT NULL REFERENCES public.profiles(id), mode text NOT NULL CHECK(mode IN('simulation','mission')),
 attempt_id uuid NOT NULL UNIQUE REFERENCES public.exam_attempts(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(user_id,mode)
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_consent_at timestamptz;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='a02_whatsapp_canonical') THEN
 ALTER TABLE public.profiles ADD CONSTRAINT a02_whatsapp_canonical CHECK(whatsapp_number IS NULL OR whatsapp_number ~ '^\+628[1-9][0-9]{7,10}$'); END IF;
END $$;

CREATE OR REPLACE FUNCTION private.a02_actor(p_permission text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND account_status='active') THEN
 RAISE EXCEPTION 'A02_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_permission IS NOT NULL AND NOT private.has_admin_permission(p_permission) THEN RAISE EXCEPTION 'A02_PERMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN auth.uid();
END $$;
CREATE OR REPLACE FUNCTION private.a02_super() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM private.a02_actor();
 IF NOT private.is_super_admin() THEN RAISE EXCEPTION 'A02_SUPERADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN auth.uid();
END $$;
CREATE OR REPLACE FUNCTION private.a02_whatsapp(p_number text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n text;
BEGIN
 IF p_number IS NULL OR p_number !~ '^[+0-9 ()-]+$' THEN RAISE EXCEPTION 'A02_INVALID_WHATSAPP' USING ERRCODE='22023'; END IF;
 n:=regexp_replace(p_number,'[ ()-]','','g');
 IF n ~ '^08' THEN n:='+62'||substr(n,2); ELSIF n ~ '^628' THEN n:='+'||n; END IF;
 IF n !~ '^\+628[1-9][0-9]{7,10}$' THEN RAISE EXCEPTION 'A02_INVALID_WHATSAPP' USING ERRCODE='22023'; END IF;
 RETURN n;
END $$;
-- Preserve education-level initialization; existing auth UPDATE/login flows do not invoke INSERT trigger.
CREATE OR REPLACE FUNCTION private.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lvl text; wa text;
BEGIN
 wa:=private.a02_whatsapp(NEW.raw_user_meta_data->>'whatsapp_number');
 IF NEW.raw_user_meta_data->>'registration_method' IN('independent','school') AND NEW.raw_user_meta_data->>'education_level' IN('sd','smp','sma') THEN lvl:=NEW.raw_user_meta_data->>'education_level'; END IF;
 INSERT INTO public.profiles(id,full_name,education_level,education_level_locked_at,whatsapp_number)
 VALUES(NEW.id,coalesce(NEW.raw_user_meta_data->>'full_name',''),lvl,CASE WHEN lvl IS NOT NULL THEN now() END,wa) ON CONFLICT(id) DO NOTHING;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.a02_profile(p_update jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_actor(); p public.profiles%ROWTYPE; wa text;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=uid FOR UPDATE;
 IF p_update IS NOT NULL THEN
 IF jsonb_typeof(p_update)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_update) k WHERE k NOT IN('full_name','whatsapp_number','whatsapp_consent')) THEN RAISE EXCEPTION 'A02_INVALID_PROFILE_FIELDS' USING ERRCODE='22023'; END IF;
 IF p_update ? 'full_name' AND (jsonb_typeof(p_update->'full_name')<>'string' OR length(btrim(p_update->>'full_name')) NOT BETWEEN 1 AND 160) THEN RAISE EXCEPTION 'A02_INVALID_NAME' USING ERRCODE='22023'; END IF;
 IF p_update ? 'whatsapp_consent' AND jsonb_typeof(p_update->'whatsapp_consent')<>'boolean' THEN RAISE EXCEPTION 'A02_INVALID_CONSENT' USING ERRCODE='22023'; END IF;
 wa:=CASE WHEN p_update ? 'whatsapp_number' THEN private.a02_whatsapp(p_update->>'whatsapp_number') ELSE p.whatsapp_number END;
 UPDATE public.profiles SET full_name=CASE WHEN p_update ? 'full_name' THEN btrim(p_update->>'full_name') ELSE full_name END,
 whatsapp_number=wa, whatsapp_consent_at=CASE WHEN p_update->>'whatsapp_consent'='true' THEN coalesce(whatsapp_consent_at,clock_timestamp()) WHEN p_update->>'whatsapp_consent'='false' THEN NULL ELSE whatsapp_consent_at END,
 updated_at=clock_timestamp() WHERE id=uid RETURNING * INTO p;
 END IF;
 RETURN jsonb_build_object('user_id',p.id,'full_name',p.full_name,'education_level',p.education_level,'whatsapp_number',p.whatsapp_number,'whatsapp_consent_at',p.whatsapp_consent_at,'contact_verified',false,'contact_required',p.whatsapp_number IS NULL);
END $$;

-- Registry writes only via superadmin. Referenced versions/nodes are immutable except activation.
CREATE OR REPLACE FUNCTION public.a02_registry_mutate(p_kind text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_super(); idv uuid; t public.a02_taxonomy_versions%ROWTYPE; n public.a02_taxonomy_nodes%ROWTYPE; b public.a02_blueprints%ROWTYPE; r jsonb;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'A02_INVALID_OBJECT' USING ERRCODE='22023'; END IF;
 IF p_kind='source' THEN
 INSERT INTO public.a02_sources(code,title,url,sha256,issued_on,verified_at,evidence,active)
 VALUES(p_data->>'code',p_data->>'title',p_data->>'url',p_data->>'sha256',(p_data->>'issued_on')::date,(p_data->>'verified_at')::timestamptz,p_data->>'evidence',(p_data->>'active')::boolean)
 ON CONFLICT(code) DO UPDATE SET active=excluded.active WHERE public.a02_sources.title=excluded.title AND public.a02_sources.url=excluded.url AND public.a02_sources.sha256=excluded.sha256 AND public.a02_sources.evidence=excluded.evidence
 AND public.a02_sources.issued_on IS NOT DISTINCT FROM excluded.issued_on AND public.a02_sources.verified_at=excluded.verified_at
 RETURNING to_jsonb(a02_sources.*) INTO r;
 IF r IS NULL THEN RAISE EXCEPTION 'A02_SOURCE_IMMUTABLE'; END IF;
 ELSIF p_kind='taxonomy' THEN
 idv:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
 SELECT * INTO t FROM public.a02_taxonomy_versions WHERE id=idv FOR UPDATE;
 IF FOUND THEN
 IF (p_data->>'expected_revision')::integer IS DISTINCT FROM t.revision THEN RAISE EXCEPTION 'A02_STALE_REVISION' USING ERRCODE='40001'; END IF;
 UPDATE public.a02_taxonomy_versions SET status=p_data->>'status',revision=revision+1 WHERE id=idv RETURNING to_jsonb(a02_taxonomy_versions.*) INTO r;
 ELSE
 INSERT INTO public.a02_taxonomy_versions(id,code,grade,subject_name,source_code,pdf_pages,status,created_by)
 VALUES(idv,p_data->>'code',(p_data->>'grade')::integer,p_data->>'subject_name',p_data->>'source_code',p_data->>'pdf_pages',p_data->>'status',uid) RETURNING to_jsonb(a02_taxonomy_versions.*) INTO r;
 END IF;
 ELSIF p_kind='node' THEN
 idv:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
 SELECT * INTO n FROM public.a02_taxonomy_nodes WHERE id=idv FOR UPDATE;
 IF FOUND THEN
 -- Label/code/provenance changes require a new node/version, never rewrite historical meaning.
 IF (p_data->>'expected_revision')::integer IS DISTINCT FROM n.revision THEN RAISE EXCEPTION 'A02_STALE_REVISION' USING ERRCODE='40001'; END IF;
 UPDATE public.a02_taxonomy_nodes SET active=(p_data->>'active')::boolean,revision=revision+1 WHERE id=idv RETURNING to_jsonb(a02_taxonomy_nodes.*) INTO r;
 ELSE
 SELECT * INTO t FROM public.a02_taxonomy_versions WHERE id=(p_data->>'taxonomy_id')::uuid FOR UPDATE;
 IF NOT FOUND OR t.status<>'draft' THEN RAISE EXCEPTION 'A02_TAXONOMY_NOT_DRAFT'; END IF;
 IF (t.subject_name='Matematika' AND p_data->>'dimension' IN('text_type','reading_competency','reading_subcompetency')) OR (t.subject_name='Bahasa Indonesia' AND p_data->>'dimension' IN('math_domain','math_subdomain')) THEN RAISE EXCEPTION 'A02_DIMENSION_MISMATCH'; END IF;
 IF p_data->>'parent_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes WHERE id=(p_data->>'parent_id')::uuid AND taxonomy_id=t.id) THEN RAISE EXCEPTION 'A02_PARENT_MISMATCH'; END IF;
 INSERT INTO public.a02_taxonomy_nodes(id,taxonomy_id,code,dimension,label,parent_id,pdf_pages,active)
 VALUES(idv,t.id,p_data->>'code',p_data->>'dimension',p_data->>'label',(p_data->>'parent_id')::uuid,p_data->>'pdf_pages',(p_data->>'active')::boolean) RETURNING to_jsonb(a02_taxonomy_nodes.*) INTO r;
 END IF;
 ELSIF p_kind='blueprint' THEN
 idv:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
 SELECT * INTO b FROM public.a02_blueprints WHERE id=idv FOR UPDATE;
 IF FOUND THEN
 IF (p_data->>'expected_revision')::integer IS DISTINCT FROM b.revision THEN RAISE EXCEPTION 'A02_STALE_REVISION' USING ERRCODE='40001'; END IF;
 UPDATE public.a02_blueprints SET status=p_data->>'status',revision=revision+1 WHERE id=idv RETURNING to_jsonb(a02_blueprints.*) INTO r;
 ELSE
 INSERT INTO public.a02_blueprints(id,code,version,taxonomy_id,mode,total_questions,duration_minutes,topic_counts,status,policy_kind,official_evidence,created_by)
 VALUES(idv,p_data->>'code',(p_data->>'version')::integer,(p_data->>'taxonomy_id')::uuid,p_data->>'mode',(p_data->>'total_questions')::integer,(p_data->>'duration_minutes')::integer,p_data->'topic_counts',p_data->>'status',p_data->>'policy_kind',p_data->>'official_evidence',uid) RETURNING * INTO b;
 r:=to_jsonb(b);
 END IF;
 IF r->>'status'='active' THEN PERFORM private.a02_validate_blueprint(idv); END IF;
 ELSE RAISE EXCEPTION 'A02_INVALID_REGISTRY_KIND' USING ERRCODE='22023'; END IF;
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.a02_classify(p_version_id uuid,p_expected_revision integer,p_taxonomy_id uuid,p_topic_id uuid,p_node_ids uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_actor('bank_soal.edit'); v public.question_versions%ROWTYPE; q public.questions%ROWTYPE; t public.a02_taxonomy_versions%ROWTYPE; snap jsonb; rev integer;
BEGIN
 SELECT q0.* INTO q FROM public.questions q0 JOIN public.question_versions v0 ON v0.question_id=q0.id WHERE v0.id=p_version_id FOR UPDATE OF q0;
 SELECT * INTO v FROM public.question_versions WHERE id=p_version_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'A02_VERSION_NOT_FOUND'; END IF;
 IF v.version_status NOT IN('DRAFT','NEEDS_REVISION') OR EXISTS(SELECT 1 FROM public.exam_attempt_questions WHERE question_version_id=v.id) OR EXISTS(SELECT 1 FROM public.school_assignment_questions WHERE question_version_id=v.id) THEN RAISE EXCEPTION 'A02_VERSION_FROZEN'; END IF;
 SELECT revision INTO rev FROM public.a02_classifications WHERE version_id=v.id;
 IF coalesce(rev,0) IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'A02_STALE_REVISION' USING ERRCODE='40001'; END IF;
 SELECT * INTO t FROM public.a02_taxonomy_versions WHERE id=p_taxonomy_id AND status='active' FOR SHARE;
 IF NOT FOUND OR t.grade<>q.grade OR t.subject_name<>q.subject_name THEN RAISE EXCEPTION 'A02_TAXONOMY_MISMATCH'; END IF;
 IF p_node_ids IS NULL OR cardinality(p_node_ids)=0 OR cardinality(p_node_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_node_ids) x) OR
 EXISTS(SELECT 1 FROM unnest(p_node_ids) x WHERE NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes n WHERE n.id=x AND n.taxonomy_id=t.id AND n.active)) OR
 NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes WHERE id=p_topic_id AND taxonomy_id=t.id AND active AND dimension='topic') THEN RAISE EXCEPTION 'A02_INVALID_NODES'; END IF;
 IF EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes WHERE id=ANY(p_node_ids||ARRAY[p_topic_id]) AND parent_id IS NOT NULL AND NOT(parent_id=ANY(p_node_ids||ARRAY[p_topic_id]))) THEN RAISE EXCEPTION 'A02_INCOMPLETE_HIERARCHY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes WHERE id=ANY(p_node_ids) AND dimension='indicator') OR
 NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes WHERE id=ANY(p_node_ids) AND dimension='cognitive_level') OR
 (t.subject_name='Matematika' AND (NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes WHERE id=ANY(p_node_ids) AND dimension='math_domain') OR NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes WHERE id=ANY(p_node_ids) AND dimension='math_subdomain') OR NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes WHERE id=ANY(p_node_ids) AND dimension='competency'))) OR
 (t.subject_name='Bahasa Indonesia' AND (NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes WHERE id=ANY(p_node_ids) AND dimension='reading_competency') OR NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes WHERE id=ANY(p_node_ids) AND dimension='reading_subcompetency') OR NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes WHERE id=ANY(p_node_ids) AND dimension='text_type'))) THEN RAISE EXCEPTION 'A02_REQUIRED_DIMENSIONS'; END IF;
 SELECT jsonb_build_object('provenance','version_snapshot','taxonomy',to_jsonb(t),'source',to_jsonb(s),'topic',to_jsonb(topic),'nodes',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.dimension,n.code) FROM public.a02_taxonomy_nodes n WHERE n.id=ANY(p_node_ids)),
 'question_type',q.question_type,'difficulty',q.difficulty,'source_reference',q.source_reference,'usage_rights',q.usage_rights)
 INTO snap FROM public.a02_sources s CROSS JOIN public.a02_taxonomy_nodes topic WHERE s.code=t.source_code AND topic.id=p_topic_id;
 INSERT INTO public.a02_classifications(version_id,taxonomy_id,topic_id,node_ids,snapshot,updated_by)
 VALUES(v.id,t.id,p_topic_id,p_node_ids,snap,uid) ON CONFLICT(version_id) DO UPDATE SET taxonomy_id=excluded.taxonomy_id,topic_id=excluded.topic_id,node_ids=excluded.node_ids,snapshot=excluded.snapshot,revision=a02_classifications.revision+1,updated_by=uid,updated_at=clock_timestamp();
 RETURN jsonb_build_object('version_id',v.id,'revision',coalesce(rev,0)+1,'classification',snap);
END $$;

CREATE OR REPLACE FUNCTION private.a02_metadata_valid(p_version_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.question_versions v JOIN public.questions q ON q.id=v.question_id JOIN public.a02_classifications c ON c.version_id=v.id
 JOIN public.a02_taxonomy_versions t ON t.id=c.taxonomy_id JOIN public.a02_sources s ON s.code=t.source_code
 WHERE v.id=p_version_id AND t.status='active' AND s.active AND t.grade=q.grade AND t.subject_name=q.subject_name
 AND q.grade IN(6,9) AND length(btrim(v.question_text))>0 AND length(btrim(v.explanation))>0 AND length(btrim(v.content_hash))>0
 AND length(btrim(q.source_reference))>0 AND q.usage_rights IN('ORISINAL','BERLISENSI','IZIN_TERTULIS','DOMAIN_PUBLIK') AND q.difficulty IN('MUDAH','SEDANG','SULIT')
 AND NOT coalesce((c.snapshot->>'invalidated')::boolean,false)
 AND c.snapshot->>'question_type'=q.question_type AND c.snapshot->>'difficulty'=q.difficulty
 AND c.snapshot->>'source_reference'=q.source_reference AND c.snapshot->>'usage_rights'=q.usage_rights
 AND NOT EXISTS(SELECT 1 FROM unnest(c.node_ids||ARRAY[c.topic_id]) x WHERE NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes n WHERE n.id=x AND n.active AND n.taxonomy_id=t.id))
 AND (v.stimulus_id IS NULL OR EXISTS(SELECT 1 FROM public.question_stimuli st WHERE st.id=v.stimulus_id AND st.stimulus_status='APPROVED' AND length(btrim(st.source_reference))>0 AND st.usage_rights IN('ORISINAL','BERLISENSI','IZIN_TERTULIS','DOMAIN_PUBLIK')))
 AND ((q.question_type IN('PG_TUNGGAL','PGK_MA') AND (SELECT count(*) FROM public.question_options o WHERE o.question_version_id=v.id)>=2
 AND (SELECT count(*) FROM public.question_options o WHERE o.question_version_id=v.id AND o.is_correct)>=1
 AND (q.question_type<>'PG_TUNGGAL' OR (SELECT count(*) FROM public.question_options o WHERE o.question_version_id=v.id AND o.is_correct)=1)
 AND NOT EXISTS(SELECT 1 FROM public.question_options o WHERE o.question_version_id=v.id AND length(btrim(o.option_text))=0))
 OR (q.question_type='PGK_KATEGORI' AND EXISTS(SELECT 1 FROM public.question_category_items ci WHERE ci.question_version_id=v.id)
 AND NOT EXISTS(SELECT 1 FROM public.question_category_items ci WHERE ci.question_version_id=v.id AND (length(btrim(ci.item_text))=0 OR cardinality(regexp_split_to_array(ci.category_label,'\s*/\s*'))<2 OR NOT(ci.correct_category=ANY(regexp_split_to_array(ci.category_label,'\s*/\s*'))))))))
$$;
CREATE OR REPLACE FUNCTION private.a02_eligible(p_taxonomy_id uuid DEFAULT NULL) RETURNS TABLE(question_id uuid,version_id uuid,topic_id uuid,grade integer,subject_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT q.id,v.id,c.topic_id,q.grade::integer,q.subject_name FROM public.questions q JOIN public.question_versions v ON v.question_id=q.id
 JOIN public.a02_classifications c ON c.version_id=v.id WHERE q.question_status='PUBLISHED' AND v.is_current AND v.version_status='PUBLISHED'
 AND (p_taxonomy_id IS NULL OR c.taxonomy_id=p_taxonomy_id) AND private.a02_metadata_valid(v.id)
 AND EXISTS(SELECT 1 FROM public.question_reviews r WHERE r.question_version_id=v.id AND r.question_id=q.id AND r.review_action='APPROVE' AND r.reviewer_id IS DISTINCT FROM v.created_by
 AND r.reviewed_at>=(SELECT max(e.created_at) FROM public.a02_editorial_events e WHERE e.version_id=v.id AND e.action='submit'))
$$;
CREATE OR REPLACE FUNCTION public.a02_inventory() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM private.a02_actor('bank_soal.view');
 RETURN (SELECT jsonb_agg(jsonb_build_object('grade',g,'subject_name',s,'target',100,'actual',actual,'eligible',eligible,'shortage',greatest(100-eligible,0)) ORDER BY g,s)
 FROM (SELECT g,s,(SELECT count(DISTINCT q.id) FROM public.questions q WHERE q.grade=g AND q.subject_name=s) actual,
 (SELECT count(DISTINCT e.question_id) FROM private.a02_eligible() e WHERE e.grade=g AND e.subject_name=s) eligible
 FROM unnest(ARRAY[6,9]) g CROSS JOIN unnest(ARRAY['Bahasa Indonesia','Matematika']) s) counts);
END $$;
CREATE OR REPLACE FUNCTION public.a02_editorial(p_version_id uuid,p_expected_status text,p_expected_classification_revision integer,p_action text,p_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid; v public.question_versions%ROWTYPE; q public.questions%ROWTYPE; ns text;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('submit','approve','request_revision','publish','archive') OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 3 AND 4000 THEN RAISE EXCEPTION 'A02_INVALID_EDITORIAL_INPUT' USING ERRCODE='22023'; END IF;
 uid:=private.a02_actor(CASE p_action WHEN 'submit' THEN 'bank_soal.edit' WHEN 'approve' THEN 'bank_soal.review' WHEN 'request_revision' THEN 'bank_soal.review' WHEN 'publish' THEN 'bank_soal.publish' ELSE 'bank_soal.moderate' END);
 -- Same question lock order for all editorial operations.
 SELECT q0.* INTO q FROM public.questions q0 JOIN public.question_versions v0 ON v0.question_id=q0.id WHERE v0.id=p_version_id FOR UPDATE OF q0;
 SELECT * INTO v FROM public.question_versions WHERE id=p_version_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'A02_VERSION_NOT_FOUND'; END IF;
 IF v.version_status IS DISTINCT FROM p_expected_status OR p_expected_classification_revision IS DISTINCT FROM (SELECT revision FROM public.a02_classifications WHERE version_id=v.id) THEN RAISE EXCEPTION 'A02_STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF p_action<>'archive' AND EXISTS(SELECT 1 FROM public.question_versions WHERE question_id=q.id AND version_number>v.version_number) THEN RAISE EXCEPTION 'A02_STALE_VERSION' USING ERRCODE='40001'; END IF;
 IF p_action='submit' THEN
 IF v.version_status NOT IN('DRAFT','NEEDS_REVISION') OR NOT private.a02_metadata_valid(v.id) THEN RAISE EXCEPTION 'A02_NOT_SUBMITTABLE'; END IF; ns:='PENDING_REVIEW';
 ELSIF p_action IN('approve','request_revision') THEN
 IF v.version_status<>'PENDING_REVIEW' OR NOT EXISTS(SELECT 1 FROM public.a02_editorial_events WHERE version_id=v.id AND action='submit') THEN RAISE EXCEPTION 'A02_NOT_REVIEWABLE'; END IF;
 IF v.created_by IS NULL OR v.created_by=uid OR EXISTS(SELECT 1 FROM public.a02_editorial_events WHERE version_id=v.id AND action='submit' AND actor_id=uid) THEN RAISE EXCEPTION 'A02_SELF_REVIEW_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_action='approve' AND NOT private.a02_metadata_valid(v.id) THEN RAISE EXCEPTION 'A02_METADATA_INVALID'; END IF;
 ns:=CASE p_action WHEN 'approve' THEN 'APPROVED' ELSE 'NEEDS_REVISION' END;
 ELSIF p_action='publish' THEN
 IF v.version_status<>'APPROVED' OR NOT private.a02_metadata_valid(v.id) OR NOT EXISTS(SELECT 1 FROM public.question_reviews WHERE question_version_id=v.id AND review_action='APPROVE' AND reviewer_id<>v.created_by AND reviewed_at>=(SELECT max(created_at) FROM public.a02_editorial_events WHERE version_id=v.id AND action='submit')) THEN RAISE EXCEPTION 'A02_NOT_PUBLISHABLE'; END IF;
 UPDATE public.question_versions SET is_current=false,version_status=CASE WHEN version_status='PUBLISHED' THEN 'SUPERSEDED' ELSE version_status END WHERE question_id=q.id AND is_current AND id<>v.id;
 UPDATE public.question_versions SET is_current=true WHERE id=v.id; ns:='PUBLISHED';
 ELSE
 UPDATE public.questions SET question_status='ARCHIVED' WHERE id=q.id;
 INSERT INTO public.a02_editorial_events(question_id,version_id,action,actor_id,note) VALUES(q.id,v.id,p_action,uid,p_note);
 RETURN jsonb_build_object('version_id',v.id,'status','ARCHIVED');
 END IF;
 UPDATE public.question_versions SET version_status=ns WHERE id=v.id;
 -- A pending revision must not take a currently published question out of service.
 IF p_action='publish' OR q.question_status<>'PUBLISHED' THEN UPDATE public.questions SET question_status=ns WHERE id=q.id; END IF;
 INSERT INTO public.a02_editorial_events(question_id,version_id,action,actor_id,note) VALUES(q.id,v.id,p_action,uid,p_note);
 IF p_action IN('submit','approve','request_revision') THEN
 INSERT INTO public.question_reviews(question_id,question_version_id,reviewer_id,review_action,review_notes,reviewed_at) VALUES(q.id,v.id,uid,CASE p_action WHEN 'submit' THEN 'SUBMIT' WHEN 'approve' THEN 'APPROVE' ELSE 'REQUEST_REVISION' END,p_note,clock_timestamp()); END IF;
 RETURN jsonb_build_object('version_id',v.id,'status',ns,'classification_revision',p_expected_classification_revision);
END $$;

CREATE OR REPLACE FUNCTION public.a02_business_config(p_update jsonb DEFAULT NULL,p_expected_revision integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b public.a02_business_settings%ROWTYPE;
BEGIN
 IF p_update IS NOT NULL THEN
 PERFORM private.a02_super();
 IF jsonb_typeof(p_update)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_update) k WHERE k NOT IN('manager_whatsapp','individual_price_label','school_price_label','individual_template','school_template','legacy_start_enforcement')) THEN RAISE EXCEPTION 'A02_INVALID_SETTINGS' USING ERRCODE='22023'; END IF;
 SELECT * INTO b FROM public.a02_business_settings FOR UPDATE;
 IF b.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'A02_STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_update) e WHERE e.key NOT IN('legacy_start_enforcement') AND (jsonb_typeof(e.value)<>'string' OR length(btrim(e.value#>>'{}')) NOT BETWEEN 1 AND 2000)) OR (p_update ? 'legacy_start_enforcement' AND jsonb_typeof(p_update->'legacy_start_enforcement')<>'boolean') THEN RAISE EXCEPTION 'A02_INVALID_SETTINGS' USING ERRCODE='22023'; END IF;
 UPDATE public.a02_business_settings SET manager_whatsapp=CASE WHEN p_update ? 'manager_whatsapp' THEN private.a02_whatsapp(p_update->>'manager_whatsapp') ELSE manager_whatsapp END,
 individual_price_label=coalesce(p_update->>'individual_price_label',individual_price_label),school_price_label=coalesce(p_update->>'school_price_label',school_price_label),
 individual_template=coalesce(p_update->>'individual_template',individual_template),school_template=coalesce(p_update->>'school_template',school_template),
 legacy_start_enforcement=coalesce((p_update->>'legacy_start_enforcement')::boolean,legacy_start_enforcement),revision=revision+1;
 END IF;
 SELECT * INTO b FROM public.a02_business_settings;
 RETURN jsonb_build_object('manager_whatsapp',b.manager_whatsapp,'individual_price_label',b.individual_price_label,'school_price_label',b.school_price_label,'individual_template',b.individual_template,'school_template',b.school_template,'legacy_start_enforcement',b.legacy_start_enforcement,'revision',b.revision);
END $$;
CREATE OR REPLACE FUNCTION public.a02_subscription_set(p_user_id uuid,p_school_id uuid,p_status text,p_expires_at timestamptz,p_expected_revision integer,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_super(); s public.a02_subscriptions%ROWTYPE; old jsonb;
BEGIN
 IF (p_user_id IS NULL)=(p_school_id IS NULL) OR p_status IS NULL OR p_status NOT IN('none','pending','active','inactive') OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 2000 OR (p_expires_at IS NOT NULL AND p_expires_at<=clock_timestamp() AND p_status='active') THEN RAISE EXCEPTION 'A02_INVALID_SUBSCRIPTION' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('a02:subscription:'||coalesce(p_user_id,p_school_id)::text,0));
 SELECT * INTO s FROM public.a02_subscriptions WHERE user_id=p_user_id OR school_id=p_school_id FOR UPDATE;
 IF coalesce(s.revision,0) IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'A02_STALE_REVISION' USING ERRCODE='40001'; END IF;
 old:=CASE WHEN s.id IS NOT NULL THEN to_jsonb(s) END;
 IF s.id IS NULL THEN
 INSERT INTO public.a02_subscriptions(user_id,school_id,status,expires_at,updated_by) VALUES(p_user_id,p_school_id,p_status,p_expires_at,uid) RETURNING * INTO s;
 ELSE UPDATE public.a02_subscriptions SET status=p_status,expires_at=p_expires_at,revision=revision+1,updated_by=uid,updated_at=clock_timestamp() WHERE id=s.id RETURNING * INTO s; END IF;
 INSERT INTO public.a02_subscription_audit(subscription_id,actor_id,old_data,new_data,reason) VALUES(s.id,uid,old,to_jsonb(s),p_reason);
 RETURN to_jsonb(s);
END $$;
CREATE OR REPLACE FUNCTION private.a02_subscribed(p_user_id uuid,p_school_id uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.a02_subscriptions s WHERE s.status='active' AND (s.expires_at IS NULL OR s.expires_at>statement_timestamp()) AND
 ((p_school_id IS NULL AND s.user_id=p_user_id) OR (s.school_id IS NOT NULL AND (p_school_id IS NULL OR s.school_id=p_school_id) AND EXISTS(
 SELECT 1 FROM public.school_memberships m JOIN public.schools sc ON sc.id=m.school_id WHERE m.user_id=p_user_id AND m.school_id=s.school_id AND m.status='active' AND m.role='student' AND sc.status='active'))))
$$;
CREATE OR REPLACE FUNCTION public.a02_subscription_context() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_actor();
BEGIN
 RETURN jsonb_build_object('subscribed',private.a02_subscribed(uid),'individual',coalesce((SELECT jsonb_build_object('status',s.status,'expires_at',s.expires_at,'revision',s.revision) FROM public.a02_subscriptions s WHERE user_id=uid),'{"status":"none","revision":0}'::jsonb),
 'trials',(SELECT jsonb_object_agg(m,NOT EXISTS(SELECT 1 FROM public.a02_trial_uses u WHERE u.user_id=uid AND u.mode=m)) FROM unnest(ARRAY['simulation','mission']) m),
 'requests',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'school_id',r.school_id,'status',r.status,'created_at',r.created_at)) FROM public.a02_subscription_requests r WHERE r.user_id=uid),'[]'::jsonb));
END $$;
CREATE OR REPLACE FUNCTION public.a02_subscription_request(p_school_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_actor(); rid uuid;
BEGIN
 IF p_school_id IS NOT NULL THEN PERFORM private.require_school_staff(p_school_id); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('a02:request:'||coalesce(p_school_id,uid)::text,0));
 SELECT id INTO rid FROM public.a02_subscription_requests WHERE status='pending' AND ((p_school_id IS NULL AND school_id IS NULL AND user_id=uid) OR school_id=p_school_id);
 IF rid IS NOT NULL THEN RETURN rid; END IF;
 IF (SELECT count(*) FROM public.a02_subscription_requests WHERE user_id=uid AND created_at>clock_timestamp()-interval '1 day')>=5 THEN RAISE EXCEPTION 'A02_REQUEST_RATE_LIMIT'; END IF;
 INSERT INTO public.a02_subscription_requests(user_id,school_id) VALUES(uid,p_school_id) RETURNING id INTO rid;
 RETURN rid;
END $$;
CREATE OR REPLACE FUNCTION private.a02_entitle(p_attempt_id uuid,p_mode text,p_school_id uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_actor();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND whatsapp_number IS NOT NULL AND whatsapp_consent_at IS NOT NULL) THEN RAISE EXCEPTION 'A02_CONTACT_REQUIRED'; END IF;
 IF p_school_id IS NOT NULL THEN
 IF NOT private.a02_subscribed(uid,p_school_id) THEN RAISE EXCEPTION 'A02_SCHOOL_SUBSCRIPTION_REQUIRED'; END IF;
 ELSIF NOT private.a02_subscribed(uid) THEN
 IF p_mode IS NULL OR p_mode NOT IN('simulation','mission') THEN RAISE EXCEPTION 'A02_INVALID_MODE' USING ERRCODE='22023'; END IF;
 -- Unique(user,mode) is the final concurrent arbiter; failed selection rolls back this debit.
 INSERT INTO public.a02_trial_uses(user_id,mode,attempt_id) VALUES(uid,p_mode,p_attempt_id) ON CONFLICT(user_id,mode) DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'A02_TRIAL_EXHAUSTED'; END IF;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION private.a02_validate_blueprint(p_id uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b public.a02_blueprints%ROWTYPE; x jsonb; total integer:=0; ids uuid[]:='{}'; tid uuid; cnt integer;
BEGIN
 SELECT * INTO b FROM public.a02_blueprints WHERE id=p_id;
 IF NOT FOUND OR b.total_questions IS NULL OR b.duration_minutes IS NULL OR jsonb_typeof(b.topic_counts)<>'array' OR jsonb_array_length(b.topic_counts)=0 THEN RAISE EXCEPTION 'A02_INVALID_BLUEPRINT'; END IF;
 -- Framework 047 does not establish official standalone counts/durations. No activation until separately verified policy is implemented.
 IF b.policy_kind='official' THEN RAISE EXCEPTION 'A02_OFFICIAL_POLICY_PENDING_VALIDATION' USING ERRCODE='0A000'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_versions WHERE id=b.taxonomy_id AND status='active') THEN RAISE EXCEPTION 'A02_TAXONOMY_INACTIVE'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(b.topic_counts) LOOP
 IF jsonb_typeof(x)<>'object' OR x->>'count' IS NULL OR x->>'count' !~ '^[1-9][0-9]{0,2}$' OR x->>'topic_id' IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(x) k WHERE k NOT IN('topic_id','count')) THEN RAISE EXCEPTION 'A02_INVALID_TOPIC_COUNT'; END IF;
 tid:=(x->>'topic_id')::uuid; cnt:=(x->>'count')::integer;
 IF tid=ANY(ids) OR NOT EXISTS(SELECT 1 FROM public.a02_taxonomy_nodes WHERE id=tid AND taxonomy_id=b.taxonomy_id AND dimension='topic' AND active) THEN RAISE EXCEPTION 'A02_INVALID_BLUEPRINT_TOPIC'; END IF;
 ids:=array_append(ids,tid); total:=total+cnt;
 END LOOP;
 IF total<>b.total_questions THEN RAISE EXCEPTION 'A02_BLUEPRINT_TOTAL_MISMATCH'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.a02_catalog() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM private.a02_actor();
 RETURN jsonb_build_object('sources',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM public.a02_sources s WHERE active),'[]'::jsonb),
 'taxonomies',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM public.a02_taxonomy_versions t WHERE status='active'),'[]'::jsonb),
 'nodes',coalesce((SELECT jsonb_agg(to_jsonb(n)) FROM public.a02_taxonomy_nodes n JOIN public.a02_taxonomy_versions t ON t.id=n.taxonomy_id WHERE n.active AND t.status='active'),'[]'::jsonb),
 'blueprints',coalesce((SELECT jsonb_agg(to_jsonb(b)-'created_by') FROM public.a02_blueprints b WHERE status='active'),'[]'::jsonb));
END $$;
CREATE OR REPLACE FUNCTION public.a02_start(p_blueprint_id uuid,p_adaptive boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_actor(); b public.a02_blueprints%ROWTYPE; t public.a02_taxonomy_versions%ROWTYPE; a public.exam_attempts%ROWTYPE;
 x jsonb; selected uuid[]:='{}'; part uuid[]; expected integer; pos integer:=0; result jsonb;
BEGIN
 IF p_adaptive IS NULL THEN RAISE EXCEPTION 'A02_INVALID_ADAPTIVE' USING ERRCODE='22023'; END IF;
 -- Adaptive is explicitly unsupported, never silently substituted with random selection.
 IF p_adaptive THEN RAISE EXCEPTION 'A02_ADAPTIVE_NOT_SUPPORTED' USING ERRCODE='0A000'; END IF;
 SELECT * INTO b FROM public.a02_blueprints WHERE id=p_blueprint_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'A02_BLUEPRINT_NOT_ACTIVE'; END IF;
 SELECT * INTO t FROM public.a02_taxonomy_versions WHERE id=b.taxonomy_id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND education_level=CASE t.grade WHEN 6 THEN 'sd' ELSE 'smp' END) THEN RAISE EXCEPTION 'A02_GRADE_MISMATCH'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||':'||t.grade::text||':'||t.subject_name,0));
 SELECT * INTO a FROM public.exam_attempts WHERE user_id=uid AND grade=t.grade AND subject_name=t.subject_name AND attempt_status='IN_PROGRESS' AND started_at+duration_minutes*interval '1 minute'>clock_timestamp() ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN
 IF NOT EXISTS(SELECT 1 FROM public.a02_attempt_context WHERE attempt_id=a.id AND blueprint_id=b.id) THEN RAISE EXCEPTION 'A02_OTHER_ACTIVE_SESSION'; END IF;
 RETURN public.resume_exam_attempt(a.id)||jsonb_build_object('mode',b.mode,'config_snapshot',(SELECT config_snapshot FROM public.a02_attempt_context WHERE attempt_id=a.id));
 END IF;
 PERFORM private.a02_validate_blueprint(b.id);
 FOR x IN SELECT value FROM jsonb_array_elements(b.topic_counts) LOOP
 expected:=(x->>'count')::integer;
 SELECT array_agg(c.version_id) INTO part FROM (SELECT e.version_id FROM private.a02_eligible(t.id) e WHERE e.topic_id=(x->>'topic_id')::uuid ORDER BY random() LIMIT expected) c;
 IF coalesce(cardinality(part),0)<>expected THEN RAISE EXCEPTION 'A02_INVENTORY_SHORTAGE' USING DETAIL='No attempt or trial debit persisted.'; END IF;
 selected:=selected||part;
 END LOOP;
 IF cardinality(selected)<>b.total_questions THEN RAISE EXCEPTION 'A02_DISTRIBUTION_MISMATCH'; END IF;
 -- Lock selected content against simultaneous editorial changes, then recheck eligibility.
 PERFORM 1 FROM public.questions q JOIN public.question_versions v ON v.question_id=q.id WHERE v.id=ANY(selected) ORDER BY q.id FOR SHARE OF q,v;
 IF (SELECT count(*) FROM private.a02_eligible(t.id) e WHERE e.version_id=ANY(selected))<>b.total_questions THEN RAISE EXCEPTION 'A02_INVENTORY_CHANGED' USING ERRCODE='40001'; END IF;
 UPDATE public.exam_attempts SET attempt_status='EXPIRED' WHERE user_id=uid AND grade=t.grade AND subject_name=t.subject_name AND attempt_status='IN_PROGRESS' AND started_at+duration_minutes*interval '1 minute'<=clock_timestamp();
 INSERT INTO public.exam_attempts(user_id,education_level,grade,subject_name,duration_minutes,total_questions) VALUES(uid,CASE t.grade WHEN 6 THEN 'SD' ELSE 'SMP' END,t.grade,t.subject_name,b.duration_minutes,b.total_questions) RETURNING * INTO a;
 INSERT INTO public.exam_attempt_questions(attempt_id,question_id,question_version_id,question_order)
 SELECT a.id,v.question_id,v.id,row_number() OVER(ORDER BY random())::integer FROM public.question_versions v WHERE v.id=ANY(selected);
 INSERT INTO public.a02_attempt_context(attempt_id,mode,blueprint_id,config_snapshot) VALUES(a.id,b.mode,b.id,jsonb_build_object('blueprint',to_jsonb(b)-'created_by','taxonomy',to_jsonb(t)));
 INSERT INTO public.a02_attempt_metadata(attempt_id,question_id,version_id,snapshot)
 SELECT a.id,v.question_id,v.id,c.snapshot FROM public.question_versions v JOIN public.a02_classifications c ON c.version_id=v.id WHERE v.id=ANY(selected);
 PERFORM private.a02_entitle(a.id,b.mode);
 result:=public.resume_exam_attempt(a.id);
 RETURN result||jsonb_build_object('mode',b.mode,'config_snapshot',(SELECT config_snapshot FROM public.a02_attempt_context WHERE attempt_id=a.id));
END $$;

-- Move old starts to private once; retain exact definitions and signatures. No exposed bypass.
DO $$ BEGIN
 IF to_regprocedure('private.a02_legacy_start(integer,text,integer,integer)') IS NULL THEN
 ALTER FUNCTION public.start_exam_attempt(integer,text,integer,integer) SET SCHEMA private;
 ALTER FUNCTION private.start_exam_attempt(integer,text,integer,integer) RENAME TO a02_legacy_start;
 END IF;
 IF to_regprocedure('private.a02_legacy_school_start(uuid)') IS NULL THEN
 ALTER FUNCTION public.start_school_assignment(uuid) SET SCHEMA private;
 ALTER FUNCTION private.start_school_assignment(uuid) RENAME TO a02_legacy_school_start;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.start_exam_attempt(p_grade integer,p_subject_name text,p_question_count integer DEFAULT 20,p_duration_minutes integer DEFAULT 60) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_actor(); result jsonb; aid uuid; enabled boolean;
BEGIN
 IF p_grade IS NULL OR p_grade NOT IN(6,9) OR p_subject_name IS NULL OR length(btrim(p_subject_name))=0 OR p_question_count IS NULL OR p_question_count NOT BETWEEN 1 AND 100 OR p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'A02_INVALID_START' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||':'||p_grade::text||':'||p_subject_name,0));
 SELECT id INTO aid FROM public.exam_attempts WHERE user_id=uid AND grade=p_grade AND subject_name=p_subject_name AND attempt_status='IN_PROGRESS' AND started_at+duration_minutes*interval '1 minute'>clock_timestamp() ORDER BY started_at DESC LIMIT 1;
 IF aid IS NOT NULL THEN RETURN public.resume_exam_attempt(aid); END IF;
 SELECT legacy_start_enforcement INTO enabled FROM public.a02_business_settings;
 IF enabled THEN
 -- UI must migrate to configured starts. Never create an unreviewed session under enforcement.
 RAISE EXCEPTION 'A02_CONFIGURED_START_REQUIRED';
 END IF;
 result:=private.a02_legacy_start(p_grade,p_subject_name,p_question_count,p_duration_minutes);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.start_school_assignment(p_assignment_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_actor(); a public.school_assignments%ROWTYPE; aid uuid; result jsonb; enabled boolean;
BEGIN
 SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'A02_ASSIGNMENT_NOT_FOUND'; END IF;
 SELECT attempt_id INTO aid FROM public.school_assignment_recipients WHERE assignment_id=a.id AND user_id=uid FOR UPDATE;
 SELECT legacy_start_enforcement INTO enabled FROM public.a02_business_settings;
 IF enabled AND aid IS NULL THEN
 IF NOT EXISTS(SELECT 1 FROM public.school_assignment_recipients WHERE assignment_id=a.id AND user_id=uid) OR NOT private.is_active_student_member(a.school_id,uid) THEN RAISE EXCEPTION 'A02_RECIPIENT_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.questions q JOIN public.question_versions v ON v.question_id=q.id JOIN public.school_assignment_questions sq ON sq.question_version_id=v.id WHERE sq.assignment_id=a.id ORDER BY q.id FOR SHARE OF q,v;
 IF (SELECT count(*) FROM public.school_assignment_questions sq JOIN private.a02_eligible() e ON e.question_id=sq.question_id AND e.version_id=sq.question_version_id WHERE sq.assignment_id=a.id)<>a.question_count THEN RAISE EXCEPTION 'A02_ASSIGNMENT_INELIGIBLE'; END IF;
 END IF;
 result:=private.a02_legacy_school_start(p_assignment_id);
 IF enabled AND aid IS NULL THEN
 aid:=(result->>'attempt_id')::uuid;
 PERFORM private.a02_entitle(aid,'school',a.school_id);
 INSERT INTO public.a02_attempt_context(attempt_id,mode,school_id,config_snapshot) VALUES(aid,'school',a.school_id,jsonb_build_object('assignment_id',a.id,'question_count',a.question_count,'duration_minutes',a.duration_minutes));
 INSERT INTO public.a02_attempt_metadata(attempt_id,question_id,version_id,snapshot) SELECT aid,sq.question_id,sq.question_version_id,c.snapshot FROM public.school_assignment_questions sq JOIN public.a02_classifications c ON c.version_id=sq.question_version_id WHERE sq.assignment_id=a.id;
 END IF;
 RETURN result;
END $$;

-- Existing review implementation is retained privately; public replacement augments only after its owner/submitted checks.
DO $$ BEGIN
 IF to_regprocedure('private.a02_legacy_review(uuid)') IS NULL THEN
 ALTER FUNCTION public.get_exam_attempt_review(uuid) SET SCHEMA private;
 ALTER FUNCTION private.get_exam_attempt_review(uuid) RENAME TO a02_legacy_review;
 END IF;
END $$;
-- Live review referenced a nonexistent category_options column; derive the same projection
-- from the canonical slash-separated labels instead of adding a second mutable source.
DO $$ DECLARE def text; BEGIN
 def:=pg_get_functiondef('private.a02_legacy_review(uuid)'::regprocedure);
 IF position('ci.category_options' IN def)>0 THEN
 EXECUTE replace(def,'ci.category_options', $patch$to_jsonb(regexp_split_to_array(ci.category_label,'\s*/\s*'))$patch$);
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_exam_attempt_review(p_attempt_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; qs jsonb;
BEGIN
 PERFORM private.a02_actor();
 result:=private.a02_legacy_review(p_attempt_id);
 SELECT coalesce(jsonb_agg(item||jsonb_build_object('question_version_id',aq.question_version_id,'classification',coalesce(m.snapshot,jsonb_build_object('provenance','legacy_unclassified','historical_classification_available',false))) ORDER BY aq.question_order),'[]'::jsonb)
 INTO qs FROM jsonb_array_elements(result->'questions') item JOIN public.exam_attempt_questions aq ON aq.attempt_id=p_attempt_id AND aq.question_id=(item->>'question_id')::uuid LEFT JOIN public.a02_attempt_metadata m ON m.attempt_id=aq.attempt_id AND m.question_id=aq.question_id;
 RETURN result||jsonb_build_object('questions',qs,'mode',coalesce((SELECT mode FROM public.a02_attempt_context WHERE attempt_id=p_attempt_id),'legacy'),'config_snapshot',(SELECT config_snapshot FROM public.a02_attempt_context WHERE attempt_id=p_attempt_id));
END $$;

CREATE OR REPLACE FUNCTION public.get_student_exam_history(p_limit integer DEFAULT 50,p_before timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_actor();
BEGIN
 RETURN (SELECT coalesce(jsonb_agg(x.data ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb) FROM (
 SELECT a.id,a.created_at,jsonb_build_object('attempt_id',a.id,'subject',a.subject_name,'grade',a.grade,'education_level',a.education_level,
 'status',a.attempt_status,'total_questions',a.total_questions,'correct_answers',a.correct_answers,
 'incorrect_or_unanswered',CASE WHEN a.attempt_status='SUBMITTED' THEN greatest(a.total_questions-coalesce(a.correct_answers,0),0) END,
 'score',a.score,'started_at',a.started_at,'submitted_at',a.submitted_at,'created_at',a.created_at,
 'mode',coalesce(c.mode,'legacy'),'config_snapshot',c.config_snapshot) data
 FROM public.exam_attempts a LEFT JOIN public.a02_attempt_context c ON c.attempt_id=a.id WHERE a.user_id=uid
 AND (p_before IS NULL OR a.created_at<p_before) ORDER BY a.created_at DESC,a.id DESC LIMIT least(greatest(coalesce(p_limit,50),1),100)) x);
END $$;

-- New strict import is additive. Existing TQBS/AI APIs are unchanged and never become eligible implicitly.
CREATE OR REPLACE FUNCTION public.a02_import(p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_super(); result jsonb; rowv record; qid uuid; vid uuid; cls jsonb; saved jsonb:='[]';
BEGIN
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR jsonb_typeof(p_payload->'questions') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_payload->'questions') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'A02_INVALID_IMPORT' USING ERRCODE='22023'; END IF;
 -- Legacy persistence is transactional; all rows are rolled back if any classification is invalid.
 result:=public.save_ai_question_draft_batch(p_payload);
 FOR rowv IN SELECT value,ordinality FROM jsonb_array_elements(p_payload->'questions') WITH ORDINALITY LOOP
 SELECT imported_record_id INTO qid FROM public.question_import_rows WHERE batch_id=(result->>'batch_id')::uuid AND source_row_number=rowv.ordinality;
 IF qid IS NULL THEN RAISE EXCEPTION 'A02_IMPORT_ROW_NOT_PERSISTED'; END IF;
 SELECT id INTO STRICT vid FROM public.question_versions WHERE question_id=qid AND version_number=1;
 UPDATE public.question_versions SET version_status='DRAFT',is_current=false WHERE id=vid;
 IF rowv.value->>'difficulty' IS NULL THEN RAISE EXCEPTION 'A02_IMPORT_DIFFICULTY_REQUIRED' USING ERRCODE='22023'; END IF;
 UPDATE public.questions SET difficulty=rowv.value->>'difficulty' WHERE id=qid;
 cls:=rowv.value->'classification';
 IF jsonb_typeof(cls) IS DISTINCT FROM 'object' OR jsonb_typeof(cls->'node_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'A02_IMPORT_CLASSIFICATION_REQUIRED' USING ERRCODE='22023'; END IF;
 PERFORM public.a02_classify(vid,0,(cls->>'taxonomy_id')::uuid,(cls->>'topic_id')::uuid,ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(cls->'node_ids')));
 saved:=saved||jsonb_build_array(jsonb_build_object('row',rowv.ordinality,'question_id',qid,'version_id',vid,'classification_revision',1,'status','DRAFT'));
 END LOOP;
 RETURN result||jsonb_build_object('rows',saved,'publication_status','DRAFT');
END $$;

-- School evaluation never exposes answer payloads, keys, auth.users, or a global school directory.
CREATE OR REPLACE FUNCTION public.a02_evaluation(p_school_id uuid,p_grade integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_actor(); own_only boolean; result jsonb;
BEGIN
 IF p_school_id IS NULL OR (p_grade IS NOT NULL AND p_grade NOT IN(6,9)) THEN RAISE EXCEPTION 'A02_INVALID_EVALUATION_SCOPE' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.schools WHERE id=p_school_id AND status='active') THEN RAISE EXCEPTION 'A02_SCHOOL_ACCESS_REQUIRED' USING ERRCODE='42501'; END IF;
 own_only:=NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school_id AND user_id=uid AND status='active' AND role IN('teacher','school_admin'));
 IF own_only AND NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school_id AND user_id=uid AND status='active' AND role='student') THEN RAISE EXCEPTION 'A02_SCHOOL_ACCESS_REQUIRED' USING ERRCODE='42501'; END IF;
 WITH scoped AS (
 SELECT a.*,aq.question_id,aq.question_version_id,q.question_type,ans.answer_payload,m.snapshot
 FROM public.exam_attempts a LEFT JOIN public.a02_attempt_context ctx ON ctx.attempt_id=a.id
 LEFT JOIN public.school_assignment_recipients sar ON sar.attempt_id=a.id AND sar.user_id=a.user_id
 LEFT JOIN public.school_assignments sa ON sa.id=sar.assignment_id
 JOIN public.exam_attempt_questions aq ON aq.attempt_id=a.id JOIN public.questions q ON q.id=aq.question_id
 JOIN public.exam_attempt_answers ans ON ans.attempt_id=a.id AND ans.question_id=aq.question_id
 LEFT JOIN public.a02_attempt_metadata m ON m.attempt_id=a.id AND m.question_id=aq.question_id AND m.version_id=aq.question_version_id
 WHERE coalesce(ctx.school_id,sa.school_id)=p_school_id AND a.attempt_status='SUBMITTED' AND a.submitted_at IS NOT NULL AND a.grade IN(6,9) AND (p_grade IS NULL OR a.grade=p_grade)
 AND (NOT own_only OR a.user_id=uid) AND ans.answered_at BETWEEN a.started_at AND least(a.submitted_at,a.started_at+a.duration_minutes*interval '1 minute')
 AND EXISTS(SELECT 1 FROM public.school_memberships sm JOIN public.profiles pr ON pr.id=sm.user_id WHERE sm.school_id=p_school_id AND sm.user_id=a.user_id AND sm.role='student' AND sm.status='active' AND pr.account_status='active')
 AND private.exam_answer_payload_is_valid(aq.question_version_id,q.question_type,ans.answer_payload)
 AND CASE WHEN q.question_type='PGK_MA' THEN jsonb_array_length(coalesce(ans.answer_payload->'option_codes','[]'))>0
 WHEN q.question_type='PGK_KATEGORI' THEN coalesce(ans.answer_payload->'category_answers','{}')<>'{}'::jsonb ELSE true END
 ), scored AS (
 SELECT *,private.exam_answer_is_correct(question_version_id,question_type,answer_payload)::integer correct FROM scoped
 ), topics AS (
 SELECT grade,subject_name,snapshot->'topic'->>'id' topic_id,coalesce(snapshot->'topic'->>'label','Legacy tanpa klasifikasi') topic_label,count(*) answered,sum(correct) correct
 FROM scored GROUP BY grade,subject_name,snapshot->'topic'->>'id',snapshot->'topic'->>'label'
 ), trends AS (
 SELECT date_trunc('week',submitted_at AT TIME ZONE 'UTC') week,grade,subject_name,count(*) answered,round(avg(correct)*100,2) accuracy FROM scored GROUP BY 1,2,3
 ), students AS (
 SELECT user_id,count(DISTINCT id) attempts,count(*) answered,round(avg(correct)*100,2) accuracy FROM scored GROUP BY user_id
 ), topfive AS (SELECT * FROM students ORDER BY accuracy DESC,answered DESC,user_id LIMIT 5)
 SELECT jsonb_build_object('school_id',p_school_id,'grade',p_grade,'scope',CASE WHEN own_only THEN 'self' ELSE 'school' END,
 'basis','valid_saved_answers_in_submitted_school_attempts','topics',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('accuracy',round(t.correct::numeric/nullif(t.answered,0)*100,2)) ORDER BY grade,subject_name,topic_label) FROM topics t),'[]'),
 'trends',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY week,grade,subject_name) FROM trends t),'[]'),
 'top5',CASE WHEN own_only THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY accuracy DESC,answered DESC,user_id) FROM topfive t),'[]') END,
 'top5_average',CASE WHEN NOT own_only THEN (SELECT round(avg(accuracy),2) FROM topfive) END,
 'students',CASE WHEN own_only THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('full_name',p.full_name) ORDER BY s.user_id) FROM students s JOIN public.profiles p ON p.id=s.user_id),'[]') END) INTO result;
 RETURN result;
END $$;

-- Immutable historical payloads: status/current flag transitions alone remain legal.
CREATE OR REPLACE FUNCTION private.a02_freeze() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE vid uuid; frozen boolean;
BEGIN
 IF TG_TABLE_NAME IN('a02_attempt_context','a02_attempt_metadata','a02_editorial_events','a02_subscription_audit') THEN RAISE EXCEPTION 'A02_AUDIT_IMMUTABLE'; END IF;
 IF TG_TABLE_NAME='question_versions' THEN
 vid:=OLD.id;
 frozen:=OLD.version_status NOT IN('DRAFT','NEEDS_REVISION') OR EXISTS(SELECT 1 FROM public.exam_attempt_questions WHERE question_version_id=vid) OR EXISTS(SELECT 1 FROM public.school_assignment_questions WHERE question_version_id=vid);
 IF TG_OP='DELETE' AND frozen THEN RAISE EXCEPTION 'A02_VERSION_FROZEN'; END IF;
 IF TG_OP='UPDATE' AND frozen AND (to_jsonb(NEW)-ARRAY['version_status','is_current']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version_status','is_current']) THEN RAISE EXCEPTION 'A02_VERSION_FROZEN'; END IF;
 IF TG_OP='UPDATE' AND OLD.version_status IN('PUBLISHED','SUPERSEDED') AND NEW.version_status NOT IN('PUBLISHED','SUPERSEDED') THEN RAISE EXCEPTION 'A02_VERSION_FROZEN'; END IF;
 ELSE
 IF TG_TABLE_NAME='a02_classifications' THEN
 IF TG_OP='INSERT' THEN vid:=NEW.version_id; ELSE vid:=OLD.version_id; END IF;
 ELSIF TG_OP='INSERT' THEN vid:=NEW.question_version_id; ELSE vid:=OLD.question_version_id; END IF;
 -- Legacy import/revision writes options after creating PENDING_REVIEW versions.
 -- Preserve those APIs, but never allow additions to approved/published/used payloads.
 SELECT CASE WHEN TG_OP='INSERT' AND TG_TABLE_NAME<>'a02_classifications' THEN version_status IN('APPROVED','PUBLISHED','SUPERSEDED') ELSE version_status NOT IN('DRAFT','NEEDS_REVISION') END
 INTO frozen FROM public.question_versions WHERE id=vid;
 IF frozen OR EXISTS(SELECT 1 FROM public.exam_attempt_questions WHERE question_version_id=vid) OR EXISTS(SELECT 1 FROM public.school_assignment_questions WHERE question_version_id=vid) THEN RAISE EXCEPTION 'A02_VERSION_FROZEN'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['question_versions','question_options','question_category_items','a02_classifications','a02_attempt_context','a02_attempt_metadata','a02_editorial_events','a02_subscription_audit'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS a02_freeze ON public.%I',t);
 EXECUTE format('CREATE TRIGGER a02_freeze BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.a02_freeze()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['question_options','question_category_items','a02_classifications'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS a02_freeze_insert ON public.%I',t);
 EXECUTE format('CREATE TRIGGER a02_freeze_insert BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION private.a02_freeze()',t);
 END LOOP;
END $$;

-- Protect shared question identity and stimulus payloads used by historical versions.
CREATE OR REPLACE FUNCTION private.a02_freeze_shared() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE frozen boolean;
BEGIN
 IF TG_TABLE_NAME='questions' THEN
 SELECT EXISTS(SELECT 1 FROM public.question_versions v WHERE v.question_id=OLD.id AND
 (v.version_status NOT IN('DRAFT','NEEDS_REVISION') OR EXISTS(SELECT 1 FROM public.exam_attempt_questions aq WHERE aq.question_version_id=v.id) OR EXISTS(SELECT 1 FROM public.school_assignment_questions sq WHERE sq.question_version_id=v.id))) INTO frozen;
 IF frozen AND (TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['question_status','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['question_status','updated_at'])) THEN RAISE EXCEPTION 'A02_SHARED_METADATA_FROZEN'; END IF;
 ELSE
 SELECT EXISTS(SELECT 1 FROM public.question_versions v WHERE v.stimulus_id=OLD.id AND
 (v.version_status NOT IN('DRAFT','NEEDS_REVISION') OR EXISTS(SELECT 1 FROM public.exam_attempt_questions aq WHERE aq.question_version_id=v.id) OR EXISTS(SELECT 1 FROM public.school_assignment_questions sq WHERE sq.question_version_id=v.id))) INTO frozen;
 IF frozen THEN RAISE EXCEPTION 'A02_STIMULUS_FROZEN'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DROP TRIGGER IF EXISTS a02_freeze_shared ON public.questions;
CREATE TRIGGER a02_freeze_shared BEFORE UPDATE OR DELETE ON public.questions FOR EACH ROW EXECUTE FUNCTION private.a02_freeze_shared();
DROP TRIGGER IF EXISTS a02_freeze_shared ON public.question_stimuli;
CREATE TRIGGER a02_freeze_shared BEFORE UPDATE OR DELETE ON public.question_stimuli FOR EACH ROW EXECUTE FUNCTION private.a02_freeze_shared();

-- Additive revision path creates a real editable draft instead of stranding legacy PENDING_REVIEW.
CREATE OR REPLACE FUNCTION public.a02_revision(p_question_id uuid,p_expected_version_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; latest uuid;
BEGIN
 PERFORM private.a02_actor('bank_soal.edit');
 PERFORM 1 FROM public.questions WHERE id=p_question_id FOR UPDATE;
 SELECT id INTO latest FROM public.question_versions WHERE question_id=p_question_id ORDER BY version_number DESC LIMIT 1;
 IF latest IS DISTINCT FROM p_expected_version_id OR latest IS NULL THEN RAISE EXCEPTION 'A02_STALE_VERSION' USING ERRCODE='40001'; END IF;
 result:=public.save_question_revision(p_question_id,p_payload);
 UPDATE public.question_versions SET version_status='DRAFT' WHERE id=(result->>'version_id')::uuid;
 RETURN result||jsonb_build_object('version_status','DRAFT','classification_revision',0);
END $$;
CREATE OR REPLACE FUNCTION public.a02_stimulus_review(p_version_id uuid,p_expected_status text,p_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=private.a02_actor('bank_soal.review'); st public.question_stimuli%ROWTYPE; v public.question_versions%ROWTYPE;
BEGIN
 PERFORM 1 FROM public.questions q JOIN public.question_versions qv ON qv.question_id=q.id WHERE qv.id=p_version_id FOR UPDATE OF q;
 SELECT * INTO v FROM public.question_versions WHERE id=p_version_id FOR UPDATE;
 IF NOT FOUND OR v.version_status NOT IN('DRAFT','NEEDS_REVISION') THEN RAISE EXCEPTION 'A02_VERSION_FROZEN'; END IF;
 SELECT * INTO st FROM public.question_stimuli WHERE id=v.stimulus_id FOR UPDATE;
 IF NOT FOUND OR st.stimulus_status IS DISTINCT FROM p_expected_status THEN RAISE EXCEPTION 'A02_STALE_STIMULUS' USING ERRCODE='40001'; END IF;
 IF st.created_by IS NULL OR st.created_by=uid OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 3 AND 4000 OR length(btrim(st.source_reference))=0 OR st.usage_rights NOT IN('ORISINAL','BERLISENSI','IZIN_TERTULIS','DOMAIN_PUBLIK') THEN RAISE EXCEPTION 'A02_INVALID_STIMULUS_REVIEW' USING ERRCODE='42501'; END IF;
 UPDATE public.question_stimuli SET stimulus_status='APPROVED' WHERE id=st.id;
 INSERT INTO public.question_reviews(question_id,question_version_id,reviewer_id,review_action,review_notes) VALUES(v.question_id,v.id,uid,'COMMENT','Stimulus approved: '||p_note);
 RETURN jsonb_build_object('stimulus_id',st.id,'status','APPROVED');
END $$;
CREATE OR REPLACE FUNCTION public.a02_question_metadata(p_version_id uuid,p_expected_revision integer,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v public.question_versions%ROWTYPE; rev integer; result jsonb;
BEGIN
 PERFORM private.a02_actor('bank_soal.edit');
 PERFORM 1 FROM public.questions q JOIN public.question_versions qv ON qv.question_id=q.id WHERE qv.id=p_version_id FOR UPDATE OF q;
 SELECT * INTO v FROM public.question_versions WHERE id=p_version_id FOR UPDATE;
 IF NOT FOUND OR v.version_status NOT IN('DRAFT','NEEDS_REVISION') THEN RAISE EXCEPTION 'A02_VERSION_FROZEN'; END IF;
 SELECT revision INTO rev FROM public.a02_classifications WHERE version_id=v.id;
 IF coalesce(rev,0) IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'A02_STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('source_reference','usage_rights','difficulty')) OR EXISTS(SELECT 1 FROM jsonb_each(p_data) e WHERE jsonb_typeof(e.value)<>'string' OR length(btrim(e.value#>>'{}'))=0) THEN RAISE EXCEPTION 'A02_INVALID_METADATA' USING ERRCODE='22023'; END IF;
 UPDATE public.questions SET source_reference=coalesce(p_data->>'source_reference',source_reference),usage_rights=coalesce(p_data->>'usage_rights',usage_rights),difficulty=coalesce(p_data->>'difficulty',difficulty) WHERE id=v.question_id RETURNING to_jsonb(questions.*) INTO result;
 -- Never reset a revision token (ABA). Require classification before metadata editing,
 -- retain its provenance, and invalidate it until explicit reclassification.
 IF rev IS NULL THEN RAISE EXCEPTION 'A02_CLASSIFICATION_REQUIRED'; END IF;
 UPDATE public.a02_classifications SET snapshot=snapshot||'{"invalidated":true}'::jsonb,
 revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE version_id=v.id;
 RETURN jsonb_build_object('version_id',v.id,'classification_revision',rev+1,'question',result);
END $$;
CREATE OR REPLACE FUNCTION public.a02_editorial_context(p_version_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM private.a02_actor('bank_soal.view');
 IF NOT EXISTS(SELECT 1 FROM public.question_versions WHERE id=p_version_id) THEN RAISE EXCEPTION 'A02_VERSION_NOT_FOUND'; END IF;
 RETURN jsonb_build_object('version_id',p_version_id,'classification',(SELECT to_jsonb(c) FROM public.a02_classifications c WHERE version_id=p_version_id),
 'metadata_valid',private.a02_metadata_valid(p_version_id),'eligible',EXISTS(SELECT 1 FROM private.a02_eligible() WHERE version_id=p_version_id),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY created_at,id) FROM public.a02_editorial_events e WHERE version_id=p_version_id),'[]'));
END $$;
CREATE OR REPLACE FUNCTION public.a02_registry_workspace() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM private.a02_super();
 RETURN jsonb_build_object('sources',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY code) FROM public.a02_sources s),'[]'),
 'taxonomies',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY code) FROM public.a02_taxonomy_versions t),'[]'),
 'nodes',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY taxonomy_id,dimension,code) FROM public.a02_taxonomy_nodes n),'[]'),
 'blueprints',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY code,version) FROM public.a02_blueprints b),'[]'),
 'subscriptions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY updated_at DESC) FROM public.a02_subscriptions s),'[]'),
 'subscription_requests',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY created_at DESC) FROM public.a02_subscription_requests r),'[]'));
END $$;
-- Verified framework headings only; draft registries intentionally lack guessed indicators/counts.
INSERT INTO public.a02_taxonomy_versions(code,grade,subject_name,source_code,pdf_pages,status)
VALUES('BSKAP047-SD-BI-v1',6,'Bahasa Indonesia','BSKAP-047-2025','8-10','draft'),
('BSKAP047-SMP-BI-v1',9,'Bahasa Indonesia','BSKAP-047-2025','15-17','draft'),
('BSKAP047-SD-MAT-v1',6,'Matematika','BSKAP-047-2025','13-15','draft'),
('BSKAP047-SMP-MAT-v1',9,'Matematika','BSKAP-047-2025','20-25','draft') ON CONFLICT(code) DO NOTHING;
INSERT INTO public.a02_taxonomy_nodes(taxonomy_id,code,dimension,label,pdf_pages)
SELECT t.id,x.code,x.dimension,x.label,t.pdf_pages FROM public.a02_taxonomy_versions t CROSS JOIN (VALUES
('tekstual','reading_competency','Pemahaman Tekstual'),('inferensial','reading_competency','Pemahaman Inferensial'),
('evaluasi-apresiasi','reading_competency','Evaluasi dan Apresiasi'),('informasi','text_type','Teks Informasi'),('fiksi','text_type','Teks Fiksi')) x(code,dimension,label)
WHERE t.code IN('BSKAP047-SD-BI-v1','BSKAP047-SMP-BI-v1') ON CONFLICT(taxonomy_id,code) DO NOTHING;
INSERT INTO public.a02_taxonomy_nodes(taxonomy_id,code,dimension,label,pdf_pages)
SELECT t.id,x.code,'math_domain',x.label,t.pdf_pages FROM public.a02_taxonomy_versions t CROSS JOIN (VALUES
('bilangan','Bilangan'),('geometri-pengukuran','Geometri dan Pengukuran'),('data','Data'),('aljabar','Aljabar'),('geometri','Geometri'),('pengukuran','Pengukuran'),('data-peluang','Data dan Peluang')) x(code,label)
WHERE (t.code='BSKAP047-SD-MAT-v1' AND x.code IN('bilangan','geometri-pengukuran','data')) OR
(t.code='BSKAP047-SMP-MAT-v1' AND x.code IN('bilangan','aljabar','geometri-pengukuran','data-peluang')) ON CONFLICT(taxonomy_id,code) DO NOTHING;

-- Do not inherit Supabase default table/function grants. No client table policies are necessary:
-- all access is through the scoped RPCs above, with database owner bypass inside definers.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'a02\_%' ESCAPE '\' LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.relname);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',r.relname);
 END LOOP;
 FOR r IN SELECT p.oid::regprocedure signature,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname IN('public','private') AND p.proname LIKE 'a02\_%' ESCAPE '\') OR (n.nspname='private' AND p.proname='handle_new_user') OR (n.nspname='public' AND p.proname IN('start_exam_attempt','start_school_assignment','get_exam_attempt_review','get_student_exam_history')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
 IF r.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.signature); END IF;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.a02_business_config(jsonb,integer) TO anon;
-- Existing profile policies may grant legacy field writes; contact and consent must be RPC-only.
REVOKE UPDATE(whatsapp_number,whatsapp_consent_at) ON public.profiles FROM PUBLIC,anon,authenticated;
