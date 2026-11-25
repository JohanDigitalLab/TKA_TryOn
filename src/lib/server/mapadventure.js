export const SESSION_COOKIE = "tka-mapadventure-session";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOOLS = ["clue", "freezetime", "fiftyfifty", "skipreplace", "secondchance"];
const object = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const uuid = value => typeof value === "string" && UUID.test(value);
const pick = (value, fields) => Object.fromEntries(fields.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));

export function validPayload(action, payload) {
  if (!object(payload)) return false;
  try { if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 65536) return false; } catch { return false; }
  switch (action) {
    case "bootstrap": return keys(payload, []);
    case "settings": {
      const s = payload.settings;
      return keys(payload, ["settings"]) && keys(s, ["SHOW_TIPS", "SUBJECT"]) && Object.keys(s).length > 0 &&
        (s.SHOW_TIPS === undefined || ["0", "1"].includes(s.SHOW_TIPS)) && (s.SUBJECT === undefined || text(s.SUBJECT, 200));
    }
    case "material": return keys(payload, ["nodeId"]) && uuid(payload.nodeId);
    case "read_complete": return keys(payload, ["nodeId", "readToken"]) && uuid(payload.nodeId) && uuid(payload.readToken);
    case "start": return keys(payload, ["nodeId", "stage"]) && uuid(payload.nodeId) && ["practice", "sidequest", "gatekeeper"].includes(payload.stage);
    case "complete_node": return keys(payload, ["attempt_id"]) && uuid(payload.attempt_id);
    case "complete_island": return keys(payload, ["islandId"]) && uuid(payload.islandId);
    case "gacha": return keys(payload, ["nodeId", "chestTier"]) && uuid(payload.nodeId) && (payload.chestTier === undefined || ["wooden", "silver", "golden"].includes(payload.chestTier));
    case "buy": return keys(payload, ["tool"]) && TOOLS.includes(payload.tool);
    case "next":
    case "timeout": return keys(payload, ["attempt_id", "question_id"]) && uuid(payload.attempt_id) && uuid(payload.question_id);
    case "use_tool": return keys(payload, ["attempt_id", "question_id", "tool"]) && uuid(payload.attempt_id) && uuid(payload.question_id) && TOOLS.includes(payload.tool);
    case "answer": {
      if (!keys(payload, ["attempt_id", "question_id", "answer_payload"]) || !uuid(payload.attempt_id) || !uuid(payload.question_id)) return false;
      const a = payload.answer_payload;
      if (!keys(a, ["option_codes", "category_answers"]) || !Object.keys(a).length) return false;
      if (a.option_codes !== undefined && (!Array.isArray(a.option_codes) || a.option_codes.length > 100 || !a.option_codes.every(code => text(code, 100)) || new Set(a.option_codes).size !== a.option_codes.length)) return false;
      if (a.category_answers !== undefined && (!object(a.category_answers) || Object.keys(a.category_answers).length > 100 || !Object.entries(a.category_answers).every(([key, value]) => /^\d{1,9}$/.test(key) && text(value, 200)))) return false;
      return !(a.option_codes?.length && Object.keys(a.category_answers || {}).length);
    }
    default: return false;
  }
}

function safeError(error) {
  if (error?.code === "42501") return "Akses MapAdventure ditolak. Periksa akun dan sesi login.";
  if (["22023", "22P02"].includes(error?.code)) return "Perintah atau jawaban tidak valid. Periksa isian lalu coba lagi.";
  const shortage = /^Insufficient published questions: need (3|5|1), available (\d{1,3})$/.exec(error?.message || "");
  if (shortage) return `Soal belum cukup: diperlukan ${shortage[1]}, tersedia ${shortage[2]}. Hubungi pengelola materi.`;
  const known = {
    "Insufficient points": "Poin belum cukup untuk membeli alat ini.",
    "Tool inventory empty": "Persediaan alat ini habis.",
    "No clue available": "Petunjuk belum tersedia untuk soal ini.",
    "Finish active session before changing subject": "Selesaikan sesi aktif sebelum mengganti mata pelajaran.",
    "Different session already active": "Ada sesi lain yang aktif. Lanjutkan sesi tersimpan.",
    "Node locked": "Tahap ini masih terkunci.",
    "Node locked or already completed": "Tahap terkunci atau sudah selesai. Muat ulang peta.",
    "Tool already used on question": "Alat ini sudah digunakan. Muat ulang sesi untuk melihat efeknya.",
    "Practice is untimed; freezetime unavailable": "Latihan tanpa batas waktu; Freeze Time tidak dikurangi.",
    "Current question has not expired": "Waktu server belum habis. Muat ulang sesi untuk menyelaraskan timer.",
  };
  return known[error?.message] || "MapAdventure belum dapat menjalankan perintah. Muat ulang data lalu coba lagi.";
}

// Strip ownership/audit columns and defensively whitelist question fields (never frozen keys).
export function publicState(data) {
  const question = q => q ? { ...pick(q, ["id", "version", "type", "text", "instruction", "difficulty", "estimate_minutes", "subject_code", "education_level", "theme", "topic"]),
    stimulus: q.stimulus ? pick(q.stimulus, ["title", "content_text", "file_url", "media_description"]) : null,
    options: (q.options || []).map(o => pick(o, ["option_code", "option_text"])),
    category_items: (q.category_items || []).map(c => pick(c, ["item_number", "item_text", "category_label"])) } : null;
  const ledger = tools => (tools || []).map(t => pick(t, ["tool", "question_id", "question_index"]));
  const feedback = value => value ? pick(value, ["question_id", "accepted", "retry", "correct", "is_timeout"]) : null;
  const answerPayload = value => ({
    ...(Array.isArray(value?.option_codes) ? { option_codes: value.option_codes.filter(code => typeof code === "string") } : {}),
    ...(object(value?.category_answers) ? { category_answers: Object.fromEntries(Object.entries(value.category_answers).filter(([key, val]) => /^\d+$/.test(key) && typeof val === "string")) } : {}),
  });
  // Only a finalized result may publish frozen keys; active question projection stays private.
  const review = records => (records || []).map(record => ({
    ...pick(record, ["correct", "is_timeout"]), answer_payload: answerPayload(record.answer_payload),
    question: { ...question(record.question), ...pick(record.question, ["explanation"]),
      ...(record.question?.answer_keys ? { answer_keys: answerPayload(record.question.answer_keys) } : {}) },
  }));
  const result = {
    settings: pick(data.settings, ["SHOW_TIPS", "SUBJECT"]), education_level: data.education_level, subject_code: data.subject_code,
    subjects: (data.subjects || []).map(s => pick(s, ["name", "subject_code"])),
    islands: (data.islands || []).map(i => pick(i, ["id", "theme", "order_number", "status", "stars"])),
    nodes: (data.nodes || []).map(n => pick(n, ["id", "theme_id", "subject_topic_id", "theme", "topic", "order_number", "material_status", "practice_status", "sidequest_status", "mysterychest_status", "gatekeeper_status", "material_stars", "practice_stars", "sidequest_stars", "gatekeeper_stars", "chest_reward"])),
    status: pick(data.status, ["points", "stars"]), wallet: pick(data.wallet, ["points"]), inventory: pick(data.inventory, TOOLS), profile_xp: data.profile_xp,
    tip: data.tip ? pick(data.tip, ["id", "message"]) : null,
    session: data.session ? { ...pick(data.session, ["attempt_id", "nodeId", "stage", "index", "total", "answered", "deadline_at", "server_now", "remaining_seconds"]),
      question: question(data.session.question), feedback: feedback(data.session.feedback), tools: ledger(data.session.tools), effects: pick(data.session.effects, ["clue", "eliminated", "secondchance", "retried"]) } : null,
  };
  if (data.material) result.material = pick(data.material, ["nodeId", "text", "url", "readToken"]);
  if (data.result) result.result = { ...pick(data.result, ["attempt_id", "nodeId", "stage", "passed", "correct", "total", "score", "stars", "best_stars", "points", "xp"]), tools: ledger(data.result.tools), review: review(data.result.review) };
  if (data.reward) result.reward = { ...pick(data.reward, ["tier", "points"]), tools: pick(data.reward.tools, TOOLS) };
  if (data.answer) result.answer = feedback(data.answer);
  if (data.resumed !== undefined) result.resumed = data.resumed;
  return result;
}

export function createMapadventureActions({ getUser, cookies }) {
  async function identityFor(expectedUserId) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const identity = token ? await getUser(token) : null;
    if (!identity) return { failure: { ok: false, code: "ACCOUNT_CHANGED", error: "Sesi berakhir. Silakan login kembali." } };
    if (identity.user.id !== expectedUserId) return { failure: { ok: false, code: "ACCOUNT_CHANGED", error: "Akun berubah. Muat ulang MapAdventure." } };
    return identity;
  }
  async function call(identity, action, payload) {
    const { data, error } = await identity.supabase.rpc("mapadventure", { p_action: action, p_payload: payload });
    if (error || !object(data)) return { ok: false, error: safeError(error) };
    return { ok: true, userId: identity.user.id, data: publicState(data) };
  }
  async function execute(action, payload, expectedUserId) {
    if (!uuid(expectedUserId) || !validPayload(action, payload)) return { ok: false, error: "Perintah MapAdventure tidak valid." };
    try {
      const identity = await identityFor(expectedUserId);
      return identity.failure || await call(identity, action, payload);
    } catch { return { ok: false, error: safeError() }; }
  }
  async function completeNode(expectedUserId, nodeId, score, usedTools, attemptId) {
    // Compatibility hints are bounded, but never forwarded or used to grade/reward.
    if (!uuid(expectedUserId) || !uuid(nodeId) || (attemptId !== undefined && !uuid(attemptId)) ||
      (score !== undefined && (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100)) ||
      (usedTools !== undefined && (!Array.isArray(usedTools) || usedTools.length > 100 || !usedTools.every(t => keys(t, ["tool", "question_id"]) && TOOLS.includes(t.tool) && uuid(t.question_id))))) return { ok: false, error: "Perintah penyelesaian tidak valid." };
    try {
      const identity = await identityFor(expectedUserId);
      if (identity.failure) return identity.failure;
      const state = await call(identity, "bootstrap", {});
      if (!state.ok) return state;
      const session = state.data.session;
      if (session && (session.nodeId !== nodeId || (attemptId && session.attempt_id !== attemptId))) return { ok: false, error: "Sesi aktif tidak cocok dengan topik ini." };
      const id = attemptId || session?.attempt_id;
      if (!id) return { ok: false, error: "Sesi tidak tersedia. Muat ulang data." };
      const completed = await call(identity, "complete_node", { attempt_id: id });
      if (completed.ok && completed.data.result?.nodeId !== nodeId) return { ok: false, error: "Hasil tidak cocok dengan topik ini." };
      return completed;
    } catch { return { ok: false, error: safeError() }; }
  }
  return { execute, completeNode };
}

// Small isolated bridge intentionally mirrors VirtualPet, with its own cookie and no feature changes.
export function createMapadventureSession({ getUser, cookies, production = false }) {
  return async function POST(request) {
    const reply = (body, status) => Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Origin" } });
    if (request.headers.get("origin") !== new URL(request.url).origin || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) return reply({ error: "Origin tidak diizinkan." }, 403);
    const options = { httpOnly: true, secure: production, sameSite: "strict", path: "/", maxAge: 300 };
    try {
      const token = /^Bearer ([A-Za-z0-9_.-]{1,3500})$/i.exec(request.headers.get("authorization") || "")?.[1];
      const identity = token ? await getUser(token) : null;
      const store = await cookies();
      if (!identity) {
        store.set(SESSION_COOKIE, "", { ...options, maxAge: 0 });
        return reply({ error: "Sesi login tidak valid." }, 401);
      }
      store.set(SESSION_COOKIE, token, options);
      return reply({ userId: identity.user.id }, 200);
    } catch { return reply({ error: "Gagal memverifikasi sesi login." }, 503); }
  };
}
