import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMapadventureActions, createMapadventureSession, publicState, validPayload, SESSION_COOKIE } from '../src/lib/server/mapadventure.js';
const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const state = { settings: { SHOW_TIPS: '1', SUBJECT: 'Matematika' }, islands: [{ id: user, theme: 'Bilangan', user_id: user, stars: 3 }], nodes: [{ id: user, theme_id: user, topic: 'Pecahan', user_id: user }], inventory: { clue: 0 }, status: { points: 25, stars: 3 }, wallet: { points: 25 }, session: null };
function fixture(options = {}) {
  const calls = [];
  const getUser = async token => {
    calls.push(['auth', token]);
    return options.invalid ? null : { user: { id: user }, supabase: { rpc: async (name, args) => {
      calls.push(['rpc', name, args]);
      return options.rpc ? options.rpc(args) : { data: state };
    } } };
  };
  const cookies = async () => ({ get: name => { calls.push(['cookie', name]); return options.missing ? undefined : { value: 'private-token' }; }, set: (...args) => calls.push(['set', ...args]) });
  return { calls, getUser, cookies, ...createMapadventureActions({ getUser, cookies }) };
}
const cases = [
  ['bootstrap', {}], ['bootstrap', { attempt_id: other }], ['previous', { attempt_id: user, question_id: other }],
  ['settings', { settings: { SHOW_TIPS: '0', SUBJECT: 'Matematika' } }], ['material', { nodeId: user }],
  ['read_complete', { nodeId: user, readToken: other }], ['start', { nodeId: user, stage: 'practice' }],
  ['answer', { attempt_id: user, question_id: other, answer_payload: { option_codes: ['A'] } }],
  ['timeout', { attempt_id: user, question_id: other }], ['next', { attempt_id: user, question_id: other }],
  ['use_tool', { attempt_id: user, question_id: other, tool: 'clue' }], ['complete_node', { attempt_id: user }],
  ['complete_island', { islandId: user }], ['gacha', { nodeId: user, chestTier: 'golden' }], ['buy', { tool: 'secondchance' }],
];
test('all supported actions reverify cookie identity and call only user-scoped canonical RPC', async () => {
  const f = fixture();
  for (const [action, payload] of cases) {
    const result = await f.execute(action, payload, user);
    assert.equal(result.ok, true, action);
    assert.equal(result.userId, user);
    assert.deepEqual(f.calls.at(-1), ['rpc', 'mapadventure', { p_action: action, p_payload: payload }]);
    assert.equal(result.data.islands[0].user_id, undefined);
    assert.equal(result.data.nodes[0].user_id, undefined);
  }
  assert.equal(f.calls.filter(c => c[0] === 'auth').length, cases.length);
  assert.equal(f.calls[0][1], SESSION_COOKIE);
});
test('canonical settings and tip survive action projection; typo is not an API alias', async () => {
  const tip = { id: other, message: 'Bekal nyata' };
  const f = fixture({ rpc: async () => ({ data: { ...state, tip, tip1: { message: 'obsolete' }, settings: { ...state.settings, SHOW_TIPS1: '0' } } }) });
  const result = await f.execute('settings', { settings: { SHOW_TIPS: '0' } }, user);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.settings, state.settings);
  assert.deepEqual(result.data.tip, tip);
  assert.equal(result.data.tip1, undefined);
  assert.deepEqual(f.calls.at(-1)[2].p_payload, { settings: { SHOW_TIPS: '0' } });
});
test('missing/expired/stale identity rejects before any RPC', async () => {
  for (const options of [{ missing: true }, { invalid: true }, {}]) {
    const f = fixture(options);
    const result = await f.execute('bootstrap', {}, options.missing || options.invalid ? user : other);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ACCOUNT_CHANGED');
    assert.equal(f.calls.some(c => c[0] === 'rpc'), false);
  }
});
test('strict bounded payloads reject score, ownership, rewards, invalid categories/tools and unsafe types', async () => {
  const bad = [
    ['bootstrap', { userId: user }], ['bootstrap', { token: 'secret' }], ['complete_node', { attempt_id: user, score: 100 }],
    ['gacha', { chestTier: 'golden' }], ['gacha', { nodeId: user, chestTier: 'fake' }],
    ['timeout', { attempt_id: user }], ['timeout', { attempt_id: user, question_id: other, is_timeout: true }],
    ['timeout', { attempt_id: user, question_id: other, timestamp: Date.now() }],
    ['answer', { attempt_id: user, question_id: other, answer_payload: { is_timeout: true } }],
    ['settings', { settings: { SHOW_TIPS: 0 } }], ['settings', { settings: { SUBJECT: 'x'.repeat(201) } }],
    ['settings', { settings: { SHOW_TIPS1: '0' } }], ['start', { nodeId: {}, stage: 'practice' }],
    ['answer', { attempt_id: user, question_id: other, answer_payload: { option_codes: ['A', 'A'] } }],
    ['answer', { attempt_id: user, question_id: other, answer_payload: { category_answers: { bad: 'Benar' } } }],
    ['answer', { attempt_id: user, question_id: other, answer_payload: { option_codes: ['A'], category_answers: { 1: 'Benar' } } }],
    ['answer', { attempt_id: user, question_id: other, answer_payload: { option_codes: ['x'.repeat(66000)] } }],
  ];
  for (const [action, payload] of bad) {
    assert.equal(validPayload(action, payload), false);
    const f = fixture();
    assert.equal((await f.execute(action, payload, user)).ok, false);
    assert.equal(f.calls.length, 0);
  }
  assert.equal(validPayload('answer', { attempt_id: user, question_id: other, answer_payload: { option_codes: [] } }), true);
  assert.equal(validPayload('answer', { attempt_id: user, question_id: other, answer_payload: { category_answers: { 1: 'Benar', 2: 'Salah' } } }), true);
});
test('completion compatibility hints never reach SQL; active node and attempt binding are checked', async () => {
  const session = { attempt_id: other, nodeId: user, stage: 'practice', total: 3, answered: 3, question: null, tools: [] };
  const f = fixture({ rpc: async args => ({ data: { ...state, session: args.p_action === 'bootstrap' ? session : null, ...(args.p_action === 'complete_node' ? { result: { nodeId: user, score: 0, passed: false, points: 0, xp: 0, stars: 0, tools: [] } } : {}) } }) });
  const result = await f.completeNode(user, user, 100, [], other);
  assert.equal(result.data.result.score, 0);
  assert.deepEqual(f.calls.at(-1)[2], { p_action: 'complete_node', p_payload: { attempt_id: other } });
  const before = f.calls.filter(c => c[0] === 'rpc' && c[2].p_action === 'complete_node').length;
  assert.equal((await f.completeNode(user, other, 100, [], other)).ok, false);
  assert.equal(f.calls.filter(c => c[0] === 'rpc' && c[2].p_action === 'complete_node').length, before);
  assert.equal((await f.completeNode(other, user, 100, [], other)).code, 'ACCOUNT_CHANGED');
  assert.deepEqual(f.calls.find(c => c[0] === 'rpc')[2], { p_action: 'bootstrap', p_payload: { attempt_id: other } });
  const missing = fixture();
  assert.equal((await missing.completeNode(user, user, 100, [])).ok, false);
  assert.equal(missing.calls.length, 0);
});
test('completed attempt replay returns its bound frozen result without another finish', async () => {
 const result = { attempt_id: other, nodeId: user, passed: true, stars: 3, tools: [] };
 const f = fixture({ rpc: async () => ({ data: { ...state, result } }) });
 const replay = await f.completeNode(user, user, undefined, undefined, other);
 assert.equal(replay.ok, true);
 assert.equal(replay.data.result.attempt_id, other);
 assert.equal(f.calls.filter(call => call[0] === 'rpc').length, 1);
 assert.equal((await f.completeNode(user, other, undefined, undefined, other)).ok, false);
});
test('explicit completion rejects missing, different, and incomplete targeted attempts before finish', async () => {
  for (const session of [null, { attempt_id: user, nodeId: user, total: 3, answered: 3 },
    { attempt_id: other, nodeId: other, total: 3, answered: 3 },
    { attempt_id: other, nodeId: user, total: 3, answered: 2 }]) {
    const f = fixture({ rpc: async () => ({ data: { ...state, session } }) });
    assert.equal((await f.completeNode(user, user, undefined, undefined, other)).ok, false);
    assert.deepEqual(f.calls.filter(c => c[0] === 'rpc').map(c => c[2]), [{ p_action: 'bootstrap', p_payload: { attempt_id: other } }]);
  }
});
test('bootstrap and bidirectional navigation accept only explicit UUID selectors', () => {
  assert.equal(validPayload('bootstrap', {}), true);
  assert.equal(validPayload('bootstrap', { attempt_id: user }), true);
  for (const attempt_id of [null, 1, '', 'bad']) assert.equal(validPayload('bootstrap', { attempt_id }), false);
  for (const action of ['next', 'previous']) {
    assert.equal(validPayload(action, { attempt_id: user, question_id: other }), true);
    for (const payload of [{}, { attempt_id: user }, { question_id: other }, { attempt_id: user, question_id: 'bad' },
      { attempt_id: user, question_id: other, index: 0 }, { attempt_id: user, question_id: other, is_timeout: true }]) assert.equal(validPayload(action, payload), false);
  }
});
test('selected session and descriptor projections expose review answer without private fields', () => {
  const descriptor = { attempt_id: other, nodeId: user, stage: 'practice', subject_code: 'MAT', theme_id: user, index: 1, total: 3, answered: 2 };
  const data = publicState({ ...state, sessions: [{ ...descriptor, user_id: user, records: ['secret'], pool: ['secret'] }],
    session: { ...descriptor, question: { id: user, text: 'Review', answer_keys: { option_codes: ['B'] } },
      feedback: { question_id: user, correct: false, accepted: true },
      answer_payload: { option_codes: ['A', 2], category_answers: { 1: 'Benar', bad: 'secret', 2: 42 }, first_answer: 'secret', answer_keys: ['secret'] } } });
  assert.deepEqual(data.sessions, [descriptor]);
  assert.equal(data.session.question.id, user);
  assert.equal(data.session.feedback.question_id, user);
  assert.deepEqual(data.session.answer_payload, { option_codes: ['A'], category_answers: { 1: 'Benar' } });
  assert.doesNotMatch(JSON.stringify(data), /secret|answer_keys|user_id|records|pool/);
  assert.equal(publicState(state).session, null);
  assert.deepEqual(publicState(state).sessions, []);
});
test('public return strips answer keys, hidden clue, first answers, audit fields', () => {
  const data = publicState({ ...state, session: { tools: [], question: { id: user, answer_keys: { option_codes: ['A'] }, clue: 'hidden', options: [{ option_code: 'A', is_correct: true }], category_items: [{ item_number: 1, correct_category: 'secret' }] }, effects: { clue: 'paid', first_answer: 'secret' } } });
  assert.doesNotMatch(JSON.stringify(data), /answer_keys|hidden|first_answer|is_correct|correct_category|user_id|secret/);
  assert.equal(data.session.effects.clue, 'paid');
});
test('timer projection and strict timeout keys expose no private records; timed tools are allowed', async () => {
  for(const tool of ['freezetime','secondchance']) assert.equal(validPayload('use_tool',{attempt_id:user,question_id:other,tool}),true);
  assert.equal(validPayload('buy',{tool:'freezetime'}),true);
  const s={attempt_id:user,stage:'sidequest',deadline_at:'2026-01-01T00:02:00Z',server_now:'2026-01-01T00:00:00Z',remaining_seconds:120,records:[{answer_payload:'secret'}],question:{id:other,estimate_minutes:2},tools:[{tool:'freezetime',question_id:other,question_index:0}]};
  const data=publicState({...state,session:s,answer:{accepted:true,retry:false,is_timeout:true}});
  assert.equal(data.session.remaining_seconds,120); assert.equal(data.session.server_now,s.server_now); assert.equal(data.session.deadline_at,s.deadline_at);
  assert.equal(data.session.question.estimate_minutes,2); assert.equal(data.answer.is_timeout,true); assert.equal(data.session.tools[0].question_index,0); assert.equal(data.session.records,undefined);
  for(const extra of [{deadline_at:s.deadline_at},{server_now:s.server_now},{is_timeout:false},{answer_payload:{}},{question_id:42}]) assert.equal(validPayload('timeout',{attempt_id:user,question_id:other,...extra}),false);
  assert.equal(validPayload('answer',{attempt_id:user,question_id:other,answer_payload:{}}),false);
  assert.equal((await fixture().execute('timeout',{attempt_id:user,question_id:other},user)).ok,true);
});
test('feedback and final review projection whitelist authoritative fields without leaking active keys or audit', () => {
  const question={id:other,type:'PGK_KATEGORI',text:'Snapshot',answer_keys:{category_answers:{1:'Benar'},first_answer:'secret'},category_items:[{item_number:1,item_text:'Pernyataan',correct_category:'secret'}],clue:'secret',explanation:'Pembahasan',user_id:user};
  const feedback={question_id:other,correct:false,accepted:true,retry:false,is_timeout:true,first_answer:'secret'};
  const data=publicState({...state,session:{question,feedback},answer:feedback,result:{best_stars:3,review:[{question,correct:false,is_timeout:true,answer_payload:{category_answers:{1:'Salah'},first_answer:'secret'},first_answer:'secret'}]}});
  assert.equal(data.answer.correct,false); assert.equal(data.session.feedback.question_id,other); assert.equal(data.session.question.answer_keys,undefined);
  assert.equal(data.result.best_stars,3); assert.deepEqual(data.result.review[0].question.answer_keys,{category_answers:{1:'Benar'}});
  assert.equal(data.result.review[0].question.explanation,'Pembahasan'); assert.equal(data.result.review[0].is_timeout,true);
  assert.doesNotMatch(JSON.stringify(data),/secret|first_answer|user_id|correct_category/);
  for(const p of [{attempt_id:user},{attempt_id:user,question_id:other,correct:true},{attempt_id:other,question_id:'bad'}]) assert.equal(validPayload('next',p),false);
});
test('SQL/auth exceptions are sanitized, known shortages remain actionable', async () => {
  for (const error of [{ code: 'XX000', message: 'private SQL token' }, { code: 'P0001', message: 'secret schema' }]) {
    const result = await fixture({ rpc: async () => ({ error }) }).execute('bootstrap', {}, user);
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.error, /SQL|token|secret|schema/);
  }
  const result = await fixture({ rpc: async () => ({ error: { message: 'Insufficient published questions: need 5, available 2' } }) }).execute('start', { nodeId: user, stage: 'gatekeeper' }, user);
  assert.match(result.error, /diperlukan 5, tersedia 2/);
  const f = createMapadventureActions({ getUser: async () => { throw Error('secret'); }, cookies: async () => ({ get: () => ({ value: 't' }) }) });
  assert.doesNotMatch(JSON.stringify(await f.execute('bootstrap', {}, user)), /secret/);
});
function request(headers = {}) { return new Request('https://school.test/api/mapadventure/session', { method: 'POST', headers: { origin: 'https://school.test', authorization: 'Bearer secret.jwt.token', ...headers } }); }
test('bridge requires exact Origin and same-origin fetch metadata before auth or writes', async () => {
  const f = fixture(); const post = createMapadventureSession(f);
  for (const origin of ['https://evil.test', 'https://sibling.school.test', 'null', '']) assert.equal((await post(request({ origin }))).status, 403);
  assert.equal((await post(request({ 'sec-fetch-site': 'same-site' }))).status, 403);
  const missing = request(); missing.headers.delete('origin'); assert.equal((await post(missing)).status, 403);
  assert.equal(f.calls.length, 0);
});
test('bridge cookie is isolated, verified, HttpOnly, short, secure in production, no-store', async () => {
  const f = fixture(); const post = createMapadventureSession({ ...f, production: true });
  const response = await post(request());
  assert.deepEqual(await response.json(), { userId: user });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(f.calls.at(-1), ['set', SESSION_COOKIE, 'secret.jwt.token', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 300 }]);
  assert.equal((await post(request({ authorization: '' }))).status, 401);
  assert.equal(f.calls.at(-1)[3].maxAge, 0);
  assert.equal((await createMapadventureSession({ ...f, getUser: async () => { throw Error('secret'); } })(request())).status, 503);
});
test('dedicated Next actions expose requested names and no token or service role arguments', () => {
  const source = readFileSync(new URL('../src/app/actions/mapadventure.js', import.meta.url), 'utf8');
  assert.match(source, /^"use server"/);
  for (const name of ['previousMapadventure', 'mapadventure_complete_node', 'mapadventure_complete_island', 'mapadventure_open_gatcha']) assert.match(source, new RegExp(`export async function ${name}\\(`));
  assert.doesNotMatch(source, /accessToken|service_role|token/);
});
