import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBossfightHandlers } from '../src/lib/server/bossfight.js';

function setup({ identity = true, error = null } = {}) {
  const calls = [];
  const h = createBossfightHandlers({
    getBearerToken: r => r.headers.get('authorization'),
    getUser: async () => identity ? { user: { id: 'owner' }, supabase: { rpc: async (...args) => { calls.push(args); return { data: { ok: true }, error }; } } } : null,
  });
  return { ...h, calls };
}
const req = (body, auth = 'token') => new Request('http://localhost/api/bossfight', { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });
test('authentication fails closed before RPC', async () => {
  const h = setup(); assert.equal((await h.POST(req({}, null))).status, 401); assert.equal(h.calls.length, 0);
  assert.equal((await setup({ identity: false }).POST(req({ action: 'start' }))).status, 401);
});
test('GET bootstrap uses verified identity and no-store', async () => {
  const h = setup(); const r = await h.GET(new Request('http://localhost', { headers: { authorization: 'token' } }));
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(h.calls, [['bossfight', { p_action: 'bootstrap', p_payload: {} }]]);
});
test('all supported actions use a single user-scoped RPC', async () => {
  for (const action of ['settings', 'start', 'batch', 'finish']) {
    const h = setup(); const body = { action, attempt_id: '11111111-1111-1111-1111-111111111111' };
    assert.equal((await h.POST(req(body))).status, 200); assert.deepEqual(h.calls[0], ['bossfight', { p_action: action, p_payload: body }]);
  }
});
test('reject malformed payload/action/UUID and bounded request body', async () => {
  for (const body of [null, [], { action: 'delete' }, { action: 'finish', attempt_id: 'bad' }]) assert.equal((await setup().POST(req(body))).status, 400);
  assert.equal((await setup().POST(req({ action: 'start', padding: 'x'.repeat(65536) }))).status, 413);
  const r = new Request('http://localhost', { method: 'POST', headers: { authorization: 'token', 'content-type': 'application/json' }, body: '{' });
  assert.equal((await setup().POST(r)).status, 400);
});
test('database errors mapped without leaking details', async () => {
  for (const [code, status] of [['42501', 403], ['22023', 400], ['22P02', 400], ['P0001', 409], ['XX000', 500]]) {
    const r = await setup({ error: { code, message: 'secret database details' } }).POST(req({ action: 'start' }));
    assert.equal(r.status, status); assert.ok(!(await r.text()).includes('secret'));
  }
});
test('migration declares critical security and atomic persistence invariants', async () => {
  const sql = await readFile(new URL('../docs/database/migration-bossfight.sql', import.meta.url), 'utf8');
  assert.ok(!/service_role/i.test(sql));
  assert.equal((sql.match(/SECURITY DEFINER/g) || []).length, (sql.match(/SET search_path=pg_catalog/g) || []).length);
  for (const pattern of [/pg_advisory_xact_lock/, /FOR UPDATE/, /private\.exam_answer_is_correct/, /estimate_minutes<=5/, /version_status='PUBLISHED'/, /question_status='PUBLISHED'/, /bossfight_one_active/, /s\.result IS NOT NULL/, /pos>n/, /pos<n/, /Answer already locked/, /Session not terminal/, /s\.combo\[actor\]>=3 THEN 30 ELSE 20/, /least\(100,s\.hp\[actor\]\+20\)/, /s\.correct\*2>n/, /xp_score=xp_score\+xp/, /REVOKE ALL ON private\.bossfight_sessions/]) assert.match(sql, pattern);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.(submit_exam_attempt|save_exam_answer|resume_exam_attempt)/);
  assert.ok(sql.indexOf("IF p_action='finish' THEN") < sql.indexOf('INSERT INTO public.exam_attempt_questions'));
  const generic = await readFile(new URL('../docs/database/migration_generic_exam_attempt.sql', import.meta.url), 'utf8');
  assert.equal((generic.match(/CREATE OR REPLACE FUNCTION public\.(submit_exam_attempt|save_exam_answer|resume_exam_attempt)/g) || []).length, 3);
  assert.equal((generic.match(/RAISE EXCEPTION 'Use BossFight endpoint'/g) || []).length, 3);
  for (const call of ['private.submit_exercise_attempt(p_attempt_id)', 'private.save_exercise_answer(p_attempt_id,p_question_id,p_answer_payload)', 'private.resume_student_exercise(p_attempt_id)', 'private.resume_tka_tryout(p_attempt_id)']) assert.ok(generic.includes(call), call);
  assert.doesNotMatch(generic, /exercise_legacy|bossfight_legacy/);
});
