export const SESSION_COOKIE = "tka-virtualpet-session";
const ITEMS = ["water", "rice", "apple", "donut", "cake", "vitamin"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

export function validPayload(action, payload) {
  if (!object(payload)) return false;
  try { if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 120000) return false; } catch { return false; }
  if (action === "bootstrap") return keys(payload, []);
  if (action === "settings") return keys(payload, ["settings"]) && keys(payload.settings, ["SHOW_TIPS"]) && ["0", "1"].includes(payload.settings.SHOW_TIPS);
  if (action === "adopt") return keys(payload, ["pet_type", "pet_name"]) && text(payload.pet_type, 50) && text(payload.pet_name, 50);
  if (action === "feed") return keys(payload, ["item"]) && ITEMS.includes(payload.item);
  if (action === "start") return keys(payload, ["scenario"]) && ["KUIZ", "HOTS", "PENYELAMATAN"].includes(payload.scenario);
  if (action !== "finish" || !keys(payload, ["attempt_id", "answers"]) || !UUID.test(payload.attempt_id) || !Array.isArray(payload.answers) || ![10, 15].includes(payload.answers.length)) return false;
  const ids = new Set();
  return payload.answers.every(answer => {
    if (!keys(answer, ["question_id", "answer_payload"]) || !UUID.test(answer.question_id) || ids.has(answer.question_id)) return false;
    ids.add(answer.question_id);
    const p = answer.answer_payload;
    if (!keys(p, ["option_codes", "category_answers"]) || !Object.keys(p).length) return false;
    if (p.option_codes !== undefined && (!Array.isArray(p.option_codes) || p.option_codes.length > 100 || !p.option_codes.every(code => text(code, 100)) || new Set(p.option_codes).size !== p.option_codes.length)) return false;
    if (p.category_answers !== undefined && (!object(p.category_answers) || Object.keys(p.category_answers).length > 100 || !Object.entries(p.category_answers).every(([key, value]) => /^\d{1,9}$/.test(key) && text(value, 200)))) return false;
    return !(p.option_codes?.length && Object.keys(p.category_answers || {}).length);
  });
}

function safeError(error) {
  if (error?.code === "42501") return "Akses VirtualPet ditolak. Periksa akun dan sesi login.";
  if (error?.code === "22023" || error?.code === "22P02") return "Jawaban atau perintah tidak valid. Periksa semua jawaban lalu coba lagi.";
  if (error?.code === "P0001") {
    const match = /^Soal published valid tidak cukup untuk (KUIZ|HOTS|PENYELAMATAN): dibutuhkan (10|15), tersedia (\d{1,2}) pada jenjang (sd|smp|sma)$/.exec(error.message || "");
    if (match) return `Soal belum cukup: diperlukan ${match[2]}, tersedia ${match[3]}. Silakan coba lagi nanti.`;
    if (error.message === "Item inventory is empty") return "Stok item habis. Kerjakan kuis untuk mendapat perbekalan.";
    return "VirtualPet belum dapat menjalankan perintah ini. Coba lagi atau hubungi operator.";
  }
  return "Gagal menghubungi VirtualPet. Silakan coba lagi.";
}

// Never return raw pet rows (ownership/audit columns are not UI data).
export function publicState(data) {
  const p = data.pet;
  const result = {
    pet: p ? Object.fromEntries(["id", "pet_type", "pet_name", "xp", "level", "hunger", "hydration", "happiness", "status"].map(key => [key, p[key]])) : null,
    inventory: Object.fromEntries(ITEMS.map(key => [key, data.inventory?.[key] ?? 0])),
    settings: { SHOW_TIPS: data.settings?.SHOW_TIPS },
    tip: data.tip ? { id: data.tip.id, message: data.tip.message } : null,
    profile_xp: data.profile_xp,
    session: data.session,
  };
  for (const key of ["attempt_id", "scenario", "score", "correct", "total", "passed", "rewards", "snacks", "resumed"]) {
    if (data[key] !== undefined) result[key] = data[key];
  }
  return result;
}

export function createVirtualpetActions({ getUser, cookies }) {
  return async function execute(action, payload, expectedUserId) {
    if (!UUID.test(expectedUserId) || !validPayload(action, payload)) return { ok: false, error: "Perintah VirtualPet tidak valid." };
    try {
      const token = (await cookies()).get(SESSION_COOKIE)?.value;
      const identity = token ? await getUser(token) : null;
      if (!identity) return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
      // Identity is derived from getUser; this non-secret expectation only rejects stale browser/cookie races.
      if (identity.user.id !== expectedUserId) return { ok: false, error: "Akun berubah. Muat ulang VirtualPet.", code: "ACCOUNT_CHANGED" };
      const { data, error } = await identity.supabase.rpc("virtualpet", { p_action: action, p_payload: payload });
      if (error) return { ok: false, error: safeError(error) };
      if (!data || typeof data !== "object") return { ok: false, error: safeError() };
      return { ok: true, userId: identity.user.id, data: publicState(data) };
    } catch { return { ok: false, error: safeError() }; }
  };
}

export function createVirtualpetSession({ getUser, cookies, production = false }) {
  return async function POST(request) {
    const reply = (body, status) => Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Origin" } });
    // Require an exact Origin, not merely a same-site sibling domain. No forwarded-host trust.
    if (request.headers.get("origin") !== new URL(request.url).origin || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) return reply({ error: "Origin tidak diizinkan." }, 403);
    const options = { httpOnly: true, secure: production, sameSite: "strict", path: "/", maxAge: 300 };
    try {
      const authorization = request.headers.get("authorization") || "";
      const token = /^Bearer ([A-Za-z0-9_.-]{1,3500})$/i.exec(authorization)?.[1];
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
