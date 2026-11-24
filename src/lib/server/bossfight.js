const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "no-store" };
const reply = (body, status = 200) => Response.json(body, { status, headers });

export function createBossfightHandlers({ getBearerToken, getUser }) {
  async function handle(request, action) {
    try {
      const token = getBearerToken(request);
      if (!token) return reply({ error: "Silakan login." }, 401);
      const identity = await getUser(token);
      if (!identity?.user || !identity.supabase) return reply({ error: "Sesi tidak valid." }, 401);
      let payload = {};
      if (!action) {
        if (!(request.headers.get("content-type") || "").includes("application/json")) return reply({ error: "JSON diperlukan." }, 400);
        const reader = request.body?.getReader();
        if (!reader) return reply({ error: "Body diperlukan." }, 400);
        const chunks = []; let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 65536) { await reader.cancel(); return reply({ error: "Body terlalu besar." }, 413); }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply({ error: "JSON tidak valid." }, 400); }
        if (!payload || Array.isArray(payload) || typeof payload !== "object") return reply({ error: "Payload tidak valid." }, 400);
        action = payload.action;
        if (!["settings", "start", "batch", "finish"].includes(action)) return reply({ error: "Action tidak valid." }, 400);
        if (["batch", "finish"].includes(action) && !UUID.test(payload.attempt_id || "")) return reply({ error: "Attempt tidak valid." }, 400);
      }
      const { data, error } = await identity.supabase.rpc("bossfight", { p_action: action, p_payload: payload });
      if (error) {
        const status = error.code === "42501" ? 403 : ["22023", "22P02"].includes(error.code) ? 400 : error.code === "P0001" ? 409 : 500;
        return reply({ error: status === 500 ? "Backend BossFight belum tersedia." : status === 403 ? "Sesi tidak dapat diakses." : status === 409 ? "Konflik sesi, urutan, atau soal tidak tersedia." : "Data BossFight tidak valid." }, status);
      }
      return reply({ data });
    } catch { return reply({ error: "Gagal memproses BossFight." }, 500); }
  }
  return { GET: (request) => handle(request, "bootstrap"), POST: (request) => handle(request) };
}
