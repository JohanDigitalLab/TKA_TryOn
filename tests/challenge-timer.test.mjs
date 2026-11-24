import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/app/student/challenge/page.js");
const timerSection = page.slice(page.indexOf("  const isTimeExpired ="), page.indexOf("  // TANDA RAGU-RAGU"));
const assignment = page.match(/setUntimed\(data\.attempt_type[^;]+;/)[0];

function runTimer(data, remaining, overrides = {}) {
  const calls = [];
  const context = {
    data, remaining, untimed: true, loading: false, finished: false, attemptId: "server-attempt",
    finishExam: () => calls.push("submit"),
    setUntimed(value) { context.untimed = value; },
    setRemaining(update) { context.remaining = update(context.remaining); },
    useEffect(effect) { context.cleanup = effect(); },
    setTimeout(callback) { calls.push("timeout"); callback(); return 1; },
    setInterval(callback) { calls.push("interval"); context.tick = callback; return 2; },
    clearTimeout() { calls.push("clearTimeout"); },
    clearInterval() { calls.push("clearInterval"); },
    ...overrides,
  };
  vm.runInNewContext(`${assignment}\n${timerSection}`, context);
  return { context, calls };
}

for (const attempt_type of ["EXERCISE", "ASSIGNMENT", undefined, null, "", "tryout", "UNKNOWN"]) {
  test(`no interval or timeout submission for server type ${String(attempt_type)}`, () => {
    for (const seconds of [3600, 60, 0, -1]) {
      const { calls } = runTimer({ attempt_type }, seconds);
      assert.deepEqual(calls, []);
    }
  });
}

test("explicit TRYOUT counts down, cleans up and submits at expiry", () => {
  const { context, calls } = runTimer({ attempt_type: "TRYOUT" }, 2);
  assert.deepEqual(calls, ["interval"]);
  context.tick();
  assert.equal(context.remaining, 1);
  context.tick();
  assert.equal(context.remaining, 0);
  context.cleanup();
  assert.ok(calls.includes("clearInterval"));
  const expired = runTimer({ attempt_type: "TRYOUT" }, 0);
  assert.deepEqual(expired.calls, ["timeout", "submit"]);
  expired.context.cleanup();
  assert.ok(expired.calls.includes("clearTimeout"));
});

test("loading, finished and absent attempt still block TRYOUT timer", () => {
  for (const state of [{ loading: true }, { finished: true }, { attemptId: null }]) {
    assert.deepEqual(runTimer({ attempt_type: "TRYOUT" }, 0, state).calls, []);
  }
});

test("start/resume share server classification; multi-subject resets before next RPC", () => {
  assert.match(page, /\[untimed, setUntimed\] = useState\(true\)/);
  const start = page.slice(page.indexOf("  const startExam ="), page.indexOf("  // SIMPAN JAWABAN"));
  // Resume memakai RPC spesifik: tryout untuk ?attemptId, latihan untuk attempt EXERCISE.
  for (const rpc of ["start_school_assignment", "resume_tka_tryout", "resume_student_exercise", "start_student_exercise"]) assert.ok(start.includes(`"${rpc}"`));
  assert.doesNotMatch(start, /"resume_exam_attempt"/);
  assert.match(start, /Mode sesi latihan lama tidak lagi didukung/);
  assert.doesNotMatch(start, new RegExp(["start", "learning", "attempt"].join("_")));
  assert.doesNotMatch(start, new RegExp(["start", "exam", "attempt"].join("_")));
  assert.match(start, /setLoading\(true\);\s+setUntimed\(true\)/);
  assert.equal((start.match(/setUntimed\(data\.attempt_type !== "TRYOUT"\)/g) || []).length, 1);
  const next = page.slice(page.indexOf("  const nextSubject ="), page.indexOf("  // PENGAMAN NAVIGASI"));
  assert.ok(next.indexOf("setUntimed(true)") < next.indexOf("startExam(subjectList[nextIndex])"));
});

test("countdown UI and warning states require explicit timed classification", () => {
  assert.match(page, /\{!untimed && \(<div[^]*?role="timer"[^]*?Sisa waktu kurang dari 5 menit\.[^]*?<\/div>\)\}/);
  for (const name of ["isTimeExpired", "timerWarning", "timerCritical"]) assert.match(page, new RegExp(`const ${name} = !untimed &&`));
});

test("TKA start/resume loader returns persisted attempt_type; exercise helper covers practice paths", () => {
  const sql = read("docs/database/migration-start-tka-tryout.sql");
  const generic = read("docs/database/migration_generic_exam_attempt.sql");
  const loader = sql.split("CREATE OR REPLACE FUNCTION private.resume_tka_tryout")[1].split("END $$;")[0];
  assert.match(loader, /'attempt_type',a\.attempt_type/);
  assert.match(generic, /RETURN private\.resume_tka_tryout\(p_attempt_id\)/);
  assert.match(sql, /private\.resume_tka_tryout\(aid\)/);
  // Pembungkus publik resume/submit/save tryout spesifik, hanya untuk attempt TRYOUT.
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.resume_tka_tryout\(p_attempt_id uuid\)/);
  assert.match(sql, /kind IS DISTINCT FROM 'TRYOUT'/);
  assert.match(sql, /WHERE id = p_attempt_id AND user_id = u AND attempt_type = 'TRYOUT'/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.resume_tka_tryout\(uuid\) TO authenticated/);
  const exercise = read("docs/database/migration-start-student-exercise.sql");
  assert.match(exercise, /'attempt_type',a\.attempt_type/);
  assert.match(exercise, /attempt_type IN\('EXERCISE','ASSIGNMENT'\)/);
});

test("CBT dispatches type-specific RPCs for saving and submitting", () => {
  const save = page.slice(page.indexOf("  const persistAnswer ="), page.indexOf("  // UPDATE JAWABAN"));
  const finish = page.slice(page.indexOf("  const finishExam ="), page.indexOf("  // LANJUT KE MATA PELAJARAN"));
  for (const [section, names] of [[save, ["save_tka_answer", "save_exercise_answer", "save_exam_answer"]], [finish, ["submit_tka_attempt", "submit_exercise_attempt", "submit_exam_attempt"]]]) {
    for (const rpc of names) assert.ok(section.includes(`"${rpc}"`), rpc);
  }
  assert.match(save, /attemptTypeRef\.current === "TRYOUT"/);
  assert.match(finish, /attemptTypeRef\.current === "EXERCISE" \|\| attemptTypeRef\.current === "ASSIGNMENT"/);
  assert.match(page, /attemptTypeRef\.current = serverAttemptType/);
});
