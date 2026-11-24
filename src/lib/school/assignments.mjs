export function assignmentAvailability(assignment, now = Date.now()) {
  if (assignment.status === 'cancelled') return { label: 'Dibatalkan', canStart: false };
  if (assignment.attempt_status === 'SUBMITTED') return { label: 'Selesai', canStart: false };
  if (assignment.status !== 'published') return { label: 'Belum diterbitkan', canStart: false };
  const due = Date.parse(assignment.due_at);
  const opens = Date.parse(assignment.opens_at);
  if (!Number.isFinite(due) || !Number.isFinite(opens)) return { label: 'Jadwal tidak valid', canStart: false };
  if (now < opens) return { label: 'Terjadwal', canStart: false };
  // Resume after deadline permits the existing engine to finalize saved answers;
  // revoked/cancelled access is still rejected server-side, including finalize.
  if (assignment.attempt_status === 'IN_PROGRESS' && assignment.attempt_id) return { label: now >= due ? 'Buka sesi untuk finalisasi server' : 'Lanjutkan', canStart: true };
  if (now >= due) return { label: 'Berakhir', canStart: false };
  if (assignment.attempt_id) return { label: 'Sesi berakhir', canStart: false };
  const duration = Number(assignment.duration_minutes);
  if (!Number.isFinite(duration) || duration <= 0 || now + duration * 60000 > due) return { label: 'Waktu mulai habis', canStart: false };
  return { label: 'Kerjakan', canStart: true };
}

export function normalizeStudentAssignments(data) {
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
  if (!Array.isArray(data) || data.length > 100 || !data.every(a => a && uuid(a.id)
    && typeof a.title === 'string' && typeof a.school_name === 'string' && typeof a.subject_name === 'string'
    && ['published', 'cancelled'].includes(a.status) && Number.isFinite(Date.parse(a.opens_at)) && Number.isFinite(Date.parse(a.due_at))
    && Number.isInteger(a.question_count) && a.question_count > 0 && Number.isInteger(a.duration_minutes) && a.duration_minutes > 0
    && (a.attempt_id === null || uuid(a.attempt_id)) && (a.attempt_status === null || ['IN_PROGRESS', 'SUBMITTED', 'EXPIRED'].includes(a.attempt_status))
    && (a.score === null || (typeof a.score === 'number' && Number.isFinite(a.score))))) {
    throw new Error('Respons daftar tugas tidak sesuai kontrak. Muat ulang; akses historis yang dicabut dapat menolak seluruh daftar.');
  }
  return data;
}

export function assignmentMutationPayload(form, schoolId, editing = null) {
  const opens = new Date(form.opens_at);
  const due = new Date(form.due_at);
  const count = Number(form.question_count);
  const duration = Number(form.duration_minutes);
  if (!schoolId || !form.class_id || form.title.trim().length < 3 || form.title.trim().length > 160 || !form.subject_name.trim()) {
    throw new Error('Sekolah, kelas, judul (3–160 karakter), dan mata pelajaran wajib diisi.');
  }
  if (!Number.isInteger(count) || count < 1 || count > 100 || !Number.isInteger(duration) || duration < 1 || duration > 240) {
    throw new Error('Jumlah soal 1–100 dan durasi 1–240 menit.');
  }
  if (!Number.isFinite(opens.getTime()) || !Number.isFinite(due.getTime()) || due - opens < duration * 60000) {
    throw new Error('Rentang jadwal harus cukup untuk seluruh durasi ujian.');
  }
  return {
    p_school_id: schoolId, p_class_id: form.class_id, p_title: form.title.trim(),
    p_subject_name: form.subject_name.trim(), p_question_count: count, p_duration_minutes: duration,
    p_opens_at: opens.toISOString(), p_due_at: due.toISOString(),
    p_assignment_id: editing?.id || null, p_expected_updated_at: editing?.updated_at || null,
  };
}
