export const ITEM_IDS = ["water", "rice", "apple", "donut", "cake", "vitamin"];
export const MODES = [
  { id: "KUIZ", count: 10, label: "Kuis", reward: "Air +1, nasi +1, XP profil +1" },
  { id: "HOTS", count: 10, label: "HOTS", reward: "2 undian independen apel/donat/kue/vitamin (boleh sama), XP profil +5" },
  { id: "PENYELAMATAN", count: 15, label: "Penyelamatan", reward: "Kenyang dan hidrasi +50 (maksimal 100), XP profil +2" },
];
export function mapPet(state) {
  return state.pet ? { ...state.pet, species: state.pet.pet_type, name: state.pet.pet_name,
    inventory: Object.fromEntries(ITEM_IDS.map(id => [id, state.inventory?.[id] ?? 0])) } : null;
}
export function categoryLabels(item) {
  return [...new Set((item.category_label || "").split("/").map(label => label.trim()).filter(Boolean))];
}
export function buildAnswers(session, drafts) {
  return session.questions.map(q => {
    const draft = drafts[q.id];
    if (q.type === "PGK_KATEGORI") {
      const categories = draft?.category_answers || {};
      if (!q.category_items.every(item => categoryLabels(item).includes(categories[item.item_number]))) throw new Error("Lengkapi seluruh kategori jawaban.");
      return { question_id: q.id, answer_payload: { category_answers: { ...categories } } };
    }
    const codes = draft?.option_codes || [];
    if (q.type === "PG_TUNGGAL" && codes.length !== 1) throw new Error("Jawab semua soal pilihan tunggal terlebih dahulu.");
    return { question_id: q.id, answer_payload: { option_codes: [...codes] } };
  });
}

export function createVirtualpetClient({ getSession, actions, fetcher = fetch, onIdentityChange = () => {} }) {
  let busy = false;
  let owner = null;
  const changed = () => Object.assign(new Error("Akun berubah. Muat ulang VirtualPet."), { code: "ACCOUNT_CHANGED" });
  return async function request(action, payload = {}) {
    if (busy) throw new Error("Perintah sebelumnya masih diproses.");
    busy = true;
    try {
      const { data, error } = await getSession();
      const session = data?.session;
      if (error || !session?.access_token || !session.user?.id) {
        onIdentityChange();
        throw changed();
      }
      const userId = session.user.id;
      if (owner && owner !== userId) { onIdentityChange(); throw changed(); }
      const bridge = await fetcher("/api/virtualpet/session", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
      const body = await bridge.json();
      if (!bridge.ok) throw new Error("Gagal memperbarui sesi VirtualPet. Silakan coba lagi.");
      if (body.userId !== userId) { onIdentityChange(); throw changed(); }
      const result = await actions[action](payload, userId);
      if (!result.ok) {
        if (result.code === "ACCOUNT_CHANGED") { onIdentityChange(); throw changed(); }
        throw new Error(result.error || "Perintah VirtualPet gagal.");
      }
      // Recheck browser identity after await: never paint a previous account's state.
      const current = await getSession();
      if (current.data?.session?.user?.id !== userId || result.userId !== userId) { onIdentityChange(); throw changed(); }
      owner = userId;
      return result.data;
    } finally { busy = false; }
  };
}
