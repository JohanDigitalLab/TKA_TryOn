import test from 'node:test';
import assert from 'node:assert/strict';
import { mutationRequiredEnv, stagingMutationConfig, stagingMutationRequest } from '../src/lib/server/staging-mutation-guard.mjs';
import { verifySchoolStagingMutation, runConfiguredMutation, publicFixtureAnswer } from '../scripts/verify-school-staging-mutation.mjs';
const ids = Array.from({ length: 13 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const ref = 'a'.repeat(20);
const jwt = (sub, patch = {}) => `e30.${Buffer.from(JSON.stringify({ sub, role: 'authenticated', iss: `https://${ref}.supabase.co/auth/v1`, exp: 4102444800, ...patch })).toString('base64url')}.offline`;
const fixture = () => ({ projectRef: ref, userIds: ids.slice(0, 3), schoolIds: ids.slice(3, 5), classId: ids[5],
  tkaCode: 'TEST_SET', subjectName: 'Matematika', grade: 6, questionCount: 1, durationMinutes: 1, runId: ids[6] });
const env = () => ({ STAGING_MUTATION_CONFIRM: 'MUTATE_ISOLATED_STAGING_ONLY',
  STAGING_ISOLATION_CONFIRM: 'NONPRODUCTION_PROJECT_NO_REAL_USERS',
  STAGING_FIXTURE_CONFIRM: 'EXISTING_TEST_ONLY_FIXTURES_EMPTY_STUDENT_HISTORY',
  STAGING_PROJECT_REF: ref, PRODUCTION_PROJECT_REF: 'b'.repeat(20), STAGING_SUPABASE_URL: `https://${ref}.supabase.co`,
  STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_offline', STAGING_SCHOOL_A_TOKEN: jwt(ids[0]),
  STAGING_SCHOOL_B_TOKEN: jwt(ids[1]), STAGING_STUDENT_TOKEN: jwt(ids[2]),
  STAGING_SCHOOL_A_ID: ids[3], STAGING_SCHOOL_B_ID: ids[4], STAGING_MUTATION_FIXTURE: JSON.stringify(fixture()) });

test('every required input missing or invalid prevents network; read-only flag is not consent', async () => {
  for (const key of mutationRequiredEnv) {
    const e = env(); delete e[key];
    let calls = 0;
    const options = { fetchImpl: async () => { calls++; throw Error('network forbidden'); } };
    await assert.rejects(verifySchoolStagingMutation(e, options), /GUARD/);
    assert.deepEqual(await runConfiguredMutation(e, options), { skipped: true });
    assert.equal(calls, 0);
  }
  const patches = [
    { STAGING_MUTATION_CONFIRM: 'READ_ONLY_STAGING' }, { STAGING_MUTATION_CONFIRM: 'true' },
    { STAGING_FIXTURE_CONFIRM: 'true' }, { STAGING_ISOLATION_CONFIRM: '*' },
    { PRODUCTION_PROJECT_REF: ref }, { PRODUCTION_PROJECT_REF: 'unknown' },
    { STAGING_SUPABASE_URL: `https://${ref}.supabase.co/?allow=true` },
    { STAGING_SUPABASE_PUBLISHABLE_KEY: jwt(ids[0], { role: 'service_role' }) },
    { STAGING_STUDENT_TOKEN: jwt(ids[2], { role: 'service_role' }) },
    { STAGING_STUDENT_TOKEN: jwt(ids[2], { exp: 1 }) },
    { STAGING_SCHOOL_B_TOKEN: jwt(ids[0]) },
    { STAGING_MUTATION_FIXTURE: JSON.stringify({ ...fixture(), userIds: [ids[1], ids[0], ids[2]] }) },
    { STAGING_MUTATION_FIXTURE: JSON.stringify({ ...fixture(), schoolIds: [ids[4], ids[3]] }) },
    { STAGING_MUTATION_FIXTURE: JSON.stringify({ ...fixture(), projectRef: 'c'.repeat(20) }) },
    { STAGING_MUTATION_FIXTURE: JSON.stringify({ ...fixture(), allowAll: true }) },
    { STAGING_MUTATION_FIXTURE: '{}' },
  ];
  for (const patch of patches) {
    let calls = 0;
    await assert.rejects(runConfiguredMutation({ ...env(), ...patch }, { fetchImpl: async () => { calls++; } }), /GUARD/);
    assert.equal(calls, 0);
  }
  assert.throws(() => stagingMutationConfig(env(), { sets: { session: [{ project_ref: ref }] } }), /GUARD/);
  assert.equal(stagingMutationConfig(env()).fixture.classId, ids[5]);
});

test('transport strict allowlist rejects arbitrary RPC/table paths and extra arguments', () => {
  for (const op of ['school_admin_mutate', 'xschool_admin_mutate', 'sql', '../exam_attempts', '__proto__', 'constructor']) {
    assert.throws(() => stagingMutationRequest(op), /GUARD/);
  }
  assert.throws(() => stagingMutationRequest('submit_exam_attempt', { p_attempt_id: ids[0], delete: true }));
  assert.throws(() => stagingMutationRequest('submit_exam_attempt', { p_attempt_id: 'invalid' }));
  assert.equal(stagingMutationRequest('resume_exam_attempt', { p_attempt_id: ids[0] }).method, 'POST');
  const history = stagingMutationRequest('get_student_history', { p_limit: 1, p_type: null });
  assert.equal(history.method, 'POST');
  assert.deepEqual(JSON.parse(history.body), { p_limit: 1, p_type: null });
});

test('answers derive from public structures only for all supported types', () => {
  for (const type of ['PG_TUNGGAL', 'PGK_MA']) assert.deepEqual(publicFixtureAnswer([{ question_id: ids[9],
    question_type: type, options: [{ option_code: 'Z' }] }]).payload, { option_codes: ['Z'], category_answers: {} });
  assert.deepEqual(publicFixtureAnswer([{ question_id: ids[9], question_type: 'PGK_KATEGORI',
    category_items: [{ item_number: 1, category_label: 'Benar / Salah' }, { item_number: 2, category_options: ['Ya', 'Tidak'] }] }]).payload,
  { option_codes: [], category_answers: { 1: 'Benar', 2: 'Ya' } });
  assert.throws(() => publicFixtureAnswer([{ question_id: ids[9], question_type: 'PG_TUNGGAL', correct_answer: 'A' }]));
});

function backend(patch = {}) {
  const calls = [];
  let clock = Date.parse('2026-11-24T04:00:00Z');
  let assignment, schedule, current;
  const attempts = new Map();
  const date = () => new Date(clock).toISOString();
  const result = (data, status = 200) => ({ ok: status < 300, status, json: async () => structuredClone(data) });
  const questions = [{ question_id: ids[10], question_type: 'PG_TUNGGAL', options: [{ option_code: 'Z' }] }];
  const payload = a => ({ attempt_id: a.id, subject_name: 'Matematika', grade: 6, duration_minutes: 1,
    total_questions: 1, remaining_seconds: 60, questions, answers: a.answers,
    ...(a.schedule ? { schedule_id: ids[8], resumed: a.started } : {}) });
  const fetchImpl = async (url, options) => {
    const u = new URL(url);
    assert.equal(u.origin, `https://${ref}.supabase.co`);
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    const actor = [0, 1, 2].find(i => options.headers.Authorization === `Bearer ${jwt(ids[i])}`);
    const op = u.pathname.split('/').at(-1);
    const args = options.method === 'POST' ? JSON.parse(options.body) : Object.fromEntries(u.searchParams);
    calls.push({ actor, op, args, method: options.method });
    const denied = () => result({ code: patch.missingDenial ? 'PGRST202' : '42501' }, patch.missingDenial ? 404 : 403);
    if (op === 'user') return result({ id: patch.badAuth ? ids[0] : ids[actor], email_confirmed_at: date() });
    if (op === 'xschool_portal_context') return result({ memberships: [{ school_id: ids[actor === 1 ? 4 : 3],
      school_name: 'Offline', role: actor === 2 ? 'student' : 'school_admin', is_primary: true }],
    school_types: [], applications: [], transfers: [], is_platform_admin: false, can_review_applications: false });
    if (op === 'school_advanced_capabilities') return result({ school_id: args.p_school_id,
      capability_version: patch.badCapability ? 'old' : 'school-advanced-sql/1', assignment_contract: 1,
      agenda_contract: 1, single_set_package: true, max_attempts: 1, full_duration_start: true,
      revocation_finalize: 'deny', school_reference: 'schools.id' });
    if (['get_teacher_workspace', 'get_school_schedule_agenda'].includes(op) && args.p_school_id !== ids[actor === 1 ? 4 : 3]) return denied();
    if (op === 'xschool_admin_workspace') return result({ school: { id: ids[3] }, classes: [{ id: ids[5], archived: false }],
      members: [{ membership_id: ids[12], user_id: ids[2], role: 'student', status: 'active', class_id: ids[5] }], requests: [], invites: [], transfers: [] });
    if (op === 'get_teacher_workspace') return result({ classes: [{ id: ids[5], school_id: ids[3], grade: 6 }], assignments: assignment ? [assignment] : [] });
    if (op === 'get_student_history') return result(patch.history ? [{ attempt_id: ids[11] }] : []);
    if (op === 'get_student_subjects') return result([{ name: 'Matematika', subject_code: 'MAT',
      configuration: { tka_code: 'TEST_SET', type: patch.random ? 'RANDOM' : 'SET', total_questions: 1, duration_minutes: 1 } }]);
    if (op === 'get_student_assignments') return result(assignment ? [{ id: assignment.id, attempt_id: ids[9] }] : []);
    if (op === 'get_school_schedule_agenda') return result({ server_now: date(), schedules: schedule ? [schedule] : [] });
    if (op === 'save_school_assignment') {
      assignment = { id: ids[7], class_id: ids[5], status: 'draft', opens_at: date(), due_at: args.p_due_at,
        updated_at: date(), recipients: 1, submitted: 0 };
      return result(assignment.id);
    }
    if (op === 'set_school_assignment_status') {
      if (actor === 1 && !patch.crossAllowed) return denied();
      assignment.status = args.p_status;
      return result(null);
    }
    if (op === 'get_school_assignment_ranking') return result(attempts.has(ids[9]) ? [{ position: 1, student_name: 'Offline', score: 0,
      correct_answers: 0, total_questions: 1, submitted_at: date() }] : []);
    if (op === 'create_school_schedule') {
      schedule = { schedule_id: ids[8], label: args.p_label, start_at: args.p_start_at, deadline_at: args.p_deadline_at,
        status: 'draft', revision: 1, tka_code: 'TEST_SET', attempt_id: null };
      return result({ schedule_id: ids[8], status: 'draft', revision: 1 });
    }
    if (op === 'set_school_schedule_status') {
      if (actor === 1) return denied();
      if (patch.cancelFail && args.p_status === 'cancelled') return result({ code: 'XX000' }, 500);
      assert.equal(args.p_expected_revision, schedule.revision);
      schedule.status = args.p_status; schedule.revision++;
      return result({ schedule_id: ids[8], status: schedule.status, revision: schedule.revision });
    }
    if (op === 'get_school_schedule_participants') {
      if (actor === 1) return denied();
      const a = attempts.get(ids[11]);
      return result({ schedule_id: ids[8], status: schedule.status, server_now: date(), total: 1,
        participants: [{ user_id: ids[2], attempt_id: a?.id || null, attempt_status: a?.status,
          answered_count: a ? Object.keys(a.answers).length : 0, score: a ? 0 : null }] });
    }
    if (['start_school_assignment', 'start_school_schedule'].includes(op)) {
      const isSchedule = op === 'start_school_schedule';
      const id = isSchedule ? ids[11] : ids[9];
      if (!attempts.has(id)) attempts.set(id, { id, schedule: isSchedule, started: false, answers: {}, status: 'IN_PROGRESS' });
      current = attempts.get(id);
      if (current.status === 'SUBMITTED') return result({ code: 'P0001',
        message: isSchedule ? 'Tryout is not active' : 'Assignment is not active' }, 400);
      const data = payload(current);
      current.started = true;
      if (patch.duplicate && attempts.size && calls.filter(c => c.op === op).length > 1) data.attempt_id = ids[12];
      return result(data);
    }
    if (op === 'resume_exam_attempt') return result(payload(attempts.get(args.p_attempt_id)));
    if (op === 'save_exam_answer') {
      if (patch.saveThrow) throw Error('SENSITIVE_BACKEND_ERROR');
      attempts.get(args.p_attempt_id).answers[args.p_question_id] = args.p_answer_payload;
      return result({ saved: true, attempt_id: args.p_attempt_id, question_id: args.p_question_id });
    }
    if (op === 'submit_exam_attempt') {
      attempts.get(args.p_attempt_id).status = 'SUBMITTED';
      return result({ attempt_id: args.p_attempt_id, total_questions: 1, correct_answers: 0,
        incorrect_or_unanswered: 1, score: patch.badScore ? 100 : 0, status: 'SUBMITTED' });
    }
    if (op === 'get_exam_attempt_review') return result({ attempt_id: args.p_attempt_id, questions });
    throw Error('UNEXPECTED_OFFLINE_REQUEST');
  };
  return { fetchImpl, sleep: async ms => { clock += ms; }, calls, attempts };
}

test('offline lifecycle covers auth/capabilities, assignment ranking, agenda monitor, engine and own-record cancellations', async () => {
  const b = backend();
  assert.equal((await verifySchoolStagingMutation(env(), b)).mutation, true);
  assert.equal(b.attempts.size, 2);
  assert.deepEqual(b.calls.slice(0, 3).map(c => c.op), ['user', 'user', 'user']);
  const writes = b.calls.filter(c => c.method === 'POST' && c.op !== 'get_student_history');
  assert.equal(writes.filter(c => c.op === 'save_school_assignment').length, 1);
  assert.equal(writes.filter(c => c.op === 'create_school_schedule').length, 1);
  assert.ok(writes.every(c => !c.args.p_school_id || c.args.p_school_id === ids[3]));
  assert.deepEqual(writes.slice(-2).map(c => c.args.p_status), ['cancelled', 'cancelled']);
});

test('offline failure paths fail closed without mutation retries or leaking backend errors', async () => {
  for (const patch of [{ badAuth: true }, { badCapability: true }, { history: true }, { random: true }, { missingDenial: true }]) {
    const b = backend(patch);
    await assert.rejects(verifySchoolStagingMutation(env(), b));
    assert.equal(b.calls.filter(c => c.method === 'POST' && c.op !== 'get_student_history').length, 0);
  }
  for (const patch of [{ crossAllowed: true }, { duplicate: true }, { saveThrow: true }, { badScore: true }, { cancelFail: true }]) {
    const b = backend(patch);
    await assert.rejects(verifySchoolStagingMutation(env(), b), /STAGING_MUTATION_(FAILED|CANCELLATION_UNCONFIRMED)/);
    assert.equal(b.calls.filter(c => c.op === 'save_school_assignment').length, 1);
    assert.equal(b.calls.filter(c => c.op === 'set_school_assignment_status' && c.actor === 0 && c.args.p_status === 'cancelled').length, 1);
  }
});
