import { advancedContracts, advancedRpc } from './advanced.mjs';
// Audited against addendum-02-db.json, captured 2026-11-23.
// Explicit allowlist, NOT a general x-prefix fallback. PostgreSQL remains the
// authorization boundary; browser validation does not grant any permission.
export class SchoolContractError extends Error {
  constructor(code, message, cause) {
    super(`${code}: ${message}`, { cause });
    this.name = "SchoolContractError";
    this.code = code;
  }
}
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = value => typeof value === "string" && value.length > 0;
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = (code, message, cause) => { throw new SchoolContractError(code, message, cause); };
const invalid = () => fail("SCHOOL_RESPONSE_INVALID", "Respons sekolah tidak sesuai kontrak. Muat ulang; bila berulang, laporkan kode ini kepada pengelola. Jangan mengulang mutasi sebelum memeriksa data.");
const arrays = (data, keys) => object(data) && keys.every(key => Array.isArray(data[key]) && data[key].every(object));
const actions = ["profile_update", "class_save", "class_archive", "invite_create", "invite_revoke", "member_approve", "member_reject", "member_move", "member_deactivate"];
// All enabled x RPCs call school_actor/school_require (active verified Auth,
// active profile, active school and scoped membership), with pg_catalog path.
export const schoolContracts = Object.freeze({
  school_portal_context: { name: "xschool_portal_context", args: [] },
  school_admin_workspace: { name: "xschool_admin_workspace", args: ["p_school_id"] },
  school_admin_mutate: { name: "xschool_admin_mutate", args: ["p_school_id", "p_action", "p_data"] },
  school_invite_request: { name: "xschool_invite_request", args: ["p_code", "p_confirm"] },
  submit_school_application: { name: "xsubmit_school_application", args: ["p_data"] },
  school_communications: { name: "xschool_communications", args: ["p_school_id"] },
  school_communication_mutate: { name: "xschool_communication_mutate", args: ["p_action", "p_data"] },
  school_coordinator_transfer: { name: "xschool_coordinator_transfer", args: ["p_action", "p_data"] },
  get_school_students: { name: "get_school_students", args: [] },
  get_school_subject_topics: { name: "get_school_subject_topics", args: [] },
});
export function staffMemberships(context) {
  return (context?.memberships || []).filter(m => ["school_admin", "teacher"].includes(m.role));
}
export function assertSchoolMembership(context, schoolId, roles = ["school_admin"]) {
  const membership = context?.memberships?.find(m => m.school_id === schoolId && roles.includes(m.role));
  if (!membership) fail("SCHOOL_MEMBERSHIP_REQUIRED", "Keanggotaan aktif sekolah belum dipetakan untuk akun ini. Hubungi koordinator/platform untuk rekonsiliasi keanggotaan; ID sekolah pada profil tidak memberikan izin kelas.");
  return membership;
}
export function validateSchoolResponse(operation, data, params = {}) {
  if (operation === "school_portal_context") {
    if (!arrays(data, ["memberships", "school_types", "applications", "transfers"]) || typeof data.is_platform_admin !== "boolean" || typeof data.can_review_applications !== "boolean" || !data.memberships.every(m => uuid(m.school_id) && text(m.school_name) && ["school_admin", "teacher", "student"].includes(m.role) && typeof m.is_primary === "boolean")) invalid();
  } else if (operation === "school_admin_workspace") {
    if (!arrays(data, ["classes", "members", "requests", "invites", "transfers"]) || !object(data.school) || data.school.id !== params.p_school_id || !data.classes.every(c => uuid(c.id) && typeof c.archived === "boolean") || !data.members.every(m => uuid(m.membership_id) && uuid(m.user_id) && ["school_admin", "teacher", "student"].includes(m.role) && ["active", "inactive"].includes(m.status) && (m.class_id === null || data.classes.some(c => c.id === m.class_id)))) invalid();
  } else if (operation === "get_school_students") {
    if (!arrays(data, ["students"]) || !object(data.school) || !uuid(data.school.id) || !data.students.every(s => uuid(s.id))) invalid();
  } else if (operation === "get_school_subject_topics") {
    if (!Array.isArray(data) || !data.every(t => object(t) && text(t.subject_code) && text(t.theme) && text(t.topic))) invalid();
  } else if (operation === "school_communications") {
    if (!arrays(data, ["messages", "tickets"]) || !data.tickets.every(t => Array.isArray(t.replies))) invalid();
  } else if (operation === "school_admin_mutate") {
    const action = params.p_action;
    if (!object(data) || (action === "class_save" ? !uuid(data.class_id) : action === "invite_create" ? !uuid(data.invite_id) || !text(data.code) : ["member_approve", "member_reject"].includes(action) && data.request_id ? !uuid(data.request_id) || !text(data.status) : data.ok !== true)) invalid();
  } else if (operation === "school_invite_request") {
    if (!object(data) || (params.p_confirm ? !uuid(data.request_id) || !text(data.status) : !text(data.school_name) || !text(data.class_name) || data.requires_approval !== true)) invalid();
  } else if (operation === "submit_school_application") {
    if (!object(data) || !uuid(data.application_id) || !text(data.status)) invalid();
  } else if (operation === "school_communication_mutate") {
    if (!object(data) || !uuid(data.id)) invalid();
  } else if (operation === "school_coordinator_transfer") {
    if (!object(data) || !uuid(data.transfer_id) || !text(data.status)) invalid();
  } else invalid();
  return data;
}
export async function schoolRpc(client, operation, params = {}, scope = {}) {
  if (Object.hasOwn(advancedContracts, operation)) return advancedRpc(client, operation, params, scope.schoolId || params.p_school_id);
  const contract = Object.hasOwn(schoolContracts, operation) && schoolContracts[operation];
  if (!contract) fail("SCHOOL_RPC_UNSUPPORTED", "Operasi belum direkonsiliasi. Hubungi pengelola; tidak ada fallback ke RPC lama atau provisioning Auth.");
  if (!object(params) || Object.keys(params).some(k => !contract.args.includes(k)) || contract.args.some(k => !Object.hasOwn(params, k))) fail("SCHOOL_ARGS_INVALID", "Argumen sekolah tidak sesuai kontrak.");
  if (Object.hasOwn(params, "p_school_id") && params.p_school_id !== null && !uuid(params.p_school_id)) fail("SCHOOL_ARGS_INVALID", "ID sekolah tidak valid.");
  if (operation === "school_admin_mutate" && (!actions.includes(params.p_action) || !object(params.p_data))) fail("SCHOOL_ARGS_INVALID", "Aksi manajemen tidak didukung.");
  if (operation === "school_invite_request" && (typeof params.p_code !== "string" || params.p_code.length !== 64 || typeof params.p_confirm !== "boolean")) fail("SCHOOL_ARGS_INVALID", "Kode atau konfirmasi undangan tidak valid.");
  const { data, error } = await client.rpc(contract.name, params);
  if (error) {
    if (["42501", "PGRST301", "PGRST302"].includes(error.code)) fail("SCHOOL_ACCESS_DENIED", "Akses ditolak server. Periksa verifikasi email, status akun/sekolah dan membership; masuk kembali atau hubungi koordinator. Tidak ada fallback profil.", error);
    if (["PGRST202", "42883"].includes(error.code)) fail("SCHOOL_RPC_UNAVAILABLE", "Kontrak sekolah tidak tersedia pada backend. Laporkan kepada platform untuk review deployment; jangan menjalankan migrasi historis atau mengulang mutasi secara otomatis.", error);
    fail("SCHOOL_REQUEST_FAILED", "Permintaan ditolak atau statusnya belum pasti. Muat ulang data sebelum mencoba ulang; hubungi koordinator bila berulang.", error);
  }
  return validateSchoolResponse(operation, data, params);
}
export async function loadLegacySchoolStudents(client, profile) {
  const context = await schoolRpc(client, "school_portal_context");
  if (profile?.account_type !== "SCHOOL" || !uuid(profile.school_id)) fail("SCHOOL_LEGACY_UNAVAILABLE", "Daftar profil terkelola hanya tersedia bagi akun SCHOOL legacy yang dipetakan.");
  assertSchoolMembership(context, profile.school_id);
  const data = await schoolRpc(client, "get_school_students");
  if (data.school.id !== profile.school_id) invalid();
  return data;
}
export function schoolWorkspaceSummary(workspace) {
  // Membership status != Auth account status. Do not label this active students.
  return {
    studentMemberships: workspace.members.filter(m => m.role === "student" && m.status === "active").length,
    unarchivedClasses: workspace.classes.filter(c => !c.archived).length,
    pendingRequests: workspace.requests.filter(r => r.status === "pending").length,
  };
}
