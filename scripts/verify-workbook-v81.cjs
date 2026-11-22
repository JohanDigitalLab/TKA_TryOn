'use strict';
// Default rollback. --apply requires explicit project confirmation and archives legacy questions
// atomically with the original workbook import. Never deletes student history.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseEnv } = require('node:util');
const { pathToFileURL } = require('node:url');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const env = p => fs.existsSync(path.join(root, p)) ? parseEnv(read(p)) : {};
(async () => {
 let client;
 try {
  assert(process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === '--apply'), 'Provide workbook path and optional --apply');
  const apply = process.argv.includes('--apply');
  const { readSpreadsheet } = await import(pathToFileURL(path.join(root, 'src/lib/import/spreadsheet.js')));
  const { parseV81Workbook } = await import(pathToFileURL(path.join(root, 'src/lib/import/v81.js')));
  const parsed = parseV81Workbook(readSpreadsheet(fs.readFileSync(process.argv[2])), path.basename(process.argv[2]));
  assert.equal(parsed.questionCount,474); assert.equal(parsed.counts.ERROR,0,JSON.stringify(parsed.issues));
  const db={...env('.env.database.local'),...process.env};
  const app={...env('.env.local'),...process.env};
  const url=new URL(app.NEXT_PUBLIC_SUPABASE_URL);
  const ref=url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  assert(url.protocol==='https:' && ref);
  assert(db.DB_HOST===`db.${ref}.supabase.co` || (db.DB_HOST.endsWith('.pooler.supabase.com') && db.DB_USER.endsWith(`.${ref}`)), 'Project mismatch');
  if(db.DB_EXPECTED_PROJECT_REF) assert.equal(db.DB_EXPECTED_PROJECT_REF,ref);
  if(apply) assert.equal(db.WORKBOOK_V81_APPLY_PROJECT_REF,ref,'Explicit project confirmation required');
  client=new Client({host:db.DB_HOST,port:Number(db.DB_PORT||5432),database:db.DB_NAME,user:db.DB_USER,password:db.DB_PASSWORD,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.resolve(root,db.DB_SSL_CA_PATH),'utf8')},connectionTimeoutMillis:15000});
  client.on('notice',()=>{}); await client.connect(); assert.equal(client.connection.stream.authorized,true);
  await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'");
  const baseline=(await client.query('SELECT count(*)::int n FROM public.questions')).rows[0].n;
  for(const migration of ['docs/database/migration-stage-7-operator-questions.sql','docs/database/migration-stage-8-workbook-v81.sql']) {
   const sql=read(migration).replace(/^BEGIN;\s*|^COMMIT;\s*$/gm,'');
   await client.query(sql); await client.query(sql);
  }
  await client.query('SAVEPOINT legacy_operator_tests');
  await client.query(read('tests/database/operator-questions.sql'));
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  await client.query('ROLLBACK TO SAVEPOINT legacy_operator_tests');
  const ids=parsed.questions.map(q=>q.id);
  const existing=(await client.query('SELECT question_code,question_type,education_level_id,subject_name,question_status FROM public.questions WHERE question_code=ANY($1::text[])',[ids])).rows;
  console.log(JSON.stringify({phase:'baseline',existingWorkbookIDs:existing.length,existingTypes:existing.reduce((a,q)=>(a[q.question_type]=(a[q.question_type]||0)+1,a),{})}));
  // User-authorized legacy archive; IDs/versions/answers remain unchanged.
  assert(existing.length === 200 || existing.length === 0, 'Unexpected number of overlapping IDs');
  const historyBefore=(await client.query(`SELECT (SELECT count(*) FROM public.exam_attempt_questions)::int items,(SELECT count(*) FROM public.exam_attempt_answers)::int answers`)).rows[0];
  if(existing.length === 200) {
   await client.query('SELECT id FROM public.questions WHERE question_code=ANY($1::text[]) ORDER BY id FOR UPDATE',[ids]);
   if(apply) {
    const backup={createdAt:new Date().toISOString(),projectRef:ref,questions:(await client.query('SELECT * FROM public.questions WHERE question_code=ANY($1::text[])',[ids])).rows};
    const qids=backup.questions.map(q=>q.id);
    backup.versions=(await client.query('SELECT * FROM public.question_versions WHERE question_id=ANY($1::uuid[])',[qids])).rows;
    backup.questionImportRows=(await client.query('SELECT * FROM public.question_import_rows WHERE imported_record_id=ANY($1::uuid[])',[qids])).rows;
    fs.mkdirSync(path.join(root,'.local/database'),{recursive:true});
    const file=path.join(root,`.local/database/v81-legacy-archive-backup-${Date.now()}.json`);
    fs.writeFileSync(file,JSON.stringify(backup,null,2),{flag:'wx',mode:0o600});
    assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).questions.length,200);
   }
   const archived=await client.query(`UPDATE public.questions SET question_code='LEGACY-V81-'||id::text||'-'||question_code,question_status='ARCHIVED' WHERE question_code=ANY($1::text[])`,[ids]);
   assert.equal(archived.rowCount,200);
  }
  // Exercise real identifiers/content against the DB; apply only after the verification succeeds.
  await client.query('SAVEPOINT workbook_import_tests');
  const user=(await client.query('SELECT gen_random_uuid() id')).rows[0].id;
  await client.query(`INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,now(),'{"full_name":"Workbook verifier","registration_method":"independent","education_level":"sd"}')`,[user,`${user}@workbook.invalid`]);
  await client.query('INSERT INTO public.admin_operator_accounts(user_id,is_active) VALUES($1,true)',[user]);
  await client.query("INSERT INTO public.admin_operator_permissions(user_id,permission_code) VALUES($1,'bank_soal.import')",[user]);
  const payload={format:'TRYOUT_V8_1',fileName:parsed.fileName,questions:parsed.questions,mode:'upsert'};
  const call=async p=>{
   await client.query('SET LOCAL ROLE authenticated');
   await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
   const result = (await client.query('SELECT public.save_question_import_batch($1::jsonb) result',[JSON.stringify(p)])).rows[0].result;
   await client.query('RESET ROLE');
   return result;
  };
  const preview=await call({...payload,preview:true}); assert.equal(preview.existing_count,0);
  const first=await call(payload); assert.equal(first.questions_imported+first.questions_updated,474);
  const stored=(await client.query(`SELECT q.question_code,q.material,q.sub_material,v.version_status,v.is_current,v.scoring_rule,s.content_text,
   (SELECT count(*)::int FROM public.question_options WHERE question_version_id=v.id) options,
   (SELECT count(*)::int FROM public.question_category_items WHERE question_version_id=v.id) categories
   FROM public.questions q JOIN LATERAL(SELECT * FROM public.question_versions WHERE question_id=q.id ORDER BY version_number DESC LIMIT 1) v ON true
   LEFT JOIN public.question_stimuli s ON s.id=v.stimulus_id WHERE q.question_code=ANY($1::text[])`,[ids])).rows;
  assert.equal(stored.length,474);
  for(const q of parsed.questions){
   const row=stored.find(r=>r.question_code===q.id);
   assert.equal(row.is_current,false); assert.equal(row.version_status,q.needs_reconstruction?'NEEDS_REVISION':'PENDING_REVIEW');
   assert.deepEqual(row.scoring_rule.source_metadata.raw,JSON.parse(JSON.stringify(q.raw)));
   assert.equal(row.scoring_rule.source_metadata.material,q.material); assert.equal(row.scoring_rule.source_metadata.sub_material,q.sub_material);
   assert.equal(row.options,q.options.length); assert.equal(row.categories,q.category_items.length);
   if(q.stimulus) assert.equal(row.content_text,q.stimulus);
  }
  const optionValues=(await client.query(`SELECT q.question_code,o.option_code,o.option_text,o.is_correct FROM public.questions q JOIN public.question_versions v ON v.question_id=q.id JOIN public.question_options o ON o.question_version_id=v.id WHERE v.scoring_rule->>'v81_fingerprint' IS NOT NULL AND q.question_code=ANY($1::text[])`,[ids])).rows;
  const categoryValues=(await client.query(`SELECT q.question_code,c.item_number,c.item_text,c.correct_category FROM public.questions q JOIN public.question_versions v ON v.question_id=q.id JOIN public.question_category_items c ON c.question_version_id=v.id WHERE v.scoring_rule->>'v81_fingerprint' IS NOT NULL AND q.question_code=ANY($1::text[])`,[ids])).rows;
  for(const q of parsed.questions){
   for(const o of q.options) assert(optionValues.some(x=>x.question_code===q.id && x.option_code===o.option_code && x.option_text===o.option_text && x.is_correct===o.is_correct));
   for(const c of q.category_items) assert(categoryValues.some(x=>x.question_code===q.id && x.item_number===c.item_number && x.item_text===c.item_text && x.correct_category===c.correct_category));
  }
  const versionsBefore=(await client.query('SELECT count(*)::int n FROM public.question_versions')).rows[0].n;
  const second=await call(payload); assert.equal(second.questions_skipped,474); assert.equal(second.questions_imported+second.questions_updated,0);
  const skip=await call({...payload,mode:'skip'}); assert.equal(skip.questions_skipped,474);
  assert.equal((await client.query('SELECT count(*)::int n FROM public.question_versions')).rows[0].n,versionsBefore);
  const changed=structuredClone(payload); changed.questions[0].question_text+=' (revisi verifikasi)'; changed.questions[0].raw.Pertanyaan=changed.questions[0].question_text;
  const revision=await call(changed); assert.equal(revision.questions_updated,1); assert.equal(revision.questions_skipped,473);
  await client.query('SAVEPOINT invalid_payload');
  const invalid=structuredClone(payload); invalid.questions[0].options.forEach(o=>o.is_correct=false);
  await assert.rejects(()=>call(invalid),/opsi\/kunci PG/);
  await client.query('ROLLBACK TO SAVEPOINT invalid_payload');
  await client.query('SAVEPOINT denied_actor');
  await client.query('UPDATE public.admin_operator_accounts SET is_active=false WHERE user_id=$1',[user]);
  await assert.rejects(()=>call(payload),/Izin|aktif|Akses/);
  await client.query('ROLLBACK TO SAVEPOINT denied_actor');
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  const historyAfter=(await client.query(`SELECT (SELECT count(*) FROM public.exam_attempt_questions)::int items,(SELECT count(*) FROM public.exam_attempt_answers)::int answers`)).rows[0];
  assert.deepEqual(historyAfter,historyBefore);
  // Verification mutations (changed revision, inactive fixture actor) must not survive apply.
  // All test imports/user were made inside this savepoint; keep only the final clean import.
  await client.query('ROLLBACK TO SAVEPOINT workbook_import_tests');
  const actor=(await client.query("SELECT r.user_id FROM public.user_global_roles r JOIN auth.users a ON a.id=r.user_id JOIN public.profiles p ON p.id=r.user_id WHERE r.role='super_admin' AND a.email_confirmed_at IS NOT NULL AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until<now()) AND p.account_status='active' ORDER BY r.user_id LIMIT 1")).rows[0]?.user_id;
  let finalImport=null;
  if(apply) {
   assert(actor,'Active verified superadmin required for the final import audit');
   await client.query('SET LOCAL ROLE authenticated');
   await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);
   finalImport=(await client.query('SELECT public.save_question_import_batch($1::jsonb) result',[JSON.stringify({...payload,mode:'skip'})])).rows[0].result;
   await client.query('RESET ROLE');
   assert.equal(finalImport.questions_imported,474);
   await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  }
  await client.query(apply?'COMMIT':'ROLLBACK');
  if(!apply) assert.equal((await client.query('SELECT count(*)::int n FROM public.questions')).rows[0].n,baseline);
  console.log(JSON.stringify({verified:true,committed:apply,tlsVerified:true,idempotentMigration:true,originalWorkbook:true,sheets:parsed.totalSheets,recognized:parsed.recognizedSheets.length,ignored:parsed.ignoredSheets.length,questionsStored:stored.length,firstImport:first,identicalUpsertSkipped:second.questions_skipped,skipModeSkipped:skip.questions_skipped,changedUpsert:revision.questions_updated,metadataAndKeysVerified:true,legacyOperatorTests:true,studentHistoryPreserved:true,archivedLegacy:existing.length,finalImport,baselineRestored:!apply}));
 } catch(e) {
  if(client) await client.query('ROLLBACK').catch(()=>{});
  console.error(JSON.stringify({verified:false,committed:false,code:e.code||e.name,message:e.message,where:e.where?.replace(/SQL statement[\s\S]*/,''),position:e.position})); process.exitCode=1;
 } finally {if(client) await client.end();}
})();
