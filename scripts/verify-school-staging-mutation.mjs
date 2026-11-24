import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stagingMutationConfig, stagingMutationRequest, mutationEnvPresent } from '../src/lib/server/staging-mutation-guard.mjs';
import { validateSchoolResponse } from '../src/lib/school/rpc-contract.mjs';
import { requireAdvanced, validateAdvanced, isUuid } from '../src/lib/school/advanced.mjs';
import { normalizeStudentSubjects } from '../src/lib/student/rpc-contract.mjs';

const fail = () => { throw new Error('STAGING_MUTATION_FAILED'); };
const check = value => { if (!value) fail(); };
const same = isDeepStrictEqual;
const deny = r => check(!r.ok && [401, 403].includes(r.status) && r.data?.code === '42501');

// Deliberately choose a structurally valid answer, never a correct answer/key.
export function publicFixtureAnswer(questions) {
  for (const q of questions || []) {
    if (!isUuid(q.question_id)) continue;
    if (['PG_TUNGGAL', 'PGK_MA'].includes(q.question_type)) {
      const code = q.options?.[0]?.option_code;
      if (typeof code === 'string' && code) return { questionId: q.question_id,
        payload: { option_codes: [code], category_answers: {} } };
    }
    if (q.question_type === 'PGK_KATEGORI' && q.category_items?.length) {
      const pairs = q.category_items.map(item => [String(item.item_number),
        item.category_options?.[0] || item.category_label?.split(/\s*\/\s*/)[0]]);
      if (pairs.every(([n, v]) => /^[1-9]\d*$/.test(n) && typeof v === 'string' && v)) {
        return { questionId: q.question_id, payload: { option_codes: [], category_answers: Object.fromEntries(pairs) } };
      }
    }
  }
  fail();
}

export async function verifySchoolStagingMutation(env, { snapshot, fetchImpl = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const c = stagingMutationConfig(env, snapshot); // ALWAYS before first network request.
  const f = c.fixture;
  let phase = 'preflight';
  let assignmentId, scheduleId, revision;
  let cleanupFailed = false;
  const createdAttempts = new Set();
  const label = `isolated-staging-${f.runId}`;
  async function request(actor, operation, args = {}) {
    // Enforce ownership of ALL mutation targets at the actual transport boundary.
    if (operation === 'save_school_assignment') {
      check(phase === 'mutation' && actor === 0 && args.p_school_id === c.schoolIds[0]
        && args.p_class_id === f.classId && args.p_assignment_id === null && args.p_expected_updated_at === null
        && args.p_title === label && args.p_subject_name === f.subjectName
        && args.p_question_count === f.questionCount && args.p_duration_minutes === f.durationMinutes);
    }
    if (operation === 'create_school_schedule') check(phase === 'mutation' && actor === 0
      && args.p_school_id === c.schoolIds[0] && args.p_label === label && args.p_tka_code === f.tkaCode
      && same(args.p_participant_ids, [c.uids[2]]));
    if (operation === 'set_school_assignment_status') check(assignmentId && args.p_assignment_id === assignmentId
      && ((actor === 0 && ['published', 'cancelled'].includes(args.p_status)) || (actor === 1 && args.p_status === 'cancelled')));
    if (operation === 'set_school_schedule_status') check(scheduleId && args.p_schedule_id === scheduleId
      && args.p_expected_revision === revision
      && ((actor === 0 && ['published', 'cancelled'].includes(args.p_status)) || (actor === 1 && args.p_status === 'cancelled')));
    if (operation === 'start_school_assignment') check(actor === 2 && assignmentId && args.p_assignment_id === assignmentId);
    if (operation === 'start_school_schedule') check(actor === 2 && scheduleId && args.p_schedule_id === scheduleId);
    if (['resume_exam_attempt', 'save_exam_answer', 'submit_exam_attempt'].includes(operation)) {
      check(actor === 2 && createdAttempts.has(args.p_attempt_id));
    }
    const { path, ...options } = stagingMutationRequest(operation, args);
    const response = await fetchImpl(`${c.url}${path}`, { ...options, redirect: 'error', cache: 'no-store',
      headers: { apikey: c.key, Authorization: `Bearer ${c.tokens[actor]}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000) });
    let data;
    try {
      data = response.status === 204 && operation === 'set_school_assignment_status' ? null : await response.json();
    } catch { fail(); }
    return { ok: response.ok, status: response.status, data };
  }
  async function rpc(actor, operation, args = {}) {
    const r = await request(actor, operation, args);
    check(r.ok);
    return r.data;
  }
  async function advanced(actor, operation, args) {
    return validateAdvanced(operation, await rpc(actor, operation, args), args);
  }
  async function workspace() {
    return advanced(0, 'get_teacher_workspace', { p_school_id: c.schoolIds[0] });
  }
  async function agenda() {
    return advanced(0, 'get_school_schedule_agenda', { p_school_id: c.schoolIds[0] });
  }
  async function monitor() {
    const m = await advanced(0, 'get_school_schedule_participants', { p_schedule_id: scheduleId, p_limit: 100, p_offset: 0 });
    check(m.total === 1 && m.participants.length === 1 && m.participants[0].user_id === c.uids[2]);
    return m.participants[0];
  }
  async function exercise(operation, id) {
    const args = operation === 'start_school_assignment' ? { p_assignment_id: id } : { p_schedule_id: id };
    const a = await rpc(2, operation, args);
    check(isUuid(a.attempt_id) && !createdAttempts.has(a.attempt_id));
    createdAttempts.add(a.attempt_id);
    check(a.total_questions === f.questionCount && a.duration_minutes === f.durationMinutes
      && a.grade === f.grade && a.subject_name === f.subjectName && a.questions?.length === f.questionCount
      && a.remaining_seconds > 0 && Object.keys(a.answers || {}).length === 0);
    if (operation === 'start_school_schedule') check(a.schedule_id === id && a.resumed === false);
    const again = await rpc(2, operation, args);
    check(again.attempt_id === a.attempt_id);
    if (operation === 'start_school_schedule') check(again.resumed === true);
    const resumed = await rpc(2, 'resume_exam_attempt', { p_attempt_id: a.attempt_id });
    check(resumed.attempt_id === a.attempt_id && same(resumed.questions, a.questions));
    const answer = publicFixtureAnswer(resumed.questions);
    const saved = await rpc(2, 'save_exam_answer', { p_attempt_id: a.attempt_id,
      p_question_id: answer.questionId, p_answer_payload: answer.payload });
    check(saved.saved === true && saved.attempt_id === a.attempt_id && saved.question_id === answer.questionId);
    const after = await rpc(2, 'resume_exam_attempt', { p_attempt_id: a.attempt_id });
    check(same(after.answers?.[answer.questionId], answer.payload));
    const result = await rpc(2, 'submit_exam_attempt', { p_attempt_id: a.attempt_id });
    check(result.attempt_id === a.attempt_id && result.status === 'SUBMITTED'
      && result.total_questions === f.questionCount && Number.isInteger(result.correct_answers)
      && result.correct_answers >= 0 && result.correct_answers <= f.questionCount
      && result.incorrect_or_unanswered === f.questionCount - result.correct_answers
      && Number.isFinite(Number(result.score))
      && Math.abs(Number(result.score) - Math.round(result.correct_answers / f.questionCount * 10000) / 100) < 0.001);
    const review = await rpc(2, 'get_exam_attempt_review', { p_attempt_id: a.attempt_id });
    check(review.attempt_id === a.attempt_id && review.questions?.length === f.questionCount);
    // A completed activity must not silently create another attempt.
    const completedStart = await request(2, operation, args);
    check(!completedStart.ok && completedStart.status === 400 && completedStart.data?.code === 'P0001'
      && completedStart.data?.message === (operation === 'start_school_schedule'
        ? 'Tryout is not active' : 'Assignment is not active'));
    return { attemptId: a.attempt_id, result };
  }
  try {
    // Authenticate all actors before context, capability, fixtures or mutations.
    for (let i = 0; i < 3; i++) {
      const u = await rpc(i, 'user');
      check(u.id === c.uids[i] && u.email_confirmed_at && !u.deleted_at
        && (!u.banned_until || Date.parse(u.banned_until) <= Date.now()));
    }
    for (let i = 0; i < 3; i++) {
      const ctx = validateSchoolResponse('school_portal_context', await rpc(i, 'xschool_portal_context'));
      check(!ctx.is_platform_admin && !ctx.can_review_applications && ctx.memberships.length === 1
        && ctx.memberships[0].school_id === c.schoolIds[i === 1 ? 1 : 0]
        && ctx.memberships[0].role === (i === 2 ? 'student' : 'school_admin'));
    }
    await requireAdvanced({ rpc: async (name, args) => ({ data: await rpc(2, name, args) }) }, c.schoolIds[0]);
    for (let i = 0; i < 2; i++) {
      await requireAdvanced({ rpc: async (name, args) => ({ data: await rpc(i, name, args) }) }, c.schoolIds[i]);
      deny(await request(i, 'get_teacher_workspace', { p_school_id: c.schoolIds[1 - i] }));
      deny(await request(i, 'get_school_schedule_agenda', { p_school_id: c.schoolIds[1 - i] }));
    }
    const w = validateSchoolResponse('school_admin_workspace', await rpc(0, 'xschool_admin_workspace',
      { p_school_id: c.schoolIds[0] }), { p_school_id: c.schoolIds[0] });
    const students = w.members.filter(m => m.role === 'student' && m.class_id === f.classId && m.status === 'active');
    check(students.length === 1 && students[0].user_id === c.uids[2]);
    const tw = await workspace();
    check(tw.classes.some(cl => cl.id === f.classId && cl.grade === f.grade)
      && !tw.assignments.some(a => a.class_id === f.classId));
    check(same(await rpc(2, 'get_student_history', { p_limit: 1, p_type: null }), []));
    check(same(await rpc(2, 'get_student_assignments'), []));
    const studentAgenda = await advanced(2, 'get_school_schedule_agenda', { p_school_id: c.schoolIds[0] });
    check(studentAgenda.schedules.length === 0);
    const subjects = normalizeStudentSubjects(await rpc(2, 'get_student_subjects'));
    check(subjects.some(s => s.name === f.subjectName && s.configuration?.type === 'SET'
      && s.configuration.tka_code === f.tkaCode && s.configuration.total_questions === f.questionCount
      && s.configuration.duration_minutes === f.durationMinutes));
    const before = await agenda();
    check(!before.schedules.some(s => s.label === label));
    const now = Date.parse(before.server_now);
    const due = new Date(now + (f.durationMinutes + 10) * 60000).toISOString();
    phase = 'mutation';
    const draft = await rpc(0, 'save_school_assignment', { p_school_id: c.schoolIds[0], p_class_id: f.classId,
      p_title: label, p_subject_name: f.subjectName, p_question_count: f.questionCount,
      p_duration_minutes: f.durationMinutes, p_opens_at: before.server_now, p_due_at: due,
      p_assignment_id: null, p_expected_updated_at: null });
    check(isUuid(draft) && !tw.assignments.some(a => a.id === draft));
    assignmentId = draft;
    check((await workspace()).assignments.some(a => a.id === assignmentId && a.status === 'draft'));
    // Negative MUTATION: cancel only our own fresh draft, never write in the other school.
    deny(await request(1, 'set_school_assignment_status', { p_assignment_id: assignmentId, p_status: 'cancelled' }));
    check((await workspace()).assignments.some(a => a.id === assignmentId && a.status === 'draft'));
    await advanced(0, 'set_school_assignment_status', { p_assignment_id: assignmentId, p_status: 'published' });
    check(same(await advanced(0, 'get_school_assignment_ranking', { p_assignment_id: assignmentId }), []));
    const assignment = await exercise('start_school_assignment', assignmentId);
    const ranking = await advanced(0, 'get_school_assignment_ranking', { p_assignment_id: assignmentId });
    check(ranking.length === 1 && Number(ranking[0].score) === Number(assignment.result.score));
    const listed = await rpc(2, 'get_student_assignments');
    check(listed.filter(a => a.id === assignmentId).length === 1
      && listed.find(a => a.id === assignmentId).attempt_id === assignment.attemptId);
    const server = await agenda();
    const start = Date.parse(server.server_now) + 30000;
    const schedule = await advanced(0, 'create_school_schedule', { p_school_id: c.schoolIds[0], p_label: label,
      p_tka_code: f.tkaCode, p_start_at: new Date(start).toISOString(),
      p_deadline_at: new Date(start + (f.durationMinutes + 5) * 60000).toISOString(), p_participant_ids: [c.uids[2]] });
    check(!before.schedules.some(s => s.schedule_id === schedule.schedule_id));
    scheduleId = schedule.schedule_id; revision = schedule.revision;
    deny(await request(1, 'set_school_schedule_status', { p_schedule_id: scheduleId, p_status: 'cancelled', p_expected_revision: revision }));
    const unchanged = (await agenda()).schedules.find(s => s.schedule_id === scheduleId);
    check(unchanged?.status === 'draft' && unchanged.revision === revision);
    const published = await advanced(0, 'set_school_schedule_status', { p_schedule_id: scheduleId, p_status: 'published', p_expected_revision: revision });
    revision = published.revision;
    deny(await request(1, 'get_school_schedule_participants', { p_schedule_id: scheduleId, p_limit: 100, p_offset: 0 }));
    check((await monitor()).attempt_id === null);
    // Bounded waiting against authoritative server time, never modify timestamps/history.
    let ready = false;
    for (let i = 0; i < 16; i++) {
      const a = await agenda();
      if (Date.parse(a.server_now) >= start) { ready = true; break; }
      await sleep(2500);
    }
    check(ready);
    const scheduled = await exercise('start_school_schedule', scheduleId);
    const monitored = await monitor();
    check(monitored.attempt_id === scheduled.attemptId && monitored.attempt_status === 'SUBMITTED'
      && monitored.answered_count === 1 && Number(monitored.score) === Number(scheduled.result.score));
    return { checks: 'isolated-assignment/schedule/engine/cross-school-created-records', mutation: true };
  } catch {
    // Do not propagate transport errors, payloads or identifiers to callers/logs.
    fail();
  } finally {
    // No deletes, SQL, arbitrary writes, historical cancellation or mutation retry.
    // Ambiguous transport failures are not retried; review the isolated project manually.
    if (scheduleId) {
      try {
        const cancelled = await advanced(0, 'set_school_schedule_status', { p_schedule_id: scheduleId,
          p_status: 'cancelled', p_expected_revision: revision });
        revision = cancelled.revision;
      } catch { cleanupFailed = true; }
    }
    if (assignmentId) {
      try { await advanced(0, 'set_school_assignment_status', { p_assignment_id: assignmentId, p_status: 'cancelled' }); }
      catch { cleanupFailed = true; }
    }
    if (cleanupFailed) throw new Error('STAGING_MUTATION_CANCELLATION_UNCONFIRMED');
  }
}

export async function runConfiguredMutation(env, options = {}) {
  if (!mutationEnvPresent(env)) return { skipped: true };
  // Validate every confirmation offline before even reading optional snapshot metadata.
  stagingMutationConfig(env, options.snapshot);
  return verifySchoolStagingMutation(env, options);
}
async function main() {
  if (!mutationEnvPresent(process.env)) {
    console.log('SKIP: konfigurasi wajib mutasi terisolasi belum lengkap; tidak ada jaringan.');
    return;
  }
  stagingMutationConfig(process.env);
  let snapshot;
  try { snapshot = JSON.parse(await readFile(new URL('../.local/database/addendum-02-db.json', import.meta.url), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') fail(); }
  await runConfiguredMutation(process.env, { snapshot });
  console.log('PASS: lifecycle mutasi staging terisolasi dan pembatalan rekaman baru terverifikasi.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('FAIL: guard/invariant mutasi staging; status mungkin tidak pasti, review project test-only tanpa retry otomatis.');
    process.exitCode = 1;
  });
}
