import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { studentAttemptRequest, studentAttemptQuestions, attemptRemainingSeconds } from "../src/lib/student/rpc-contract.mjs";
import { localPath, authLink, joinPath } from "../src/lib/school/onboarding.mjs";
import { registrationContext, studentRegistrationPath } from "../src/lib/student/registration.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// start_learning_attempt was a historical package/mode contract. The current
// challenge delegates to the audited adapter; test exact requests + fail-closed
// behavior, not just the absence of an old function name.
test("kontrak aktif mempertahankan konfigurasi server, prioritas assignment dan resume", async () => {
  const config = { source: "server", attemptType: "TRYOUT", tka_code: "TKA-SMP" };
  assert.deepEqual(studentAttemptRequest({ config }), { name: "start_tka_tryout", args: { p_tka_code: "TKA-SMP" } });
  assert.deepEqual(studentAttemptRequest({ config: { source: "server", attemptType: "EXERCISE", subject_code: "mat-smp", question_count: 15, theme: null, topic: null } }), {
    name: "start_student_exercise", args: { p_subject_code: "mat-smp", p_question_count: 15, p_theme: null, p_topic: null },
  });
  assert.deepEqual(studentAttemptRequest({ config, resumeAttemptId: "existing" }), { name: "resume_exam_attempt", args: { p_attempt_id: "existing" } });
  assert.deepEqual(studentAttemptRequest({ config, resumeAttemptId: "existing", assignmentId: "assigned" }), { name: "start_school_assignment", args: { p_assignment_id: "assigned" } });
  let mutations = 0;
  const dispatch = options => { const request = studentAttemptRequest(options); mutations++; return request; };
  assert.throws(() => dispatch({ config: { activityType: "latihan", simulationId: "browser-id", duration: 60 } }), { code: "STUDENT_START_CONFIGURATION_UNSUPPORTED" });
  assert.equal(mutations, 0);
  for (const patch of [{ question_count: 0 }, { question_count: "15" }, { topic: "topic-without-theme" }]) {
    assert.throws(() => dispatch({ config: { source: "server", attemptType: "EXERCISE", subject_code: "mat-smp", question_count: 15, theme: null, topic: null, ...patch } }));
  }
  assert.equal(mutations, 0);
  const source = await read("src/app/student/challenge/page.js");
  assert.match(source, /studentAttemptRequest\(\{ assignmentId, scheduledId, resumeAttemptId, config: currentConfig \}\)/);
  const scheduledId = '11111111-1111-4111-8111-111111111111';
  assert.deepEqual(studentAttemptRequest({ scheduledId, config }), { name: 'start_school_schedule', args: { p_schedule_id: scheduledId } });
  assert.throws(() => studentAttemptRequest({ scheduledId, assignmentId: 'assigned' }));
  assert.throws(() => studentAttemptRequest({ scheduledId, resumeAttemptId: 'existing' }));
  assert.match(source, /supabase.rpc\(request.name, request.args\)/);
  assert.ok(source.indexOf("studentAttemptRequest({") < source.indexOf("supabase.rpc(request.name"));
  assert.doesNotMatch(source, /start_learning_attempt|LEARNING_SUBSCRIPTION_REQUIRED/);
  assert.match(source, /router.push\("\/student\/results"\)/);
});

test("soal aktif tidak membocorkan kunci dan latihan untimed tidak menjadi timer nol", () => {
  const [question] = studentAttemptQuestions({ attempt_id: "active", questions: [{ question_id: "q", question_type: "PG_TUNGGAL", question_order: 1, instruction: "Pilih", answer_payload: { option_codes: ["B"] }, correct_answer: "SECRET", explanation: "SECRET", options: [{ option_code: "A", option_text: "Satu", is_correct: true }], category_items: [] }] });
  assert.deepEqual(question.options, [{ code: "A", text: "Satu" }]);
  assert.deepEqual(question.answer_payload, { option_codes: ["B"] });
  assert.equal(question.instruction, "Pilih");
  assert.doesNotMatch(JSON.stringify(question), /SECRET|is_correct|correct_answer|explanation/);
  assert.equal(attemptRemainingSeconds({ attempt_type: "EXERCISE", remaining_seconds: null, duration_minutes: null }, 60), null);
  assert.equal(attemptRemainingSeconds({ attempt_type: "TRYOUT", remaining_seconds: 120, duration_minutes: 60 }), 120);
});

test("akses tanpa kuota trial mempertahankan harga dan tautan registrasi sesuai produk", async () => {
  const [status, subscription, landing, migration] = await Promise.all([
    read("src/components/learning-access.js"), read("src/app/subscription/page.js"),
    read("src/app/page.js"), read("docs/database/migration-stage-9-unrestricted-learning.sql"),
  ]);
  assert.match(status, /tanpa batas percobaan/);
  assert.doesNotMatch(status, /learning_access_context|data\.trials|showPlanLink/);
  // The product source uses registration, not WhatsApp checkout. Verify each
  // plan's distinct destination AND actual helper semantics, without changing prices.
  for (const source of [subscription, landing]) {
    assert.match(source, /name: "Siswa Mandiri",\s+href: "\/register\?method=independent"/);
    assert.match(source, /name: "Sekolah",\s+href: "\/school\/register"/);
    assert.match(source, /href=\{plan.href\}/);
    assert.match(source, /price: "Rp49\.000"/);
    assert.match(source, /price: "Rp25\.000"/);
  }
  assert.match(subscription, /href="\/register\?method=school"/);
  for (const method of ["independent", "school"]) {
    const path = studentRegistrationPath({ method });
    assert.equal(registrationContext(new URL(path, "https://local.invalid").searchParams).method, method);
  }
  assert.match(migration, /'unrestricted',true/);
  assert.doesNotMatch(migration, /LEARNING_SUBSCRIPTION_REQUIRED|A02_TRIAL_EXHAUSTED/);
});

test("login memelihara undangan, menolak external next, dan menyerahkan default role ke home", async () => {
  const source = await read("src/app/login/page.js");
  assert.match(source, /supabase.auth.getUser\(\)/);
  assert.match(source, /active && !error && data\?\.user/);
  assert.match(source, /localPath\(params.get\("next"\), "\/home"\)/);
  assert.match(source, /<Suspense/);
  assert.doesNotMatch(source, /education_level|educationLevels|\.from\("profiles"\)/);
  const invite = joinPath("a".repeat(64));
  const loginUrl = new URL(authLink("login", invite), "https://local.invalid");
  assert.equal(localPath(loginUrl.searchParams.get("next"), "/home"), invite);
  assert.equal(localPath("https://evil.example", "/home"), "/home");
  assert.equal(localPath(null, "/home"), "/home");
  assert.equal(registrationContext(new URL(authLink("register", invite), "https://local.invalid").searchParams).method, "school");
  // Execute the real submit handler with isolated dependencies (no React/browser
  // test dependency available). Assert success, failure and double-submit behavior.
  const handlerSource = source.slice(source.indexOf("  async function login(event) {"), source.indexOf("\n  return ("));
  const createHandler = new Function("supabase", "router", "next", "lock", "setBusy", "setError", "FormData", `${handlerSource}; return login;`);
  for (const scenario of ["success", "error", "no-session", "locked"]) {
    const calls = []; const redirects = []; const errors = [];
    const lock = { current: scenario === "locked" };
    const handler = createHandler({ auth: { signInWithPassword: async args => {
      calls.push(args);
      return { data: scenario === "no-session" ? {} : { session: {}, user: {} }, error: scenario === "error" ? new Error("SECRET") : null };
    } } }, { replace: target => redirects.push(target) }, invite, lock, () => {}, message => errors.push(message), class { get(key) { return key === "email" ? " student@example.invalid " : "password"; } });
    await handler({ preventDefault() {}, currentTarget: {} });
    if (scenario === "locked") { assert.equal(calls.length, 0); continue; }
    assert.deepEqual(calls, [{ email: "student@example.invalid", password: "password" }]);
    assert.deepEqual(redirects, scenario === "success" ? [invite] : []);
    if (scenario !== "success") { assert.match(errors.at(-1), /Login belum berhasil/); assert.doesNotMatch(errors.at(-1), /SECRET/); }
    assert.equal(lock.current, false);
  }
});

test("migrasi akses tetap mempertahankan keamanan fungsi dan aturan paket", async () => {
  const sql = await read("docs/database/migration-stage-9-unrestricted-learning.sql");
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /Package settings are fixed/);
  assert.match(sql, /REVOKE ALL ON FUNCTION/);
  assert.match(sql, /GRANT EXECUTE/);
  assert.match(sql, /private\.learning_legacy_start/);
  assert.match(sql, /private\.learning_legacy_assignment/);
});
