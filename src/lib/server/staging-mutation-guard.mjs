// Offline, fail-closed mutation gate. Never loads env files or creates clients.
import { stagingConfig } from './staging-guard.mjs';
import { isUuid } from '../school/advanced.mjs';

export const mutationRequiredEnv = Object.freeze([
  'STAGING_MUTATION_CONFIRM', 'STAGING_ISOLATION_CONFIRM', 'STAGING_FIXTURE_CONFIRM',
  'STAGING_PROJECT_REF', 'PRODUCTION_PROJECT_REF', 'STAGING_SUPABASE_URL',
  'STAGING_SUPABASE_PUBLISHABLE_KEY', 'STAGING_SCHOOL_A_TOKEN', 'STAGING_SCHOOL_B_TOKEN',
  'STAGING_STUDENT_TOKEN', 'STAGING_SCHOOL_A_ID', 'STAGING_SCHOOL_B_ID', 'STAGING_MUTATION_FIXTURE',
]);
const fail = () => { throw new Error('STAGING_MUTATION_GUARD_REJECTED'); };
const exact = (o, keys) => o && typeof o === 'object' && !Array.isArray(o)
  && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
export function mutationEnvPresent(env) {
  // Presence only; never return values, missing names, tokens or parsed claims.
  return mutationRequiredEnv.every(k => typeof env[k] === 'string' && env[k].length > 0);
}
export function stagingMutationConfig(env, snapshot) {
  if (!mutationEnvPresent(env) || env.STAGING_MUTATION_CONFIRM !== 'MUTATE_ISOLATED_STAGING_ONLY'
    || env.STAGING_ISOLATION_CONFIRM !== 'NONPRODUCTION_PROJECT_NO_REAL_USERS'
    || env.STAGING_FIXTURE_CONFIRM !== 'EXISTING_TEST_ONLY_FIXTURES_EMPTY_STUDENT_HISTORY') fail();
  let f;
  try { f = JSON.parse(env.STAGING_MUTATION_FIXTURE); } catch { fail(); }
  const keys = ['projectRef', 'userIds', 'schoolIds', 'classId', 'tkaCode', 'subjectName',
    'grade', 'questionCount', 'durationMinutes', 'runId'];
  if (!exact(f, keys) || !Array.isArray(f.userIds) || f.userIds.length !== 3 || !f.userIds.every(isUuid)
    || !Array.isArray(f.schoolIds) || f.schoolIds.length !== 2 || !f.schoolIds.every(isUuid)
    || !isUuid(f.classId) || !isUuid(f.runId) || ![6, 9].includes(f.grade)
    || typeof f.tkaCode !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(f.tkaCode)
    || typeof f.subjectName !== 'string' || !f.subjectName.trim() || f.subjectName !== f.subjectName.trim() || f.subjectName.length > 100
    || !Number.isInteger(f.questionCount) || f.questionCount < 1 || f.questionCount > 100
    || !Number.isInteger(f.durationMinutes) || f.durationMinutes < 1 || f.durationMinutes > 240) fail();
  // Reuse exactly the existing origin/token/production snapshot denylist checks.
  // The private compatibility input is NOT an operator read-only opt-in or an existing attempt.
  const c = stagingConfig({ ...env, STAGING_TESTS_CONFIRM: 'READ_ONLY_STAGING',
    STAGING_STUDENT_ATTEMPT_ID: f.userIds[2] }, snapshot);
  if (f.projectRef !== env.STAGING_PROJECT_REF || f.userIds.some((id, i) => id !== c.uids[i])
    || f.schoolIds.some((id, i) => id !== c.schoolIds[i])
    || new Set([...f.userIds, ...f.schoolIds, f.classId, f.runId]).size !== 7) fail();
  const key = c.key;
  if (!key.startsWith('sb_publishable_')) {
    let claim;
    try { claim = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); } catch { fail(); }
    if (claim.ref !== env.STAGING_PROJECT_REF) fail();
  }
  return Object.freeze({ ...c, fixture: Object.freeze({ ...f,
    userIds: Object.freeze([...f.userIds]), schoolIds: Object.freeze([...f.schoolIds]) }) });
}

const contracts = Object.freeze({
  xschool_portal_context: [], xschool_admin_workspace: ['p_school_id'],
  school_advanced_capabilities: ['p_school_id'], get_teacher_workspace: ['p_school_id'],
  get_student_history: ['p_limit', 'p_type'], get_student_subjects: [], get_student_assignments: [],
  get_school_schedule_agenda: ['p_school_id'],
  save_school_assignment: ['p_school_id', 'p_class_id', 'p_title', 'p_subject_name', 'p_question_count', 'p_duration_minutes', 'p_opens_at', 'p_due_at', 'p_assignment_id', 'p_expected_updated_at'],
  set_school_assignment_status: ['p_assignment_id', 'p_status'],
  get_school_assignment_ranking: ['p_assignment_id'],
  create_school_schedule: ['p_school_id', 'p_label', 'p_tka_code', 'p_start_at', 'p_deadline_at', 'p_participant_ids'],
  set_school_schedule_status: ['p_schedule_id', 'p_status', 'p_expected_revision'],
  get_school_schedule_participants: ['p_schedule_id', 'p_limit', 'p_offset'],
  start_school_schedule: ['p_schedule_id'], start_school_assignment: ['p_assignment_id'],
  resume_exam_attempt: ['p_attempt_id'], save_exam_answer: ['p_attempt_id', 'p_question_id', 'p_answer_payload'],
  submit_exam_attempt: ['p_attempt_id'], get_exam_attempt_review: ['p_attempt_id'],
});
const mutations = new Set(['save_school_assignment', 'set_school_assignment_status', 'create_school_schedule',
  'set_school_schedule_status', 'start_school_schedule', 'start_school_assignment', 'resume_exam_attempt', 'save_exam_answer', 'submit_exam_attempt']);
export function stagingMutationRequest(operation, args = {}) {
  if (operation === 'user' && exact(args, [])) return { path: '/auth/v1/user', method: 'GET' };
  if (!Object.hasOwn(contracts, operation) || !exact(args, contracts[operation])) fail();
  for (const [k, v] of Object.entries(args)) {
    if (/_id$/.test(k) && v !== null && !isUuid(v)) fail();
  }
  // This read RPC needs a real JSON null: never omit/filter p_type or stringify it as text "null".
  if (mutations.has(operation) || operation === 'get_student_history') {
    return { path: `/rest/v1/rpc/${operation}`, method: 'POST', body: JSON.stringify(args) };
  }
  const query = new URLSearchParams(Object.entries(args).filter(([, v]) => v !== null));
  return { path: `/rest/v1/rpc/${operation}${query.size ? `?${query}` : ''}`, method: 'GET' };
}
