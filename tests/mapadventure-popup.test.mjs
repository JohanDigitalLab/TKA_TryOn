import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMapadventureClient } from '../src/lib/student/mapadventure-client.js';

const ui = readFileSync(new URL('../src/components/student/mapadventure/MapAdventure.jsx', import.meta.url), 'utf8');
const quiz = ui.slice(ui.indexOf('function Quiz('), ui.indexOf('function AdventureResult('));

test('modal header and bag balance stay outside the scrolling body', () => {
  const modal = ui.slice(ui.indexOf('function Modal('), ui.indexOf('function Feedback('));
  assert.match(modal, /flex-col overflow-hidden/);
  assert.match(modal, /header className="flex shrink-0/);
  assert.ok(modal.indexOf('{headerBadge}') < modal.indexOf('overflow-y-auto'));
  assert.match(ui, /title="Tas Alat" headerBadge=/);
});

test('quiz has two-line attempt header without removing the question timer', () => {
  assert.match(quiz, /Soal \$\{session.index \+ 1\}\/\$\{session.total\} · Tanpa batas waktu/);
  assert.match(quiz, /subtitle=\{STAGES.find/);
  assert.match(quiz, /role="timer" aria-label="Sisa waktu soal"/);
  assert.match(quiz, /questionSecondsLeft\(session, performance.now\(\) - receivedAt\)/);
});

test('tool badges expose icon and stock only with keyboard accessible tooltip', () => {
  assert.match(quiz, /tabIndex=\{0\} aria-label=\{description\}/);
  assert.match(quiz, /aria-describedby=\{`map-tool-\$\{tool.id\}`\}/);
  assert.match(quiz, /role="tooltip"/);
  assert.match(quiz, /group-hover:block group-focus-within:block/);
  assert.match(quiz, /aria-hidden="true">\{tool.symbol\} \{game.state.inventory\[tool.id\] \|\| 0\}/);
});

test('inline feedback directly precedes one-row navigation and right aligned responsive submit', () => {
  const status = quiz.indexOf('{(feedback || retryFeedback || effects.retried || expired)');
  const nav = quiz.indexOf('<nav aria-label="Navigasi soal"');
  assert.ok(status > quiz.indexOf('<BossFightChoices') && status < nav);
  assert.match(quiz.slice(status, nav), /Jawaban sudah dikunci/);
  assert.match(quiz.slice(status, nav), /menunggu konfirmasi server/);
  assert.match(quiz, /flex flex-nowrap items-center gap-2/);
  assert.match(quiz, /aria-label="Sebelumnya"/);
  assert.match(quiz, /aria-label="Sesudahnya"/);
  assert.match(quiz, /ml-auto px-3!/);
  assert.match(quiz, /sm:hidden">Jawab/);
  assert.match(quiz, /disabled=\{game.busy \|\| !q \|\| expired \|\| readOnly\}/);
  assert.match(ui, /const message = game.quizOpen \? "" : game.error \|\| game.notice/);
});

test('correct, incorrect and timeout server records survive navigation without regrading or mutation', async () => {
  for (const outcome of [{ correct: true }, { correct: false }, { correct: false, is_timeout: true }]) {
    const feedback = { question_id: 'q1', accepted: true, retry: false, ...outcome };
    const answer_payload = outcome.is_timeout ? {} : { option_codes: ['B'] };
    const saved = { attempt_id: 'attempt', question: { id: 'q1' }, feedback, answer_payload };
    const request = createMapadventureClient({
      getSession: async () => ({ data: { session: { access_token: 'token', user: { id: 'user' } } } }),
      fetcher: async () => ({ ok: true, json: async () => ({ userId: 'user' }) }),
      actions: Object.fromEntries(['answer', 'timeout', 'next', 'previous'].map(action => [action, async () => ({
        ok: true, userId: 'user', data: { session: action === 'next' ? { attempt_id: 'attempt', question: { id: 'q2' } } : structuredClone(saved) },
      })])),
    });
    const first = await request(outcome.is_timeout ? 'timeout' : 'answer', { attempt_id: 'attempt', question_id: 'q1', answer_payload });
    await request('next', { attempt_id: 'attempt', question_id: 'q1' });
    const back = await request('previous', { attempt_id: 'attempt', question_id: 'q2' });
    assert.deepEqual(first.session.feedback, feedback);
    assert.deepEqual(back.session.feedback, feedback);
    assert.deepEqual(back.session.answer_payload, answer_payload);
  }
});
