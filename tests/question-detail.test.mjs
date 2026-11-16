import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const ui = await read('src/components/admin/questions-workspace.js');
const route = await read('src/components/admin/question-detail-page.js');
const detailEntry = await read('src/app/admin/questions/detail/page.js');
const listSource = await read('src/app/admin/questions/page.js');

test('tautan detail memakai satu target bernama tanpa mengubah keadaan daftar', () => {
  const link = ui.match(/<a\s+href=\{`\/admin\/questions\/[\s\S]*?<\/a>/)?.[0];
  assert.ok(link);
  assert.match(link, /encodeURIComponent\(question.id\)/);
  assert.match(link, /target="tka-question-detail"/);
  assert.doesNotMatch(link, /onClick|setPage|setSearch|setSelectedQuestion|_blank|noopener|noreferrer/);
  assert.doesNotMatch(ui, /window.open/);
});

test('rute langsung membaca ID URL di Suspense dan mereset workspace untuk ID baru', () => {
  assert.match(route, /const params = useSearchParams\(\)/);
  assert.match(route, /params.get\("id"\) \|\| ""/);
  assert.match(route, /<Suspense fallback=/);
  assert.match(route, /<QuestionsWorkspace key=\{id\} questionId=\{id\}/);
  assert.match(listSource, /<QuestionsWorkspace \/>/);
  assert.match(detailEntry, /export const instant = false/);
  assert.match(detailEntry, /<QuestionDetailPage \/>/);
});

test('detail dibatasi izin dan mengambil satu soal berdasarkan ID dengan pembatalan request', () => {
  assert.match(ui, /if \(!authReady \|\| !session \|\| !isAdmin \|\| !can\(PERMISSIONS.view\)\) return/);
  const detail = ui.slice(ui.indexOf('if (detailOnly) {'), ui.indexOf('const from = page * pageSize'));
  assert.match(detail, /ID soal tidak valid/);
  assert.match(detail, /\.eq\("id", questionId\)/);
  assert.match(detail, /\.maybeSingle\(\)/);
  assert.match(detail, /abortSignal\(signal\)/);
  assert.match(detail, /if \(signal\?\.aborted\) return/);
  assert.match(detail, /Soal tidak ditemukan atau tidak dapat diakses/);
  assert.match(ui, /granted.includes\(PERMISSIONS.view\)/);
  assert.match(ui, /if \(!can\(PERMISSIONS.edit\)\)/);
  assert.match(ui, /if \(!can\(required\)\) return/);
});

test('detail fokus mempertahankan metadata, editor revisi dan seluruh workflow lama', () => {
  assert.match(ui, /Bank Soal >> Detail Soal/);
  assert.match(ui, /!detailOnly && \(<>/);
  assert.match(ui, /detailOnly && selectedQuestion && selectedVersion/);
  for (const label of ['Materi', 'Topik', 'Status', 'Status Versi']) assert.ok(ui.includes(`["${label}",`));
  assert.match(ui, /Informasi pendukung telaah/);
  assert.match(ui, /target="tka-question-list"/);
  assert.match(ui, /Kembali ke Bank Soal/);
  for (const marker of ['save_question_revision', 'review_question_version', 'p_version_id: version.id', 'selectedStimulus', 'selectedOptions', 'selectedCategoryItems', 'showAnswerKey', 'Simpan Revisi']) assert.ok(ui.includes(marker), marker);
  assert.equal((ui.match(/await loadQuestions\(\)/g) || []).length, 2);
});
