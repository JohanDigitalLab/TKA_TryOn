import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("kegiatan mengirim paket mapel dan mode ke pemeriksaan server", async () => {
  const source = await read("src/app/student/challenge/page.js");
  assert.match(source, /"start_learning_attempt"/);
  assert.match(source, /p_package_id: simulationId/);
  assert.match(source, /p_mode: currentConfig.activityType === "latihan" \? "mission" : "simulation"/);
  assert.match(source, /p_subjects: subjectList/);
  assert.match(source, /"resume_exam_attempt"/);
  assert.match(source, /router.push\("\/subscription"\)/);
  assert.match(source, /router.push\("\/student\/results"\)/);
  assert.doesNotMatch(source, /LEARNING_SUBSCRIPTION_REQUIRED/);
});

test("akses belajar tidak lagi bergantung pada kuota trial", async () => {
  const [status, subscription, migration] = await Promise.all([
    read("src/components/learning-access.js"),
    read("src/app/subscription/page.js"),
    read("docs/database/migration-stage-9-unrestricted-learning.sql"),
  ]);
  assert.match(status, /tanpa batas percobaan/);
  assert.doesNotMatch(status, /learning_access_context|data\.trials|showPlanLink/);
  assert.match(subscription, /wa\.me\/6282138171938/);
  assert.match(migration, /'unrestricted',true/);
  assert.doesNotMatch(migration, /LEARNING_SUBSCRIPTION_REQUIRED|A02_TRIAL_EXHAUSTED/);
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
