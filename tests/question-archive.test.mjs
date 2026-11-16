import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const sql = await read('docs/database/migration-stage-10-question-archive.sql');
const ui = await read('src/components/admin/questions-workspace.js');

test('arsip memakai identitas terverifikasi, permission khusus dan optimistic concurrency', () => {
 for (const marker of ['private.school_actor()', "private.has_admin_permission('bank_soal.view')", "private.has_admin_permission('bank_soal.archive')", 'FOR UPDATE', 'p_expected_status', 'p_expected_version_id', "ERRCODE='40001'", "SET search_path=pg_catalog"]) assert.ok(sql.includes(marker), marker);
 assert.match(sql, /length\(btrim\(p_reason\)\) NOT BETWEEN 5 AND 2000/);
 assert.doesNotMatch(sql, /DELETE FROM|TRUNCATE TABLE/i);
});

test('arsip mempertahankan sejarah, memblokir dependensi dan menutup penulisan audit langsung', () => {
 for (const table of ['exam_attempt_questions', 'exam_attempt_answers', 'school_assignment_questions']) assert.ok(sql.includes(`FROM public.${table} WHERE question_id=q.id`));
 for (const marker of ['FOR SHARE', 'question_archive_reference_guard', 'question_archive_status_guard', 'ENABLE ROW LEVEL SECURITY', 'REVOKE ALL ON public.question_archive_audit FROM PUBLIC,anon,authenticated', 'previous_status', 'latest_version_id', 'actor_id', 'reason']) assert.ok(sql.includes(marker), marker);
 assert.match(sql, /REVOKE ALL ON FUNCTION public.archive_question\(uuid,text,uuid,text\) FROM PUBLIC,anon/);
 assert.match(sql, /GRANT EXECUTE ON FUNCTION public.archive_question\(uuid,text,uuid,text\) TO authenticated/);
 assert.match(sql, /transaction_isolation.*read committed/);
});

test('UI arsip menggunakan dialog, alasan, pencegahan submit ganda dan RPC bukan delete langsung', () => {
 for (const marker of ['bank_soal.archive', '<dialog', 'showModal()', 'archiveReason.trim()', 'archiveInFlight.current', 'p_expected_status: archiveTarget.question_status', 'p_expected_version_id: version.id', 'archive_question', 'Ya, arsipkan soal', 'await loadQuestions()']) assert.ok(ui.includes(marker), marker);
 assert.doesNotMatch(ui, /\.delete\(/);
 assert.match(ui, /data.question_status !== "ARCHIVED"/);
 assert.match(ui, /disabled=\{!can\(PERMISSIONS.archive\) \|\| question.question_status === "ARCHIVED"/);
});

test('runner default rollback, verifikasi read-only, TLS dan project guard', async () => {
 const runner = await read('scripts/migrate-question-archive.cjs');
 for (const marker of ['rejectUnauthorized:true', 'QUESTION_ARCHIVE_APPLY_PROJECT_REF', 'Project mismatch', "'COMMIT' : 'ROLLBACK'", 'REPEATABLE READ READ ONLY', 'ROLLBACK TO SAVEPOINT archive_tests', 'Existing questions must remain unchanged']) assert.ok(runner.includes(marker), marker);
});
