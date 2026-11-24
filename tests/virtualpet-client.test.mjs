import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVirtualpetClient, buildAnswers, categoryLabels, gradeVirtualpetAnswer, mapPet, MODES, ITEM_IDS } from '../src/lib/student/virtualpet-client.js';
const userId = '11111111-1111-4111-8111-111111111111';
const browser = { data: { session: { user: { id: userId }, access_token: 'private-token' } } };
function fixture(overrides = {}) {
  const calls = [];
  const client = createVirtualpetClient({
    getSession: async () => { calls.push(['session']); return browser; },
    fetcher: async (url, options) => { calls.push(['bridge', url, options]); return { ok: true, json: async () => ({ userId }) }; },
    actions: Object.fromEntries(['bootstrap', 'settings', 'adopt', 'feed', 'start', 'finish'].map(action => [action, async (...args) => { calls.push([action, ...args]); return { ok: true, userId, data: { session: null, marker: action } }; }])),
    ...overrides,
  });
  return { calls, client };
}
test('every command renews bridge before action, no token action argument, and rechecks identity after response', async () => {
  const { calls, client } = fixture();
  for (const action of ['bootstrap', 'settings', 'adopt', 'feed', 'start', 'finish']) {
    assert.equal((await client(action, { marker: action })).marker, action);
    const batch = calls.splice(0);
    assert.deepEqual(batch.map(c => c[0]), ['session', 'bridge', action, 'session']);
    assert.deepEqual(batch[2], [action, { marker: action }, userId]);
    assert.equal(batch[1][2].headers.Authorization, 'Bearer private-token');
    assert.equal(batch[1][2].credentials, 'same-origin');
    assert.equal(batch[1][2].cache, 'no-store');
  }
});
test('client rejects concurrent commands and releases busy lock on failure', async () => {
  let release;
  let started;
  const signal = new Promise(resolve => { started = resolve; });
  const f = fixture({ actions: { finish: async () => { started(); await new Promise(resolve => { release = resolve; }); return { ok: false, error: 'Retry' }; } } });
  const first = f.client('finish', {});
  await signal;
  await assert.rejects(f.client('finish', {}), /masih diproses/);
  release();
  await assert.rejects(first, /Retry/);
  const next = f.client('finish', {});
  await new Promise(resolve => setTimeout(resolve, 0));
  release();
  await assert.rejects(next, /Retry/);
});
test('bridge/account mismatch and browser account change cannot paint another user data', async () => {
  let invalidated = 0;
  for (const override of [
    { getSession: async () => ({ data: { session: null } }) },
    { fetcher: async () => ({ ok: true, json: async () => ({ userId: 'other' }) }) },
    { actions: { bootstrap: async () => ({ ok: true, userId: 'other', data: { secret: 'other pet' } }) } },
    { actions: { bootstrap: async () => ({ ok: false, code: 'ACCOUNT_CHANGED' }) } },
  ]) {
    const { client } = fixture({ ...override, onIdentityChange: () => { invalidated++; } });
    await assert.rejects(client('bootstrap'), { code: 'ACCOUNT_CHANGED' });
  }
  assert.equal(invalidated, 4);
  let checks = 0;
  const { client } = fixture({ getSession: async () => ++checks === 1 ? browser : { data: { session: { user: { id: 'other' } } } } });
  await assert.rejects(client('bootstrap'), { code: 'ACCOUNT_CHANGED' });
});
test('bridge error never invokes actions; stale owner rejected before bridge on next call', async () => {
  let identity = browser;
  const f = fixture({ getSession: async () => identity });
  await f.client('bootstrap');
  identity = { data: { session: { user: { id: 'other' }, access_token: 'other-token' } } };
  await assert.rejects(f.client('bootstrap'), { code: 'ACCOUNT_CHANGED' });
  assert.equal(f.calls.filter(c => c[0] === 'bridge').length, 1);
  const denied = fixture({ fetcher: async () => ({ ok: false, json: async () => ({ error: 'secret' }) }) });
  await assert.rejects(denied.client('bootstrap'), /memperbarui sesi/);
  assert.equal(denied.calls.some(c => c[0] === 'bootstrap'), false);
});
test('failed finish retries the same attempt and answers without adding score or reward', async () => {
  const payload = { attempt_id: userId, answers: [{ question_id: 'q1', answer_payload: { option_codes: ['B'] } }] };
  const received = [];
  const { client } = fixture({ actions: { finish: async body => {
    received.push(structuredClone(body));
    if (received.length === 1) throw new Error('Network interrupted');
    return { ok: true, userId, data: { correct: 8, total: 10, score: 80, passed: true, rewards: { water: 1, rice: 1, profile_xp: 1 } } };
  } } });
  await assert.rejects(client('finish', payload), /Network interrupted/);
  const result = await client('finish', payload);
  assert.deepEqual(received, [payload, payload]);
  assert.equal(result.score, 80);
  assert.equal(result.rewards.profile_xp, 1);
  assert.deepEqual(Object.keys(received[1]), ['attempt_id', 'answers']);
});
test('mapping uses canonical SQL inventory, species/name/xp and exact mode counts/rewards', () => {
  const pet = mapPet({ pet: { pet_type: 'bear', pet_name: 'Madu', xp: 9, level: 0, status: 'happy' }, inventory: { rice: 2, cake: 1 } });
  assert.equal(pet.species, 'bear'); assert.equal(pet.name, 'Madu'); assert.equal(pet.xp, 9);
  assert.deepEqual(Object.keys(pet.inventory), ITEM_IDS);
  assert.equal(pet.inventory.rice, 2); assert.equal(pet.inventory.water, 0);
  assert.deepEqual(MODES.map(m => m.count), [5, 5, 10]);
  assert.match(MODES[1].reward, /2 .*apel\/donat\/kue\/vitamin/);
  assert.match(MODES[2].reward, /maksimal 100/);
  assert.equal(mapPet({ pet: null }), null);
});
const questions = [
  { id: 'single', type: 'PG_TUNGGAL', options: [{ option_code: 'A' }, { option_code: 'B' }] },
  { id: 'multi', type: 'PGK_MA', options: [{ option_code: 'A' }, { option_code: 'B' }] },
  { id: 'category', type: 'PGK_KATEGORI', category_items: [{ item_number: 1, category_label: 'Benar / Salah' }, { item_number: 2, category_label: 'Ya/Tidak' }] },
];
test('exact finish answer forms support all types, empty MA and per-item slash categories', () => {
  const drafts = { single: { option_codes: ['B'] }, category: { category_answers: { 1: 'Benar', 2: 'Tidak' } } };
  const result = buildAnswers({ questions }, drafts);
  assert.deepEqual(result, [
    { question_id: 'single', answer_payload: { option_codes: ['B'] } },
    { question_id: 'multi', answer_payload: { option_codes: [] } },
    { question_id: 'category', answer_payload: { category_answers: { 1: 'Benar', 2: 'Tidak' } } },
  ]);
  assert.deepEqual(categoryLabels(questions[2].category_items[0]), ['Benar', 'Salah']);
  assert.throws(() => buildAnswers({ questions }, {}), /pilihan tunggal/);
  assert.throws(() => buildAnswers({ questions }, { single: drafts.single, category: { category_answers: { 1: 'Benar' } } }), /seluruh kategori/);
  drafts.single.option_codes.push('A'); assert.deepEqual(result[0].answer_payload.option_codes, ['B']);
});
test('immediate grading supports exact single/multi sets and case-insensitive categories', () => {
  const single = { type: 'PG_TUNGGAL', answer_keys: { option_codes: ['B'] } };
  assert.equal(gradeVirtualpetAnswer(single, { option_codes: ['B'] }), true);
  assert.equal(gradeVirtualpetAnswer(single, { option_codes: ['A'] }), false);
  const multi = { type: 'PGK_MA', answer_keys: { option_codes: ['B', 'C'] } };
  assert.equal(gradeVirtualpetAnswer(multi, { option_codes: ['C', 'B'] }), true);
  assert.equal(gradeVirtualpetAnswer(multi, { option_codes: ['B'] }), false);
  assert.equal(gradeVirtualpetAnswer(multi, { option_codes: [] }), false);
  const category = { ...questions[2], answer_keys: { category_answers: { 1: 'Benar', 2: 'Tidak' } } };
  assert.equal(gradeVirtualpetAnswer(category, { category_answers: { 1: ' benar ', 2: 'TIDAK' } }), true);
  assert.equal(gradeVirtualpetAnswer(category, { category_answers: { 1: 'Benar' } }), false);
});

test('UI source contract: server-only state/rewards, retry gate, ordered one-shot tips, resume/focus and frozen finish', () => {
  const source = name => readFileSync(new URL(`../src/components/student/virtualpet/${name}`, import.meta.url), 'utf8');
  const room = source('VirtualPetRoom.jsx'); const hook = source('useVirtualpetRoom.js'); const quiz = source('VirtualpetQuiz.jsx');
  assert.match(room, /function PetIllustration/); assert.match(room, /<motion.svg/);
  assert.doesNotMatch(room, /function decay|setPet|setDev|Simulasi|Mode demo|Date.now\(|"food"|"legendary"|"medicine"/);
  for (const line of room.split('\n').filter(line => line.includes('localStorage.'))) assert.match(line, /KEY\}-theme/);
  assert.match(room, /loaded && !tips && !session && !result/);
  assert.match(room, /Coba lagi/); assert.match(room, /Jangan tampilkan lagi/);
  assert.ok(room.indexOf('await run("feed"') < room.indexOf('setEffects(previous'));
  assert.match(hook, /if \(lock.current\)/); assert.match(hook, /finally[\s\S]*lock.current = false/);
  assert.match(hook, /tipsSeen.current = true/); assert.match(hook, /if \(!saved\) setHideTips\(previous\)/);
  assert.match(hook, /SHOW_TIPS: checked \? "0" : "1"/);
  assert.match(hook, /latest.current\?\.session/); assert.match(hook, /visibilitychange/); assert.match(hook, /"focus"/);
  for (const field of ['q.text', 'q.instruction', 'content_text', 'media_description', 'file_url', 'category_items', 'option_code']) assert.ok(quiz.includes(field), field);
  assert.match(quiz, /submitted \|\| \{ attempt_id: session.attempt_id/);
  assert.doesNotMatch(quiz, /setInterval|remaining_seconds|score\s*[:=]/);
  assert.match(quiz, /gradeVirtualpetAnswer/);
  assert.match(quiz, /disabled=\{frozen\}/);
  assert.match(quiz, /last \? <button/);
  assert.match(quiz, /Konfirmasi Jawaban/);
  assert.match(quiz, /className="sm:hidden">Jawab/);
  assert.match(quiz, /className="sm:hidden">Selesai/);
  assert.match(room, /aria-label="Reward yang didapat"/);
  assert.match(room, /pet.hydration === 0 \|\| pet.hunger === 0/);
  assert.match(room, /pingsan! Butuh penyelamatan\./);
  assert.match(room, /const ill = status === "sick" \|\| fainted/);
  assert.match(room, /data-pet-care="infus"/);
  assert.match(room, /data-pet-care="kompres"/);
  assert.doesNotMatch(room, /Zz|Sedang hibernasi|const asleep/);
  assert.match(room, /onClick=\{\(\) => setRescueOpen\(true\)\}>Misi Penyelamatan/);
  assert.match(room, /fainted && rescueOpen && !session && !tips && !result/);
  assert.match(room, /\["hunger", "hydration", "rice", "water", "apple", "donut", "cake", "vitamin", "xp"\]/);
  assert.doesNotMatch(room, /<span>\{label\}<\/span>/);
  assert.match(room, /inline-flex items-center gap-2 rounded-full border/);
  assert.match(quiz, /sm:hidden/);
  assert.doesNotMatch(quiz, /<select/);
  assert.match(room, /Total pertanyaan/);
  assert.match(room, /Review jawaban/);
  assert.match(hook, /reviewSession/);
  assert.match(quiz, /Tanpa batas waktu/); assert.match(room, /result.correct/); assert.match(room, /result.rewards/);
});
