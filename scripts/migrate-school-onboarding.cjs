// No credential output. Default always ROLLBACK, including DDL and test fixtures.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const envFile = (p) => fs.existsSync(path.join(root, p)) ? parseEnv(read(p)) : {};
const rpcNames = ['school_portal_context', 'submit_school_application', 'review_school_application',
  'school_admin_workspace', 'school_admin_mutate', 'school_invite_request', 'school_communications',
  'school_communication_mutate', 'school_coordinator_transfer', 'platform_school_workspace'];
const tables = ['school_applications', 'school_onboarding_settings', 'school_invite_requests',
  'school_coordinator_transfers', 'school_messages', 'school_message_reads', 'school_support_tickets',
  'school_ticket_replies', 'school_onboarding_audit'];
(async () => {
  let client;
  try {
    const args = process.argv.slice(2);
    assert(args.every((a) => a === '--apply'), 'Unknown argument');
    const apply = args.includes('--apply');
    const db = { ...envFile('.env.database.local'), ...process.env };
    const app = { ...envFile('.env.local'), ...process.env };
    const test = envFile('.env.test.local');
    for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_SSL_CA_PATH']) assert(db[key], `Missing ${key}`);
    const url = new URL(app.NEXT_PUBLIC_SUPABASE_URL);
    assert.equal(url.protocol, 'https:', 'HTTPS Supabase URL required');
    const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
    assert(match, 'Managed Supabase project URL required');
    const ref = match[1];
    assert(db.DB_HOST === `db.${ref}.supabase.co` ||
      (db.DB_HOST.endsWith('.pooler.supabase.com') && db.DB_USER.endsWith(`.${ref}`)), 'Database/application project mismatch');
    if (test.NEXT_PUBLIC_SUPABASE_URL) assert.equal(new URL(test.NEXT_PUBLIC_SUPABASE_URL).hostname, url.hostname, 'Test/application project mismatch');
    if (db.DB_EXPECTED_PROJECT_REF) assert.equal(db.DB_EXPECTED_PROJECT_REF, ref, 'Expected project mismatch');
    if (apply) assert.equal(db.SCHOOL_ONBOARDING_APPLY_PROJECT_REF, ref, 'Apply requires explicit project confirmation');
    client = new Client({ host: db.DB_HOST, port: Number(db.DB_PORT || 5432), database: db.DB_NAME,
      user: db.DB_USER, password: db.DB_PASSWORD,
      ssl: { rejectUnauthorized: true, ca: fs.readFileSync(path.resolve(root, db.DB_SSL_CA_PATH), 'utf8') },
      connectionTimeoutMillis: 15000, application_name: 'school-onboarding-stage-4' });
    client.on('notice', () => {});
    await client.connect();
    assert.equal(client.connection.stream.authorized, true, 'TLS peer verification failed');
    await client.query('BEGIN');
    await client.query("SET LOCAL idle_in_transaction_session_timeout='120s'");
    // Capture definitions/policies in memory for a reviewable, secret-free audit summary.
    const before = await client.query(`SELECT n.nspname,p.proname,p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prokind='f'`);
    const oldMutators = before.rows.filter((r) => /(insert\s+into|update|delete\s+from|merge\s+into)\s+(public\.)?"?(schools|school_memberships|school_invites|classes)"?([\s(]|$)/i.test(r.definition) && !rpcNames.includes(r.proname));
    const policies = await client.query("SELECT tablename,policyname,cmd FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])", [['schools','school_memberships','school_invites','classes','student_academic_profiles']]);
    for (const name of ['school_assignments','exam_attempts','student_academic_profiles']) {
      const r = await client.query('SELECT to_regclass($1) AS relation', [`public.${name}`]);
      assert(r.rows[0].relation, `Missing prerequisite ${name}`);
    }
    const sql = read('docs/database/migration-stage-4-school-onboarding.sql').replace(/^BEGIN;\s*|^COMMIT;\s*$/gm, '');
    await client.query(sql);
    await client.query(sql);
    const acl = await client.query(`SELECT c.relname,c.relrowsecurity,
      has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') client_write,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') anon_access,
      has_table_privilege('authenticated',c.oid,'SELECT') client_read
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`, [tables.concat(['schools','school_memberships','school_invites','classes'])]);
    assert.equal(acl.rowCount, 13);
    for (const r of acl.rows) {
      assert.equal(r.relrowsecurity,true,r.relname); assert.equal(r.client_write,false,r.relname);
      if (tables.includes(r.relname)) { assert.equal(r.anon_access,false,r.relname); assert.equal(r.client_read,false,r.relname); }
    }
    const columns = await client.query(`SELECT c.relname,a.attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped
      AND (has_column_privilege('authenticated',c.oid,a.attnum,'INSERT,UPDATE,REFERENCES') OR has_column_privilege('anon',c.oid,a.attnum,'INSERT,UPDATE,REFERENCES'))`, [['schools','school_memberships','school_invites','classes']]);
    assert.equal(columns.rowCount,0,'Column-level bypass');
    const functions = await client.query(`SELECT p.proname,p.prosecdef,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') client_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[])`,[rpcNames]);
    assert.equal(functions.rowCount,10);
    for (const f of functions.rows) {
      assert.equal(f.prosecdef,true,f.proname); assert.equal(f.anon_execute,false,f.proname);
      assert.equal(f.client_execute,true,f.proname); assert(f.proconfig.includes('search_path=pg_catalog'),f.proname);
    }
    for (const f of oldMutators) {
      const r = await client.query("SELECT has_function_privilege('authenticated',$1::regprocedure,'EXECUTE') allowed",[f.signature]);
      assert.equal(r.rows[0].allowed,false,`Legacy bypass: ${f.signature}`);
    }
    await client.query('SAVEPOINT onboarding_tests');
    await client.query(read('tests/database/school-onboarding.sql'));
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await client.query('ROLLBACK TO SAVEPOINT onboarding_tests');
    // Existing assignment/CBT integration suite also runs, independently rolled back.
    await client.query('SAVEPOINT assignment_regression');
    await client.query(read('tests/database/school-workflows.sql'));
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await client.query('ROLLBACK TO SAVEPOINT assignment_regression');
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ verified:true, committed:apply, tlsVerified:true, projectIdentityMatched:true,
      migrationExecutions:2, rpcCount:functions.rowCount, securedTables:acl.rowCount,
      auditedFunctions:before.rowCount, legacyMutatorsRevoked:oldMutators.map((f)=>f.signature),
      inspectedPolicies:policies.rowCount, tests:['school-onboarding','school-workflows'], fixturesRolledBack:true,
      concurrency:'serialized logic and lock catalog checks; no two-session stress test' }));
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    // PG errors may contain row data; never print detail, connection strings, or raw env.
    console.error(JSON.stringify({ verified:false, committed:false, code:error.code || error.name, message:error.message,
      position:error.position, internalPosition:error.internalPosition,
      where:error.where?.replace(/SQL statement[\s\S]*/, '') }));
    process.exitCode=1;
  } finally { if (client) await client.end(); }
})();
