import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const sql = readFileSync(new URL('../docs/database/migration-school-advanced-blockers.sql', import.meta.url), 'utf8').replace(/\r/g, '');
const deployment = readFileSync(new URL('../docs/database/SCHOOL_BLOCKERS_DEPLOYMENT.md', import.meta.url), 'utf8');
const executable = sql.replace(/--[^\n]*/g, '');
function body(name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const end = sql.indexOf('$function$;', start);
  assert.ok(end > start);
  return sql.slice(start, end);
}
const access = body('private.school_assignment_access');
const deadline = body('private.school_assignment_deadline');
const start = body('private.learning_legacy_assignment');
const resume = body('private.resume_school_assignment');
const save = body('public.save_exam_answer');
const submit = body('public.submit_exam_attempt');

test('review only: transaction, advisory/table locks, fail-closed mapping, rollback', () => {
  assert.match(executable, /BEGIN;/);
  assert.match(executable, /SET LOCAL search_path = pg_catalog/);
  assert.match(executable, /pg_advisory_xact_lock/);
  assert.match(executable, /LOCK TABLE[\s\S]*IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(executable, /current_setting\('school_blockers.school_uid_reference',true\) IS DISTINCT FROM 'schools.id'/);
  assert.match(executable.trim(), /ROLLBACK;$/);
  assert.doesNotMatch(executable, /\bCOMMIT\b|\bDROP\b|\bTRUNCATE\b|\bDELETE FROM\b/i);
});

test('integrity preflight precedes constraints; no cleanup or automatic backfill', () => {
  assert.ok(sql.indexOf('$preflight$;') < sql.indexOf('ALTER TABLE'));
  assert.match(sql, /GROUP BY scheduled_tryouts,user_id HAVING count\(\*\)>1/);
  assert.match(sql, /\(c.id,c.school_id\)=\(a.class_id,a.school_id\)/);
  assert.match(sql, /p.school_id IS NOT NULL AND s.id IS NULL/);
  assert.match(sql, /attempt_type' AND attnotnull AND NOT atthasdef/);
  assert.doesNotMatch(executable, /(?:INSERT INTO|UPDATE) public\.(?:profiles|school_memberships|student_academic_profiles)\b/i);
  assert.doesNotMatch(executable, /ALTER[^;]*attempt_type[^;]*DEFAULT/i);
});

test('five non-destructive FKs and recipient uniqueness, reuse class index', () => {
  assert.equal((executable.match(/NOT VALID/g) || []).length, 5);
  for (const fragment of [
    'FOREIGN KEY (school_uid) REFERENCES public.schools(id) NOT VALID',
    'UNIQUE (scheduled_tryouts,user_id)',
    'FOREIGN KEY (scheduled_tryouts) REFERENCES public.scheduled_tryouts(id) NOT VALID',
    'FOREIGN KEY (user_id) REFERENCES auth.users(id) NOT VALID',
    'FOREIGN KEY (class_id,school_id) REFERENCES public.classes(id,school_id) NOT VALID',
    'FOREIGN KEY (school_id) REFERENCES public.schools(id) NOT VALID',
  ]) assert.ok(executable.includes(fragment), fragment);
  assert.doesNotMatch(executable, /CASCADE|VALIDATE CONSTRAINT|ALTER TABLE public.student_academic_profiles/i);
});

test('authoritative active membership and conflict veto never derive membership from profile', () => {
  assert.match(access, /private.school_actor\(\)/);
  assert.match(access, /user_id=u FOR UPDATE/);
  assert.match(access, /status='active' FOR SHARE/);
  assert.match(access, /role='student' AND status='active' FOR SHARE/);
  assert.match(access, /p.school_id<>a.school_id/);
  assert.match(access, /p.is_managed IS TRUE OR p.account_type='SCHOOL'/);
  assert.match(access, /conflicting active memberships/);
  assert.match(access, /r.attempt_id IS DISTINCT FROM p_attempt_id/);
});

test('assignment type explicit, fixed snapshot, no expiration mutation of other attempts', () => {
  assert.match(start, /total_questions,attempt_type,started_at,deadline_at/);
  assert.match(start, /'ASSIGNMENT',clock_timestamp\(\),a.due_at/);
  assert.match(start, /FROM public.school_assignment_questions q WHERE q.assignment_id=a.id/);
  assert.match(start, /actual<>a.question_count OR actual=0/);
  assert.doesNotMatch(start, /UPDATE public.exam_attempts/);
  assert.match(start, /clock_timestamp\(\)\+a.duration_minutes\*interval '1 minute'>a.due_at/);
});

test('effective assignment deadline and owner are shared across resume/save/submit', () => {
  assert.match(deadline, /attempt_id=p_attempt_id AND user_id=u/);
  assert.match(deadline, /private.school_assignment_access\(aid,p_attempt_id\)/);
  assert.match(deadline, /least\(due,e.started_at\+e.duration_minutes\*interval '1 minute',e.deadline_at\)/);
  for (const fn of [resume, save, submit]) assert.match(fn, /private.school_assignment_deadline\(p_attempt_id\)/);
  assert.match(save, /v_now>=v_assignment_deadline/);
  assert.match(submit, /v_submitted_after_deadline:=clock_timestamp\(\)>=v_assignment_deadline/);
  assert.match(resume, /greatest\(0,floor/);
});

test('resume uses pinned attempt version/order with no key/theme/topic leakage or redraw', () => {
  assert.match(resume, /v.id=aq.question_version_id AND v.question_id=q.id/);
  assert.match(resume, /ORDER BY aq.question_order/);
  assert.match(resume, /FROM public.exam_attempt_answers x WHERE x.attempt_id=a.id/);
  assert.doesNotMatch(resume, /answer_key|is_correct|correct_answer|theme|topic|random\(|is_current|version_status/i);
});

test('consistent acquisition order: user advisory then assignment context then attempt row', () => {
  for (const fn of [save, submit, deadline]) {
    const lock = fn.indexOf('pg_advisory_xact_lock');
    const context = fn.indexOf(':=private.school_assignment_');
    const row = fn.indexOf('SELECT * INTO', context);
    assert.ok(lock >= 0 && context > lock && row > context);
  }
  assert.ok(access.indexOf('pg_advisory_xact_lock') < access.indexOf('FOR SHARE'));
  assert.ok(access.indexOf('public.school_assignments') < access.indexOf('public.school_assignment_recipients\n'));
});

test('minimal ACL and safe search path, no broad RPC reactivation', () => {
  const functions = executable.match(/CREATE OR REPLACE FUNCTION /g) || [];
  assert.equal(functions.length, 6);
  assert.equal((executable.match(/SET search_path (?:= pg_catalog|TO 'pg_catalog')/g) || []).length, 6);
  assert.equal((executable.match(/REVOKE ALL ON FUNCTION/g) || []).length, 6);
  assert.equal((executable.match(/GRANT EXECUTE ON FUNCTION/g) || []).length, 2);
  assert.doesNotMatch(executable, /CREATE OR REPLACE FUNCTION (?:public|private)\.x|GRANT[^;]*TO (?:anon|PUBLIC)|GRANT[^;]*ON TABLE/i);
});

test('save validation/upsert and scoring/conditional submit retained in full', () => {
  assert.match(save, /private.exam_answer_payload_is_valid/);
  assert.match(save, /ON CONFLICT \(attempt_id, question_id\) DO UPDATE SET/);
  assert.match(submit, /private.exam_answer_is_correct/);
  assert.match(submit, /ROUND\(\(v_correct::numeric \/ v_total\) \* 100, 2\)/);
  assert.match(submit, /WHERE id = v_attempt.id AND user_id = v_user_id AND attempt_status = 'IN_PROGRESS'/);
  assert.doesNotMatch(submit, /INSERT INTO public.exam_attempt_answers/);
  // Optional local provenance check: CI does not require the ignored audit snapshot.
  const snapshotPath = new URL('../.local/database/addendum-02-db.json', import.meta.url);
  if (existsSync(snapshotPath)) {
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    const original = (name) => snapshot.sets.functions.find((f) => f.proname === name).definition.replace(/\r/g, '');
    const section = (text, from, to) => text.slice(text.indexOf(from), text.lastIndexOf(to));
    assert.equal(section(submit, '  SELECT COUNT(*)::integer,', 'END;'), section(original('submit_exam_attempt'), '  SELECT COUNT(*)::integer,', 'END;'));
    assert.equal(section(save, '  SELECT q.question_type, aq.question_version_id', 'END;'), section(original('save_exam_answer'), '  SELECT q.question_type, aq.question_version_id', 'END;'));
  }
});

test('deployment explicitly preserves remaining gates and limits validation claims', () => {
  for (const text of ['HOLD', 'staging', 'belum terbukti', 'Tidak ada koneksi database', 'Penanganan administratif', 'rollback']) {
    assert.ok(deployment.includes(text), text);
  }
});
