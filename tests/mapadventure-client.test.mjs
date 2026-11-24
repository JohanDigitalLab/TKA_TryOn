import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMapadventureClient, buildAnswer, categoryLabels, questionSecondsLeft, safeMaterialUrl, openGachaChest, STAGES, TOOLS } from '../src/lib/student/mapadventure-client.js';
const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const active = { settings: { SHOW_TIPS: '1' }, session: { attempt_id: user, question: { id: other }, effects: {} } };
const payload = { attempt_id: user, question_id: other, answer_payload: { option_codes: ['A'] } };
function fixture(options = {}) {
  const calls = [];
  let identity = user;
  const actions = new Proxy({}, { get: (_, action) => async (p, id) => {
    calls.push([action, p, id]);
    if (options.action) return options.action(action, p, id);
    return { ok: true, userId: user, data: active };
  } });
  const getSession = async () => ({ data: { session: identity ? { access_token: 'secret.jwt', user: { id: identity } } : null } });
  let invalidations = 0;
  const client = createMapadventureClient({ getSession: options.getSession || getSession, actions, fetcher: options.fetcher || (async (url, init) => {
    calls.push(['bridge', url, init]);
    return { ok: true, status: 200, json: async () => ({ userId: identity }) };
  }), onIdentityChange: () => { invalidations += 1; } });
  return { client, calls, identity: id => { identity = id; }, invalidations: () => invalidations };
}
test('bridge alone gets Bearer; action receives only payload and nonsecret expected identity', async () => {
  const f = fixture(); await f.client('bootstrap');
  assert.equal(f.calls[0][1], '/api/mapadventure/session');
  assert.equal(f.calls[0][2].headers.Authorization, 'Bearer secret.jwt');
  assert.equal(f.calls[0][2].credentials, 'same-origin');
  assert.deepEqual(f.calls[1], ['bootstrap', {}, user]);
  assert.doesNotMatch(JSON.stringify(f.calls[1]), /secret/);
});
test('canonical tips settings travel unchanged through browser actions and responses', async () => {
  const tip = { id: other, message: 'Bekal nyata' };
  const f = fixture({ action: async (action, p) => ({ ok: true, userId: user, data: { ...active, settings: p.settings, tip: p.settings.SHOW_TIPS === '1' ? tip : null } }) });
  let result = await f.client('settings', { settings: { SHOW_TIPS: '0' } });
  assert.deepEqual(result.settings, { SHOW_TIPS: '0' }); assert.equal(result.tip, null);
  result = await f.client('settings', { settings: { SHOW_TIPS: '1' } });
  assert.deepEqual(result.tip, tip); assert.equal(result.tip1, undefined);
  assert.deepEqual(f.calls.filter(c => c[0] === 'settings').map(c => c[1]), [{ settings: { SHOW_TIPS: '0' } }, { settings: { SHOW_TIPS: '1' } }]);
});
test('client busy guard prevents duplicate purchases during pending request', async () => {
  let release;
  const f = fixture({ action: async () => { await new Promise(resolve => { release = resolve; }); return { ok: true, userId: user, data: active }; } });
  const first = f.client('buy', { tool: 'clue' });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(f.client('buy', { tool: 'clue' }), /masih diproses/);
  release(); await first;
  assert.equal(f.calls.filter(c => c[0] === 'buy').length, 1);
});
test('identity changes before/after request, missing auth and server mismatch invalidate data', async () => {
  const f = fixture(); await f.client('bootstrap'); f.identity(other);
  await assert.rejects(f.client('bootstrap'), { code: 'ACCOUNT_CHANGED' }); assert.equal(f.invalidations(), 1);
  const absent = fixture(); absent.identity(null); await assert.rejects(absent.client('bootstrap'), { code: 'ACCOUNT_CHANGED' });
  const stale = fixture({ action: async () => ({ ok: false, code: 'ACCOUNT_CHANGED' }) }); await assert.rejects(stale.client('bootstrap'), { code: 'ACCOUNT_CHANGED' });
  let post;
  const late = fixture({ action: async () => { post.identity(other); return { ok: true, userId: user, data: active }; } }); post = late;
  await assert.rejects(late.client('bootstrap'), { code: 'ACCOUNT_CHANGED' });
});
test('account switch while bridge is in flight prevents mutation dispatch', async () => {
  let count = 0;
  const f = fixture({ getSession: async () => ({ data: { session: { access_token: 'secret', user: { id: ++count === 1 ? user : other } } } }) });
  await assert.rejects(f.client('buy', { tool: 'clue' }), { code: 'ACCOUNT_CHANGED' });
  assert.equal(f.calls.some(c => c[0] === 'buy'), false);
});
test('lost final secondchance answer is replayed identically only while question remains unchanged', async () => {
  let answered = false;
  const retried = { ...active, session: { ...active.session, effects: { secondchance: true, retried: true } } };
  const f = fixture({ action: async action => {
    if (action === 'answer' && !answered) { answered = true; throw Error('network'); }
    return { ok: true, userId: user, data: retried };
  } });
  await assert.rejects(f.client('answer', payload, { retried: true }), /jawaban belum dihapus/);
  await f.client('answer', { ...payload, answer_payload: { option_codes: ['B'] } }, { retried: true });
  const answers = f.calls.filter(c => c[0] === 'answer');
  assert.equal(answers.length, 2);
  assert.deepEqual(answers[0][1], answers[1][1]);
});
test('lost answer response reconciles advanced question instead of submitting twice', async () => {
  const advanced = { ...active, session: { ...active.session, question: { id: user } } };
  const f = fixture({ action: async action => { if (action === 'answer') throw Error('network'); return { ok: true, userId: user, data: advanced }; } });
  const result = await f.client('answer', payload);
  assert.equal(result.session.question.id, user);
  assert.equal(f.calls.filter(c => c[0] === 'answer').length, 1);
  assert.match(result.notice, /Koneksi terputus/);
});
test('lost secondchance response reconciles retried flag without turning retry into final answer', async () => {
  const f = fixture({ action: async action => { if (action === 'answer') throw Error('network'); return { ok: true, userId: user, data: { ...active, session: { ...active.session, effects: { retried: true } } } }; } });
  const result = await f.client('answer', payload, { retried: false });
  assert.equal(result.session.effects.retried, true);
  assert.equal(f.calls.filter(c => c[0] === 'answer').length, 1);
});
test('uncommitted answer retry remains identical, preserving original draft payload', async () => {
  let count = 0;
  const f = fixture({ action: async action => {
    if (action === 'answer' && ++count === 1) throw Error('network');
    return { ok: true, userId: user, data: active };
  } });
  await assert.rejects(f.client('answer', payload), /jawaban belum dihapus/);
  await f.client('answer', { ...payload, answer_payload: { option_codes: ['B'] } });
  const answers = f.calls.filter(c => c[0] === 'answer');
  assert.deepEqual(answers[0][1], answers[1][1]);
});
test('uncertain buy/tool are reconciled, never automatically replayed even if bootstrap also fails', async () => {
  for (const mutation of ['buy', 'use_tool']) {
    let down = true;
    const f = fixture({ action: async () => { if (down) throw Error('network'); return { ok: true, userId: user, data: active }; } });
    await assert.rejects(f.client(mutation, { tool: 'clue' }), /Koneksi terputus/);
    down = false;
    const result = await f.client(mutation, { tool: 'clue' });
    assert.equal(f.calls.filter(c => c[0] === mutation).length, 1);
    assert.match(result.notice, /Data tersimpan/);
  }
});
test('authoritative rejection is shown without blind retries', async () => {
  const f = fixture({ action: async () => ({ ok: false, error: 'Stok habis' }) });
  await assert.rejects(f.client('use_tool', { tool: 'clue' }), /Stok habis/);
  assert.equal(f.calls.filter(c => c[0] === 'bootstrap').length, 0);
});
test('three question structures produce answer payload only, including empty multiselect', () => {
  const q = { type: 'PG_TUNGGAL', options: [{ option_code: 'A' }, { option_code: 'B' }] };
  assert.deepEqual(buildAnswer(q, { option_codes: ['A'] }), { option_codes: ['A'] });
  assert.throws(() => buildAnswer(q), /Pilih satu/);
  assert.throws(() => buildAnswer(q, { option_codes: ['A'] }, { eliminated: ['A'] }), /tidak tersedia/);
  assert.deepEqual(buildAnswer({ ...q, type: 'PGK_MA' }), { option_codes: [] });
  const item = { item_number: 1, category_label: ' Benar / Salah / Benar' };
  assert.deepEqual(categoryLabels(item), ['Benar', 'Salah']);
  const category = { type: 'PGK_KATEGORI', category_items: [item] };
  assert.throws(() => buildAnswer(category), /Lengkapi/);
  assert.deepEqual(buildAnswer(category, { category_answers: { 1: 'Benar' } }), { category_answers: { 1: 'Benar' } });
});
test('material URLs are absolute http(s) only; PDF detection handles query/hash', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,secret', '/relative.pdf', 'https://user:pass@school.test/a.pdf', null]) assert.equal(safeMaterialUrl(value), null);
  assert.equal(safeMaterialUrl('https://school.test/Materi.PDF?download=1#page=2').pdf, true);
  assert.equal(safeMaterialUrl('http://school.test/material').pdf, false);
});
test('gacha helper calls node-scoped server operation; freeze timed only and graph sequential', async () => {
  const calls = [];
  await openGachaChest(async (...args) => calls.push(args), user, 'golden');
  assert.deepEqual(calls, [['gacha', { nodeId: user, chestTier: 'golden' }]]);
  assert.deepEqual(STAGES.map(s => s.id), ['material', 'practice', 'sidequest', 'mysterychest', 'gatekeeper']);
  assert.equal(TOOLS.find(t => t.id === 'freezetime').timedOnly, true);
  assert.equal(TOOLS.find(t => t.id === 'freezetime').price, 40);
  assert.equal(TOOLS.find(t => t.id === 'secondchance').price, 80);
  assert.equal(STAGES.find(s => s.id === 'practice').requirement, 'Lulus: 3/3 benar (100%).');
  assert.equal(STAGES.find(s => s.id === 'sidequest').requirement, 'Lulus: 5/5 benar (100%).');
  assert.equal(STAGES.find(s => s.id === 'gatekeeper').requirement, 'Lulus: minimal 4/5 benar (80%).');
});
test('stage selection copy distinguishes sidequest priority and medium-only gatekeeper without changing pass thresholds', () => {
  assert.equal(STAGES.find(s => s.id === 'sidequest').selection, '5 soal: prioritaskan SUSAH/SULIT atau SEDANG dengan estimasi >5 menit; kekurangan diisi SEDANG lainnya. Tidak pernah MUDAH, termasuk yang >5 menit. Ganti soal mengikuti aturan yang sama.');
  assert.equal(STAGES.find(s => s.id === 'gatekeeper').selection, '5 soal hanya SEDANG. Tidak beralih ke MUDAH atau SUSAH/SULIT bila bank kurang. Ganti soal mengikuti aturan yang sama.');
});
test('server-anchored countdown ignores device clock, clamps expiry and leaves practice untimed', () => {
 const s={stage:'sidequest',deadline_at:'2026-01-01T00:02:00Z',server_now:'2026-01-01T00:00:00Z',remaining_seconds:120};
 assert.equal(questionSecondsLeft(s),120); assert.equal(questionSecondsLeft(s,30000),90);
 assert.equal(questionSecondsLeft(s,120000),0); assert.equal(questionSecondsLeft(s,999999),0);
 assert.equal(questionSecondsLeft({...s,stage:'practice'}),null);
 assert.equal(questionSecondsLeft({...s,remaining_seconds:undefined},60000),60);
});
test('lost timeout response reconciles advance and never times out next question on replay', async () => {
 const advanced={...active,session:{...active.session,question:{id:user}}};
 const f=fixture({action:async action=>{if(action==='timeout') throw Error('network'); return {ok:true,userId:user,data:advanced};}});
 const r=await f.client('timeout',{attempt_id:user,question_id:other});
 assert.equal(r.session.question.id,user); assert.equal(f.calls.filter(c=>c[0]==='timeout').length,1);
});
test('uncommitted timeout retries identical keys only after bootstrap reconciliation', async () => {
 let n=0;
 const f=fixture({action:async action=>{if(action==='timeout' && ++n===1) throw Error('network'); return {ok:true,userId:user,data:structuredClone(active)};}});
 await assert.rejects(f.client('timeout',{attempt_id:user,question_id:other}),/Koneksi terputus/);
 await f.client('timeout',{attempt_id:user,question_id:user});
 assert.deepEqual(f.calls.filter(c=>c[0]==='timeout').map(c=>c[1]),[{attempt_id:user,question_id:other},{attempt_id:user,question_id:other}]);
});
test('UI integration contract: no demo bank/local progression, reading gate, actual session/rewards, immediate tips rollback', () => {
  const ui = readFileSync(new URL('../src/components/student/mapadventure/MapAdventure.jsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/components/student/mapadventure/useMapAdventure.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ui + hook, /Math\.random|ISLANDS_MATH|rollChest|arithSeries|localStorage|onReset|setPoints|setInventory|setProgress|answer_keys/);
  for (const expected of ['state.islands.map', 'state.subjects.map', 'state.wallet.points', 'state.status.stars', 'game.result.points', 'game.reward.tools', 'session.answered', 'effects.clue', 'effects.eliminated', 'effects.secondchance', 'effects.retried']) assert.ok(ui.includes(expected), expected);
  assert.match(ui, /session.stage !== "practice"/);
  assert.match(ui, /role="timer"/);
  assert.match(ui, /questionSecondsLeft\(session, performance.now\(\) - receivedAt\)/);
  assert.match(ui, /timeoutBusy.current/);
  assert.match(ui, /timeoutSent.current !== key/);
  assert.match(ui, /void run\("timeout", \{ attempt_id: session.attempt_id, question_id: q.id \}\)/);
  assert.match(ui, /tool.timedOnly && !timed/);
  assert.match(hook, /timeout: timeoutMapadventure/);
  assert.match(ui, /scrollHeight <= element.clientHeight/);
  assert.match(ui, /scrollTop \+ e.clientHeight >= e.scrollHeight/);
  assert.match(ui, /readToken: material.readToken/);
  assert.match(ui, /sandbox="" referrerPolicy="no-referrer"/);
  assert.match(ui, /rel="noopener noreferrer"/);
  assert.match(ui, /STAGES.find\(s => s.id === session.stage\)\?\.requirement/);
  assert.match(ui, /STAGES.find\(s => s.id === session.stage\)\?\.selection/);
  assert.doesNotMatch(ui + hook, /SHOW_TIPS1|tip1/);
  assert.match(hook, /SHOW_TIPS === "1" && data.tip\?\.message/);
  assert.match(hook, /SHOW_TIPS: checked \? "0" : "1"/);
  assert.match(hook, /if \(!saved && version === generation.current\) setHideTips\(previous\)/);
  assert.match(hook, /if \(lock.current\) return Promise.resolve\(null\)/);
  assert.match(hook, /onAuthStateChange/);
  assert.match(hook, /version !== generation.current/);
  assert.match(ui, /key=\{`\$\{state.session.attempt_id\}:\$\{state.session.question\?\.id/);
});
