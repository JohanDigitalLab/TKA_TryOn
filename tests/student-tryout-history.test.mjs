import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('results uses renamed history RPC with unchanged pagination', async () => {
  const source = await read('src/app/student/results/page.js');
  assert.match(source, /supabase\.rpc\("get_student_tryout_history", \{\s*p_limit: 50,\s*p_before: null,/);
  assert.doesNotMatch(source, /get_student_exam_history/);
});

test('history migration renames actual signature without replacing implementation or ACL', async () => {
  const sql = await read('docs/database/migration-rename-student-exam-history-to-tryout.sql');
  assert.match(sql, /ALTER FUNCTION public\.get_student_exam_history\(integer, timestamptz\)\s+RENAME TO get_student_tryout_history;/);
  assert.match(sql, /Both student history RPC names exist/);
  assert.match(sql, /Student history RPC \(integer, timestamptz\) is missing/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE|DROP FUNCTION|GRANT |REVOKE |WHERE |UPDATE /);
});

test('SQL suites and runners agree on renamed RPC and migration order', async () => {
  for (const name of ['addendum-foundation', 'learning-access', 'learning-access-extended']) {
    const sql = await read(`tests/database/${name}.sql`);
    assert.match(sql, /public\.get_student_tryout_history\(/);
    assert.doesNotMatch(sql, /get_student_exam_history/);
  }
  for (const name of ['addendum-foundation', 'learning-access']) {
    const source = await read(`scripts/migrate-${name}.cjs`);
    const migration = source.indexOf("await " + (name === 'addendum-foundation' ? 'client' : 'c') + ".query(read('docs/database/migration-rename-student-exam-history-to-tryout.sql'))");
    assert.ok(migration >= 0);
    assert.ok(migration < source.indexOf(`.query(read('tests/database/${name}.sql'))`));
  }
});
