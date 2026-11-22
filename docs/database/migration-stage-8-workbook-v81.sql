BEGIN;
-- Stage 7 is required; reuse existing tables and public import RPC.
-- Unknown rights are NULL, never silently ORISINAL. CHECK constraints already allow NULL.
ALTER TABLE public.questions ALTER COLUMN usage_rights DROP NOT NULL;
ALTER TABLE public.question_stimuli ALTER COLUMN usage_rights DROP NOT NULL;

CREATE OR REPLACE FUNCTION private.save_v81_import_batch(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='120s' AS $f$
DECLARE
 u uuid:=private.school_actor(); b uuid:=gen_random_uuid(); bc text;
 rows jsonb:=p_payload->'questions'; r jsonb; o jsonb; q public.questions%ROWTYPE;
 v uuid; s uuid; vn integer; fingerprint text; desired text; code text;
 imported integer:=0; updated integer:=0; skipped integer:=0; existing_ids jsonb;
 mode text:=p_payload->>'mode'; preview boolean:=coalesce((p_payload->>'preview')::boolean,false);
 sheet text; expected integer; actual integer; keys integer; total integer; row_label text;
BEGIN
 IF u IS NULL OR NOT private.has_admin_permission('bank_soal.import') THEN
  RAISE EXCEPTION 'Izin bank_soal.import diperlukan.' USING ERRCODE='42501';
 END IF;
 IF mode IS NULL OR mode NOT IN ('skip','upsert') OR jsonb_typeof(rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Payload/mode v8.1 tidak valid.'; END IF;
 IF jsonb_array_length(rows)<>474 OR octet_length(p_payload::text)>10485760 THEN RAISE EXCEPTION 'Workbook harus berisi tepat 474 soal dan payload maksimal 10 MB.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) x GROUP BY x->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'ID duplikat dalam workbook.'; END IF;
 FOR sheet,expected IN SELECT * FROM (VALUES('SD_Bahasa_Indonesia',100),('SD_Matematika',136),('SMP_Bahasa_Indonesia',100),('SMP_Matematika',138)) x(n,c) LOOP
  SELECT count(*) INTO actual FROM jsonb_array_elements(rows) x WHERE x->>'sheet'=sheet;
  IF actual<>expected THEN RAISE EXCEPTION 'Sheet %: diharapkan %, ditemukan %.',sheet,expected,actual; END IF;
 END LOOP;
 -- Validate all rows server-side, including the preview request. Never trust client counts.
 FOR r IN SELECT value FROM jsonb_array_elements(rows) LOOP
  row_label:=format('%s baris %s [%s]',r->>'sheet',r->>'rowNumber',r->>'id');
  IF nullif(btrim(r->>'id'),'') IS NULL OR length(r->>'id')>200 OR (r->>'rowNumber')::integer<2
   OR nullif(btrim(r->>'question_text'),'') IS NULL OR nullif(btrim(r->>'material'),'') IS NULL OR nullif(btrim(r->>'sub_material'),'') IS NULL
   OR jsonb_typeof(r->'raw') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(r->'raw'))<24
   OR (r->'raw'->>'ID Soal') IS DISTINCT FROM (r->>'id')
   OR (r->'raw'->>'Pertanyaan') IS DISTINCT FROM (r->>'question_text')
   OR (r->'raw'->>'Tema / Cakupan') IS DISTINCT FROM (r->>'material')
   OR (r->'raw'->>'Topik / Submateri') IS DISTINCT FROM (r->>'sub_material')
   OR (r->>'level') IS DISTINCT FROM (CASE WHEN r->>'sheet' LIKE 'SD_%' THEN 'sd' ELSE 'smp' END)
   OR (r->>'grade')::integer IS DISTINCT FROM (CASE WHEN r->>'level'='sd' THEN 6 ELSE 9 END)
   OR (r->>'subject') IS DISTINCT FROM (CASE WHEN r->>'sheet' LIKE '%Bahasa_Indonesia' THEN 'Bahasa Indonesia' ELSE 'Matematika' END)
   OR (r->>'difficulty') IS NULL OR r->>'difficulty' NOT IN ('MUDAH','SEDANG','SULIT')
   OR (r->>'type') IS NULL OR r->>'type' NOT IN ('PG_TUNGGAL','PGK_MA','PGK_KATEGORI')
   OR (r->>'source_status') IS NULL OR r->>'source_status' NOT IN ('KANDIDAT INTERNAL — REVIEW GURU WAJIB','REKONSTRUKSI WAJIB — BELUM SIAP DIGUNAKAN')
   OR (r->'raw'->>'Status') IS DISTINCT FROM (r->>'source_status')
   OR jsonb_typeof(r->'options') IS DISTINCT FROM 'array' OR jsonb_typeof(r->'category_items') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION '%: identitas, metadata, status atau struktur tidak valid.',row_label; END IF;
  IF r->>'type' IN ('PG_TUNGGAL','PGK_MA') THEN
   SELECT count(*), count(*) FILTER(WHERE (x->>'is_correct')::boolean) INTO total,keys FROM jsonb_array_elements(r->'options') x;
   IF total<2 OR keys<1 OR (r->>'type'='PG_TUNGGAL' AND keys<>1) OR jsonb_array_length(r->'category_items')<>0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(r->'options') x WHERE coalesce(x->>'option_code','')!~'^[A-Z]$' OR nullif(btrim(x->>'option_text'),'') IS NULL OR jsonb_typeof(x->'is_correct') IS DISTINCT FROM 'boolean')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(r->'options') x GROUP BY x->>'option_code' HAVING count(*)>1)
   THEN RAISE EXCEPTION '%: opsi/kunci PG tidak valid.',row_label; END IF;
  ELSE
   IF jsonb_array_length(r->'category_items')<2 OR jsonb_array_length(r->'options')<>0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(r->'category_items') x WHERE nullif(btrim(x->>'item_text'),'') IS NULL OR x->>'category_label' IS DISTINCT FROM 'Benar/Salah' OR coalesce(x->>'correct_category','') NOT IN ('Benar','Salah') OR (x->>'item_number')::integer<1 OR x->>'item_number' IS NULL)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(r->'category_items') x GROUP BY x->>'item_number' HAVING count(*)>1)
   THEN RAISE EXCEPTION '%: pernyataan/kategori tidak valid.',row_label; END IF;
  END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(existing.question_code ORDER BY existing.question_code),'[]'::jsonb) INTO existing_ids
 FROM public.questions existing JOIN jsonb_array_elements(rows) x ON existing.question_code=x->>'id';
 IF preview THEN RETURN jsonb_build_object('success',true,'preview',true,'existing_ids',existing_ids,'existing_count',jsonb_array_length(existing_ids),'new_count',474-jsonb_array_length(existing_ids)); END IF;
 -- Same locks/order for all v8.1 batches, including IDs not yet present.
 FOR code IN SELECT x->>'id' FROM jsonb_array_elements(rows) x ORDER BY x->>'id' LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('v81:'||code,0));
 END LOOP;
 bc:='IMP-V81-'||replace(b::text,'-','');
 INSERT INTO public.question_import_batches(id,batch_code,file_name,source_type,total_rows,valid_rows,error_rows,imported_rows,batch_status,notes,created_by,template_version,started_at)
 VALUES(b,bc,coalesce(nullif(p_payload->>'fileName',''),'workbook-v8.1.xlsx'),'IMPORT',474,474,0,0,'PROCESSING','v8.1; mode='||mode||'; hak penggunaan belum diverifikasi; versi impor nonaktif.',u,'TRYOUT_V8_1',now());
 FOR r IN SELECT value FROM jsonb_array_elements(rows) ORDER BY value->>'id' LOOP
  SELECT * INTO q FROM public.questions WHERE question_code=r->>'id' FOR UPDATE;
  fingerprint:=md5(r::text);
  IF q.id IS NOT NULL AND (mode='skip' OR EXISTS(SELECT 1 FROM public.question_versions WHERE question_id=q.id AND scoring_rule->>'v81_fingerprint'=fingerprint ORDER BY version_number DESC LIMIT 1)) THEN
   skipped:=skipped+1;
   INSERT INTO public.question_import_rows(batch_id,sheet_name,source_row_number,source_key,raw_data,normalized_data,validation_status,imported_record_id)
   VALUES(b,'SOAL',skipped+imported+updated,r->>'id',r->'raw',r,'SKIPPED',q.id);
   CONTINUE;
  END IF;
  IF q.id IS NOT NULL AND (q.question_type IS DISTINCT FROM r->>'type' OR q.education_level_id IS DISTINCT FROM r->>'level' OR q.subject_name IS DISTINCT FROM r->>'subject' OR q.question_status='ARCHIVED') THEN
   RAISE EXCEPTION '% baris % [%]: ID sudah ada dengan tipe/jenjang/mapel berbeda atau diarsipkan; gunakan mode lewati.',r->>'sheet',r->>'rowNumber',r->>'id';
  END IF;
  desired:=CASE WHEN r->>'source_status'='REKONSTRUKSI WAJIB — BELUM SIAP DIGUNAKAN' THEN 'NEEDS_REVISION' ELSE 'PENDING_REVIEW' END;
  IF q.id IS NULL THEN
   INSERT INTO public.questions(question_code,education_level_id,grade,school_type,subject_name,subject_category,material,sub_material,competency,indicator,element,difficulty,question_structure,question_type,question_status,import_batch_id,source_type,source_reference,usage_rights,created_by)
   VALUES(r->>'id',r->>'level',(r->>'grade')::smallint,CASE WHEN r->>'level'='sd' THEN 'SD/MI' ELSE 'SMP/MTs' END,r->>'subject','WAJIB',r->>'material',r->>'sub_material',r->>'competency',r->>'indicator',r->>'element',r->>'difficulty',CASE WHEN nullif(r->>'stimulus','') IS NULL THEN 'SOAL_TUNGGAL' ELSE 'SOAL_GRUP' END,r->>'type',desired,b,'IMPORT',r->'raw'->>'Sumber Bank',NULL,u) RETURNING * INTO q;
   imported:=imported+1;
  ELSE
   updated:=updated+1;
   -- Parent metadata of a published question belongs to the active version until publication.
   IF q.question_status<>'PUBLISHED' THEN
    UPDATE public.questions SET material=r->>'material',sub_material=r->>'sub_material',competency=r->>'competency',indicator=r->>'indicator',element=r->>'element',difficulty=r->>'difficulty',question_status=desired WHERE id=q.id;
   END IF;
  END IF;
  SELECT coalesce(max(version_number),0)+1 INTO vn FROM public.question_versions WHERE question_id=q.id;
  s:=NULL;
  IF nullif(r->>'stimulus','') IS NOT NULL THEN
   -- Immutable stimulus per content and source ID; do not mutate stimuli used by old snapshots.
   code:='V81-'||md5(coalesce(r->'raw'->>'ID Stimulus','')||'|'||(r->>'stimulus'));
   INSERT INTO public.question_stimuli(stimulus_code,stimulus_type,title,content_text,source_reference,usage_rights,stimulus_status,created_by)
   VALUES(code,CASE WHEN r->'raw'->>'Jenis Stimulus'='Tabel' THEN 'TABEL' ELSE 'TEKS' END,nullif(r->'raw'->>'ID Stimulus',''),r->>'stimulus',r->'raw'->>'Sumber Bank',NULL,'DRAFT',u)
   ON CONFLICT(stimulus_code) DO NOTHING;
   SELECT id INTO s FROM public.question_stimuli WHERE stimulus_code=code;
  END IF;
  INSERT INTO public.question_versions(question_id,version_number,stimulus_id,question_text,explanation,scoring_rule,content_hash,version_status,is_current,created_by)
  VALUES(q.id,vn,s,r->>'question_text',r->>'explanation',jsonb_build_object('type',r->>'type','v81_fingerprint',fingerprint,'v81_import_version',vn,'source_metadata',r-'options'-'category_items','needs_reconstruction',desired='NEEDS_REVISION'),fingerprint,desired,false,u) RETURNING id INTO v;
  FOR o IN SELECT value FROM jsonb_array_elements(r->'options') LOOP
   INSERT INTO public.question_options(question_version_id,option_code,option_text,option_order,is_correct)
   VALUES(v,o->>'option_code',o->>'option_text',(o->>'option_order')::integer,(o->>'is_correct')::boolean);
  END LOOP;
  FOR o IN SELECT value FROM jsonb_array_elements(r->'category_items') LOOP
   INSERT INTO public.question_category_items(question_version_id,item_number,item_text,category_label,correct_category)
   VALUES(v,(o->>'item_number')::integer,o->>'item_text',o->>'category_label',o->>'correct_category');
  END LOOP;
  INSERT INTO public.question_import_rows(batch_id,sheet_name,source_row_number,source_key,raw_data,normalized_data,validation_status,imported_record_id)
  VALUES(b,'SOAL',skipped+imported+updated,r->>'id',r->'raw',r,'IMPORTED',q.id);
 END LOOP;
 UPDATE public.question_import_batches SET batch_status='COMPLETED',imported_rows=imported+updated,completed_at=now(),notes=notes||format(' baru=%s revisi=%s lewati=%s gagal=0',imported,updated,skipped) WHERE id=b;
 RETURN jsonb_build_object('success',true,'batch_id',b,'batch_code',bc,'questions_imported',imported,'questions_updated',updated,'questions_skipped',skipped,'questions_failed',0,'publication_status','NONACTIVE');
END $f$;
REVOKE ALL ON FUNCTION private.save_v81_import_batch(jsonb) FROM PUBLIC,anon,authenticated;

-- Extend, rather than replace/rename, the existing public entrypoint; legacy body stays intact.
DO $patch$
DECLARE original text; patched text;
BEGIN
 SELECT pg_get_functiondef('public.save_question_import_batch(jsonb)'::regprocedure) INTO original;
 IF strpos(original,'private.save_v81_import_batch')=0 THEN
  patched:=regexp_replace(original,'BEGIN','BEGIN' || E'\n  IF p_payload->>''format''=''TRYOUT_V8_1'' THEN RETURN private.save_v81_import_batch(p_payload); END IF;');
  IF patched=original THEN RAISE EXCEPTION 'Import dispatcher patch failed'; END IF;
  EXECUTE patched;
 END IF;
 SELECT pg_get_functiondef('public.review_question_version(uuid,uuid,text,text)'::regprocedure) INTO original;
 IF strpos(original,'Hak penggunaan belum diverifikasi')=0 THEN
  patched:=replace(original,'IF p_action=''PUBLISH'' THEN',E'IF p_action=''PUBLISH'' THEN\n   IF q.usage_rights IS NULL THEN RAISE EXCEPTION ''Hak penggunaan belum diverifikasi.''; END IF;\n   IF coalesce((v.scoring_rule->>''needs_reconstruction'')::boolean,false) AND v.version_number<=coalesce((v.scoring_rule->>''v81_import_version'')::integer,0) THEN RAISE EXCEPTION ''Soal rekonstruksi wajib direvisi sebelum diterbitkan.''; END IF;');
  IF patched=original THEN RAISE EXCEPTION 'Publication guard patch failed'; END IF;
  EXECUTE patched;
 END IF;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
