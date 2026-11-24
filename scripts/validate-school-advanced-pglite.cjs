// Offline PostgreSQL validation. No env loader, DB client, endpoint, or persisted database.
// Install optional engine ONLY under .local/school-sql-sandbox; never root dependencies.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { definitions } = require('./build-school-advanced-deployment.cjs');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const qi = s => '"' + s.replaceAll('"', '""') + '"';
const relation = t => qi(t.schema_name || 'public') + '.' + qi(t.table_name);
const signature = f => f.signature.startsWith(f.schema_name + '.') ? f.signature : f.schema_name + '.' + f.signature;

async function baseline(db, sets) {
  // Explicit mocks: NOT Supabase Auth, JWT verification, GoTrue, or real service roles.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA extensions;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz,
      deleted_at timestamptz, banned_until timestamptz, encrypted_password text,
      raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz, updated_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('sandbox.actor',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, private, auth TO anon, authenticated;
    SET search_path=public,pg_catalog;`);
  for (const t of sets.tables) {
    assert.equal(t.relkind, 'r', 'Only ordinary snapshot tables are supported');
    const cols = sets.columns.filter(c => c.schema_name === t.schema_name && c.table_name === t.table_name).sort((a,b) => a.ordinal-b.ordinal);
    for (const c of cols) assert.ok(!c.generated && ['', 'a', 'd'].includes(c.identity), 'Unsupported generated/identity column');
    await db.exec(`CREATE TABLE ${relation(t)} (${cols.map(c => qi(c.column_name) + ' ' + c.type + (c.identity ? ' GENERATED ' + (c.identity === 'a' ? 'ALWAYS' : 'BY DEFAULT') + ' AS IDENTITY' : '') + (c.default_expression ? ' DEFAULT ' + c.default_expression : '') + (c.not_null ? ' NOT NULL' : '')).join(',')});`);
    if (t.rls) await db.exec(`ALTER TABLE ${relation(t)} ENABLE ROW LEVEL SECURITY;`);
    if (t.force_rls) await db.exec(`ALTER TABLE ${relation(t)} FORCE ROW LEVEL SECURITY;`);
  }
  // Restore historical definitions verbatim, including unresolved historical helpers.
  // This setting applies ONLY to snapshot restoration, never final migration validation.
  await db.exec('SET check_function_bodies=off;');
  for (const f of sets.functions) await db.exec(f.definition.trimEnd() + ';');
  await db.exec('SET check_function_bodies=on;');
  for (const kind of ['p','u','c']) for (const c of sets.constraints.filter(c => c.contype === kind)) {
    await db.exec(`ALTER TABLE ${relation(c)} ADD CONSTRAINT ${qi(c.conname)} ${c.definition};`);
  }
  const indexes = new Set((await db.query('SELECT indexname FROM pg_indexes WHERE schemaname=\'public\'')).rows.map(r => r.indexname));
  for (const i of sets.indexes) if (!indexes.has(i.indexname)) await db.exec(i.indexdef + ';');
  for (const c of sets.constraints.filter(c => c.contype === 'f')) {
    await db.exec(`ALTER TABLE ${relation(c)} ADD CONSTRAINT ${qi(c.conname)} ${c.definition};`);
  }
  for (const f of sets.functions) {
    await db.exec(`REVOKE ALL ON FUNCTION ${signature(f)} FROM PUBLIC,anon,authenticated;`);
    for (const [role,allowed] of [['anon',f.anon_execute],['authenticated',f.authenticated_execute]]) {
      if (allowed) await db.exec(`GRANT EXECUTE ON FUNCTION ${signature(f)} TO ${role};`);
    }
  }
  for (const p of sets.privileges) {
    const perms = ['select','insert','update','delete','truncate'].filter(k => p['can_' + k]);
    if (perms.length) await db.exec(`GRANT ${perms.join(',')} ON public.${qi(p.table_name)} TO ${qi(p.rolname)};`);
  }
  for (const p of sets.columnPrivileges) for (const k of ['insert','update']) {
    if (p['can_' + k]) await db.exec(`GRANT ${k}(${qi(p.column_name)}) ON public.${qi(p.table_name)} TO ${qi(p.rolname)};`);
  }
  for (const p of sets.policies) {
    const roles = p.roles.slice(1,-1).split(',').map(qi).join(',');
    await db.exec(`CREATE POLICY ${qi(p.policyname)} ON ${qi(p.schemaname)}.${qi(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${roles}` +
      (p.qual ? ` USING (${p.qual})` : '') + (p.with_check ? ` WITH CHECK (${p.with_check})` : '') + ';');
  }
  for (const t of sets.triggers) {
    await db.exec(t.definition + ';');
    if (t.tgenabled !== 'O') throw Error('Unsupported snapshot trigger state: ' + t.tgname);
  }
}

async function validate() {
  const { PGlite } = require(path.join(root, '.local/school-sql-sandbox/node_modules/@electric-sql/pglite'));
  const raw = fs.readFileSync(path.join(root, '.local/database/addendum-02-db.json'));
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), 'bf6c2bc274e7def1432142c528fc800243feff4775ae245e80471ff23f99356f');
  const sets = JSON.parse(raw).sets;
  const sql = read('docs/database/deploy-school-advanced.sql');
  const db = new PGlite(); // memory only; cannot connect to an external DB
  const report = { engine: 'PGlite', mockAuth: true, productionContact: false, snapshotTables: sets.tables.length, checks: [] };
  try {
    report.version = (await db.query('SELECT version()')).rows[0].version;
    await baseline(db, sets);
    report.checks.push('Snapshot public schema restored: columns/defaults, constraints, indexes, functions, effective anon/authenticated ACL, policies, triggers; no original data/owners/default ACL/role inheritance.');
    await assert.rejects(db.exec(sql), /HOLD: human approval/);
    await db.exec('ROLLBACK;');
    assert.equal((await db.query("SELECT count(*)::integer AS n FROM pg_attribute WHERE attrelid='public.scheduled_tryouts'::regclass AND attname='agenda_status'")).rows[0].n, 0);
    report.checks.push('Unmodified final artifact rejects missing human approval and leaves no agenda column.');
    // Synthetic-fixture approval ONLY: final artifact on disk remains false.
    // No baseline/hash/ACL/data/constraint gate is removed or rewritten.
    const approved = sql.replace(/(SET LOCAL school_deploy\.(?:human_approved|mapping_approved|affiliation_writers_approved) = )'false';/g, "$1'true';");
    assert.equal((approved.match(/SET LOCAL school_deploy\.\w+ = 'true';/g) || []).length, 3);
    // Prove real ACL and required-index gates reject drift, not just default approval.
    await db.exec('REVOKE SELECT ON public.profiles FROM anon;');
    await assert.rejects(db.exec(approved), /HOLD: table ACL drift anon public.profiles/);
    await db.exec('ROLLBACK; GRANT SELECT ON public.profiles TO anon;');
    const requiredIndex = sets.indexes.find(i => i.indexname === 'uq_exam_attempts_active_user_grade_subject');
    assert.ok(requiredIndex);
    await db.exec('DROP INDEX public.uq_exam_attempts_active_user_grade_subject;');
    await assert.rejects(db.exec(approved), /HOLD: required unique index missing or invalid/);
    await db.exec('ROLLBACK; ' + requiredIndex.indexdef + ';');
    report.checks.push('Real preflights reject table ACL drift and a missing required unique index; fixture baseline then restored.');
    await db.exec(approved);
    report.compiledMigrationFunctions = definitions(sql).length;
    report.checks.push('Complete final migration committed on empty synthetic baseline with check_function_bodies=on and every real preflight intact.');
    const results = await db.exec(read('docs/database/verify-school-advanced.sql'));
    let verified = 0;
    for (const result of results) for (const row of result.rows) if (Object.hasOwn(row, 'ok')) {
      assert.equal(row.ok, true, JSON.stringify(row)); verified++;
    }
    assert.ok(verified > 100);
    report.catalogAssertions = verified;
    report.checks.push('Read-only postinstall verification: every returned ok is true.');
    await assert.rejects(db.exec(approved), /HOLD:/);
    await db.exec('ROLLBACK;');
    report.checks.push('Second installation rejected by real baseline drift preflight.');
    report.runtimeFixture = await require('../tests/database/school-advanced-pglite.cjs')(db);
    return report;
  } catch (e) {
    e.validationReport = report;
    throw e;
  } finally { await db.close(); }
}
if (require.main === module) validate().then(r => console.log(JSON.stringify(r,null,2))).catch(e => {
  console.error(JSON.stringify({ ...e.validationReport, failure: { message:e.message, code:e.code, detail:e.detail, where:e.where, position:e.position } },null,2));
  process.exitCode=1;
});
module.exports = { validate, baseline };
