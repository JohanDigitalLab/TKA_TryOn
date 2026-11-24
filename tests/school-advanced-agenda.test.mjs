import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../docs/database/migration-school-advanced-agenda.sql', import.meta.url), 'utf8');
function body(name) {
 const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
 assert.ok(start >= 0, name);
 const rest = sql.slice(start);
 const tag = rest.match(/AS (\$\w+\$)/)?.[1];
 assert.ok(tag, name);
 return rest.slice(0, rest.indexOf(tag + ';', rest.indexOf(tag) + tag.length) + tag.length + 1);
}
test('review-only with explicit identity and dependency gates; additive schema only', () => {
 assert.match(sql, /ROLLBACK;[^\n]*\n?$/);
 assert.doesNotMatch(sql, /\bCOMMIT\s*;|\bDROP\s+(TABLE|COLUMN)|\bTRUNCATE\b|DISABLE ROW LEVEL SECURITY/i);
 assert.match(sql, /school_advanced\.school_uid_reference/);
 assert.match(sql, /school_advanced\.affiliation_writers_reviewed/);
 assert.match(sql, /ambiguous school ID\/account UID/);
 assert.match(sql, /school_blockers_schedule_recipient_unique/);
 assert.match(sql, /UNIQUE\(scheduled_tryout_id,user_id\)/);
 assert.match(sql, /FOREIGN KEY\(scheduled_tryout_id,user_id\)/);
 assert.doesNotMatch(sql, /CREATE TABLE/i);
});
test('school authorization is active verified, scoped and fails closed for legacy conflicts', () => {
 const scope = body('private.school_advanced_scope');
 for (const pattern of [/private.school_actor/, /email_confirmed_at/, /banned_until/, /is_managed/, /account_type='SCHOOL'/, /school_id<>p_school/, /role=ANY\(p_roles\)/, /IN SHARE MODE/]) assert.match(scope, pattern);
 assert.match(body('private.require_school_staff'), /private.school_require/);
 for (const name of ['get_teacher_workspace','save_school_assignment','set_school_assignment_status','get_school_assignment_ranking']) {
  assert.match(body('public.' + name), /private.require_school_staff/);
  assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.x${name}\\(`));
  assert.doesNotMatch(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.x${name}\\(`));
 }
 assert.match(body('public.set_school_assignment_status'), /private.school_advanced_scope\(a.school_id,recipient/);
});
test('publish freezes a single SET package and validates complete cohort without fallback', () => {
 const publish = body('public.set_school_schedule_status');
 for (const pattern of [/FOR UPDATE/, /p_expected_revision/, /tka_code2 IS NOT NULL/, /cfg.type<>'SET'/, /Incomplete SET snapshot/, /private.school_advanced_scope/, /agenda_snapshot=jsonb_build_object/]) assert.match(publish, pattern);
 assert.match(sql, /CREATE TRIGGER school_agenda_cohort_freeze/);
 assert.match(sql, /Published agenda question content is immutable/);
 assert.match(body('public.create_school_schedule'), /cardinality\(p_participant_ids\).*BETWEEN 1 AND 500/);
});
test('start/resume/save/submit all enforce schedule access; scoring remains existing engine', () => {
 assert.match(body('public.start_school_schedule'), /private.school_schedule_access/);
 assert.match(body('public.start_school_schedule'), /jsonb_to_recordset\(s->'questions'\)/);
 assert.match(body('private.resume_tka_tryout'), /private.school_schedule_deadline/);
 assert.match(body('public.save_exam_answer'), /v_now>=v_schedule_deadline/);
 assert.match(body('public.save_exam_answer'), /private.exam_answer_payload_is_valid/);
 assert.match(body('public.submit_exam_attempt'), /private.school_schedule_deadline/);
 assert.match(body('public.submit_exam_attempt'), /private.exam_answer_is_correct/);
 assert.match(body('private.school_schedule_deadline'), /least\(t.deadline_at,e.deadline_at,e.started_at/);
 assert.match(body('private.school_schedule_access'), /agenda_status IS DISTINCT FROM 'published'/);
 assert.match(body('public.start_tka_tryout'), /scheduled_tryout_id IS NULL/);
 assert.doesNotMatch(body('public.start_tka_tryout'), /attempt_status='EXPIRED'/);
 assert.match(body('private.learning_legacy_start'), /Use the activity-specific start\/resume endpoint/);
});
test('bounded monitoring excludes question payload and private helpers remain closed', () => {
 const monitor = body('public.get_school_schedule_participants');
 assert.match(monitor, /p_limit NOT BETWEEN 1 AND 100/);
 assert.match(monitor, /private.require_school_staff/);
 assert.doesNotMatch(monitor, /answer_payload|question_text|agenda_snapshot/);
 assert.match(body('public.school_advanced_capabilities'), /school-advanced-sql\/1/);
 for (const match of sql.matchAll(/CREATE OR REPLACE FUNCTION (private\.[a-z_]+)\(/g)) {
  assert.ok(sql.includes(`REVOKE ALL ON FUNCTION ${match[1]}(`), match[1]);
 }
 assert.doesNotMatch(sql, /GRANT (SELECT|INSERT|UPDATE|DELETE|ALL).*ON (TABLE|public\.scheduled)/);
});
test('all function definitions have terminated dollar-quoted bodies and locked search path', () => {
 const declarations = [...sql.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\(/g)];
 assert.ok(declarations.length >= 20);
 for (const [,name] of declarations) {
  const fn = body(name);
  assert.match(fn, /SET search_path\s*(?:=|TO)\s*'?pg_catalog'?/);
  assert.match(fn, /\$\w+\$;$/);
 }
});
