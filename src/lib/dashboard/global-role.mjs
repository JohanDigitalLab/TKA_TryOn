// UX routing only: database RPC/RLS remain the authorization boundary.
export async function hasSuperAdminRole(supabase, userId) {
  const { data, error } = await supabase
    .from("user_global_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error) throw error;
  return data?.role === "super_admin";
}
