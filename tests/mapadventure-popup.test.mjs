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
  assert.match(ui, /title="Tas Alat"[\s\S]{0,24}headerBadge=/);
});

test('quiz has two-line attempt header without removing the question timer', () => {
  assert.match(quiz, /Soal \$\{session.index \+ 1\}\/\$\{session.total\}/);
  assert.match(quiz, /role="progressbar"/);
  assert.match(ui, /hideHeader=\{reviewing\}/);
  assert.match(ui, /flex flex-col gap-3 sm:flex-row sm:justify-end/);
  assert.match(quiz, /subtitle=\{STAGES.find/);
  assert.match(quiz, /role="timer" aria-label="Sisa waktu soal"/);
  assert.match(quiz, /questionSecondsLeft\(session, performance.now\(\) - receivedAt\)/);
});

test('tool badges expose icon and stock only with keyboard accessible tooltip', () => {
  assert.match(quiz, /tabIndex=\{0\}[\s\S]{0,24}aria-label=\{description\}/);
  assert.match(quiz, /aria-describedby=\{`map-tool-\$\{tool\.id\}`\}/);
  assert.match(quiz, /role="tooltip"/);
  assert.match(quiz, /group-hover:block group-focus-within:block/);
  assert.match(quiz, /aria-hidden="true">\s*\{tool\.symbol\} \{game\.state\.inventory\[tool\.id\] \|\| 0\}/);
});

test('inline feedback precedes one-row controls with submit left and navigation right', () => {
  const status = quiz.indexOf('{(feedback || retryFeedback || effects.retried || expired)');
  const nav = quiz.search(/<nav[\s\S]{0,40}aria-label="Navigasi soal"/);
  assert.ok(status > 0 && nav > 0, 'feedback block and nav both found');
  assert.ok(status < nav, 'feedback rendered before the control row');
  assert.ok(status > quiz.indexOf('<BossFightChoices'));
  assert.match(quiz.slice(status, nav), /Jawaban sudah dikunci/);
  assert.match(quiz.slice(status, nav), /menunggu konfirmasi server/);
  const row = quiz.slice(nav, quiz.indexOf('</nav>', nav));
  assert.match(row, /flex flex-nowrap items-center gap-2/);
  const submit = row.indexOf('onClick={answer}');
  const previous = row.indexOf('aria-label="Sebelumnya"');
  const next = row.indexOf('aria-label="Sesudahnya"');
  assert.ok(submit >= 0 && previous >= 0 && next >= 0);
  assert.ok(submit < previous && previous < next, 'submit left, previous then next right');
  assert.match(row, /className="ml-auto flex flex-nowrap items-center gap-2"/);
  assert.match(row, /sm:hidden">Jawab/);
  assert.match(row, /hidden sm:inline">Kirim Jawaban/);
  assert.match(row, /disabled=\{game\.busy \|\| !q \|\| expired \|\| readOnly\}/);
  assert.match(ui, /const message = game\.quizOpen \? "" : game\.error \|\| game\.notice/);
});

test('quiz body uses twenty pixel mobile and twenty eight pixel desktop padding', () => {
  const modal = ui.slice(ui.indexOf('function Modal('), ui.indexOf('function Feedback('));
  assert.match(quiz, /bodyClass="pt-1! px-5! pb-5! sm:pt-1! sm:px-7! sm:pb-7!"/);
  assert.match(modal, /bodyClass = ""/);
  assert.match(modal, /\$\{bodyClass\}/);
});

test('last question replaces Sesudahnya with a responsive finish control', () => {
  assert.match(quiz, /\{hasNext \? \(/);
  assert.match(quiz, /aria-label="Selesaikan sesi"/);
  assert.match(quiz, /sm:hidden">Selesaikan</);
  assert.match(quiz, /hidden sm:inline">Selesaikan sesi</);
  assert.match(quiz, /disabled=\{game\.busy \|\| !q \|\| !allHandled\}/);
  assert.doesNotMatch(quiz, /Selesaikan sesi dan lihat hasil/);
});

test('locked answers expose only an unused secondchance and clue hides without question clue', () => {
  assert.match(quiz, /if \(tool\.id === "clue" && q\?\.has_clue === false\) return false;/);
  assert.match(quiz, /const lockedWrong =[\s\S]{0,120}feedback\.correct === false \|\| feedback\.is_timeout === true/);
  assert.match(quiz, /return tool.id !== "secondchance"/);
  assert.match(quiz, /if \(readOnly\)[\s\S]{0,120}lockedWrong[\s\S]{0,120}!secondchanceUsed[\s\S]{0,120}tool\.id === "secondchance"/);
  assert.match(quiz, /\{visibleTools\.length > 0 && \(/);
  assert.match(quiz, /\{visibleTools\.map\(\(tool\) => \{/);
  assert.doesNotMatch(quiz, /\{TOOLS\.map\(\(tool\) => \{/);
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
