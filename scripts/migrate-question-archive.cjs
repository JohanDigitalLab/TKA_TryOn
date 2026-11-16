'use strict';
// Dry-run by default; fixtures always rolled back, even when applying schema.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseEnv } = require('node:util');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
(async () => {
 let client;
 try {
  assert(process.argv.slice(2).every(a => ['--apply','--verify'].includes(a)), 'Unknown argument');
  const apply = process.argv.includes('--apply');
  const verify = process.argv.includes('--verify');
  assert(!(apply && verify));
  const db = { ...parseEnv(read('.env.database.local')), ...process.env };
  const app = { ...parseEnv(read('.env.local')), ...process.env };
  const url = new URL(app.NEXT_PUBLIC_SUPABASE_URL);
  const ref = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  assert(url.protocol === 'https:' && ref, 'Managed HTTPS project required');
  assert(db.DB_HOST === `db.${ref}.supabase.co` || (db.DB_HOST.endsWith('.pooler.supabase.com') && db.DB_USER.endsWith(`.${ref}`)), 'Project mismatch');
  if (db.DB_EXPECTED_PROJECT_REF) assert.equal(db.DB_EXPECTED_PROJECT_REF, ref);
  if (apply) assert.equal(db.QUESTION_ARCHIVE_APPLY_PROJECT_REF, ref, 'Explicit project confirmation required');
  client = new Client({host:db.DB_HOST,port:Number(db.DB_PORT || 5432),database:db.DB_NAME,user:db.DB_USER,password:db.DB_PASSWORD,
   ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.resolve(root,db.DB_SSL_CA_PATH),'utf8')},connectionTimeoutMillis:15000});
  client.on('notice',()=>{});
  await client.connect();
  assert.equal(client.connection.stream.authorized,true);
  await client.query(verify ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
  await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'");
  const fingerprint = async () => (await client.query(`SELECT count(*)::int n, md5(coalesce(string_agg(to_jsonb(q)::text,'' ORDER BY id),'')) digest FROM public.questions q`)).rows[0];
  const before = await fingerprint();
  if (!verify) {
   const sql = read('docs/database/migration-stage-10-question-archive.sql').replace(/^BEGIN;\s*|^COMMIT;\s*$/gm,'');
   await client.query(sql);
   await client.query(sql);
   await client.query('SAVEPOINT archive_tests');
   await client.query(read('tests/database/question-archive.sql'));
   await client.query('SET CONSTRAINTS ALL IMMEDIATE');
   await client.query('ROLLBACK TO SAVEPOINT archive_tests');
  }
  const acl = (await client.query(`SELECT
   has_function_privilege('anon','public.archive_question(uuid,text,uuid,text)','EXECUTE') anon_execute,
   has_function_privilege('authenticated','public.archive_question(uuid,text,uuid,text)','EXECUTE') authenticated_execute,
   has_table_privilege('authenticated','public.question_archive_audit','INSERT,UPDATE,DELETE,TRUNCATE') audit_write,
   has_table_privilege('authenticated','public.questions','DELETE') question_delete,
   (SELECT relrowsecurity FROM pg_class WHERE oid='public.question_archive_audit'::regclass) audit_rls,
   'bank_soal.archive'=ANY(private.valid_admin_permissions()) permission_registered,
   (SELECT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog'] FROM pg_proc WHERE oid='public.archive_question(uuid,text,uuid,text)'::regprocedure) hardened,
   (SELECT count(*)::int FROM pg_trigger WHERE tgname IN ('question_archive_reference_guard','question_archive_status_guard') AND NOT tgisinternal) guards`)).rows[0];
  assert.deepEqual(acl,{anon_execute:false,authenticated_execute:true,audit_write:false,question_delete:false,audit_rls:true,permission_registered:true,hardened:true,guards:5});
  assert.deepEqual(await fingerprint(),before,'Existing questions must remain unchanged');
  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
  const result={verified:true,committed:apply,readOnly:verify,tlsVerified:true,projectIdentityMatched:true,idempotent:!verify,fixturesRolledBack:!verify,questionsUnchanged:true,acl,twoSessionStressTest:false};
  fs.mkdirSync(path.join(root,'.local/database'),{recursive:true});
  fs.writeFileSync(path.join(root,'.local/database/question-archive-'+(verify?'verify':apply?'apply':'dry-run')+'.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 } catch(e) {
  if(client) await client.query('ROLLBACK').catch(()=>{});
  console.error(JSON.stringify({verified:false,code:e.code || e.name,message:e.message,where:e.where,detail:e.detail}));
  process.exitCode=1;
 } finally {if(client) await client.end();}
})();
