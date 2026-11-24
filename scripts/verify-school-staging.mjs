import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { stagingConfig, stagingReadPath } from "../src/lib/server/staging-guard.mjs";
import { validateSchoolResponse } from "../src/lib/school/rpc-contract.mjs";

const fail = () => { throw new Error("STAGING_SMOKE_FAILED: invariant akses tidak terpenuhi."); };

export async function verifySchoolStaging(env, { snapshot, fetchImpl = globalThis.fetch } = {}) {
  // This MUST precede every network call, including Auth validation.
  const config = stagingConfig(env, snapshot);
  async function read(index, operation, args) {
    const path = stagingReadPath(operation, args);
    const response = await fetchImpl(`${config.url}${path}`, {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { apikey: config.key, Authorization: `Bearer ${config.tokens[index]}` },
      signal: AbortSignal.timeout(15000),
    });
    let data;
    try { data = await response.json(); } catch { fail(); }
    return { ok: response.ok, status: response.status, data };
  }
  // JWT decoding in the guard is NOT authentication: verify all identities with Auth.
  for (let i = 0; i < 3; i++) {
    const result = await read(i, "user");
    if (!result.ok || result.data?.id !== config.uids[i] || !result.data.email_confirmed_at) fail();
  }
  const contexts = [];
  for (let i = 0; i < 3; i++) {
    const result = await read(i, "context");
    if (!result.ok) fail();
    contexts.push(validateSchoolResponse("school_portal_context", result.data));
  }
  for (let i = 0; i < 2; i++) {
    const own = config.schoolIds[i];
    const other = config.schoolIds[1 - i];
    if (contexts[i].is_platform_admin || contexts[i].can_review_applications
      || !contexts[i].memberships.some(m => m.school_id === own && m.role === "school_admin")
      || contexts[i].memberships.some(m => m.school_id === other)) fail();
    const workspace = await read(i, "workspace", { p_school_id: own });
    if (!workspace.ok) fail();
    validateSchoolResponse("school_admin_workspace", workspace.data, { p_school_id: own });
    const denied = await read(i, "workspace", { p_school_id: other });
    // Missing functions, transport failures and generic errors are NOT access denial.
    if (denied.ok || denied.data?.code !== "42501" || ![401, 403].includes(denied.status)) fail();
  }
  if (contexts[2].is_platform_admin || contexts[2].can_review_applications
    || !contexts[2].memberships.some(m => m.school_id === config.schoolIds[0] && m.role === "student")
    || contexts[2].memberships.some(m => m.role !== "student" || m.school_id === config.schoolIds[1])) fail();
  const studentWorkspace = await read(2, "workspace", { p_school_id: config.schoolIds[0] });
  if (studentWorkspace.ok || studentWorkspace.data?.code !== "42501" || ![401, 403].includes(studentWorkspace.status)) fail();
  // Supplied submitted attempt MUST belong to this student: positive control
  // prevents nonexistent/not-submitted IDs from making the denial check pass.
  const review = await read(2, "review", { p_attempt_id: config.attemptId });
  if (!review.ok || review.data?.attempt_id !== config.attemptId || !Array.isArray(review.data.questions)
    || review.data.questions.length === 0) fail();
  for (const index of [0, 1]) {
    const denied = await read(index, "review", { p_attempt_id: config.attemptId });
    const ownerDenied = denied.data?.code === "P0001" && denied.data?.message === "Sesi ujian tidak ditemukan.";
    if (denied.ok || !(ownerDenied || denied.data?.code === "42501")) fail();
  }
  return { checks: "auth/context/scoped-workspace/cross-school/owner-review", readOnly: true };
}

async function main() {
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(new URL("../.local/database/addendum-02-db.json", import.meta.url), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("STAGING_SNAPSHOT_INVALID");
  }
  await verifySchoolStaging(process.env, { snapshot });
  console.log("PASS: staging read-only access invariants.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Never print backend bodies, identity values, URLs, keys or tokens.
    console.error("FAIL: staging guard atau invariant akses; periksa konfigurasi terisolasi dan kontrak staging.");
    process.exitCode = 1;
  });
}
