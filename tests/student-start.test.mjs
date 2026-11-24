import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  studentSubjectsRequest, studentTopicsRequest, normalizeStudentSubjects, normalizeStudentTopics,
  studentStartConfig, studentAttemptRequest, studentAttemptQuestions, attemptRemainingSeconds,
} from "../src/lib/student/rpc-contract.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const subjects = [{ name: "Matematika", subject_code: "mat-smp", configuration: {
  tka_code: "TKA-SERVER", total_questions: 23, duration_minutes: 47, type: "SET",
} }, { name: "Bahasa", subject_code: "bi-smp", configuration: null }];
const topics = [{ subject_code: "mat-smp", theme: "Bilangan", topic: "Pecahan" }];
const selection = { subjects, subjectCode: "mat-smp", topics };

test("new requests match active local snapshot signatures, grants and actual response fields", async () => {
  const { sets } = JSON.parse(await read(".local/database/addendum-02-db.json"));
  for (const request of [studentSubjectsRequest(), studentTopicsRequest(),
    studentAttemptRequest({ config: studentStartConfig({ ...selection, attemptType: "TRYOUT" }) }),
    studentAttemptRequest({ config: studentStartConfig({ ...selection, attemptType: "EXERCISE", questionCount: 7 }) })]) {
    const fn = sets.functions.find((fn) => fn.schema_name === "public" && fn.proname === request.name);
    assert.ok(fn);
    assert.equal(fn.authenticated_execute, true);
    assert.equal(fn.anon_execute, false);
    assert.deepEqual(Object.keys(request.args), [...fn.arguments.matchAll(/\b(p_\w+)\s/g)].map((m) => m[1]));
  }
  const subjectFn = sets.functions.find((fn) => fn.proname === "get_student_subjects").definition;
  for (const field of ["name", "subject_code", "configuration", "tka_code", "total_questions", "duration_minutes", "type"]) {
    assert.ok(subjectFn.includes(`'${field}'`));
  }
  const topicFn = sets.functions.find((fn) => fn.proname === "get_school_subject_topics").definition;
  assert.match(topicFn, /auth.uid\(\)/);
  assert.match(topicFn, /st.subject_code ILIKE/);
  for (const name of ["load_student_exercise", "resume_tka_tryout"]) {
    const fn = sets.functions.find((fn) => fn.schema_name === "private" && fn.proname === name).definition;
    assert.doesNotMatch(fn, /'(?:is_correct|correct_category|explanation)'/);
    assert.match(fn, /user_id=u/);
  }
});

test("normalizers preserve real configuration, nullable availability, and project only known fields", () => {
  assert.deepEqual(normalizeStudentSubjects(subjects), subjects);
  assert.deepEqual(normalizeStudentTopics(topics), topics);
  assert.deepEqual(normalizeStudentSubjects([]), []);
  assert.deepEqual(normalizeStudentTopics([]), []);
  for (const data of [null, {}, [null], [{}], [{ ...subjects[0], configuration: {} }]]) assert.throws(() => normalizeStudentSubjects(data));
  for (const data of [null, {}, [{}]]) assert.throws(() => normalizeStudentTopics(data));
  assert.equal(normalizeStudentSubjects([{ ...subjects[0], secret: "hidden" }])[0].secret, undefined);
});

test("TRYOUT maps selected server tka_code, never browser simulation id or subject name", () => {
  const config = studentStartConfig({ ...selection, attemptType: "TRYOUT" });
  assert.equal(config.source, "server");
  assert.deepEqual(config.subjects, ["Matematika"]);
  assert.deepEqual(studentAttemptRequest({ config: { ...config, simulationId: "browser-uuid" } }), {
    name: "start_tka_tryout", args: { p_tka_code: "TKA-SERVER" },
  });
  assert.throws(() => studentStartConfig({ ...selection, subjectCode: "bi-smp", attemptType: "TRYOUT" }));
  assert.throws(() => studentStartConfig({ ...selection, subjectCode: "unknown", attemptType: "TRYOUT" }));
});

test("EXERCISE maps explicit adaptive, theme-only and topic choices without any timer", () => {
  for (const [theme, topic] of [[null, null], ["Bilangan", null], ["Bilangan", "Pecahan"]]) {
    const config = studentStartConfig({ ...selection, attemptType: "EXERCISE", questionCount: 7, theme, topic });
    assert.deepEqual(studentAttemptRequest({ config }), { name: "start_student_exercise", args: {
      p_subject_code: "mat-smp", p_question_count: 7, p_theme: theme, p_topic: topic,
    } });
    assert.equal(Object.hasOwn(config, "duration"), false);
    assert.equal(attemptRemainingSeconds({ attempt_type: "EXERCISE", duration_minutes: null, remaining_seconds: null }, 60), null);
  }
  for (const patch of [{ theme: "fake" }, { theme: "Bilangan", topic: "fake" }, { topic: "Pecahan" }, { questionCount: null }, { questionCount: 101 }]) {
    assert.throws(() => studentStartConfig({ ...selection, attemptType: "EXERCISE", questionCount: 7, ...patch }));
  }
});

test("adapter validates new args and keeps legacy rejection and resume/assignment precedence", () => {
  for (const tka_code of [null, "", " ", 1, {}, " trailing "]) assert.throws(() => studentAttemptRequest({ config: { source: "server", attemptType: "TRYOUT", tka_code } }));
  const config = { source: "server", attemptType: "EXERCISE", subject_code: "mat-smp", question_count: 1, theme: null, topic: null };
  for (const patch of [{ subject_code: "" }, { question_count: "7" }, { question_count: 0 }, { question_count: 1.5 }, { theme: undefined }, { topic: undefined }, { topic: "Pecahan" }]) {
    assert.throws(() => studentAttemptRequest({ config: { ...config, ...patch } }));
  }
  assert.throws(() => studentAttemptRequest({ config: { ...config, source: "legacy" } }), { code: "STUDENT_START_CONFIGURATION_UNSUPPORTED" });
  assert.deepEqual(studentAttemptRequest({ config: {}, resumeAttemptId: "existing" }), { name: "resume_exam_attempt", args: { p_attempt_id: "existing" } });
  assert.equal(studentAttemptRequest({ assignmentId: "task", resumeAttemptId: "existing" }).name, "start_school_assignment");
});

test("active-question mapping strips keys and explanations, retaining instruction and saved answers", () => {
  const payload = { option_codes: ["B"], category_answers: {} };
  const data = { attempt_id: "active", subject_name: "Matematika", questions: [{
    question_id: "q", question_order: 2, question_type: "PG_TUNGGAL", question_text: "Question", instruction: "Choose",
    is_correct: true, explanation: "SECRET", correct_answer: "A", answer_payload: payload,
    options: [{ option_code: "A", option_text: "One", is_correct: true, explanation: "SECRET" }],
    category_items: [{ item_number: 1, item_text: "Statement", category_label: "BENAR", correct_category: "SECRET", explanation: "SECRET" }],
  }] };
  const [question] = studentAttemptQuestions(data);
  assert.equal(question.instruction, "Choose");
  assert.equal(question.answer_payload, payload);
  assert.equal(question.number, 2);
  assert.deepEqual(question.options, [{ code: "A", text: "One" }]);
  assert.doesNotMatch(JSON.stringify(question), /SECRET|is_correct|correct_category|correct_answer|explanation/);
  assert.equal(data.questions[0].is_correct, true);
});

test("real route UI reads RPC selections, writes explicit config and reuses challenge without legacy UUID generation", async () => {
  const [ui, tryout, exercise, challenge] = await Promise.all([
    read("src/components/student/start-session.js"), read("src/app/student/tryout/page.js"),
    read("src/app/student/exercise/page.js"), read("src/app/student/challenge/page.js"),
  ]);
  assert.match(tryout, /<StartSession attemptType="TRYOUT"/);
  assert.match(exercise, /<StartSession attemptType="EXERCISE"/);
  assert.match(ui, /supabase.rpc\(request.name, request.args\)/);
  assert.match(ui, /subjects.map/);
  assert.match(ui, /studentStartConfig\(/);
  assert.match(ui, /sessionStorage.setItem\("tryon-exam-config", JSON.stringify\(config\)\)/);
  assert.match(ui, /router.push\("\/student\/challenge"\)/);
  assert.match(challenge, /studentAttemptQuestions\(data\)/);
  assert.doesNotMatch(ui + challenge, /crypto.randomUUID/);
  assert.match(challenge, /"save_exam_answer"/);
  assert.match(challenge, /"submit_exam_attempt"/);
});
