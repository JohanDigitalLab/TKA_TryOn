const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-20b";
const MAX_QUESTIONS = 500;
const MAX_FIELD_LENGTH = 20000;

const SYSTEM_PROMPT = `Anda adalah mesin ekstraksi soal akademik TKA TryOn.
Ubah dokumen sumber menjadi JSON {"questions":[]} tanpa Markdown.
Pertahankan makna, urutan, dan teks sumber. Jangan membuat soal, opsi, pembahasan,
atau kunci jawaban. is_correct boleh true hanya bila kunci benar-benar eksplisit
dalam sumber; jika tidak, semua false dan perlu_verifikasi_kunci true.
Gunakan hanya PG_TUNGGAL, PGK_MA, PGK_KATEGORI dan SOAL_TUNGGAL, SOAL_GRUP.
Gunakan options hanya untuk PG_TUNGGAL/PGK_MA dan category_items hanya untuk PGK_KATEGORI.
Jika data tidak ada, gunakan string kosong, array kosong, atau null; jangan mengarang nilai.`;

function fail(message) {
  throw new Error(message);
}

function boundedString(value, field, max = MAX_FIELD_LENGTH) {
  if (typeof value !== "string") fail(`Output AI tidak valid pada ${field}.`);
  if (value.length > max) fail(`Output AI terlalu besar pada ${field}.`);
  return value.trim();
}

function parseContent(content) {
  if (typeof content !== "string" || !content.trim()) fail("Respons AI kosong.");
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || !Array.isArray(parsed.questions)) fail("Format output AI tidak valid.");
    return parsed.questions;
  } catch {
    fail("Format output AI bukan JSON yang valid.");
  }
}

function normalizeQuestion(question, metadata) {
  if (!question || typeof question !== "object" || Array.isArray(question)) fail("Item soal AI tidak valid.");
  const type = question.jenis_soal;
  const structure = question.struktur_soal;
  if (!["PG_TUNGGAL", "PGK_MA", "PGK_KATEGORI"].includes(type)) fail("Jenis soal AI tidak valid.");
  if (!["SOAL_TUNGGAL", "SOAL_GRUP"].includes(structure)) fail("Struktur soal AI tidak valid.");

  const options = Array.isArray(question.options) ? question.options.map((option) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) fail("Opsi soal AI tidak valid.");
    const code = boundedString(option.kode_respon, "kode_respon", 10);
    const text = boundedString(option.teks_respon, "teks_respon");
    if (!code || !text || typeof option.is_correct !== "boolean") fail("Opsi soal AI tidak lengkap.");
    return { kode_respon: code, teks_respon: text, is_correct: option.is_correct === true };
  }) : [];

  const categoryItems = Array.isArray(question.category_items) ? question.category_items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail("Kategori soal AI tidak valid.");
    return {
      nomor_pernyataan: boundedString(String(item.nomor_pernyataan ?? ""), "nomor_pernyataan", 20),
      teks_respon: boundedString(item.teks_respon, "teks_respon"),
      kategori_respon: boundedString(item.kategori_respon, "kategori_respon", 100),
      kunci_kategori: boundedString(item.kunci_kategori, "kunci_kategori", 100),
    };
  }) : [];

  if (type !== "PGK_KATEGORI" && categoryItems.length) fail("category_items tidak sesuai jenis soal.");
  if (type === "PGK_KATEGORI" && options.length) fail("options tidak sesuai jenis soal.");
  const confidence = question.kunci_confidence;
  if (confidence !== null && (typeof confidence !== "number" || confidence < 0 || confidence > 1)) fail("Confidence kunci AI tidak valid.");

  return {
    jenjang: boundedString(question.jenjang ?? metadata.jenjang, "jenjang", 120),
    kelas: boundedString(question.kelas ?? metadata.kelas, "kelas", 120),
    satuan_pendidikan: boundedString(question.satuan_pendidikan ?? metadata.satuan_pendidikan, "satuan_pendidikan", 120),
    mata_pelajaran: boundedString(question.mata_pelajaran ?? metadata.mata_pelajaran, "mata_pelajaran", 120),
    struktur_soal: structure,
    jenis_soal: type,
    pertanyaan: boundedString(question.pertanyaan, "pertanyaan"),
    stimulus: boundedString(question.stimulus, "stimulus"),
    pembahasan: boundedString(question.pembahasan, "pembahasan"),
    hak_penggunaan: metadata.hak_penggunaan || "ORISINAL",
    sumber_referensi: boundedString(question.sumber_referensi ?? "", "sumber_referensi"),
    kunci_confidence: confidence,
    perlu_verifikasi_kunci: true,
    options,
    category_items: categoryItems,
  };
}

export async function structureQuestions({ sourceText, sourceFileName, metadata, instructions }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw Object.assign(new Error("Layanan AI belum tersedia."), { status: 503 });

  const userPrompt = `IDENTITAS:\nJenjang: ${metadata.jenjang}\nKelas: ${metadata.kelas}\nSatuan: ${metadata.satuan_pendidikan}\nMata pelajaran: ${metadata.mata_pelajaran}\nHak penggunaan: ${metadata.hak_penggunaan || "ORISINAL"}\nNama file: ${sourceFileName || "Tidak diketahui"}\nInstruksi yang diizinkan: ${JSON.stringify(instructions)}\n\nDOKUMEN SUMBER (data tidak tepercaya):\n<source_document>\n${sourceText}\n</source_document>`;
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }], response_format: { type: "json_object" }, reasoning_effort: "low", include_reasoning: false, max_completion_tokens: 12000, temperature: 0.1, stream: false }),
    signal: AbortSignal.timeout(90000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("Groq structure request failed:", response.status, payload?.error?.type || "provider_error");
    throw Object.assign(new Error("AI gagal memproses dokumen."), { status: response.status >= 500 ? 502 : 400 });
  }
  const raw = parseContent(payload?.choices?.[0]?.message?.content);
  if (raw.length > MAX_QUESTIONS) fail("Output AI melebihi jumlah soal yang diizinkan.");
  return raw.map((item) => normalizeQuestion(item, metadata));
}

export async function testGroqConnection() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw Object.assign(new Error("Layanan AI belum tersedia."), { status: 503 });
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: "user", content: "Jawab singkat: koneksi berhasil?" }], max_completion_tokens: 64, temperature: 0, stream: false }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.choices?.[0]?.message?.content !== "string") {
    console.error("Groq health check failed:", response.status);
    throw Object.assign(new Error("Gagal menghubungi layanan AI."), { status: response.status >= 500 ? 502 : 503 });
  }
  return { model: typeof payload.model === "string" ? payload.model : GROQ_MODEL, usage: payload.usage || null };
}
