import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  studentHistoryRequest, normalizeStudentHistory, studentResultSessions,
  studentAttemptRequest, attemptRemainingSeconds,
} from "../src/lib/student/rpc-contract.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// Snapshot is local audit evidence, never a reason to connect to a database.
test("RPC requests match active snapshot signatures and browser grants", async () => {
  const { sets } = JSON.parse(await read(".local/database/addendum-02-db.json"));
  const requests = [
    studentHistoryRequest({ dashboard: true }),
    studentHistoryRequest({ dashboard: true, limit: 0 }),
    studentHistoryRequest(),
    studentAttemptRequest({ resumeAttemptId: "attempt" }),
    studentAttemptRequest({ assignmentId: "assignment" }),
  ];
  for (const request of requests) {
    const matches = sets.functions.filter((fn) => fn.schema_name === "public" && fn.proname === request.name);
    assert.equal(matches.length, 1);
    const fn = matches[0];
    assert.equal(fn.authenticated_execute, true);
    assert.equal(fn.anon_execute, false);
    assert.equal(fn.result, "jsonb");
    assert.deepEqual(Object.keys(request.args), [...fn.arguments.matchAll(/\b(p_\w+)\s/g)].map((m) => m[1]));
  }
  assert.equal(sets.functions.some((fn) => fn.schema_name === "public" && fn.proname === "start_learning_attempt"), false);
  for (const [name, args] of [
    ["start_tka_tryout", ["p_tka_code"]],
    ["start_student_exercise", ["p_subject_code", "p_question_count", "p_theme", "p_topic"]],
  ]) {
    const fn = sets.functions.find((fn) => fn.schema_name === "public" && fn.proname === name);
    assert.equal(fn.authenticated_execute, true);
    assert.equal(fn.anon_execute, false);
    assert.deepEqual([...fn.arguments.matchAll(/\b(p_\w+)\s/g)].map((m) => m[1]), args);
  }
  const history = sets.functions.find((fn) => fn.proname === "get_student_tryout_history").definition;
  assert.doesNotMatch(history, /a\.attempt_type\s*=/); // Despite its name, includes exercises/assignments.
});

test("history requests preserve latest five, unlimited dashboard, and results cursor", () => {
  assert.deepEqual(studentHistoryRequest({ dashboard: true }), {
    name: "get_student_history", args: { p_limit: 5, p_type: null },
  });
  assert.equal(studentHistoryRequest({ dashboard: true, limit: 0 }).args.p_limit, 0);
  assert.deepEqual(studentHistoryRequest({ before: "2026-11-23T00:00:00Z" }).args,
    { p_limit: 50, p_before: "2026-11-23T00:00:00Z" });
  for (const limit of [-1, 1.5, "5", NaN]) assert.throws(() => studentHistoryRequest({ limit }));
  assert.throws(() => studentHistoryRequest({ limit: 0 }));
  assert.throws(() => studentHistoryRequest({ limit: 101 }));
});

test("dashboard summary normalization preserves type, null score, and zero score without fabricating status", () => {
  const data = Object.freeze([Object.freeze({
    attempt_id: "one", started_at: "2026-11-23", attempt_type: "EXERCISE", subject_name: "Matematika", score: null,
  }), Object.freeze({ attempt_id: "two", attempt_type: "ASSIGNMENT", score: 0 })]);
  const rows = normalizeStudentHistory(data);
  assert.equal(rows[0].subject, "Matematika");
  assert.equal(rows[0].status, null);
  assert.equal(rows[0].score, null);
  assert.equal(rows[1].score, 0);
  assert.equal(rows[1].attempt_type, "ASSIGNMENT");
  assert.equal(data[0].subject, undefined);
  assert.deepEqual(normalizeStudentHistory([]), []);
  for (const invalid of [null, {}, { data: [] }, [null], [{}], [{ attempt_id: "one", score: "bad" }]]) {
    assert.throws(() => normalizeStudentHistory(invalid));
  }
});

const result = {
  attempt_id: "one", subject: "Matematika", grade: 6, status: "SUBMITTED",
  total_questions: 3, correct_answers: 1, incorrect_or_unanswered: 2, score: "33.33",
  submitted_at: "2026-11-23T00:00:00Z", created_at: "2026-11-22T00:00:00Z",
};

test("active results response maps real score, status, dates and totals; answered is not correct", () => {
  const [session] = studentResultSessions([result]);
  assert.equal(session.score, 33.33);
  assert.equal(session.correctAnswers, 1);
  assert.equal(session.incorrectOrUnanswered, 2);
  assert.equal(session.answeredCount, null);
  assert.equal(session.completedAt, result.submitted_at);
  assert.equal(session.status, "SUBMITTED");
  assert.equal(session.mode, "legacy");
  assert.equal(session.packageId, null);
  const [inProgress] = studentResultSessions([{ ...result, status: undefined, attempt_status: "IN_PROGRESS", subject_name: "Bahasa Indonesia", subject: undefined }]);
  assert.equal(inProgress.status, "IN_PROGRESS");
  assert.equal(inProgress.subject, "Bahasa Indonesia");
});

test("review normalization preserves metadata and counts wrong-but-answered and category answers", () => {
  const review = { mode: "mission", config_snapshot: { package_id: "package" }, questions: [
    { question_type: "PG_TUNGGAL", is_correct: false, answer_payload: { option_codes: ["B"] } },
    { question_type: "PGK_KATEGORI", answer_payload: { category_answers: { 1: "Benar" } } },
    { question_type: "PGK_MA", answer_payload: { option_codes: [] } },
  ] };
  const [session] = studentResultSessions([{ ...result, review }]);
  assert.equal(session.answeredCount, 2);
  assert.equal(session.review, review);
  assert.equal(session.mode, "mission");
  assert.equal(session.packageId, "package");
  assert.equal(studentResultSessions([{ ...result, review: { questions: [] } }])[0].answeredCount, null);
});

test("legacy independent start fails closed, even with guessed codes; resume and assignment bypass config", () => {
  for (const activityType of ["latihan", "simulasi", undefined]) {
    const config = Object.freeze({ activityType, subjects: ["Matematika"], duration: 30, questionCount: 20, tka_code: "guessed", subject_code: "guessed" });
    assert.throws(() => studentAttemptRequest({ config }), (error) => {
      assert.equal(error.code, "STUDENT_START_CONFIGURATION_UNSUPPORTED");
      assert.match(error.message, /Tidak ada sesi baru yang dibuat/);
      assert.match(error.message, activityType === "latihan" ? /tanpa batas waktu/ : /kode konfigurasi TKA/);
      return true;
    });
    assert.deepEqual(studentAttemptRequest({ config, resumeAttemptId: "one" }), { name: "resume_exam_attempt", args: { p_attempt_id: "one" } });
    assert.deepEqual(studentAttemptRequest({ config, assignmentId: "two", resumeAttemptId: "one" }), { name: "start_school_assignment", args: { p_assignment_id: "two" } });
  }
});

test("NULL exercise time is untimed, while real zero/negative time expires", () => {
  assert.equal(attemptRemainingSeconds({ attempt_type: "EXERCISE", duration_minutes: null, remaining_seconds: null }, 30), null);
  assert.equal(attemptRemainingSeconds({ remaining_seconds: 0 }, 30), 0);
  assert.equal(attemptRemainingSeconds({ remaining_seconds: -20 }, 30), 0);
  assert.equal(attemptRemainingSeconds({ remaining_seconds: "120" }, 30), 120);
  assert.equal(attemptRemainingSeconds({ duration_minutes: 15 }, 30), 900);
  assert.equal(attemptRemainingSeconds({}, 30), 1800);
});

test("frontend uses adapters, preserves cache before rejection, and has no obsolete start/history calls", async () => {
  const [dashboard, results, challenge, missions, adapter] = await Promise.all([
    read("src/app/student/page.js"), read("src/app/student/results/page.js"),
    read("src/app/student/challenge/page.js"), read("src/app/student/missions/page.js"),
    read("src/lib/student/rpc-contract.mjs"),
  ]);
  assert.doesNotMatch(dashboard + results + challenge, /["'](?:get_student_dashboard_history|get_student_exam_history|start_learning_attempt|x+start_\w+)["']/);
  assert.match(dashboard, /normalizeStudentHistory\(historyData\)/);
  assert.match(results, /studentResultSessions\(history\)/);
  assert.match(challenge, /studentAttemptRequest\(\{ assignmentId, scheduledId, resumeAttemptId, config: currentConfig \}\)/);
  assert.ok(challenge.indexOf("studentAttemptRequest({") < challenge.indexOf('sessionStorage.setItem("tryon-exam-config"'));
  assert.ok(missions.indexOf("studentAttemptRequest({") < missions.indexOf("sessionStorage.setItem("));
  assert.match(challenge, /!attemptId \|\| isUntimed/);
  assert.match(challenge, /"save_exam_answer"/);
  assert.match(challenge, /"submit_exam_attempt"/);
  assert.doesNotMatch(adapter, /supabase|process\.env|fetch\(|sessionStorage|node:/);
});
