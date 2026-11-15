'use strict';
// Default ROLLBACK, verified TLS, project guard, fixtures always rolled back.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseEnv } = require('node:util');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const env = p => fs.existsSync(path.join(root, p)) ? parseEnv(read(p)) : {};
(async () => {
 let client;
 try {
  assert(process.argv.slice(2).every(a => a === '--apply'), 'Unknown argument');
  const apply = process.argv.includes('--apply');
  const db = { ...env('.env.database.local'), ...process.env };
  const app = { ...env('.env.local'), ...process.env };
  const url = new URL(app.NEXT_PUBLIC_SUPABASE_URL);
  const ref = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  assert(url.protocol === 'https:' && ref, 'Managed HTTPS project required');
  assert(db.DB_HOST === `db.${ref}.supabase.co` || (db.DB_HOST.endsWith('.pooler.supabase.com') && db.DB_USER.endsWith(`.${ref}`)), 'Project mismatch');
  if (db.DB_EXPECTED_PROJECT_REF) assert.equal(db.DB_EXPECTED_PROJECT_REF, ref);
  if (apply) assert.equal(db.OPERATOR_QUESTIONS_APPLY_PROJECT_REF, ref, 'Explicit apply confirmation required');
  client = new Client({ host:db.DB_HOST, port:Number(db.DB_PORT || 5432), database:db.DB_NAME, user:db.DB_USER,
   password:db.DB_PASSWORD, ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.resolve(root,db.DB_SSL_CA_PATH),'utf8')}, connectionTimeoutMillis:15000 });
  client.on('notice', () => {});
  await client.connect();
  assert.equal(client.connection.stream.authorized,true);
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'");
  const sql = read('docs/database/migration-stage-7-operator-questions.sql').replace(/^BEGIN;\s*|^COMMIT;\s*$/gm,'');
  await client.query(sql);
  await client.query(sql);
  const acl = await client.query(`SELECT has_function_privilege('anon','public.review_question_version(uuid,uuid,text,text)','EXECUTE') anon_execute,
   has_table_privilege('authenticated','public.question_workflow_audit','INSERT,UPDATE,DELETE,TRUNCATE') client_write`);
  assert.equal(acl.rows[0].anon_execute,false);
  assert.equal(acl.rows[0].client_write,false);
  await client.query('SAVEPOINT operator_tests');
  await client.query(read('tests/database/operator-questions.sql'));
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  await client.query('ROLLBACK TO SAVEPOINT operator_tests');
  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
  console.log(JSON.stringify({verified:true,committed:apply,tlsVerified:true,projectIdentityMatched:true,idempotent:true,fixturesRolledBack:true,tests:'operator-questions',twoSessionStressTest:false}));
 } catch (e) {
  if (client) await client.query('ROLLBACK').catch(()=>{});
  console.error(JSON.stringify({verified:false,committed:false,code:e.code || e.name,message:e.message,where:e.where?.replace(/SQL statement[\s\S]*/,''),position:e.position}));
  process.exitCode=1;
 } finally { if(client) await client.end(); }
})();
