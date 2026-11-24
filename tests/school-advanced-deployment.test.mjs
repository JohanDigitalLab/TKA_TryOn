import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { verifySchoolAdvancedCapability } from '../scripts/verify-school-advanced-capability.mjs';
const require = createRequire(import.meta.url);
const { build, definitions } = require('../scripts/build-school-advanced-deployment.cjs');
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r/g, '');
const sql = read('docs/database/deploy-school-advanced.sql');
const verify = read('docs/database/verify-school-advanced.sql');
const executable = sql.replace(/--[^\n]*/g, '');
const funcs = definitions(sql);
const body = name => { const f = funcs.find(f => f.name === name); assert.ok(f, name); return f.sql; };

test('committed artifacts byte-identical to offline generator; review sources untouched by assembly', { skip: !existsSync(new URL('../.local/database/addendum-02-db.json', import.meta.url)) }, () => {
 const before = ['blockers','agenda'].map(n => read(`docs/database/migration-school-advanced-${n}.sql`));
 const a = build(); const b = build();
 assert.equal(a.sql, sql); assert.equal(a.verification, verify); assert.deepEqual(a, b);
 assert.deepEqual(before, ['blockers','agenda'].map(n => read(`docs/database/migration-school-advanced-${n}.sql`)));
});
test('one atomic transaction, complete definitions, no psql includes or nested rollback', () => {
 assert.equal((executable.match(/^BEGIN;$/gm) || []).length, 1);
 assert.equal((executable.match(/^COMMIT;$/gm) || []).length, 1);
 assert.match(executable.trim(), /COMMIT;$/);
 assert.doesNotMatch(executable, /ROLLBACK|\\i\b|CREATE TABLE|DROP\s|TRUNCATE\s|DISABLE ROW LEVEL|DELETE FROM/i);
 assert.equal(funcs.length, 26);
 assert.equal(new Set(funcs.map(f => f.name)).size, funcs.length);
 for (const f of funcs) { assert.match(f.sql, /SECURITY DEFINER/); assert.match(f.sql, /SET search_path\s*(?:=|TO)\s*'?pg_catalog'?/); }
});
test('human gate defaults false and gates/dependencies reconciled before commit', () => {
 for (const setting of ['human_approved','mapping_approved','affiliation_writers_approved']) {
  assert.ok(sql.includes(`SET LOCAL school_deploy.${setting} = 'false';`));
  assert.ok(sql.includes(`current_setting('school_deploy.${setting}',true) IS DISTINCT FROM 'true'`));
 }
 assert.ok(sql.indexOf('DO $approval$') < sql.indexOf('LOCK TABLE'));
 assert.ok(sql.indexOf('$preflight$;') < sql.indexOf('ALTER TABLE'));
 assert.ok(sql.indexOf('ADD CONSTRAINT school_blockers_schedule_school_fk') < sql.indexOf('DO $gate$'));
 assert.ok(sql.indexOf('CREATE OR REPLACE FUNCTION private.school_assignment_deadline') < sql.indexOf('DO $gate$'));
 for (const fragment of ['profile collision','GROUP BY scheduled_tryouts,user_id HAVING count(*)>1','attempt_type invariant drift','inconsistent assignment attempts','dependency definition/signature/ACL drift','table ACL drift','non-idempotent']) assert.ok(sql.includes(fragment), fragment);
});
test('additive constraints and no affiliation/history backfill, ACL remains least privilege', () => {
 assert.equal((executable.match(/ADD CONSTRAINT/g) || []).length, 9);
 assert.equal((executable.match(/NOT VALID/g) || []).length, 7);
 assert.doesNotMatch(executable, /(?:UPDATE|INSERT INTO) public\.(profiles|school_memberships|student_academic_profiles)\b|VALIDATE CONSTRAINT|CASCADE/i);
 assert.doesNotMatch(executable, /GRANT[^;]*TO (?:anon|PUBLIC)|GRANT[^;]*ON TABLE|GRANT EXECUTE ON FUNCTION public\.x/i);
 for (const f of funcs) assert.ok(sql.includes(`REVOKE ALL ON FUNCTION ${f.name}(`), f.name);
 for (const f of funcs.filter(f => f.name.startsWith('private.'))) assert.ok(!sql.includes(`GRANT EXECUTE ON FUNCTION ${f.name}(`));
});
test('canonical implementation keeps agenda + assignment timers and fixes legacy required type/history mutation', () => {
 for (const name of ['public.save_exam_answer','public.submit_exam_attempt']) {
  assert.match(body(name), /private.school_assignment_deadline\(p_attempt_id\)/);
  assert.match(body(name), /private.school_schedule_deadline\(p_attempt_id\)/);
 }
 assert.match(body('public.save_exam_answer'), /private.exam_answer_payload_is_valid/);
 assert.match(body('public.submit_exam_attempt'), /private.exam_answer_is_correct/);
 assert.match(body('private.learning_legacy_start'), /duration_minutes,\s+attempt_type/);
 assert.match(body('private.learning_legacy_start'), /p_duration_minutes,\s+'TRYOUT'/);
 assert.doesNotMatch(body('private.learning_legacy_start'), /SET attempt_status = 'EXPIRED'/);
 assert.match(body('private.school_assignment_access'), /school_advanced_scope/);
});
test('postinstall is read-only security invoker catalog verification without auth spoof', () => {
 assert.match(verify, /BEGIN READ ONLY;/);
 assert.doesNotMatch(verify, /CREATE |ALTER |DROP |INSERT |UPDATE |DELETE |SET ROLE|request\.jwt|set_config|SECURITY DEFINER/i);
 for (const fragment of ['md5(p.prosrc)','pg_get_function_arguments','has_function_privilege','aclexplode','relrowsecurity','pg_policies','confrelid','confdeltype','pg_get_triggerdef','has_table_privilege']) assert.ok(verify.includes(fragment), fragment);
});
const own = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const capability = { school_id: own,capability_version:'school-advanced-sql/1',assignment_contract:1,agenda_contract:1,single_set_package:true,max_attempts:1,full_duration_start:true,revocation_finalize:'deny',school_reference:'schools.id' };
const clients = (code='42501') => ({
 authenticatedClient: { auth:{ getUser:async()=>({data:{user:{id:own,email_confirmed_at:'2026-01-01'}}}) },rpc:async(_n,p)=>p.p_school_id===own?{data:capability}:{error:{code}} },
 anonymousClient:{auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>({error:{code:'42501'}})},ownSchoolId:own,otherSchoolId:other
});
test('capability verifier uses real user validation and refuses missing-function false positives (mock only)', async () => {
 assert.equal((await verifySchoolAdvancedCapability(clients())).readOnly,true);
 await assert.rejects(verifySchoolAdvancedCapability(clients('PGRST202')),/42501/);
});
