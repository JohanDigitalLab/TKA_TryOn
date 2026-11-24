import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVirtualpetActions, createVirtualpetSession, validPayload, SESSION_COOKIE } from '../src/lib/server/virtualpet.js';
const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const state = { pet: { id: user, pet_type: 'cat', pet_name: 'Mochi', xp: 0, level: 0, hunger: 100, hydration: 100, happiness: 100, status: 'happy', user_id: user, audit_secret: 'private' }, inventory: { water: 1 }, settings: { SHOW_TIPS: '1' }, session: null, profile_xp: 2, tip: { id: user, message: 'Belajar' } };
const answers = Array.from({ length: 10 }, (_, i) => ({ question_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, answer_payload: { option_codes: ['A'] } }));
function fixture(options = {}) {
  const calls = [];
  const identity = { user: { id: user }, supabase: { rpc: async (...args) => { calls.push(['rpc', ...args]); return options.rpc || { data: state, error: null }; } } };
  const getUser = async token => { calls.push(['auth', token]); return options.invalid ? null : identity; };
  const cookies = async () => ({ get: name => { calls.push(['cookie', name]); return options.missing ? undefined : { value: 'private-token' }; }, set: (...args) => calls.push(['set', ...args]) });
  return { calls, getUser, cookies, execute: createVirtualpetActions({ getUser, cookies }) };
}
test('all six actions verify cookie identity on every call and invoke user-scoped RPC only', async () => {
  const f = fixture();
  const cases = [['bootstrap', {}], ['settings', { settings: { SHOW_TIPS: '0' } }], ['adopt', { pet_type: 'cat', pet_name: 'Mochi' }], ['feed', { item: 'rice' }], ['start', { scenario: 'PENYELAMATAN' }], ['finish', { attempt_id: user, answers }]];
  for (const [action, payload] of cases) {
    const result = await f.execute(action, payload, user);
    assert.equal(result.ok, true);
    assert.equal(result.userId, user);
    assert.equal(result.data.pet.user_id, undefined);
    assert.equal(result.data.pet.audit_secret, undefined);
    assert.deepEqual(f.calls.at(-1), ['rpc', 'virtualpet', { p_action: action, p_payload: payload }]);
  }
  assert.equal(f.calls.filter(call => call[0] === 'auth').length, 6);
  assert.equal(f.calls[0][1], SESSION_COOKIE);
  assert.doesNotMatch(JSON.stringify(await f.execute('bootstrap', {}, user)), /private-token|audit_secret/);
});
test('missing, invalid and stale account cookies fail closed before RPC', async () => {
  for (const options of [{ missing: true }, { invalid: true }, {}]) {
    const f = fixture(options);
    const result = await f.execute('bootstrap', {}, options.missing || options.invalid ? user : other);
    assert.equal(result.ok, false);
    assert.equal(f.calls.some(call => call[0] === 'rpc'), false);
  }
});
test('bounded payloads reject unknown fields, token/score/reward and malformed answers', async () => {
  for (const [action, payload] of [
    ['bootstrap', { token: 'secret' }], ['feed', { item: 'food' }], ['feed', { item: 'water', reward: 99 }],
    ['settings', { settings: { SHOW_TIPS: 0 } }], ['settings', { settings: { SHOW_TIPS: '0', rate: 1 } }],
    ['adopt', { pet_type: 'cat', pet_name: 'x'.repeat(51) }], ['start', { scenario: 'MOCK' }],
    ['finish', { attempt_id: user, answers, score: 100 }], ['finish', { attempt_id: user, answers: answers.slice(1) }],
    ['finish', { attempt_id: user, answers: Array(10).fill(answers[0]) }],
    ['finish', { attempt_id: user, answers: answers.map(a => ({ ...a, answer_payload: { option_codes: ['A', 'A'] } })) }],
    ['finish', { attempt_id: user, answers: answers.map(a => ({ ...a, answer_payload: { option_codes: ['A'], category_answers: { 1: 'Benar' } } })) }],
    ['finish', { attempt_id: user, answers: answers.map(a => ({ ...a, answer_payload: { category_answers: { 1: 'x'.repeat(120001) } } })) }],
  ]) {
    assert.equal(validPayload(action, payload), false, JSON.stringify(payload).slice(0, 100));
    const f = fixture();
    assert.equal((await f.execute(action, payload, user)).ok, false);
    assert.equal(f.calls.length, 0);
  }
  assert.equal(validPayload('finish', { attempt_id: user, answers: answers.slice(0, 5) }), true);
  assert.equal(validPayload('finish', { attempt_id: user, answers: answers.slice(0, 4) }), false);
  assert.equal(validPayload('finish', { attempt_id: user, answers: answers.map(a => ({ ...a, answer_payload: { option_codes: [] } })) }), true);
  assert.equal(validPayload('finish', { attempt_id: user, answers: answers.map(a => ({ ...a, answer_payload: { category_answers: { 1: 'Benar', 2: 'Salah' } } })) }), true);
});
test('RPC errors and thrown auth failures are sanitized; question shortage remains actionable', async () => {
  for (const rpc of [{ error: { code: 'XX000', message: 'private-token secret SQL' } }, { error: { code: 'P0001', message: 'private schema details' } }]) {
    const result = await fixture({ rpc }).execute('start', { scenario: 'HOTS' }, user);
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.error, /secret|SQL|schema|private/);
  }
  const shortage = await fixture({ rpc: { error: { code: 'P0001', message: 'Soal published valid tidak cukup untuk HOTS: dibutuhkan 5, tersedia 3 pada jenjang smp' } } }).execute('start', { scenario: 'HOTS' }, user);
  assert.match(shortage.error, /diperlukan 5, tersedia 3/);
  const execute = createVirtualpetActions({ cookies: async () => { throw Error('secret'); }, getUser: async () => null });
  assert.doesNotMatch(JSON.stringify(await execute('bootstrap', {}, user)), /secret/);
});
function request(headers = {}) { return new Request('https://school.test/api/virtualpet/session', { method: 'POST', headers: { origin: 'https://school.test', authorization: 'Bearer secret.jwt.token', ...headers } }); }
test('bridge rejects cross-origin, sibling site, null/missing Origin before auth or cookie writes', async () => {
  const f = fixture();
  const post = createVirtualpetSession(f);
  for (const origin of ['https://evil.test', 'https://sibling.school.test', 'null', '']) assert.equal((await post(request({ origin }))).status, 403);
  assert.equal((await post(request({ 'sec-fetch-site': 'cross-site' }))).status, 403);
  assert.equal(f.calls.length, 0);
});
test('bridge verifies Bearer, sets short HttpOnly production cookie, returns identity only and no-store', async () => {
  const f = fixture();
  const post = createVirtualpetSession({ ...f, production: true });
  const response = await post(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: user });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(f.calls.at(-1), ['set', SESSION_COOKIE, 'secret.jwt.token', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 300 }]);
  assert.equal((await post(request({ authorization: '' }))).status, 401);
  assert.equal(f.calls.at(-1)[3].maxAge, 0);
  const failed = await createVirtualpetSession({ ...f, getUser: async () => { throw Error('secret'); } })(request());
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /secret/);
});
test('server action module exports only async wrappers without token arguments', () => {
  const source = readFileSync(new URL('../src/app/actions/virtualpet.js', import.meta.url), 'utf8');
  assert.match(source, /^"use server"/);
  assert.equal((source.match(/export async function/g) || []).length, 6);
  assert.doesNotMatch(source, /accessToken|service_role|token/);
});
