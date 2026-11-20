// Daftar provinsi Indonesia. Sumber utama adalah API wilayah (data EMSIFA),
// dengan fallback statis agar formulir tetap dapat dipakai saat jaringan gagal.
export const PROVINCE_ENDPOINTS = [
  "https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json",
];

// 38 provinsi hasil pemekaran, dipakai bila seluruh endpoint gagal dijangkau.
export const FALLBACK_PROVINCES = [
  "Aceh",
  "Sumatera Utara",
  "Sumatera Barat",
  "Riau",
  "Jambi",
  "Sumatera Selatan",
  "Bengkulu",
  "Lampung",
  "Kepulauan Bangka Belitung",
  "Kepulauan Riau",
  "DKI Jakarta",
  "Jawa Barat",
  "Jawa Tengah",
  "DI Yogyakarta",
  "Jawa Timur",
  "Banten",
  "Bali",
  "Nusa Tenggara Barat",
  "Nusa Tenggara Timur",
  "Kalimantan Barat",
  "Kalimantan Tengah",
  "Kalimantan Selatan",
  "Kalimantan Timur",
  "Kalimantan Utara",
  "Sulawesi Utara",
  "Sulawesi Tengah",
  "Sulawesi Selatan",
  "Sulawesi Tenggara",
  "Gorontalo",
  "Sulawesi Barat",
  "Maluku",
  "Maluku Utara",
  "Papua",
  "Papua Barat",
  "Papua Selatan",
  "Papua Tengah",
  "Papua Pegunungan",
  "Papua Barat Daya",
];

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(?:^|[\s\-/])\S/g, (character) => character.toUpperCase())
    .replace(/\bDki\b/, "DKI")
    .trim();
}

export function normalizeProvinces(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const names = rows
    .map((row) => toTitleCase(typeof row === "string" ? row : row?.name))
    .filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "id"));
}

/**
 * Memuat daftar provinsi dari aplikasi (route /api/provinces) lalu memvalidasi
 * bentuknya. Kegagalan jaringan otomatis jatuh ke daftar statis.
 */
export async function fetchProvinces(fetchImpl = fetch) {
  try {
    const response = await fetchImpl("/api/provinces", { cache: "force-cache" });
    if (response?.ok) {
      const payload = await response.json();
      const list = normalizeProvinces(payload?.provinces);
      if (list.length >= 20) return list;
    }
  } catch {
    // Fallback statis di bawah.
  }
  return normalizeProvinces(FALLBACK_PROVINCES);
}

/** Mengambil daftar provinsi; selalu berhasil karena memakai fallback. */
export async function loadProvinces(endpoints = PROVINCE_ENDPOINTS) {
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { cache: "force-cache" });
      if (!response.ok) continue;
      const list = normalizeProvinces(await response.json());
      if (list.length >= 20) return { provinces: list, source: "remote" };
    } catch {
      // Lanjut ke endpoint berikutnya, lalu ke fallback statis.
    }
  }
  return { provinces: normalizeProvinces(FALLBACK_PROVINCES), source: "fallback" };
}
