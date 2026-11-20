import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const legacyStart = new RegExp(["start", "learning", "attempt"].join("_"));
const legacyExamStart = new RegExp(["start", "exam", "attempt"].join("_"));

test("sesi latihan memakai jalur adaptif, resume, dan tugas sekolah", async () => {
  const source = await read("src/app/student/challenge/page.js");
  assert.match(source, /"start_student_exercise"/);
  assert.match(source, /p_subject_code: currentConfig\.subject_codes/);
  assert.match(source, /"resume_exam_attempt"/);
  assert.match(source, /"start_school_assignment"/);
  assert.match(source, /Mode sesi latihan lama tidak lagi didukung/);
  assert.doesNotMatch(source, legacyStart);
  assert.doesNotMatch(source, legacyExamStart);
  assert.match(source, /router\.push\("\/subscription"\)/);
  assert.match(source, /router\.push\("\/student\/results"\)/);
  assert.doesNotMatch(source, /LEARNING_SUBSCRIPTION_REQUIRED/);
});

test("akses belajar tidak lagi bergantung pada kuota trial", async () => {
  const [subscription, migration] = await Promise.all([
    read("src/app/subscription/page.js"),
    read("docs/database/migration-stage-9-unrestricted-learning.sql"),
  ]);
  assert.match(subscription, /export function SubscriptionPlans/);
  assert.match(subscription, /href: "\/register"/);
  assert.match(migration, /'unrestricted',true/);
  assert.doesNotMatch(migration, /LEARNING_SUBSCRIPTION_REQUIRED|A02_TRIAL_EXHAUSTED/);
});

test("migrasi akses tetap mempertahankan keamanan fungsi dan engine assignment privat", async () => {
  const sql = await read("docs/database/migration-stage-9-unrestricted-learning.sql");
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /REVOKE ALL ON FUNCTION/);
  assert.match(sql, /GRANT EXECUTE/);
  assert.match(sql, /private\.learning_legacy_assignment/);
  assert.doesNotMatch(sql, legacyStart);
  assert.doesNotMatch(sql, legacyExamStart);
  assert.doesNotMatch(sql, /Package settings are fixed/);
});
