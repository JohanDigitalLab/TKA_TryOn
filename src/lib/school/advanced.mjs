// Browser-safe contract for the review-only school-advanced-sql/1 deployment.
export const advancedContracts = Object.freeze({
  get_teacher_workspace: ['p_school_id'],
  save_school_assignment: ['p_school_id', 'p_class_id', 'p_title', 'p_subject_name', 'p_question_count', 'p_duration_minutes', 'p_opens_at', 'p_due_at', 'p_assignment_id', 'p_expected_updated_at'],
  set_school_assignment_status: ['p_assignment_id', 'p_status'],
  get_school_assignment_ranking: ['p_assignment_id'],
  create_school_schedule: ['p_school_id', 'p_label', 'p_tka_code', 'p_start_at', 'p_deadline_at', 'p_participant_ids'],
  set_school_schedule_status: ['p_schedule_id', 'p_status', 'p_expected_revision'],
  get_school_schedule_agenda: ['p_school_id'],
  get_school_schedule_participants: ['p_schedule_id', 'p_limit', 'p_offset'],
});
export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const integer = value => Number.isSafeInteger(value) && value >= 0;
function fail(code, message) { const error = new Error(`${code}: ${message}`); error.code = code; throw error; }
const invalid = () => fail('SCHOOL_RESPONSE_INVALID', 'Respons tidak sesuai kontrak. Muat ulang sebelum mengulang operasi.');
export async function requireAdvanced(client, schoolId) {
  if (!isUuid(schoolId)) fail('SCHOOL_ADVANCED_UNAVAILABLE', 'Pilih sekolah dari membership aktif.');
  let response;
  try { response = await client.rpc('school_advanced_capabilities', { p_school_id: schoolId }); }
  catch { fail('SCHOOL_ADVANCED_UNAVAILABLE', 'Capability belum dapat diverifikasi. Tidak ada operasi yang diaktifkan.'); }
  const c = response?.data;
  if (response?.error || !record(c) || c.school_id !== schoolId || c.capability_version !== 'school-advanced-sql/1'
    || c.assignment_contract !== 1 || c.agenda_contract !== 1 || c.single_set_package !== true || c.max_attempts !== 1
    || c.full_duration_start !== true || c.revocation_finalize !== 'deny' || c.school_reference !== 'schools.id') {
    fail('SCHOOL_ADVANCED_UNAVAILABLE', 'Kontrak tugas/agenda belum tersedia untuk sekolah ini. Hubungi platform; tidak ada fallback legacy.');
  }
  return c;
}
export function validateAdvanced(operation, data, params) {
  if (operation === 'get_teacher_workspace') {
    if (!record(data) || !Array.isArray(data.classes) || !data.classes.every(c => record(c) && isUuid(c.id) && c.school_id === params.p_school_id)
      || !Array.isArray(data.assignments) || !data.assignments.every(a => record(a) && isUuid(a.id) && isUuid(a.class_id) && ['draft', 'published', 'cancelled'].includes(a.status) && date(a.updated_at) && date(a.opens_at) && date(a.due_at) && integer(a.recipients) && integer(a.submitted))) invalid();
  } else if (operation === 'save_school_assignment') { if (!isUuid(data)) invalid(); }
  else if (operation === 'set_school_assignment_status') { if (data !== null) invalid(); }
  else if (operation === 'get_school_assignment_ranking') {
    if (!Array.isArray(data) || data.length > 5 || !data.every(r => record(r) && integer(r.position) && r.position > 0 && typeof r.student_name === 'string' && Number.isFinite(Number(r.score)) && integer(r.correct_answers) && integer(r.total_questions) && date(r.submitted_at))) invalid();
  } else if (operation === 'get_school_schedule_agenda') {
    if (!record(data) || !date(data.server_now) || !Array.isArray(data.schedules) || data.schedules.length > 100 || !data.schedules.every(s => record(s) && isUuid(s.schedule_id) && ['draft', 'published', 'cancelled'].includes(s.status) && integer(s.revision) && s.revision > 0 && date(s.start_at) && date(s.deadline_at) && typeof s.label === 'string' && typeof s.tka_code === 'string' && (s.attempt_id === null || isUuid(s.attempt_id)))) invalid();
  } else if (operation === 'get_school_schedule_participants') {
    if (!record(data) || data.schedule_id !== params.p_schedule_id || !['draft', 'published', 'cancelled'].includes(data.status) || !date(data.server_now) || !integer(data.total) || !Array.isArray(data.participants) || data.participants.length > params.p_limit || !data.participants.every(p => record(p) && isUuid(p.user_id) && (p.attempt_id === null || isUuid(p.attempt_id)) && integer(p.answered_count))) invalid();
  } else if (!record(data) || !isUuid(data.schedule_id) || (params.p_schedule_id && data.schedule_id !== params.p_schedule_id)
    || data.status !== (params.p_status || 'draft') || !integer(data.revision) || data.revision !== (params.p_expected_revision ? params.p_expected_revision + 1 : 1)) invalid();
  return data;
}
export async function advancedRpc(client, operation, params = {}, schoolId = params.p_school_id) {
  const args = Object.hasOwn(advancedContracts, operation) && advancedContracts[operation];
  if (!args || !record(params) || Object.keys(params).length !== args.length || args.some(k => !Object.hasOwn(params, k))) fail('SCHOOL_ARGS_INVALID', 'Paramater tidak sesuai kontrak.');
  if (params.p_school_id && params.p_school_id !== schoolId) fail('SCHOOL_ARGS_INVALID', 'Scope sekolah berubah.');
  for (const key of ['p_school_id', 'p_class_id', 'p_assignment_id', 'p_schedule_id']) {
    if (params[key] !== undefined && params[key] !== null && !isUuid(params[key])) fail('SCHOOL_ARGS_INVALID', 'ID tidak valid.');
  }
  if (operation === 'set_school_schedule_status' && (!Number.isSafeInteger(params.p_expected_revision) || params.p_expected_revision < 1 || !['published', 'cancelled'].includes(params.p_status))) fail('SCHOOL_ARGS_INVALID', 'Revisi atau status tidak valid.');
  if (operation === 'get_school_schedule_participants' && (!integer(params.p_offset) || !integer(params.p_limit) || params.p_limit < 1 || params.p_limit > 100)) fail('SCHOOL_ARGS_INVALID', 'Halaman peserta tidak valid.');
  if (operation === 'create_school_schedule') validateSchedule(params);
  await requireAdvanced(client, schoolId);
  let response;
  try { response = await client.rpc(operation, params); }
  catch { fail('SCHOOL_REQUEST_FAILED', 'Status permintaan belum pasti. Muat ulang sebelum mencoba lagi; tidak ada retry otomatis.'); }
  if (!record(response) || response.error) fail('SCHOOL_REQUEST_FAILED', 'Server menolak permintaan atau revisi/akses berubah. Muat ulang dan periksa jadwal, peserta, paket serta akses sebelum mencoba lagi.');
  return validateAdvanced(operation, response.data, params);
}
export function validateSchedule(p, now = Date.now()) {
  if (!isUuid(p.p_school_id) || typeof p.p_label !== 'string' || p.p_label.trim().length < 3 || p.p_label.trim().length > 255
    || typeof p.p_tka_code !== 'string' || !p.p_tka_code.trim() || !date(p.p_start_at) || !date(p.p_deadline_at)
    || Date.parse(p.p_start_at) <= now || Date.parse(p.p_deadline_at) <= Date.parse(p.p_start_at)
    || !Array.isArray(p.p_participant_ids) || p.p_participant_ids.length < 1 || p.p_participant_ids.length > 500
    || !p.p_participant_ids.every(isUuid) || new Set(p.p_participant_ids).size !== p.p_participant_ids.length) fail('SCHOOL_ARGS_INVALID', 'Isi judul, kode SET, jadwal masa depan dan 1–500 ID pengguna unik. Durasi penuh dan jenjang divalidasi server.');
  return p;
}
export function scheduleAvailability(item, serverNow) {
  if (item.status !== 'published') return { canStart: false, label: item.status === 'cancelled' ? 'Dibatalkan' : 'Belum terbit' };
  if (!Number.isFinite(serverNow)) return { canStart: false, label: 'Muat ulang waktu server' };
  if (serverNow < Date.parse(item.start_at)) return { canStart: false, label: 'Terjadwal' };
  // Agenda does not expose attempt status/duration. Server decides resume eligibility/full duration.
  if (item.attempt_id) return { canStart: true, label: 'Buka sesi (server memeriksa status)' };
  if (serverNow >= Date.parse(item.deadline_at)) return { canStart: false, label: 'Berakhir' };
  return { canStart: true, label: 'Mulai (durasi penuh diperiksa server)' };
}
export function classParticipantIds(workspace, classId) {
  return [...new Set(workspace.members.filter(m => m.role === 'student' && m.status === 'active' && m.class_id === classId).map(m => m.user_id))];
}
