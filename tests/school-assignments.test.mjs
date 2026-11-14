import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentAvailability, assignmentMutationPayload } from '../src/lib/school/assignments.mjs';

const now = Date.parse('2026-11-14T05:00:00Z');
const assignment = { status: 'published', opens_at: '2026-11-14T04:00:00Z', due_at: '2026-11-14T07:00:00Z', duration_minutes: 60 };

test('tugas hanya dapat dimulai dalam jendela yang cukup untuk seluruh durasi', () => {
  assert.equal(assignmentAvailability(assignment, now).canStart, true);
  assert.equal(assignmentAvailability(assignment, now - 7200000).canStart, false);
  assert.equal(assignmentAvailability(assignment, now + 5400000).canStart, false);
  assert.equal(assignmentAvailability(assignment, now + 7200000).canStart, false);
});
test('status cancelled, draft, submitted, expired dan jadwal invalid tidak dapat dimulai', () => {
  for (const changes of [{ status: 'draft' }, { status: 'cancelled' }, { attempt_status: 'SUBMITTED' }, { attempt_id: 'existing', attempt_status: 'EXPIRED' }, { due_at: 'invalid' }, { duration_minutes: -1 }]) {
    assert.equal(assignmentAvailability({ ...assignment, ...changes }, now).canStart, false);
  }
});
test('sesi berjalan dapat dilanjutkan meskipun jendela mulai sesi baru berakhir', () => {
  assert.equal(assignmentAvailability({ ...assignment, attempt_id: 'existing', attempt_status: 'IN_PROGRESS' }, now + 5400000).canStart, true);
});
const form = { class_id: 'class', title: ' Ujian pekanan ', subject_name: ' Matematika ', question_count: '20', duration_minutes: '60', opens_at: assignment.opens_at, due_at: assignment.due_at };
test('payload mutation memakai waktu ISO, angka integer dan optimistic concurrency token', () => {
  const payload = assignmentMutationPayload(form, 'school', { id: 'assignment', updated_at: 'version' });
  assert.equal(payload.p_title, 'Ujian pekanan');
  assert.equal(payload.p_subject_name, 'Matematika');
  assert.equal(payload.p_question_count, 20);
  assert.equal(payload.p_assignment_id, 'assignment');
  assert.equal(payload.p_expected_updated_at, 'version');
  assert.equal(payload.p_opens_at, '2026-11-14T04:00:00.000Z');
});
test('validasi form menolak batas angka, judul kosong, kelas kosong, jadwal invalid dan durasi tidak cukup', () => {
  for (const changes of [{ title: ' ' }, { class_id: '' }, { question_count: 101 }, { question_count: 1.5 }, { duration_minutes: 0 }, { duration_minutes: 241 }, { opens_at: 'invalid' }, { due_at: assignment.opens_at }]) {
    assert.throws(() => assignmentMutationPayload({ ...form, ...changes }, 'school'));
  }
  assert.throws(() => assignmentMutationPayload(form, ''));
});
