// Pure, offline and fail-closed. No env files, SDK clients or network here.
const refPattern = /^[a-z]{20}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = () => { throw new Error("STAGING_GUARD_REJECTED: konfigurasi isolasi staging tidak valid."); };

export function snapshotProductionRefs(snapshot) {
  const refs = new Set();
  // Only session metadata, never profile rows or arbitrary snapshot content.
  function visit(value, key = "") {
    if (typeof value === "string") {
      if (/^(project_ref|projectRef|production_project_ref)$/.test(key) && refPattern.test(value)) refs.add(value);
      for (const match of value.matchAll(/(?:^|[./@])([a-z]{20})\.supabase\.co(?=[:/\s]|$)/g)) refs.add(match[1]);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) visit(v, k);
    }
  }
  visit(snapshot?.sets?.session);
  return [...refs];
}

export function stagingConfig(env, snapshot) {
  if (env.STAGING_TESTS_CONFIRM !== "READ_ONLY_STAGING") fail();
  const ref = env.STAGING_PROJECT_REF;
  if (!refPattern.test(ref || "")) fail();
  const denied = snapshotProductionRefs(snapshot);
  const production = env.PRODUCTION_PROJECT_REF;
  if (production !== undefined && !refPattern.test(production)) fail();
  if (production) denied.push(production);
  if (!denied.length || denied.includes(ref)) fail();
  let url;
  try { url = new URL(env.STAGING_SUPABASE_URL); } catch { fail(); }
  if (url.href !== `https://${ref}.supabase.co/`) fail();
  const key = env.STAGING_SUPABASE_PUBLISHABLE_KEY;
  // Restrict to publishable keys or anon JWT; never accept service-role keys.
  if (typeof key !== "string" || !key) fail();
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    if (jwtPayload(key).role !== "anon") fail();
  }
  const tokens = [env.STAGING_SCHOOL_A_TOKEN, env.STAGING_SCHOOL_B_TOKEN, env.STAGING_STUDENT_TOKEN];
  const claims = tokens.map(token => {
    const claim = jwtPayload(token);
    if (claim.role !== "authenticated" || !uuidPattern.test(claim.sub || "")
      || claim.iss !== `${url.origin}/auth/v1` || !Number.isFinite(claim.exp)
      || claim.exp * 1000 <= Date.now()) fail();
    return claim;
  });
  if (new Set(tokens).size !== 3 || new Set(claims.map(c => c.sub)).size !== 3) fail();
  const schoolIds = [env.STAGING_SCHOOL_A_ID, env.STAGING_SCHOOL_B_ID];
  if (!schoolIds.every(id => uuidPattern.test(id || "")) || schoolIds[0] === schoolIds[1]) fail();
  if (!uuidPattern.test(env.STAGING_STUDENT_ATTEMPT_ID || "")) fail();
  return Object.freeze({ url: url.origin, key, tokens, schoolIds, uids: claims.map(c => c.sub), attemptId: env.STAGING_STUDENT_ATTEMPT_ID });
}

function jwtPayload(token) {
  try {
    if (typeof token !== "string" || token.split(".").length !== 3) fail();
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch { fail(); }
}

// Enforce an audited read-only allowlist at the transport boundary as well.
export function stagingReadPath(operation, args = {}) {
  const contracts = {
    user: ["/auth/v1/user", []],
    context: ["/rest/v1/rpc/xschool_portal_context", []],
    workspace: ["/rest/v1/rpc/xschool_admin_workspace", ["p_school_id"]],
    review: ["/rest/v1/rpc/get_exam_attempt_review", ["p_attempt_id"]],
  };
  const contract = Object.hasOwn(contracts, operation) && contracts[operation];
  if (!contract || Object.keys(args).length !== contract[1].length
    || contract[1].some(key => !uuidPattern.test(args[key] || ""))) fail();
  const query = new URLSearchParams(args);
  return contract[0] + (query.size ? `?${query}` : "");
}
