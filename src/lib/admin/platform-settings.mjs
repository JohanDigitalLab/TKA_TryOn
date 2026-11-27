export const SETTING_KEYS = ['WA_NUMBER', 'WA_MSG_SISWA', 'WA_MSG_SEKOLAH', 'AUTO_CALC_COMPETENCY'];
export const SETTING_LABELS = { WA_NUMBER: 'Nomor WhatsApp aktivasi', WA_MSG_SISWA: 'Pesan aktivasi siswa', WA_MSG_SEKOLAH: 'Pesan aktivasi sekolah', AUTO_CALC_COMPETENCY: 'Hitung kompetensi otomatis' };
export const textLength = value => Array.from(String(value)).length;
export function normalizeWhatsAppNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/^\+?[0-9 ()-]+$/.test(raw)) throw new Error('Nomor WhatsApp hanya boleh berisi angka, spasi, +, tanda kurung, dan tanda hubung.');
  let digits = raw.replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) throw new Error('Nomor WhatsApp harus berisi 8–15 digit dengan kode negara (08 akan diubah menjadi 628).');
  return digits;
}
export function settingEnabled(value) {
  return ['1', 'true'].includes(String(value ?? '').trim().toLowerCase());
}
export function validateSettingsPatch(patch) {
  if (!patch || Array.isArray(patch) || typeof patch !== 'object' || !Object.keys(patch).length) throw new Error('Tidak ada perubahan.');
  const result = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!SETTING_KEYS.includes(key) || typeof value !== 'string') throw new Error('Kunci atau tipe pengaturan tidak diizinkan.');
    if (textLength(value) > 255) throw new Error(`${SETTING_LABELS[key]} maksimal 255 karakter.`);
    if (key === 'WA_NUMBER') result[key] = normalizeWhatsAppNumber(value);
    else if (key === 'AUTO_CALC_COMPETENCY') {
      if (!['0', '1', 'true', 'false'].includes(value.trim().toLowerCase())) throw new Error('Nilai kompetensi tidak valid.');
      result[key] = settingEnabled(value) ? '1' : '0';
    } else result[key] = value.trim();
  }
  return result;
}
export function whatsAppUrl(number, message = '') {
  const normalized = normalizeWhatsAppNumber(number);
  return normalized ? `https://wa.me/${normalized}${message ? `?text=${encodeURIComponent(message)}` : ''}` : '';
}
export function settingsError(error) {
  if (['PGRST202', '42883', '42P01'].includes(error?.code)) return 'Backend Pengaturan belum terpasang. Administrator database perlu menerapkan migration-admin-platform-settings.sql, lalu memuat ulang halaman.';
  if (error?.code === '40001') return 'Konfigurasi berubah sejak dimuat. Salin draf bila diperlukan, lalu muat ulang data terbaru sebelum menyimpan.';
  if (error?.code === '42501') return 'Akses ditolak. Pengaturan hanya untuk Super Admin aktif, terverifikasi, dan tidak diblokir.';
  return error?.message || 'Permintaan gagal. Periksa koneksi dan coba lagi.';
}
