import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = 'docs/database/migration-rename-student-dashboard-history-to-history.sql';

test('type migration keeps ownership, guards, shape and pagination without fixed status/type', async () => {
  const sql = await read('docs/database/migration-student-history-type-filter.sql');
  assert.match(sql, /CREATE FUNCTION public\.get_student_history\("p_limit" integer DEFAULT 10, "p_type" text DEFAULT NULL\)/);
  for (const fragment of ['RETURNS jsonb', 'STABLE', 'SECURITY DEFINER', 'SET search_path = pg_catalog',
    'v_user_id uuid := auth.uid()', 'IF v_user_id IS NULL', 'ERRCODE = \'42501\'',
    'IF "p_limit" IS NULL OR "p_limit" < 0', 'ERRCODE = \'22023\'',
    'a.id AS attempt_id, a.started_at, a.attempt_type, a.subject_name, a.score',
    'WHERE a.user_id = v_user_id', 'ORDER BY a.started_at DESC, a.id DESC', 'LIMIT NULLIF("p_limit", 0)',
    'SELECT array_agg(upper(token))', 'string_to_array("p_type", \',\')',
    "regexp_replace(value, '^[[:space:]]+|[[:space:]]+$', '', 'g')", "WHERE token <> ''",
    'v_types IS NULL OR upper(a.attempt_type::text) = ANY(v_types)']) assert.ok(sql.includes(fragment), fragment);
  assert.doesNotMatch(sql, /a\.status|a\.attempt_type\s*=\s*'TRYOUT'/);
});

test('signature replacement is atomic, dependency-safe and retains owner/ACL', async () => {
  const sql = await read('docs/database/migration-student-history-type-filter.sql');
  assert.match(sql, /BEGIN;[\s\S]*DROP FUNCTION public\.get_student_history\(integer\) RESTRICT;[\s\S]*NOTIFY pgrst, 'reload schema';\s*COMMIT;/);
  assert.match(sql, /Unexpected get_student_history overload/);
  assert.match(sql, /aclexplode/);
  assert.match(sql, /acldefault/);
  assert.match(sql, /WITH GRANT OPTION/);
  assert.match(sql, /ALTER FUNCTION public\.get_student_history\(integer,text\) OWNER TO %I/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_student_history\(integer,text\) FROM PUBLIC, anon;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_student_history\(integer,text\) TO authenticated;/);
  assert.doesNotMatch(sql, /DROP FUNCTION[^;]*CASCADE|CREATE OR REPLACE/);
});

test('staging SQL regression includes null, whitespace, CSV, ownership and legacy calls', async () => {
  const sql = await read('tests/database/student-history.sql');
  for (const fragment of ['NULL::text', "' , , '", 'EXERCISE, ASSIGNMENT', 'other_user',
    'WHERE user_id = u', '"p_limit" => 1', 'public.get_student_history()',
    'insufficient_privilege', 'ROLLBACK;']) assert.ok(sql.includes(fragment), fragment);
});

test('dashboard and relevant copy use renamed RPC without changing limits', async () => {
  for (const path of ['src/app/student/page.js', 'src/app/student/page copy.js']) {
    const source = await read(path);
    assert.match(source, /supabase\.rpc\("get_student_history", \{ p_limit: 5 \}\)/);
    assert.match(source, /supabase\.rpc\(\s*"get_student_history",\s*\{\s*p_limit: nextShowAll \? 0 : 5,/);
    assert.equal((source.match(/"get_student_history"/g) || []).length, 2);
    assert.doesNotMatch(source, /get_student_dashboard_history/);
  }
});

test('rename uses actual historical signature and preserves implementation/default/ACL', async () => {
  const original = await read('docs/database/migration-student-dashboard-history.sql');
  assert.match(original, /CREATE OR REPLACE FUNCTION public\.get_student_dashboard_history\("limit" integer DEFAULT 10\)/);
  assert.match(original, /RETURNS jsonb/);
  assert.match(original, /a\.user_id = v_user_id AND a\.attempt_type = 'TRYOUT'/);
  assert.match(original, /LIMIT NULLIF\("limit", 0\)/);
  const sql = await read(migration);
  assert.match(sql, /ALTER FUNCTION public\.get_student_dashboard_history\(integer\)\s+RENAME TO get_student_history;/);
  assert.match(sql, /IF to_regprocedure\('public\.get_student_dashboard_history\(integer\)'\) IS NOT NULL THEN\s+IF to_regprocedure\('public\.get_student_history\(integer\)'\) IS NOT NULL THEN\s+RAISE EXCEPTION/);
  assert.match(sql, /ELSIF to_regprocedure\('public\.get_student_history\(integer\)'\) IS NULL THEN\s+RAISE EXCEPTION/);
  assert.match(sql, /END IF;\s+END \$\$;\s+NOTIFY pgrst, 'reload schema';/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE|DROP FUNCTION|GRANT |REVOKE |WHERE |UPDATE /);
});

test('active source, SQL tests and scripts have no old dashboard RPC references', async () => {
  async function check(path) {
    const entries = await readdir(new URL(`../${path}/`, import.meta.url), { withFileTypes: true });
    for (const entry of entries) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await check(child);
      else if (/\.(?:js|mjs|cjs|sql)$/.test(entry.name)) {
        assert.doesNotMatch(await read(child), /get_student_dashboard_history/, child);
      }
    }
  }
  for (const path of ['src', 'scripts', 'tests/database']) await check(path);
});

test('deployment documents historical creator before rename and coordinated application release', async () => {
  const docs = await read('docs/database/STUDENT_HISTORY.md');
  assert.ok(docs.indexOf('migration-student-dashboard-history.sql') < docs.indexOf('migration-rename-student-dashboard-history-to-history.sql'));
  assert.match(docs, /PostgREST/);
  assert.match(docs, /maintenance window/);
  assert.match(docs, /Jangan menjalankan ulang migrasi pembuat setelah rename/);
});
