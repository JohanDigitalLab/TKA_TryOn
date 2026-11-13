export function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(
    safe % 60
  ).padStart(2, "0")}`;
}

export function getExamConfig() {
  try {
    return JSON.parse(sessionStorage.getItem("tryon-exam-config") || "{}");
  } catch {
    return {};
  }
}

export function normalizeSubjects(config) {
  const subjects = Array.isArray(config.subjects)
    ? config.subjects
    : [config.subject || config.mataPelajaran || "Matematika"];

  return subjects.map((item) => String(item).trim()).filter(Boolean);
}

export function normalizeGrade(config) {
  const raw = config.grade ?? config.kelas ?? config.level;
  const text = String(raw || "").toLowerCase();

  if (text.includes("sma") || text.includes("ma") || text === "12") {
    return 12;
  }

  if (text.includes("smp") || text.includes("mts") || text === "9") {
    return 9;
  }

  if (text.includes("sd") || text.includes("mi") || text === "6") {
    return 6;
  }

  const number = Number(raw);
  return [6, 9, 12].includes(number) ? number : 6;
}

export function normalizeType(type) {
  const value = String(type || "").toUpperCase();

  if (value === "PGK_MA") return "PGK_MA";
  if (value === "PGK_KATEGORI") return "PGK_KATEGORI";

  return "PG_TUNGGAL";
}

export function normalizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { option_codes: [], category_answers: {} };
  }

  return {
    option_codes: Array.isArray(payload.option_codes)
      ? payload.option_codes
      : [],
    category_answers:
      payload.category_answers &&
      typeof payload.category_answers === "object"
        ? payload.category_answers
        : {},
  };
}

export function hasAnswer(payload, type) {
  const answer = normalizePayload(payload);

  if (type === "PGK_KATEGORI") {
    return Object.keys(answer.category_answers).length > 0;
  }

  return answer.option_codes.length > 0;
}

export function getTypeLabel(type) {
  if (type === "PGK_MA") return "Pilihan Ganda Kompleks";
  if (type === "PGK_KATEGORI") return "Pilihan Ganda Kategori";
  return "Pilihan Ganda Tunggal";
}

export function getCategoryOptions(items = []) {
  const values = [];

  items.forEach((item) => {
    if (item.category_label) values.push(item.category_label);
    if (item.category_options && Array.isArray(item.category_options)) {
      values.push(...item.category_options);
    }
  });

  return [...new Set(values.filter(Boolean))];
}

export function getSimulationResults() {
  try {
    return JSON.parse(
      sessionStorage.getItem("tryon-simulation-results") || "[]"
    );
  } catch {
    return [];
  }
}
