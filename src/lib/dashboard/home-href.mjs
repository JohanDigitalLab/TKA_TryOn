/**
 * Menentukan URL "Home" untuk breadcrumb berdasarkan profil pengguna.
 *
 * Aturan (berurutan):
 * 1. STUDENT (mandiri maupun managed,       -> /student
 *    termasuk yang belum berlangganan;
 *    paket langganan kini tampil di /student)
 * 2. SCHOOL dengan school_id                -> /school
 * 3. ADMIN                                  -> /admin
 * 4. lainnya / profil belum ada             -> /home
 *
 * @param {{is_subscribed?: boolean|null, account_type?: string|null, is_managed?: boolean|null, school_id?: string|null}|null|undefined} profile
 * @param {string} [fallback="/home"] URL cadangan bila profil belum ada/tidak dikenali.
 *        Pemanggil yang berada di rute /home wajib mengirim fallback sendiri (mis. "/")
 *        agar tidak terjadi redirect berputar.
 * @returns {string}
 */
export function getHomeHref(profile, fallback = "/home") {
  const safeFallback = fallback || "/home";
  if (!profile) return safeFallback;

  const accountType = String(profile.account_type || "").toUpperCase();

  if (accountType === "STUDENT") return "/student";
  if (accountType === "SCHOOL") {
    return profile.school_id ? "/school" : safeFallback;
  }
  if (accountType === "ADMIN") return "/admin";

  return safeFallback;
}

/** Kolom profiles yang dibutuhkan getHomeHref. */
export const HOME_HREF_PROFILE_COLUMNS =
  "is_subscribed, account_type, is_managed, school_id";
