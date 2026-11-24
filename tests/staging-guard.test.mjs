import test from "node:test";
import assert from "node:assert/strict";
import { stagingConfig, snapshotProductionRefs, stagingReadPath } from "../src/lib/server/staging-guard.mjs";
import { verifySchoolStaging } from "../scripts/verify-school-staging.mjs";

const ref = "a".repeat(20);
const production = "b".repeat(20);
const ids = [1, 2, 3, 4, 5, 6].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const token = (sub, patch = {}) => `e30.${Buffer.from(JSON.stringify({ sub, role: "authenticated", iss: `https://${ref}.supabase.co/auth/v1`, exp: 4102444800, ...patch })).toString("base64url")}.fake`;
const fixture = () => ({
  STAGING_TESTS_CONFIRM: "READ_ONLY_STAGING", STAGING_PROJECT_REF: ref,
  PRODUCTION_PROJECT_REF: production, STAGING_SUPABASE_URL: `https://${ref}.supabase.co`,
  STAGING_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_offline",
  STAGING_SCHOOL_A_TOKEN: token(ids[0]), STAGING_SCHOOL_B_TOKEN: token(ids[1]), STAGING_STUDENT_TOKEN: token(ids[2]),
  STAGING_SCHOOL_A_ID: ids[3], STAGING_SCHOOL_B_ID: ids[4], STAGING_STUDENT_ATTEMPT_ID: ids[5],
});

test("guard requires every explicit input before any network", async () => {
  for (const key of Object.keys(fixture())) {
    const env = fixture(); delete env[key];
    let calls = 0;
    await assert.rejects(verifySchoolStaging(env, { fetchImpl: async () => { calls++; } }), /STAGING_GUARD/);
    assert.equal(calls, 0, key);
  }
  assert.equal(stagingConfig(fixture()).url, `https://${ref}.supabase.co`);
});

test("production denylist includes snapshot session and supplied known ref; cannot be overridden", () => {
  const snapshot = { sets: { session: [{ project_ref: production }] } };
  const env = fixture(); delete env.PRODUCTION_PROJECT_REF;
  assert.equal(stagingConfig(env, snapshot).url, `https://${ref}.supabase.co`);
  assert.throws(() => stagingConfig({ ...fixture(), PRODUCTION_PROJECT_REF: ref }));
  assert.throws(() => stagingConfig(fixture(), { sets: { session: [{ project_ref: ref }] } }));
  assert.throws(() => stagingConfig(env, { sets: { session: [{ read_only: "on" }] } }));
  assert.deepEqual(snapshotProductionRefs({ sets: { session: [{ host: `db.${production}.supabase.co` }] } }), [production]);
  assert.deepEqual(snapshotProductionRefs({ sets: { profiles: [{ project_ref: production }] } }), []);
});

test("guard rejects wrong origin, credentials, privileged keys and overlapping identities", () => {
  const patches = [
    { STAGING_TESTS_CONFIRM: "true" }, { PRODUCTION_PROJECT_REF: "unknown" },
    { STAGING_SUPABASE_URL: `http://${ref}.supabase.co` },
    { STAGING_SUPABASE_URL: `https://${ref}.supabase.co.evil.example` },
    { STAGING_SUPABASE_URL: `https://user:password@${ref}.supabase.co` },
    { STAGING_SUPABASE_URL: `https://${ref}.supabase.co/?x=1` },
    { STAGING_SUPABASE_PUBLISHABLE_KEY: token(ids[0], { role: "service_role" }) },
    { STAGING_SCHOOL_B_TOKEN: token(ids[0]) },
    { STAGING_STUDENT_TOKEN: token(ids[0], { aud: "different" }) },
    { STAGING_STUDENT_TOKEN: token(ids[2], { iss: `https://${production}.supabase.co/auth/v1` }) },
    { STAGING_STUDENT_TOKEN: token(ids[2], { exp: 1 }) },
    { STAGING_SCHOOL_B_ID: ids[3] }, { STAGING_STUDENT_ATTEMPT_ID: "invalid" },
  ];
  for (const patch of patches) assert.throws(() => stagingConfig({ ...fixture(), ...patch }), /STAGING_GUARD/);
});

test("transport allowlist excludes mutation/start/resume and wrong RPC arguments", () => {
  assert.equal(stagingReadPath("workspace", { p_school_id: ids[3] }), `/rest/v1/rpc/xschool_admin_workspace?p_school_id=${ids[3]}`);
  for (const operation of ["start_school_assignment", "resume_exam_attempt", "school_admin_mutate", "__proto__"]) {
    assert.throws(() => stagingReadPath(operation));
  }
  assert.throws(() => stagingReadPath("workspace", {}));
  assert.throws(() => stagingReadPath("review", { p_attempt_id: ids[5], p_action: "delete" }));
});

function fakeBackend({ crossAllowed = false, reviewAllowed = false, missingReview = false, sameUser = false, missingWorkspace = false, studentWorkspaceAllowed = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.method, "GET"); assert.equal(options.redirect, "error");
    const index = [0, 1, 2].find(i => options.headers.Authorization === `Bearer ${fixture()[["STAGING_SCHOOL_A_TOKEN", "STAGING_SCHOOL_B_TOKEN", "STAGING_STUDENT_TOKEN"][i]]}`);
    const path = new URL(url);
    const result = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
    if (path.pathname === "/auth/v1/user") return result({ id: sameUser ? ids[0] : ids[index], email_confirmed_at: "2026-01-01" });
    if (path.pathname.endsWith("xschool_portal_context")) return result({ memberships: [{ school_id: ids[index === 1 ? 4 : 3], school_name: "Offline", role: index === 2 ? "student" : "school_admin", is_primary: true }], school_types: [], applications: [], transfers: [], is_platform_admin: false, can_review_applications: false });
    if (path.pathname.endsWith("xschool_admin_workspace")) {
      const school = path.searchParams.get("p_school_id");
      if (missingWorkspace) return result({ code: "PGRST202" }, 404);
      if ((index === 2 && !studentWorkspaceAllowed) || (index !== 2 && !crossAllowed && school !== ids[index === 0 ? 3 : 4])) return result({ code: "42501" }, 403);
      return result({ school: { id: school }, classes: [], members: [], requests: [], invites: [], transfers: [] });
    }
    if (path.pathname.endsWith("get_exam_attempt_review")) {
      if (missingReview || (index !== 2 && !reviewAllowed)) return result({ code: "P0001", message: "Sesi ujian tidak ditemukan." }, 400);
      return result({ attempt_id: ids[5], questions: [{}] });
    }
    throw new Error("Unexpected offline request");
  };
  return { fetchImpl, calls };
}

test("offline smoke verifies positive controls, both cross-school denials and owner-only review", async () => {
  const backend = fakeBackend();
  assert.equal((await verifySchoolStaging(fixture(), backend)).readOnly, true);
  assert.equal(backend.calls.length, 14);
  for (const patch of [{ crossAllowed: true }, { reviewAllowed: true }, { missingReview: true }, { sameUser: true }, { missingWorkspace: true }, { studentWorkspaceAllowed: true }]) {
    await assert.rejects(verifySchoolStaging(fixture(), fakeBackend(patch)), /STAGING_SMOKE/);
  }
});
