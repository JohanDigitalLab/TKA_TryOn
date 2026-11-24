import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { schoolContracts, schoolRpc, validateSchoolResponse, assertSchoolMembership, loadLegacySchoolStudents, staffMemberships, schoolWorkspaceSummary } from "../src/lib/school/rpc-contract.mjs";

const schoolId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const context = (memberships = []) => ({ memberships, school_types: [], applications: [], transfers: [], is_platform_admin: false, can_review_applications: false });
const admin = { school_id: schoolId, school_name: "Sekolah A", role: "school_admin", is_primary: true };
const workspace = () => ({ school: { id: schoolId }, classes: [{ id: otherId, archived: false }], members: [{ membership_id: otherId, user_id: otherId, role: "student", status: "active", class_id: otherId }], requests: [{ status: "pending" }], invites: [], transfers: [] });
function mock(response) {
  const calls = [];
  return { calls, async rpc(name, args) { calls.push({ name, args }); return typeof response === "function" ? response(name, args) : response; } };
}

test("explicit portal mapping and authenticated context shape", async () => {
  const client = mock({ data: context([admin]), error: null });
  assert.deepEqual(await schoolRpc(client, "school_portal_context"), context([admin]));
  assert.deepEqual(client.calls, [{ name: "xschool_portal_context", args: {} }]);
});
test("workspace scope and array response fail closed", async () => {
  const params = { p_school_id: schoolId };
  assert.equal(validateSchoolResponse("school_admin_workspace", workspace(), params).school.id, schoolId);
  for (const data of [null, {}, { ...workspace(), members: null }, { ...workspace(), school: { id: otherId } }, { ...workspace(), classes: [] }]) {
    assert.throws(() => validateSchoolResponse("school_admin_workspace", data, params), { code: "SCHOOL_RESPONSE_INVALID" });
  }
});
test("invalid contexts cannot supply fabricated staff membership", () => {
  for (const data of [null, {}, context([{ ...admin, role: "SCHOOL" }]), context([{ ...admin, school_id: "fake" }])]) assert.throws(() => validateSchoolResponse("school_portal_context", data), { code: "SCHOOL_RESPONSE_INVALID" });
  assert.throws(() => assertSchoolMembership(context(), schoolId), { code: "SCHOOL_MEMBERSHIP_REQUIRED" });
  assert.throws(() => assertSchoolMembership(context([admin]), otherId), { code: "SCHOOL_MEMBERSHIP_REQUIRED" });
  assert.throws(() => assertSchoolMembership(context([{ ...admin, role: "teacher" }]), schoolId), { code: "SCHOOL_MEMBERSHIP_REQUIRED" });
  assert.deepEqual(staffMemberships(context([admin, { ...admin, school_id: otherId, role: "student" }])), [admin]);
});
test("unknown, provisioning, platform and mismatched teacher contracts never call backend", async () => {
  const client = mock({ data: null });
  for (const name of ["xschool_portal_context", "create_school_student", "reset_school_student_password", "update_school_student", "platform_school_workspace", "toString"]) await assert.rejects(schoolRpc(client, name), { code: "SCHOOL_RPC_UNSUPPORTED" });
  for (const name of ["get_teacher_workspace", "save_school_assignment", "set_school_assignment_status", "get_school_assignment_ranking"]) await assert.rejects(schoolRpc(client, name), { code: "SCHOOL_ARGS_INVALID" });
  assert.equal(client.calls.length, 0);
});
test("strict named arguments and supported management actions", async () => {
  const client = mock({ data: { ok: true } });
  for (const params of [{}, { p_school_id: "invalid" }, { p_school_id: schoolId, user_id: otherId }]) await assert.rejects(schoolRpc(client, "school_admin_workspace", params), { code: "SCHOOL_ARGS_INVALID" });
  await assert.rejects(schoolRpc(client, "school_admin_mutate", { p_school_id: schoolId, p_action: "promote_teacher", p_data: {} }), { code: "SCHOOL_ARGS_INVALID" });
  assert.equal(client.calls.length, 0);
  await schoolRpc(client, "school_admin_mutate", { p_school_id: schoolId, p_action: "member_deactivate", p_data: { membership_id: otherId } });
  assert.equal(client.calls[0].name, "xschool_admin_mutate");
});
test("management mutation responses including idempotent approval", () => {
  const cases = [["class_save", { class_id: otherId }], ["invite_create", { invite_id: otherId, code: "a".repeat(64) }], ["member_approve", { request_id: otherId, status: "approved" }], ["member_move", { ok: true }]];
  for (const [action, data] of cases) {
    assert.deepEqual(validateSchoolResponse("school_admin_mutate", data, { p_action: action }), data);
    assert.throws(() => validateSchoolResponse("school_admin_mutate", {}, { p_action: action }), { code: "SCHOOL_RESPONSE_INVALID" });
  }
});
test("denied/missing/network response never retries or falls back", async () => {
  for (const [code, expected] of [["42501", "SCHOOL_ACCESS_DENIED"], ["PGRST202", "SCHOOL_RPC_UNAVAILABLE"], ["42883", "SCHOOL_RPC_UNAVAILABLE"], ["23505", "SCHOOL_REQUEST_FAILED"]]) {
    const client = mock({ error: { code, message: "private backend detail" } });
    await assert.rejects(schoolRpc(client, "school_portal_context"), error => error.code === expected && !error.message.includes("private backend detail"));
    assert.equal(client.calls.length, 1);
  }
});
test("legacy read denied before profile list when membership unmapped or wrong school", async () => {
  for (const memberships of [[], [{ ...admin, school_id: otherId }], [{ ...admin, role: "teacher" }]]) {
    const client = mock({ data: context(memberships) });
    await assert.rejects(loadLegacySchoolStudents(client, { account_type: "SCHOOL", school_id: schoolId }), { code: "SCHOOL_MEMBERSHIP_REQUIRED" });
    assert.equal(client.calls.length, 1);
  }
});
test("legacy read requires matching backend school, never creates memberships", async () => {
  const client = mock(name => ({ data: name === "xschool_portal_context" ? context([admin]) : { school: { id: otherId }, students: [] } }));
  await assert.rejects(loadLegacySchoolStudents(client, { account_type: "SCHOOL", school_id: schoolId }), { code: "SCHOOL_RESPONSE_INVALID" });
  assert.deepEqual(client.calls.map(c => c.name), ["xschool_portal_context", "get_school_students"]);
});
test("real workspace counts do not invent scores or Auth account status", () => {
  assert.deepEqual(schoolWorkspaceSummary(workspace()), { studentMemberships: 1, unarchivedClasses: 1, pendingRequests: 1 });
  const data = workspace(); data.members[0].status = "inactive"; data.classes[0].archived = true;
  assert.deepEqual(schoolWorkspaceSummary(data), { studentMemberships: 0, unarchivedClasses: 0, pendingRequests: 1 });
});
test("invite preview/confirm, communications and application shapes", async () => {
  assert.throws(() => validateSchoolResponse("school_communications", { messages: [], tickets: [{}] }), { code: "SCHOOL_RESPONSE_INVALID" });
  assert.throws(() => validateSchoolResponse("school_invite_request", { request_id: schoolId, status: "pending" }, { p_confirm: false }), { code: "SCHOOL_RESPONSE_INVALID" });
  const client = mock({ data: { request_id: schoolId, status: "pending" } });
  await schoolRpc(client, "school_invite_request", { p_code: "a".repeat(64), p_confirm: true });
  assert.equal(client.calls[0].name, "xschool_invite_request");
  for (const [name, data] of [["school_communications", { messages: [], tickets: [] }], ["submit_school_application", { application_id: schoolId, status: "pending" }], ["school_communication_mutate", { id: schoolId }], ["school_coordinator_transfer", { transfer_id: schoolId, status: "pending" }]]) assert.deepEqual(validateSchoolResponse(name, data), data);
});
test("school/teacher sources have no direct membership SELECT, dummy actions or provisioning", () => {
  for (const path of ["src/app/teacher/page.js", "src/app/school/messages/page.js", "src/app/school/page.js", "src/components/school/students.js"]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from\("school_memberships"\)|create_school_student|reset_school_student_password|setSelected\(\{ action: "schedule"/);
  }
});
test("teacher keeps draft editing, publication/cancellation and ranking UI behind schoolRpc", () => {
  const source = readFileSync(new URL("../src/app/teacher/page.js", import.meta.url), "utf8");
  assert.match(source, /const context = await schoolRpc\(supabase, "school_portal_context"\)/);
  assert.match(source, /const memberships = staffMemberships\(context\)/);
  assert.match(source, /name: m\.school_name/);
  assert.doesNotMatch(source, /supabase\s*\.\s*(?:rpc|from)\s*\(/);
  assert.doesNotMatch(source, /school_memberships|profile\.school_id|account_type/);
  for (const operation of ["get_teacher_workspace", "save_school_assignment", "set_school_assignment_status", "get_school_assignment_ranking"]) {
    assert.ok(source.includes(`await schoolRpc(supabase, "${operation}",`), operation);
  }
  for (const handler of ["changeSchool", "save", "changeStatus", "openRanking", "edit", "field"]) {
    assert.match(source, new RegExp(`function ${handler}\\(`), handler);
  }
  assert.match(source, /assignmentMutationPayload\(form, schoolId, editing\)/);
  assert.match(source, /setForm\(\{ \.\.\.item, opens_at: localDate\(item\.opens_at\), due_at: localDate\(item\.due_at\) \}\)/);
  assert.match(source, /<form onSubmit=\{save\}/);
  for (const field of ["title", "class_id", "subject_name", "question_count", "duration_minutes", "opens_at", "due_at"]) {
    assert.ok(source.includes(`field("${field}", e.target.value)`), field);
  }
  for (const feature of ["Edit draft", "Tugas baru", "Simpan draft", "Batal edit", "Daftar tugas", "Muat ulang", "Terbitkan", "Batalkan tugas", "Top 5 hasil", "ranking.rows.map", "r.student_name", "r.score", "r.correct_answers", "r.total_questions"]) {
    assert.ok(source.includes(feature), feature);
  }
  assert.match(source, /onClick=\{\(\) => edit\(item\)\}/);
  assert.match(source, /setConfirm\(\{ item, status: "published" \}\)/);
  assert.match(source, /setConfirm\(\{ item, status: "cancelled" \}\)/);
  assert.match(source, /onClick=\{\(\) => openRanking\(item\)\}/);
  assert.match(source, /<dialog ref=\{dialogRef\}/);
  assert.match(source, /onClick=\{changeStatus\}/);
  assert.match(source, /if \(active\) setError\(err\.message/);
  assert.match(source, /role="alert"[^>]*>\{error\}/);
});
const snapshot = new URL("../.local/database/addendum-02-db.json", import.meta.url);
test("local audited catalog: enabled names, authenticated grants, arguments and auth helpers", { skip: !existsSync(snapshot) }, () => {
  const functions = JSON.parse(readFileSync(snapshot, "utf8")).sets.functions;
  for (const [operation, contract] of Object.entries(schoolContracts)) {
    const fn = functions.find(f => f.schema_name === "public" && f.proname === contract.name);
    assert.ok(fn, operation);
    assert.equal(fn.authenticated_execute, true, operation);
    assert.equal(fn.anon_execute, false, operation);
    for (const arg of contract.args) assert.ok(fn.arguments.includes(arg), `${operation}: ${arg}`);
    if (contract.name.startsWith("x")) {
      assert.match(fn.definition, /private.school_actor\(\)|private.school_require\(/);
      assert.match(fn.settings.join(" "), /search_path=pg_catalog/);
    }
  }
  const actor = functions.find(f => f.proname === "school_actor").definition;
  for (const fragment of ["auth.uid()", "email_confirmed_at IS NOT NULL", "deleted_at IS NULL", "banned_until", "account_status='active'"]) assert.ok(actor.includes(fragment));
  const requireSchool = functions.find(f => f.proname === "school_require").definition;
  for (const fragment of ["private.school_actor()", "status='active'", "user_id=auth.uid()", "role='school_admin'"]) assert.ok(requireSchool.includes(fragment));
  const portal = functions.find(f => f.proname === "xschool_portal_context").definition;
  assert.match(portal, /m.user_id=u AND m.status='active' AND s.status='active'/);
  for (const name of ["xschool_admin_workspace", "xschool_admin_mutate"]) assert.ok(functions.find(f => f.proname === name).definition.includes("private.school_require(p_school_id,true)"));
  assert.doesNotMatch(functions.find(f => f.proname === "require_school_staff").definition, /email_confirmed_at/);
});
