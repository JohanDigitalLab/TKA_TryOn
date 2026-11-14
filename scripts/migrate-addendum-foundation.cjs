'use strict';
// Rollback-only integration verifier. There is deliberately no apply/commit branch.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const env = p => fs.existsSync(path.join(root, p)) ? parseEnv(read(p)) : {};
const migration = read('docs/database/migration-stage-5-addendum-foundation.sql');
const stage4 = read('docs/database/migration-stage-4-school-onboarding.sql').replace(/^BEGIN;\s*|^COMMIT;\s*$/gm, '');
const fixtures = p => read(p).replace(/'registration_method','independent'/g, "'whatsapp_number','081234567890','registration_method','independent'");
(async () => {
 let client; let phase = 'arguments';
 try {
  assert(process.argv.slice(2).every(a => a === '--dry-run'), 'Only --dry-run is accepted; live apply is prohibited');
  assert(!/^\s*(COMMIT|END)\s*;/im.test(migration), 'Migration must not commit');
  const db = { ...env('.env.database.local'), ...process.env };
  const app = { ...env('.env.local'), ...process.env };
  const test = env('.env.test.local');
  for (const k of ['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD','DB_SSL_CA_PATH']) assert(db[k], `Missing ${k}`);
  const url = new URL(app.NEXT_PUBLIC_SUPABASE_URL);
  assert.equal(url.protocol, 'https:');
  const ref = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  assert(ref, 'Managed Supabase project required');
  assert(db.DB_HOST === `db.${ref}.supabase.co` || (db.DB_HOST.endsWith('.pooler.supabase.com') && db.DB_USER.endsWith(`.${ref}`)), 'Project mismatch');
  if (db.DB_EXPECTED_PROJECT_REF) assert.equal(db.DB_EXPECTED_PROJECT_REF, ref);
  if (test.NEXT_PUBLIC_SUPABASE_URL) assert.equal(new URL(test.NEXT_PUBLIC_SUPABASE_URL).hostname, url.hostname);
  client = new Client({ host:db.DB_HOST, port:Number(db.DB_PORT || 5432), database:db.DB_NAME,
   user:db.DB_USER,password:db.DB_PASSWORD,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.resolve(root,db.DB_SSL_CA_PATH),'utf8')},
   connectionTimeoutMillis:15000,application_name:'addendum02-rollback-verifier' });
  client.on('notice', () => {});
  await client.connect(); assert.equal(client.connection.stream.authorized,true);
  const branches = [];
  for (const withStage4 of [false,true]) {
   await client.query('BEGIN');
   await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='90s'; SET LOCAL idle_in_transaction_session_timeout='120s'");
   phase = withStage4 ? 'with-stage4' : 'without-stage4';
   if (withStage4) await client.query(stage4);
   await client.query(migration); await client.query(migration);
   const tables = await client.query(`SELECT c.relname,c.relrowsecurity,
    has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') client_access,
    has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') anon_access
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'a02\\_%' ESCAPE '\\'`);
   assert.equal(tables.rowCount,13);
   for (const r of tables.rows) { assert(r.relrowsecurity,r.relname); assert(!r.client_access && !r.anon_access,r.relname); }
   const funcs = await client.query(`SELECT p.proname,n.nspname,p.proconfig,
    has_function_privilege('authenticated',p.oid,'EXECUTE') allowed,
    has_function_privilege('anon',p.oid,'EXECUTE') anon_allowed
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.proname LIKE 'a02\\_%' ESCAPE '\\'`);
   for (const f of funcs.rows) {
    if (!f.proname.startsWith('a02_legacy_')) assert(f.proconfig.includes('search_path=pg_catalog'),f.proname);
    assert.equal(f.allowed,f.nspname==='public',f.proname);
    assert.equal(f.anon_allowed,f.nspname==='public' && f.proname==='a02_business_config',f.proname);
   }
   phase += ':foundation-tests';
   await client.query('SAVEPOINT tests');
   await client.query(read('tests/database/addendum-foundation.sql'));
   await client.query('SET CONSTRAINTS ALL IMMEDIATE');
   await client.query('ROLLBACK TO SAVEPOINT tests');
   phase += ':legacy-regression';
   await client.query('SAVEPOINT regression');
   await client.query(fixtures('tests/database/school-workflows.sql'));
   await client.query('SET CONSTRAINTS ALL IMMEDIATE');
   await client.query('ROLLBACK TO SAVEPOINT regression');
   if (withStage4) {
    phase = 'with-stage4:onboarding-regression';
    await client.query('SAVEPOINT onboarding');
    await client.query(fixtures('tests/database/school-onboarding.sql'));
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await client.query('ROLLBACK TO SAVEPOINT onboarding');
   }
   await client.query('ROLLBACK');
   branches.push({stage4:withStage4,migrationExecutions:2,tables:tables.rowCount,foundationTests:true,legacyRegression:true,onboardingRegression:withStage4,rolledBack:true});
  }
  console.log(JSON.stringify({verified:true,committed:false,tlsVerified:true,projectIdentityMatched:true,branches,
   concurrency:'unique constraints and serialized-path tests; no committed two-session stress fixture'}));
 } catch (e) {
  if (client) await client.query('ROLLBACK').catch(()=>{});
  console.error(JSON.stringify({verified:false,committed:false,phase,code:e.code||e.name,message:e.message,position:e.position,
   where:e.where?.replace(/SQL statement[\s\S]*/, '')}));
  process.exitCode=1;
 } finally { if (client) await client.end(); }
})();
