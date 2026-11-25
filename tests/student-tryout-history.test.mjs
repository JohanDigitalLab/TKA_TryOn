import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('hasil siswa memakai RPC hasil tunggal dan tidak lagi memakai nama riwayat lama', async () => {
  const source = await read('src/app/student/results/page.js');
  assert.match(source, /supabase\.rpc\("get_student_results", \{\s*p_user_id: isManagerAccount \? selectedUser \|\| null : null,\s*\}\)/);
  assert.match(source, /const selectedUser = requestedUser;/);
  assert.doesNotMatch(source, /get_student_exam_history/);
  assert.doesNotMatch(source, /get_student_tryout_history/);
});

test('history migration renames actual signature without replacing implementation or ACL', async () => {
  const sql = await read('docs/database/migration-rename-student-exam-history-to-tryout.sql');
  assert.match(sql, /ALTER FUNCTION public\.get_student_exam_history\(integer, timestamptz\)\s+RENAME TO get_student_tryout_history;/);
  assert.match(sql, /Both student history RPC names exist/);
  assert.match(sql, /Student history RPC \(integer, timestamptz\) is missing/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE|DROP FUNCTION|GRANT |REVOKE |WHERE |UPDATE /);
});

test('results: user_id valid menyembunyikan picker dan menampilkan nama siswa di greeting', async () => {
  const source = await read('src/app/student/results/page.js');
  assert.match(source, /\{isManager && !selectedUser && \(/);
  // Nama siswa tampil di subtitle greeting untuk akun sekolah/admin.
  assert.match(source, /` \$\{studentName\}\.`|\$\{studentName\}\./);
  assert.match(source, /const studentName =/);
});

test('hasil siswa mengecualikan VirtualPet dari attempts dan kompetensi', async () => {
  const source = await read('src/app/student/results/page.js');
  assert.match(source, /normalizeKey\(value\) === "virtualpet"/);
  assert.match(source, /\.filter\(\(attempt\) => !isVirtualpet\(attempt\.subject_name\)\)/);
  assert.match(source, /\.filter\(\(row\) => !isVirtualpet\(row\.subject\)\)/);
  const sql = await read('docs/database/migration-get-student-results.sql');
  assert.match(sql, /coalesce\(lower\(btrim\(e\.gamification_app\)\), ''\) <> 'virtualpet'/);
});

test('get_student_results membandingkan v_actor_type dengan literal lowercase', async () => {
  const sql = await read('docs/database/migration-get-student-results.sql');
  // v_actor_type berasal dari lower(btrim(...)), jadi semua pembandingnya harus lowercase.
  assert.match(sql, /v_actor_type IN \('school', 'admin'\)/);
  assert.match(sql, /v_actor_type = 'admin'/);
  assert.match(sql, /v_actor_type = 'school' AND v_actor_school IS NOT NULL THEN\s*\n\s*IF NOT EXISTS/);
  assert.doesNotMatch(sql, /v_actor_type\s*(=|IN)\s*\(?\s*'?(SCHOOL|ADMIN)/);
});

test('SQL suite dan runner memakai RPC riwayat tryout serta urutan rename', async () => {
  const sql = await read('tests/database/addendum-foundation.sql');
  assert.match(sql, /public\.get_student_tryout_history\(/);
  assert.doesNotMatch(sql, /get_student_exam_history/);
  const source = await read('scripts/migrate-addendum-foundation.cjs');
  const migration = source.indexOf("read('docs/database/migration-rename-student-exam-history-to-tryout.sql')");
  assert.ok(migration >= 0);
  assert.ok(migration < source.indexOf(`.query(read('tests/database/addendum-foundation.sql'))`));
});
