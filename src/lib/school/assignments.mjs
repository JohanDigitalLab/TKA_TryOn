export function assignmentAvailability(assignment, now = Date.now()) {
  if (assignment.status === 'cancelled') return { label: 'Dibatalkan', canStart: false };
  if (assignment.attempt_status === 'SUBMITTED') return { label: 'Selesai', canStart: false };
  if (assignment.status !== 'published') return { label: 'Belum diterbitkan', canStart: false };
  const due = Date.parse(assignment.due_at);
  const opens = Date.parse(assignment.opens_at);
  if (!Number.isFinite(due) || !Number.isFinite(opens)) return { label: 'Jadwal tidak valid', canStart: false };
  if (now >= due) return { label: 'Berakhir', canStart: false };
  if (assignment.attempt_status === 'IN_PROGRESS') return { label: 'Lanjutkan', canStart: true };
  if (assignment.attempt_id) return { label: 'Sesi berakhir', canStart: false };
  if (now < opens) return { label: 'Terjadwal', canStart: false };
  const duration = Number(assignment.duration_minutes);
  if (!Number.isFinite(duration) || duration <= 0 || now + duration * 60000 > due) return { label: 'Waktu mulai habis', canStart: false };
  return { label: 'Kerjakan', canStart: true };
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
