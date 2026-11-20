/**
 * Menentukan URL "Home" untuk breadcrumb berdasarkan profil pengguna.
 *
 * Aturan (berurutan):
 * 1. is_subscribed = false                  -> /subscription
 * 2. STUDENT dan is_managed = false         -> /student
 * 3. STUDENT dan is_managed = true          -> /mstudent
 * 4. SCHOOL dengan school_id                -> /school
 * 5. ADMIN                                  -> /admin
 * 6. lainnya / profil belum ada             -> /home
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
  if (profile.is_subscribed === false) return "/subscription";

  const accountType = String(profile.account_type || "").toUpperCase();

  if (accountType === "STUDENT") {
    return profile.is_managed === true ? "/mstudent" : "/student";
  }
  if (accountType === "SCHOOL") {
    return profile.school_id ? "/school" : safeFallback;
  }
  if (accountType === "ADMIN") return "/admin";

  return safeFallback;
}

/** Kolom profiles yang dibutuhkan getHomeHref. */
export const HOME_HREF_PROFILE_COLUMNS =
  "is_subscribed, account_type, is_managed, school_id";
