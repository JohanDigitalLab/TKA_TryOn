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
  for (const rpc of ["start_school_assignment", "resume_exam_attempt", "start_student_exercise"]) assert.ok(start.includes(`"${rpc}"`));
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

test("TKA start/resume loader returns persisted attempt_type; exercise remains explicit", () => {
  const sql = read("docs/database/migration-start-tka-tryout.sql");
  const generic = read("docs/database/migration_generic_exam_attempt.sql");
  const loader = sql.split("CREATE OR REPLACE FUNCTION private.resume_tka_tryout")[1].split("END $$;")[0];
  assert.match(loader, /'attempt_type',a\.attempt_type/);
  assert.match(generic, /RETURN private\.resume_tka_tryout\(p_attempt_id\)/);
  assert.match(sql, /private\.resume_tka_tryout\(aid\)/);
  assert.match(read("docs/database/migration-start-student-exercise.sql"), /'attempt_type','EXERCISE'/);
});
