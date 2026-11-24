import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schoolRpc } from '../src/lib/school/rpc-contract.mjs';
import { advancedContracts, requireAdvanced, validateAdvanced, validateSchedule, classParticipantIds, scheduleAvailability } from '../src/lib/school/advanced.mjs';
import { studentAttemptRequest, studentAttemptQuestions, attemptRemainingSeconds } from '../src/lib/student/rpc-contract.mjs';
import { normalizeStudentAssignments, assignmentAvailability } from '../src/lib/school/assignments.mjs';

import { getCategoryOptions, normalizeSubjects, normalizeGrade } from '../src/lib/student/exam.js';
import { runInNewContext } from 'node:vm';

const school = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const capability = { school_id: school, capability_version: 'school-advanced-sql/1', assignment_contract: 1, agenda_contract: 1, single_set_package: true, max_attempts: 1, full_duration_start: true, revocation_finalize: 'deny', school_reference: 'schools.id' };
const schedule = { schedule_id: id, label: 'Agenda nyata', start_at: '2099-01-01T00:00:00Z', deadline_at: '2099-01-01T02:00:00Z', status: 'draft', revision: 1, tka_code: 'SET-resmi', attempt_id: null };
const agenda = { server_now: '2026-11-24T00:00:00Z', schedules: [schedule] };
const create = { p_school_id: school, p_label: 'Agenda nyata', p_tka_code: 'SET-resmi', p_start_at: schedule.start_at, p_deadline_at: schedule.deadline_at, p_participant_ids: [other] };
const payloads = {
  get_teacher_workspace: { p_school_id: school },
  save_school_assignment: { p_school_id: school, p_class_id: id, p_title: 'Tugas', p_subject_name: 'Matematika', p_question_count: 20, p_duration_minutes: 60, p_opens_at: schedule.start_at, p_due_at: schedule.deadline_at, p_assignment_id: null, p_expected_updated_at: null },
  set_school_assignment_status: { p_assignment_id: id, p_status: 'published' },
  get_school_assignment_ranking: { p_assignment_id: id },
  create_school_schedule: create,
  set_school_schedule_status: { p_schedule_id: id, p_status: 'published', p_expected_revision: 1 },
  get_school_schedule_agenda: { p_school_id: school },
  get_school_schedule_participants: { p_schedule_id: id, p_limit: 100, p_offset: 0 },
};
const responses = {
  get_teacher_workspace: { classes: [{ id, school_id: school }], assignments: [] },
  save_school_assignment: id, set_school_assignment_status: null, get_school_assignment_ranking: [],
  create_school_schedule: { schedule_id: id, status: 'draft', revision: 1 },
  set_school_schedule_status: { schedule_id: id, status: 'published', revision: 2 },
  get_school_schedule_agenda: agenda,
  get_school_schedule_participants: { schedule_id: id, status: 'draft', server_now: agenda.server_now, total: 0, participants: [] },
};
function mock(cap = { data: capability }, operationResponse) {
  const calls = [];
  return { calls, async rpc(name, args) { calls.push({ name, args }); return name === 'school_advanced_capabilities' ? cap : operationResponse || { data: responses[name] }; } };
}
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('ALL teacher and agenda operations require exact capability BEFORE public operation; never x fallback', async () => {
  for (const operation of Object.keys(advancedContracts)) {
    const client = mock();
    assert.deepEqual(await schoolRpc(client, operation, payloads[operation], { schoolId: school }), responses[operation]);
    assert.deepEqual(client.calls, [{ name: 'school_advanced_capabilities', args: { p_school_id: school } }, { name: operation, args: payloads[operation] }]);
  }
});
test('missing/denied capability, malformed response, every invariant/version/school mismatch fail closed for every operation', async () => {
  const denied = [{ error: { code: '42883' } }, { error: { code: 'PGRST202' } }, { error: { code: '42501' } }, { data: null }, { data: [] }];
  for (const [key, value] of Object.entries({ school_id: other, capability_version: 'school-advanced-sql/2', assignment_contract: '1', agenda_contract: 0, single_set_package: false, max_attempts: 2, full_duration_start: false, revocation_finalize: 'allow', school_reference: 'profiles.id' })) denied.push({ data: { ...capability, [key]: value } });
  for (const cap of denied) for (const operation of Object.keys(advancedContracts)) {
    const client = mock(cap);
    await assert.rejects(schoolRpc(client, operation, payloads[operation], { schoolId: school }), { code: 'SCHOOL_ADVANCED_UNAVAILABLE' });
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].name, 'school_advanced_capabilities');
  }
  await assert.rejects(requireAdvanced({ rpc: async () => { throw new Error('network'); } }, school), { code: 'SCHOOL_ADVANCED_UNAVAILABLE' });
});
test('scope/args/page/revision failures never send a mutation or capability request', async () => {
  const client = mock();
  for (const params of [{ p_schedule_id: id, p_status: 'published', p_expected_revision: 0 }, { p_schedule_id: id, p_status: 'draft', p_expected_revision: 1 }, { p_schedule_id: id, p_status: 'cancelled', p_expected_revision: '1' }]) await assert.rejects(schoolRpc(client, 'set_school_schedule_status', params, { schoolId: school }), { code: 'SCHOOL_ARGS_INVALID' });
  for (const [limit, offset] of [[101, 0], [0, 0], [100, -1]]) await assert.rejects(schoolRpc(client, 'get_school_schedule_participants', { p_schedule_id: id, p_limit: limit, p_offset: offset }, { schoolId: school }), { code: 'SCHOOL_ARGS_INVALID' });
  await assert.rejects(schoolRpc(client, 'get_teacher_workspace', { p_school_id: school }, { schoolId: other }), { code: 'SCHOOL_ARGS_INVALID' });
  assert.equal(client.calls.length, 0);
});
test('server rejects stale revision/access/content or network: no retries, alternative RPC, or direct tables', async () => {
  for (const code of ['22023', '42501', 'PGRST202', '40001']) {
    const client = mock(undefined, { error: { code } });
    await assert.rejects(schoolRpc(client, 'set_school_schedule_status', payloads.set_school_schedule_status, { schoolId: school }), { code: 'SCHOOL_REQUEST_FAILED' });
    assert.equal(client.calls.length, 2);
  }
});
test('strict SQL response shapes: UUID assignment, void status, agenda identities/revision/timing, monitor bound and ranking', () => {
  for (const [operation, bad] of [['save_school_assignment', { id }], ['set_school_assignment_status', {}], ['get_teacher_workspace', { classes: [{ id, school_id: other }], assignments: [] }], ['get_school_assignment_ranking', Array(6).fill({})], ['get_school_schedule_agenda', { ...agenda, server_now: 'bad' }], ['get_school_schedule_agenda', { ...agenda, schedules: [{ ...schedule, status: null }] }], ['get_school_schedule_agenda', { ...agenda, schedules: [{ ...schedule, revision: '1' }] }], ['set_school_schedule_status', { schedule_id: id, status: 'published', revision: 1 }], ['get_school_schedule_participants', { ...responses.get_school_schedule_participants, schedule_id: other }]]) assert.throws(() => validateAdvanced(operation, bad, payloads[operation]), { code: 'SCHOOL_RESPONSE_INVALID' });
});
test('participants are unique USER IDs selected from active students of exact class; never membership/class IDs', () => {
  const workspace = { members: [{ membership_id: id, user_id: other, class_id: id, role: 'student', status: 'active' }, { user_id: school, class_id: other, role: 'student', status: 'active' }, { user_id: id, class_id: id, role: 'teacher', status: 'active' }, { user_id: school, class_id: id, role: 'student', status: 'inactive' }] };
  assert.deepEqual(classParticipantIds(workspace, id), [other]);
  assert.deepEqual(validateSchedule(create), create);
  for (const changes of [{ p_participant_ids: [] }, { p_participant_ids: [null] }, { p_participant_ids: ['class'] }, { p_participant_ids: [id, id] }, { p_participant_ids: Array(501).fill(id) }, { p_label: 'a' }, { p_start_at: 'invalid' }, { p_start_at: '2020-01-01T00:00:00Z' }, { p_deadline_at: create.p_start_at }]) assert.throws(() => validateSchedule({ ...create, ...changes }), { code: 'SCHOOL_ARGS_INVALID' });
});
test('scheduled dispatch isolates standalone config, rejects conflicting selectors and invalid IDs; resume remains existing dispatcher', () => {
  assert.deepEqual(studentAttemptRequest({ scheduledId: id, config: { source: 'server', attemptType: 'TRYOUT', tka_code: 'other' } }), { name: 'start_school_schedule', args: { p_schedule_id: id } });
  for (const params of [{ scheduledId: '' }, { scheduledId: 'bad' }, { scheduledId: id, assignmentId: other }, { scheduledId: id, resumeAttemptId: other }]) assert.throws(() => studentAttemptRequest(params));
  assert.deepEqual(studentAttemptRequest({ resumeAttemptId: id }), { name: 'resume_exam_attempt', args: { p_attempt_id: id } });
  assert.throws(() => attemptRemainingSeconds({ schedule_id: id, duration_minutes: 60 }, 60));
  assert.equal(attemptRemainingSeconds({ schedule_id: id, remaining_seconds: 0 }, 60), 0);
});
test('agenda uses server clock, cancels fail closed, attempt status not invented and deadline resumes still reach server', () => {
  assert.equal(scheduleAvailability({ ...schedule, status: 'published' }, NaN).canStart, false);
  assert.equal(scheduleAvailability({ ...schedule, status: 'cancelled', attempt_id: id }, Date.parse(schedule.start_at)).canStart, false);
  assert.equal(scheduleAvailability({ ...schedule, status: 'published' }, Date.parse(schedule.deadline_at)).canStart, false);
  assert.equal(scheduleAvailability({ ...schedule, status: 'published', attempt_id: id }, Date.parse(schedule.deadline_at)).canStart, true);
});
test('existing student assignment contract rejects unknown/malformed list; cancelled access dominates resume, deadline finalize preserved', () => {
  const assignment = { id, title: 'Tugas', school_name: 'Sekolah', subject_name: 'Matematika', status: 'published', opens_at: schedule.start_at, due_at: schedule.deadline_at, question_count: 20, duration_minutes: 60, attempt_id: id, attempt_status: 'IN_PROGRESS', score: null };
  assert.deepEqual(normalizeStudentAssignments([assignment]), [assignment]);
  for (const data of [null, {}, [{ ...assignment, status: 'draft' }], [{ ...assignment, id: 'bad' }]]) assert.throws(() => normalizeStudentAssignments(data));
  assert.equal(assignmentAvailability(assignment, Date.parse(schedule.deadline_at)).canStart, true);
  assert.equal(assignmentAvailability({ ...assignment, status: 'cancelled' }, Date.parse(schedule.deadline_at)).canStart, false);
});
test('actual agenda start initialization never reads standalone storage, including null or inaccessible cache', () => {
  const source = read('src/app/student/challenge/page.js');
  const handler = source.slice(source.indexOf('const startExam = useCallback'));
  const initialization = handler.slice(handler.indexOf('const currentConfig ='), handler.indexOf('if (scheduledId !== null)'));
  assert.ok(initialization.includes('studentAttemptRequest('));
  for (const cached of [null, { source: 'server', attemptType: 'TRYOUT', tka_code: 'unrelated', simulationId: 'stale' }, 'blocked']) {
    let reads = 0;
    const result = runInNewContext(`(() => { ${initialization}; return { request, simulationId, subject, grade, duration }; })()`, {
      scheduledId: id, assignmentId: null, resumeAttemptId: null, subjectOverride: null,
      getExamConfig() { reads++; if (cached === 'blocked') throw new Error('Storage denied'); return cached; },
      normalizeSubjects, normalizeGrade, studentAttemptRequest,
    });
    assert.equal(reads, 0);
    assert.equal(result.request.name, 'start_school_schedule');
    assert.equal(result.request.args.p_schedule_id, id);
    assert.equal(result.simulationId, null);
    assert.equal(result.duration, 60);
  }
});
test('agenda category payload renders and sends each item server labels, not boolean constants or another item labels', () => {
  const data = { attempt_id: id, subject_name: 'Matematika', questions: [{
    question_id: other, question_type: 'PGK_KATEGORI', category_items: [
      { item_number: 1, item_text: 'Satu', category_label: 'Sesuai / Tidak Sesuai' },
      { item_number: 2, item_text: 'Dua', category_label: 'Fakta / Opini' },
    ],
  }] };
  const [question] = studentAttemptQuestions(data);
  const ui = read('src/app/student/challenge/page.js');
  assert.match(ui, /getCategoryOptions\(\[item\]\)\.map\(\(category\)/);
  assert.match(ui, /chooseCategory\(number, category\)/);
  const [first, second] = question.category_items.map(item => getCategoryOptions([item]));
  assert.deepEqual(first, ['Sesuai', 'Tidak Sesuai']);
  assert.deepEqual(second, ['Fakta', 'Opini']);
  assert.ok(!first.includes('BENAR') && !first.includes('Fakta'));
});
test('UI regression: gating, double submit, school race isolation, revision, real API, bounded monitoring and safe engine/cache reuse', () => {
  const ui = read('src/components/school/agenda.js');
  const teacher = read('src/app/teacher/page.js');
  const challenge = read('src/app/student/challenge/page.js');
  assert.match(ui, /key=\{`\$\{membership.school_id\}:\$\{membership.role\}`\}/);
  assert.match(ui, /version !== sequence.current/);
  assert.match(ui, /if \(lock.current \|\| !ready \|\| loading\) return/);
  assert.match(ui, /<fieldset disabled=\{!ready \|\| loading \|\| busy\}/);
  for (const op of ['create_school_schedule', 'set_school_schedule_status', 'get_school_schedule_agenda', 'get_school_schedule_participants']) assert.ok(ui.includes(`'${op}'`));
  assert.match(ui, /p_expected_revision: confirm.item.revision/);
  assert.match(ui, /p_limit: 100, p_offset: offset/);
  assert.match(ui, /p_participant_ids: \[\.\.\.new Set\(\[\.\.\.selectedIds, \.\.\.manual\]\)\]/);
  assert.match(teacher, /fieldset disabled=\{busy \|\| loading \|\| !ready\}/);
  assert.match(teacher, /generation.current === version/);
  assert.match(teacher, /operationLock.current = true/);
  assert.match(challenge, /scheduledId !== null \? \{\} : getExamConfig\(\)/);
  assert.match(challenge, /if \(assignmentId \|\| scheduledId !== null \|\| resumeAttemptId\) return/);
  assert.match(challenge, /data.schedule_id !== scheduledId/);
  assert.match(challenge, /anchor.seconds - \(performance.now\(\) - anchor.at\) \/ 1000/);
  assert.match(challenge, /key=\{params.toString\(\)\}/);
  for (const source of [ui, teacher]) assert.doesNotMatch(source, /supabase\.from\(|xstart_|xget_teacher|Math.random\(/);
  for (const path of ['src/components/school/overview.js', 'src/app/school/manage/page.js', 'src/app/school/page.js']) assert.ok(read(path).includes('/school/agenda'));
  assert.ok(read('src/app/student/page.js').includes('/student/agenda'));
});
