// Browser-safe, pure adapters. Source: .local/database/addendum-02-db.json.
// No client, environment, network, or mutation retries belong in this module.

export function studentHistoryRequest({ dashboard = false, limit = dashboard ? 5 : 50, before = null } = {}) {
  if (!Number.isSafeInteger(limit) || limit < (dashboard ? 0 : 1) || (!dashboard && limit > 100)) {
    throw new Error("Batas riwayat tidak valid.");
  }
  return dashboard
    ? { name: "get_student_history", args: { p_limit: limit, p_type: null } }
    : { name: "get_student_tryout_history", args: { p_limit: limit, p_before: before } };
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Respons angka riwayat server tidak valid.");
  return number;
}

export function normalizeStudentHistory(data) {
  if (!Array.isArray(data)) throw new Error("Respons riwayat server tidak valid.");
  return data.map((row) => {
    if (!record(row) || typeof row.attempt_id !== "string" || !row.attempt_id) {
      throw new Error("Identitas riwayat server tidak valid.");
    }
    const total = numeric(row.total_questions);
    const correct = numeric(row.correct_answers);
    return {
      ...row,
      subject_name: row.subject_name ?? row.subject ?? "",
      subject: row.subject ?? row.subject_name ?? "",
      status: row.status ?? row.attempt_status ?? null,
      score: numeric(row.score),
      total_questions: total,
      correct_answers: correct,
      incorrect_or_unanswered: numeric(row.incorrect_or_unanswered)
        ?? (total !== null && correct !== null ? Math.max(0, total - correct) : null),
    };
  });
}

function answeredCount(row) {
  if (row.answered_count != null) return numeric(row.answered_count);
  const questions = row.review?.questions;
  if (!Array.isArray(questions) || questions.length !== row.total_questions) return null;
  return questions.filter((question) => {
    const payload = question.answer_payload;
    if (!record(payload)) return false;
    return question.question_type === "PGK_KATEGORI"
      ? record(payload.category_answers) && Object.keys(payload.category_answers).length > 0
      : Array.isArray(payload.option_codes) && payload.option_codes.length > 0;
  }).length;
}

export function studentResultSessions(history) {
  return normalizeStudentHistory(history).map((row, index, rows) => {
    const snapshot = row.config_snapshot ?? row.review?.config_snapshot ?? null;
    return {
      attemptId: row.attempt_id,
      subject: row.subject || "Mata pelajaran",
      grade: row.grade,
      mode: row.mode ?? snapshot?.mode ?? row.review?.mode
        ?? (row.attempt_type === "EXERCISE" ? "mission" : row.attempt_type === "TRYOUT" ? "simulation" : "legacy"),
      packageId: row.package_id ?? snapshot?.package_id ?? null,
      configSnapshot: snapshot,
      subjectIndex: index,
      totalSubjects: rows.length,
      score: row.score,
      totalQuestions: row.total_questions,
      correctAnswers: row.correct_answers,
      incorrectOrUnanswered: row.incorrect_or_unanswered,
      // total - incorrect_or_unanswered is the number CORRECT, not answered.
      answeredCount: answeredCount(row),
      completedAt: row.submitted_at ?? row.created_at ?? row.started_at,
      status: row.status,
      review: row.review ?? null,
      reviewError: row.reviewError || "",
    };
  });
}

function requiredText(value) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error("Kode atau pilihan server tidak valid.");
  }
  return value;
}

export function studentSubjectsRequest() {
  return { name: "get_student_subjects", args: {} };
}

export function studentTopicsRequest() {
  return { name: "get_school_subject_topics", args: {} };
}

export function normalizeStudentSubjects(data) {
  if (!Array.isArray(data)) throw new Error("Respons mata pelajaran server tidak valid.");
  return data.map((row) => {
    if (!record(row)) throw new Error("Mata pelajaran server tidak valid.");
    const configuration = row.configuration;
    if (configuration != null && (!record(configuration)
      || !Number.isSafeInteger(configuration.total_questions) || configuration.total_questions < 1
      || !Number.isSafeInteger(configuration.duration_minutes) || configuration.duration_minutes < 1
      || !["RANDOM", "SET"].includes(configuration.type))) {
      throw new Error("Konfigurasi TKA server tidak valid.");
    }
    return {
      name: requiredText(row.name), subject_code: requiredText(row.subject_code),
      configuration: configuration == null ? null : {
        tka_code: requiredText(configuration.tka_code),
        total_questions: configuration.total_questions,
        duration_minutes: configuration.duration_minutes, type: configuration.type,
      },
    };
  });
}

export function normalizeStudentTopics(data) {
  if (!Array.isArray(data)) throw new Error("Respons materi server tidak valid.");
  return data.map((row) => {
    if (!record(row)) throw new Error("Materi server tidak valid.");
    return { subject_code: requiredText(row.subject_code), theme: requiredText(row.theme), topic: requiredText(row.topic) };
  });
}

export function studentStartConfig({ subjects, subjectCode, attemptType, questionCount, theme = null, topic = null, topics = [] }) {
  const subject = normalizeStudentSubjects(subjects).find((row) => row.subject_code === subjectCode);
  if (!subject) throw new Error("Pilih mata pelajaran dari server.");
  const config = { source: "server", attemptType, subject_code: subject.subject_code, subjects: [subject.name], currentSubjectIndex: 0 };
  if (attemptType === "TRYOUT") {
    if (!subject.configuration) throw new Error("Konfigurasi TKA belum tersedia untuk mata pelajaran ini.");
    config.tka_code = subject.configuration.tka_code;
  } else if (attemptType === "EXERCISE") {
    const catalog = normalizeStudentTopics(topics);
    if (theme !== null && !catalog.some((row) => row.subject_code === subjectCode && row.theme === theme && (topic === null || row.topic === topic))) {
      throw new Error("Pilih materi dan topik dari server.");
    }
    Object.assign(config, { question_count: questionCount, theme, topic });
  }
  studentAttemptRequest({ config });
  return config;
}

// Allowlist only active-question fields. Keys/explanations belong exclusively to post-submit review.
export function studentAttemptQuestions(data) {
  if (!record(data) || !data.attempt_id || !Array.isArray(data.questions) || !data.questions.length) {
    throw new Error("Respons soal sesi server tidak valid.");
  }
  return data.questions.map((item, index) => ({
    question_id: item.question_id, number: item.question_order || index + 1,
    subject: data.subject_name || data.subject, type: item.question_type,
    question: item.question_text, instruction: item.instruction,
    stimulus: item.stimulus?.content_text || item.stimulus?.title || "",
    answer_payload: item.answer_payload,
    options: (item.options || []).map((option) => ({ code: option.option_code, text: option.option_text })),
    category_items: (item.category_items || []).map((category) => ({
      item_number: category.item_number, item_text: category.item_text,
      category_label: category.category_label, category_options: category.category_options,
    })),
  }));
}

export function studentAttemptRequest({ assignmentId, scheduledId = null, resumeAttemptId, config = {} } = {}) {
  // A schedule must never silently adopt an unrelated assignment/resume/standalone session.
  if (scheduledId !== null) {
    if (assignmentId || resumeAttemptId || typeof scheduledId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(scheduledId)) {
      throw new Error('Identitas agenda tidak valid atau bertentangan dengan sesi lain. Buka kembali agenda sekolah.');
    }
    return { name: 'start_school_schedule', args: { p_schedule_id: scheduledId } };
  }
  // Preserve existing assignment/resume precedence. Never try another mutation on error.
  if (assignmentId) return { name: "start_school_assignment", args: { p_assignment_id: assignmentId } };
  if (resumeAttemptId) return { name: "resume_exam_attempt", args: { p_attempt_id: resumeAttemptId } };

  // This marker records selection provenance, NOT authorization. RPC validates actor, level and access.
  if (config.source === "server") {
    if (config.attemptType === "TRYOUT") {
      return { name: "start_tka_tryout", args: { p_tka_code: requiredText(config.tka_code) } };
    }
    if (config.attemptType === "EXERCISE") {
      if (!Number.isSafeInteger(config.question_count) || config.question_count < 1 || config.question_count > 100
        || !Object.hasOwn(config, "theme") || !Object.hasOwn(config, "topic")
        || (config.topic !== null && config.theme === null)) {
        throw new Error("Konfigurasi latihan tidak valid.");
      }
      return { name: "start_student_exercise", args: {
        p_subject_code: requiredText(config.subject_code), p_question_count: config.question_count,
        p_theme: config.theme === null ? null : requiredText(config.theme),
        p_topic: config.topic === null ? null : requiredText(config.topic),
      } };
    }
    throw new Error("Jenis sesi server tidak valid.");
  }

  // Active contracts: start_tka_tryout(p_tka_code), and start_student_exercise
  // (p_subject_code, p_question_count, p_theme, p_topic). get_student_subjects
  // supplies subject_code + configuration, but the legacy form stores only names,
  // arbitrary duration/count/difficulty, and a browser UUID (NOT a tka_code).
  // Exercise responses are untimed. Do not silently reinterpret this timed CBT
  // configuration, choose a default code, or revive x/xx legacy functions.
  const detail = config.activityType === "latihan"
    ? "Latihan aktif memerlukan kode mata pelajaran server dan berjalan tanpa batas waktu; pengaturan durasi/kesulitan lama tidak dapat diterapkan."
    : "Simulasi aktif memerlukan kode konfigurasi TKA dari server; nama mata pelajaran dan ID simulasi browser bukan kode konfigurasi.";
  const error = new Error(`Sesi baru belum dapat dimulai dari konfigurasi lama. ${detail} Tidak ada sesi baru yang dibuat. Sesi yang sudah ada tetap dapat dilanjutkan.`);
  error.code = "STUDENT_START_CONFIGURATION_UNSUPPORTED";
  throw error;
}

export function attemptRemainingSeconds(data, fallbackMinutes) {
  // NULL is deliberately untimed for the active exercise contract, not zero.
  if (data.attempt_type === "EXERCISE" && data.remaining_seconds == null && data.duration_minutes == null) return null;
  const remaining = numeric(data.remaining_seconds);
  if (remaining !== null) return Math.max(0, remaining);
  if (data.schedule_id != null) throw new Error('Sisa waktu agenda wajib berasal dari server.');
  const duration = numeric(data.duration_minutes) ?? numeric(fallbackMinutes);
  if (duration === null) throw new Error("Durasi sesi server tidak valid.");
  return Math.max(0, duration * 60);
}
