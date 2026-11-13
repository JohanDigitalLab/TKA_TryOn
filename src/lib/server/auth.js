import { createClient } from "@supabase/supabase-js";

const SUPER_ADMIN_ROLE = "super_admin";

function authError(status, message) {
  return { allowed: false, status, message };
}

function getSupabaseClient(accessToken) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Server authentication is not configured.");
  }

  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getBearerToken(request) {
  const value = request?.headers?.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(value)) return null;
  return value.replace(/^Bearer\s+/i, "").trim();
}

/** Verifies the token and returns a narrow, server-derived user record. */
export async function getUser(token) {
  if (!token || typeof token !== "string") return null;

  const supabase = getSupabaseClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;

  return { user: data.user, supabase };
}

async function hasSuperAdminRole(supabase, userId) {
  const { data, error } = await supabase
    .from("user_global_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", SUPER_ADMIN_ROLE)
    .maybeSingle();

  // Role lookup errors fail closed. A missing row is not an error.
  if (error) return { allowed: false, error };
  return { allowed: Boolean(data), error: null };
}

export async function requireSuperAdmin(request) {
  const token = getBearerToken(request);
  if (!token) return authError(401, "Sesi login tidak ditemukan.");

  try {
    const identity = await getUser(token);
    if (!identity) return authError(401, "Sesi login tidak valid atau kedaluwarsa.");

    const role = await hasSuperAdminRole(identity.supabase, identity.user.id);
    if (role.error) {
      console.error("Role verification failed:", role.error.message);
      return authError(500, "Gagal memverifikasi hak akses.");
    }
    if (!role.allowed) return authError(403, "Hak akses tidak mencukupi.");

    return { allowed: true, user: identity.user, supabase: identity.supabase };
  } catch (error) {
    console.error("Authentication failed:", error?.message || error);
    return authError(500, "Gagal memverifikasi autentikasi.");
  }
}

export async function requireAdminPermission(request, permissionCode = "bank_soal.view") {
  const token = getBearerToken(request);
  if (!token) return authError(401, "Sesi login tidak ditemukan.");

  try {
    const identity = await getUser(token);
    if (!identity) return authError(401, "Sesi login tidak valid atau kedaluwarsa.");

    const role = await hasSuperAdminRole(identity.supabase, identity.user.id);
    if (role.error) {
      console.error("Role verification failed:", role.error.message);
      return authError(500, "Gagal memverifikasi hak akses.");
    }
    if (role.allowed) {
      return {
        allowed: true,
        user: identity.user,
        supabase: identity.supabase,
        role: SUPER_ADMIN_ROLE,
        permissions: [permissionCode],
      };
    }

    const { data, error } = await identity.supabase.rpc("admin_has_permission", {
      p_permission_code: permissionCode,
    });
    if (error) {
      console.error("Permission verification failed:", error.message);
      return authError(500, "Gagal memverifikasi hak akses.");
    }
    if (data !== true) return authError(403, "Hak akses tidak mencukupi.");

    return {
      allowed: true,
      user: identity.user,
      supabase: identity.supabase,
      role: "operator",
      permissions: [permissionCode],
    };
  } catch (error) {
    console.error("Authorization failed:", error?.message || error);
    return authError(500, "Gagal memverifikasi hak akses.");
  }
}
