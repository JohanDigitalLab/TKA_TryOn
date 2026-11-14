// Browser-safe contract helpers. Authorization always remains in PostgreSQL RPCs.
export const statusLabels = { pending: "Menunggu persetujuan", approved: "Disetujui", rejected: "Ditolak", deactivated: "Dinonaktifkan", active: "Aktif", inactive: "Nonaktif", open: "Terbuka", closed: "Ditutup", accepted: "Diterima", cancelled: "Dibatalkan" };
export function localPath(value, fallback = "/student") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\s\u0000-\u001f\u007f]/u.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\s\u0000-\u001f\u007f]/u.test(decoded)) return fallback;
    const url = new URL(value, "https://local.invalid");
    return url.origin === "https://local.invalid" && !url.pathname.startsWith("//") ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}
export function authLink(kind, next) { return `/${kind}?next=${encodeURIComponent(localPath(next))}`; }
export function inviteCode(value) {
  const code = String(value || "").trim();
  if (code.length !== 64 || /\s/u.test(code)) throw new Error("Kode undangan harus tepat 64 karakter tanpa spasi.");
  return code;
}
export function joinPath(code) { return `/school/join?code=${encodeURIComponent(inviteCode(code))}`; }
export function gradesFor(level) { return ({ sd: [1,2,3,4,5,6], smp: [7,8,9], sma: [10,11,12] })[String(level).toLowerCase()] || []; }
export function academicYear(value) { return /^\d{4}\/\d{4}$/.test(value) && Number(value.slice(5)) === Number(value.slice(0,4)) + 1; }
export function text(value, label, min, max) {
  const result = String(value ?? "").trim();
  if ([...result].length < min || [...result].length > max) throw new Error(`${label}: panjang harus ${min}–${max} karakter.`);
  return result;
}
export const applicationFields = [
  ["school_name", "Nama sekolah", 3, 160], ["address", "Alamat", 3, 500], ["city", "Kota/kabupaten", 2, 100], ["province", "Provinsi", 2, 100], ["teacher_name", "Nama penanggung jawab", 2, 160], ["teacher_position", "Jabatan", 2, 100], ["contact_phone", "Telepon kontak", 6, 30],
];
export function applicationPayload(values, types) {
  const result = Object.fromEntries(applicationFields.map(([key,label,min,max]) => [key,text(values[key],label,min,max)]));
  result.npsn = String(values.npsn || "").trim();
  if (!/^\d{8}$/.test(result.npsn)) throw new Error("NPSN wajib tepat 8 angka.");
  if (!types.some(type => type.id === values.school_type_id)) throw new Error("Pilih tipe sekolah yang tersedia.");
  result.school_type_id = values.school_type_id;
  if (values.authorization_confirmed !== true) throw new Error("Pernyataan kewenangan wajib disetujui.");
  result.authorization_confirmed = true;
  return result;
}
export function classPayload(values, level, existing) {
  const grade = Number(existing?.grade ?? values.grade);
  const year = existing?.academic_year ?? String(values.academic_year || "").trim();
  if (!Number.isInteger(grade) || !gradesFor(level).includes(grade)) throw new Error("Tingkat kelas tidak sesuai jenjang sekolah.");
  if (!academicYear(year)) throw new Error("Tahun ajaran harus dua tahun berurutan, contoh 2026/2027.");
  return { name: text(values.name,"Nama kelas",1,100), grade, academic_year: year, ...(existing ? { class_id: existing.id } : {}) };
}
export function transferPayload(values, recovery = false) {
  const email = text(values.email,"Email tujuan",3,254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email tujuan tidak valid.");
  return { email, ...(recovery ? { reason: text(values.reason,"Alasan pemulihan",10,2000) } : {}) };
}
export function schoolError(error) {
  if (["PGRST202", "42883"].includes(error?.code)) return "Portal tahap 4 belum tersedia pada database ini. Penerapan backend masih menunggu persetujuan; tidak ada perubahan yang dilakukan.";
  if (error?.code === "42501") return "Akses ditolak. Pastikan email terverifikasi, akun aktif, dan izin sekolah/platform sesuai. Muat ulang konteks atau masuk dengan akun yang benar.";
  const known = { "Education level mismatch": "Jenjang akun siswa tidak cocok dengan kelas undangan. Hubungi admin untuk pemeriksaan profil.", "Invite unavailable": "Undangan tidak tersedia, kedaluwarsa, dicabut, atau kuotanya habis.", "Already affiliated with a school": "Akun sudah memiliki afiliasi sekolah. Hubungi admin sekolah.", "Class still has students or pending requests": "Kelas masih memiliki siswa atau permintaan menunggu. Pindahkan siswa dan selesaikan permintaan dahulu.", "School already registered": "NPSN sudah terdaftar.", "Student cannot become coordinator": "Akun siswa pada sekolah ini tidak dapat menerima peran koordinator.", "Invite revoked or expired": "Undangan dicabut/kedaluwarsa. Tolak permintaan lama dan buat undangan baru bila diperlukan." };
  if (known[error?.message]) return known[error.message];
  if (error instanceof Error && !error.code) return error.message;
  return "Permintaan belum dapat diselesaikan. Periksa data dan izin, lalu muat ulang sebelum mencoba lagi. Respons jaringan yang tidak pasti dapat berarti perubahan sudah tersimpan.";
}
