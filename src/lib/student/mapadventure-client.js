export const TOOLS = [
  { id: "clue", name: "Petunjuk", price: 30, symbol: "💡" },
  { id: "fiftyfifty", name: "50 : 50", price: 50, symbol: "◐" },
  { id: "skipreplace", name: "Ganti soal", price: 60, symbol: "🔄" },
  { id: "secondchance", name: "Kesempatan kedua", price: 80, symbol: "🛡️" },
  { id: "freezetime", name: "Freeze Time", price: 40, symbol: "❄️", timedOnly: true },
];
export const STAGES = [
  { id: "material", name: "Kemah Ilmu", symbol: "⛺" },
  { id: "practice", name: "Latihan", symbol: "🏋️", requirement: "Lulus: 3/3 benar (100%)." },
  { id: "sidequest", name: "Misi Sampingan", symbol: "⚔️", requirement: "Lulus: 5/5 benar (100%).", selection: "5 soal: prioritaskan SUSAH/SULIT atau SEDANG dengan estimasi >5 menit; kekurangan diisi SEDANG lainnya. Tidak pernah MUDAH, termasuk yang >5 menit. Ganti soal mengikuti aturan yang sama." },
  { id: "mysterychest", name: "Peti Misteri", symbol: "🎁" },
  { id: "gatekeeper", name: "Pos Penjaga", symbol: "🏰", requirement: "Lulus: minimal 4/5 benar (80%).", selection: "5 soal hanya SEDANG. Tidak beralih ke MUDAH atau SUSAH/SULIT bila bank kurang. Ganti soal mengikuti aturan yang sama." },
];
export function safeMaterialUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return { href: url.href, pdf: /\.pdf$/i.test(url.pathname) };
  } catch { return null; }
}
export function categoryLabels(item) {
  return [...new Set((item.category_label || "").split("/").map(s => s.trim()).filter(Boolean))];
}
export function buildAnswer(question, draft = {}, effects = {}) {
  if (question.type === "PGK_KATEGORI") {
    const categories = draft.category_answers || {};
    if (!question.category_items.every(item => categoryLabels(item).includes(categories[item.item_number]))) throw new Error("Lengkapi seluruh kategori jawaban.");
    return { category_answers: Object.fromEntries(question.category_items.map(item => [item.item_number, categories[item.item_number]])) };
  }
  const codes = draft.option_codes || [];
  if (question.type === "PG_TUNGGAL" && codes.length !== 1) throw new Error("Pilih satu jawaban.");
  if (new Set(codes).size !== codes.length || codes.some(code => !question.options.some(o => o.option_code === code) || effects.eliminated?.includes(code))) throw new Error("Pilihan tidak tersedia. Periksa kembali jawaban.");
  return { option_codes: [...codes] };
}
// Adapt finalized server records only; never infer correctness or regrade in the browser.
export function mapadventureReviewRecords(review = []) {
  return review.map((record, questionIndex) => {
    const q = record.question;
    const options = q.options || [];
    const answer = record.answer_payload || {};
    const indices = (answer.option_codes || []).map(code => options.findIndex(option => option.option_code === code)).filter(index => index >= 0);
    return {
      questionIndex, correct: record.correct === true,
      selected: record.is_timeout ? null : q.type === "PGK_KATEGORI" ? answer.category_answers || {} : q.type === "PGK_MA" ? indices : indices[0] ?? null,
      question: { ...q, question: q.text, optionDetails: options, options: options.map(option => option.option_text),
        ...(q.answer_keys ? { answer_keys: { options: q.answer_keys.option_codes, categories: q.answer_keys.category_answers } } : {}) },
    };
  });
}
export function openGachaChest(request, nodeId, chestTier) {
  return request("gacha", { nodeId, ...(chestTier === undefined ? {} : { chestTier }) });
}

// Use a monotonic local clock anchored to the server's remaining time. Device wall-clock
// changes cannot add time. SQL still makes the authoritative expiry decision.
export function questionSecondsLeft(session, elapsedMs = 0) {
  if (session?.feedback || session?.stage === "practice" || !session?.deadline_at) return null;
  const remaining = Number.isFinite(session.remaining_seconds) ? session.remaining_seconds :
    (Date.parse(session.deadline_at) - Date.parse(session.server_now)) / 1000;
  return Math.max(0, Math.ceil(remaining - Math.max(0, elapsedMs) / 1000));
}

export function matchingSession(state, { nodeId, stage }) {
  return state?.sessions?.find(session => session.nodeId === nodeId && session.stage === stage) || null;
}

export function createMapadventureClient({ getSession, actions, fetcher = fetch, onIdentityChange = () => {} }) {
  let busy = false;
  let owner = null;
  let pending = null;
  const changed = () => Object.assign(new Error("Akun berubah. Muat ulang MapAdventure."), { code: "ACCOUNT_CHANGED" });
  const invalidate = () => { pending = null; onIdentityChange(); throw changed(); };
  async function send(action, payload) {
    const { data, error } = await getSession();
    const session = data?.session;
    if (error || !session?.access_token || !session.user?.id) return invalidate();
    const userId = session.user.id;
    if (owner && owner !== userId) return invalidate();
    owner = userId;
    const bridge = await fetcher("/api/mapadventure/session", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
    if (bridge.status === 401) return invalidate();
    if (!bridge.ok) throw new Error("Gagal memperbarui sesi MapAdventure.");
    const body = await bridge.json();
    if (body.userId !== userId) return invalidate();
    const beforeAction = await getSession();
    if (beforeAction.error || beforeAction.data?.session?.user?.id !== userId) return invalidate();
    const started = performance.now();
    const result = await actions[action](payload, userId);
    if (result.ok && result.data.session) {
      // Conservative network allowance; never grants extra time for transit latency.
      result.data.session.clock_received_at = performance.now();
      if (typeof result.data.session.remaining_seconds === "number") result.data.session.remaining_seconds = Math.max(0, result.data.session.remaining_seconds - (performance.now() - started) / 1000);
    }
    const current = await getSession();
    if (current.error || current.data?.session?.user?.id !== userId || (result.ok && result.userId !== userId) || result.code === "ACCOUNT_CHANGED") return invalidate();
    if (!result.ok) throw Object.assign(new Error(result.error || "Perintah MapAdventure gagal."), { rejected: true, code: result.code });
    return result.data;
  }
  function answerAdvanced(state, previous) {
    const s = state.session;
    return !s || s.attempt_id !== previous.attempt_id || s.question?.id !== previous.question_id || s.feedback?.question_id === previous.question_id || !!s.effects?.retried !== previous.retried;
  }
  async function reconcile(saved) {
    if (saved.action === "start") {
      // A start may have committed. Discover only its node/stage, never replay it
      // or substitute an unrelated attempt from another subject or stage.
      const state = await send("bootstrap", {});
      const descriptor = matchingSession(state, saved.payload);
      return descriptor ? send("bootstrap", { attempt_id: descriptor.attempt_id }) : state;
    }
    return send("bootstrap", saved.attempt_id ? { attempt_id: saved.attempt_id } : {});
  }
  return async function request(action, payload = {}, context = {}) {
    if (busy) throw new Error("Perintah sebelumnya masih diproses.");
    busy = true;
    try {
      // A lost answer response may already have advanced the index (or secondchance).
      // Reconcile before replay; never turn a retry into a second final answer.
      if (pending) {
        const saved = pending;
        const state = await reconcile(saved);
        if (!["answer", "timeout"].includes(saved.action) || answerAdvanced(state, saved)) {
          pending = null;
          return { ...state, notice: "Data tersimpan sudah dimuat ulang. Periksa hasil sebelum melanjutkan." };
        }
        if (action !== saved.action || payload.attempt_id !== saved.attempt_id || payload.question_id !== saved.question_id) { pending = null; return state; }
        payload = saved.payload; // an answer/timeout retry keeps the same frozen keys
      }
      const retried = !!context.retried;
      const attempt = { action, payload: structuredClone(payload), attempt_id: payload.attempt_id, question_id: payload.question_id, retried: pending?.retried ?? retried };
      try {
        const state = await send(action, payload);
        pending = null;
        return state;
      } catch (error) {
        if (error.code === "ACCOUNT_CHANGED" || error.rejected) { pending = null; throw error; }
        // A lost start may have reconciled a stale completed node. Never replay
        // that click automatically into a new attempt; inspect server state first.
        if (["start", "answer", "timeout", "next", "previous", "complete_node", "use_tool", "buy"].includes(action)) {
          pending = attempt;
          try {
            const state = await reconcile(attempt);
            if (!["answer", "timeout"].includes(action) || answerAdvanced(state, attempt)) {
              pending = null;
              return { ...state, notice: "Koneksi terputus; data server dimuat ulang. Periksa jawaban, alat, dan saldo. Pembelian/pemakaian tidak diulang otomatis." };
            }
          } catch (failure) { if (failure.code === "ACCOUNT_CHANGED") throw failure; }
        }
        throw new Error("Koneksi terputus. Coba lagi untuk memeriksa data tersimpan; jawaban belum dihapus.");
      }
    } finally { busy = false; }
  };
}
