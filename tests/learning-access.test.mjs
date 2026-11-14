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
});

test("status percobaan dan aktivasi manual tersedia tanpa payment gateway", async () => {
  const [status, subscription, admin] = await Promise.all([
    read("src/components/learning-access.js"), read("src/app/subscription/page.js"), read("src/app/admin/subscriptions/page.js"),
  ]);
  assert.match(status, /learning_access_context/);
  assert.match(status, /data.trials\?\.simulation/);
  assert.match(status, /data.trials\?\.mission/);
  assert.match(subscription, /wa.me\/6282138171938/);
  assert.match(subscription, /showPlanLink=\{false\}/);
  assert.match(admin, /learning_subscription_workspace/);
  assert.match(admin, /learning_subscription_set/);
  assert.match(admin, /p_expected_revision: revision/);
  assert.match(admin, /p_reason: reason.trim\(\)/);
  assert.match(admin, /window.confirm/);
});

test("migrasi mengunci trial atomik, mapel tetap dan akses legacy privat", async () => {
  const sql = await read("docs/database/migration-stage-6-learning-access.sql");
  assert.match(sql, /PRIMARY KEY\(user_id,mode\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /Package settings are fixed/);
  assert.match(sql, /LEARNING_SUBSCRIPTION_REQUIRED/);
  assert.match(sql, /ALTER FUNCTION public.start_exam_attempt.*SET SCHEMA private/);
  assert.match(sql, /REVOKE ALL ON FUNCTION/);
  assert.match(sql, /private.is_super_admin\(\)/);
  assert.match(sql, /learning_subscription_audit/);
});
