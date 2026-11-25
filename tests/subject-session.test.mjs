import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getSubjectSessionConflict, getSubjectSessionError } from '../src/lib/student/subject-session.js';

const id = '11111111-1111-1111-1111-111111111111';
const response = (type, extra = {}) => ({ status: 'SUBJECT_SESSION_ACTIVE', reason: 'EXISTING_SESSION', existing_session: { attempt_id: id, attempt_type: type, subject_name: 'Matematika', can_resume: true, ...extra } });
test('cross-type conflicts offer explicit typed resume, never a successful start', () => {
  assert.equal(getSubjectSessionConflict({ attempt_id: id, resumed: true }), null);
  for (const [type, label] of [['EXERCISE', 'latihan'], ['ASSIGNMENT', 'tugas sekolah'], ['TRYOUT', 'tryout']]) {
    const conflict = getSubjectSessionConflict(response(type));
    assert.equal(conflict.href, `/student/challenge?attemptId=${id}`);
    assert.equal(conflict.label, `Lanjutkan ${label} yang ada`);
    assert.ok(conflict.message.includes(label));
  }
});
test('game, unsupported and malformed conflicts never offer generic CBT navigation', () => {
  for (const data of [response('GAMIFICATION'), response('LEGACY'), response('EXERCISE', { attempt_id: 'javascript:alert(1)' }), response('EXERCISE', { can_resume: false }), { ...response('EXERCISE'), reason: 'GAME_SESSION_ACTIVE' }]) {
    assert.equal(getSubjectSessionConflict(data).href, null);
  }
  assert.match(getSubjectSessionConflict({ status: 'SUBJECT_SESSION_ACTIVE', reason: 'GAME_SESSION_ACTIVE' }).message, /game aktif/);
});
test('old deployments show actionable conflict instructions, other errors remain unchanged', () => {
  for (const message of ['Finish or resume the existing subject session', 'Finish or resume existing subject session']) {
    assert.match(getSubjectSessionError({ message }, 'fallback'), /memperbarui RPC/);
  }
  assert.equal(getSubjectSessionError({ message: 'Not allowed' }, 'fallback'), 'Not allowed');
  assert.equal(getSubjectSessionError(null, 'fallback'), 'fallback');
});
test('both entry pages stop before navigation/storage on conflicts and display explicit resume link', async () => {
  for (const name of ['tryout', 'exercise']) {
    const page = await readFile(new URL(`../src/app/student/${name}/page.js`, import.meta.url), 'utf8');
    assert.match(page, /const conflict = getSubjectSessionConflict\(data\);\s+if \(conflict\) \{[^]*?setSessionConflict\(conflict\);[^]*?startingRef.current = false;[^]*?setStarting\(false\);\s+return;/);
    assert.match(page, /<Link href=\{sessionConflict.href\}/);
    assert.match(page, /getSubjectSessionError\(error,/);
    assert.ok(page.indexOf('getSubjectSessionConflict(data)') < page.indexOf('router.push('));
  }
});
test('SQL retains unique indexes, serializes starts and guards same-type resume against legacy game links', async () => {
  const read = name => readFile(new URL(`../docs/database/${name}`, import.meta.url), 'utf8');
  const helper = await read('migration-subject-session-conflict.sql');
  assert.doesNotMatch(helper, /DROP\s+(?:INDEX|CONSTRAINT|TABLE)|DELETE FROM/i);
  assert.match(helper, /NOT game AND a.attempt_type='TRYOUT'/);
  assert.match(helper, /a.duration_minutes>0/);
  assert.match(helper, /FOR UPDATE/);
  for (const name of ['bossfight', 'virtualpet', 'mapadventure']) assert.ok(helper.includes(`private.${name}_sessions`));
  for (const name of ['migration-start-tka-tryout.sql', 'migration-start-student-exercise.sql']) {
    const sql = await read(name);
    assert.match(sql, /private.subject_session_conflict\(u,g,subj\)/);
    assert.match(sql, /AND NOT private.is_game_exam_attempt\(id\)/);
    assert.match(sql, /learning:user:/);
    assert.doesNotMatch(sql, /Finish or resume/);
  }
});
