'use strict';
// Default read-only audit. --apply deletes only the exact 200 overlapping workbook IDs,
// after backup and only if no exam/assignment references exist. No CASCADE.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {parseEnv}=require('node:util');
const {pathToFileURL}=require('node:url');
const {Client}=require('pg');
const root=path.resolve(__dirname,'..');
const env=p=>fs.existsSync(path.join(root,p))?parseEnv(fs.readFileSync(path.join(root,p),'utf8')):{};
(async()=>{
 let client;
 try {
  const args=process.argv.slice(2); assert(args.length===1 || (args.length===2 && args[1]==='--apply'),'Workbook path and optional --apply required');
  const apply=args.includes('--apply');
  const {readSpreadsheet}=await import(pathToFileURL(path.join(root,'src/lib/import/spreadsheet.js')));
  const {parseV81Workbook}=await import(pathToFileURL(path.join(root,'src/lib/import/v81.js')));
  const p=parseV81Workbook(readSpreadsheet(fs.readFileSync(args[0]))); assert.equal(p.counts.ERROR,0); assert.equal(p.questionCount,474);
  const db={...env('.env.database.local'),...process.env}, app={...env('.env.local'),...process.env};
  const url=new URL(app.NEXT_PUBLIC_SUPABASE_URL),ref=url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  assert(url.protocol==='https:' && ref); assert(db.DB_HOST===`db.${ref}.supabase.co`||(db.DB_HOST.endsWith('.pooler.supabase.com')&&db.DB_USER.endsWith(`.${ref}`)),'Project mismatch');
  if(db.DB_EXPECTED_PROJECT_REF) assert.equal(db.DB_EXPECTED_PROJECT_REF,ref);
  if(apply) assert.equal(db.LEGACY_WORKBOOK_DELETE_PROJECT_REF,ref,'Explicit project confirmation required');
  client=new Client({host:db.DB_HOST,port:Number(db.DB_PORT||5432),database:db.DB_NAME,user:db.DB_USER,password:db.DB_PASSWORD,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.resolve(root,db.DB_SSL_CA_PATH),'utf8')},connectionTimeoutMillis:15000});
  await client.connect();assert.equal(client.connection.stream.authorized,true);
  await client.query(apply?'BEGIN':'BEGIN READ ONLY');
  await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='60s'");
  const ids=p.questions.map(q=>q.id);
  const target=(await client.query(`SELECT * FROM public.questions WHERE question_code=ANY($1::text[]) ${apply?'FOR UPDATE':''}`,[ids])).rows;
  const qids=target.map(q=>q.id);
  const refs={};
  for(const table of ['exam_attempt_questions','exam_attempt_answers','school_assignment_questions']) refs[table]=Number((await client.query(`SELECT count(*) n FROM public.${table} WHERE question_id=ANY($1::uuid[])`,[qids])).rows[0].n);
  console.log(JSON.stringify({phase:'audit',apply,matched:target.length,references:refs,tlsVerified:true}));
  if(!apply){await client.query('ROLLBACK');return;}
  assert.equal(target.length,200,'Expected exactly 200 legacy questions; no deletion performed');
  assert(Object.values(refs).every(n=>n===0),'Questions still referenced by exams/assignments; deletion refused to preserve student history');
  assert(target.every(q=>q.source_type==='IMPORT'),'Unexpected non-import question; deletion refused');
  // Block new references during dependency checks/deletion.
  await client.query('LOCK TABLE public.exam_attempt_questions, public.exam_attempt_answers, public.school_assignment_questions IN SHARE ROW EXCLUSIVE MODE');
  for(const table of Object.keys(refs)) assert.equal(Number((await client.query(`SELECT count(*) n FROM public.${table} WHERE question_id=ANY($1::uuid[])`,[qids])).rows[0].n),0);
  const backup={createdAt:new Date().toISOString(),projectRef:ref,questions:target};
  backup.versions=(await client.query('SELECT * FROM public.question_versions WHERE question_id=ANY($1::uuid[])',[qids])).rows;
  const vids=backup.versions.map(v=>v.id);
  backup.options=(await client.query('SELECT * FROM public.question_options WHERE question_version_id=ANY($1::uuid[])',[vids])).rows;
  backup.categories=(await client.query('SELECT * FROM public.question_category_items WHERE question_version_id=ANY($1::uuid[])',[vids])).rows;
  backup.reviews=(await client.query('SELECT * FROM public.question_reviews WHERE question_id=ANY($1::uuid[])',[qids])).rows;
  backup.importRows=(await client.query('SELECT * FROM public.question_import_rows WHERE imported_record_id=ANY($1::uuid[])',[qids])).rows;
  const hasAudit=(await client.query("SELECT to_regclass('public.question_workflow_audit') present")).rows[0].present;
  if(hasAudit) backup.workflowAudit=(await client.query('SELECT * FROM public.question_workflow_audit WHERE question_id=ANY($1::uuid[])',[qids])).rows;
  const relative=`.local/database/legacy-workbook-backup-${Date.now()}.json`;
  fs.mkdirSync(path.join(root,'.local/database'),{recursive:true});
  fs.writeFileSync(path.join(root,relative),JSON.stringify(backup,null,2),{flag:'wx',mode:0o600});
  if(hasAudit) await client.query('DELETE FROM public.question_workflow_audit WHERE question_id=ANY($1::uuid[])',[qids]);
  await client.query('DELETE FROM public.question_reviews WHERE question_id=ANY($1::uuid[])',[qids]);
  await client.query('DELETE FROM public.question_options WHERE question_version_id=ANY($1::uuid[])',[vids]);
  await client.query('DELETE FROM public.question_category_items WHERE question_version_id=ANY($1::uuid[])',[vids]);
  await client.query('DELETE FROM public.question_versions WHERE question_id=ANY($1::uuid[])',[qids]);
  // Keep import history, retaining raw source and replacing only the now-deleted pointer.
  await client.query('UPDATE public.question_import_rows SET imported_record_id=NULL WHERE imported_record_id=ANY($1::uuid[])',[qids]);
  const deleted=await client.query('DELETE FROM public.questions WHERE id=ANY($1::uuid[])',[qids]); assert.equal(deleted.rowCount,200);
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');await client.query('COMMIT');
  console.log(JSON.stringify({committed:true,deleted:deleted.rowCount,studentHistoryDeleted:false,backup:relative,stimuliAndImportBatchesRetained:true}));
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({committed:false,code:e.code||e.name,message:e.message}));process.exitCode=1;}
 finally{if(client)await client.end();}
})();
