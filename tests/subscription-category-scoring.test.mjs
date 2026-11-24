import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard /student menampilkan paket langganan tanpa redirect berputar", async () => {
  const page = await read("src/app/student/page.js");

  // Akun belum berlangganan tetap berada di /student: state unsubscribed
  // diaktifkan, profile diisi, dan fungsi kembali sebelum RPC dashboard.
  const guard = page.slice(
    page.indexOf("if (profileData?.is_subscribed !== true) {"),
    page.indexOf("get_student_active_attempts")
  );

  assert.match(guard, /setUnsubscribed\(true\)/);
  assert.match(guard, /setProfile\(/);
  assert.match(guard, /return;/);

  // Tidak boleh ada lagi redirect ke /subscription maupun prop subscriptionMode.
  assert.doesNotMatch(page, /router\.replace\("\/subscription"\)/);
  assert.doesNotMatch(page, /subscriptionMode/);

  // Paket langganan dirender di dalam dashboard siswa.
  assert.match(page, /<SubscriptionPlans \/>/);
  assert.match(page, /export function SubscriptionPlans/);
});

test("skor PGK_KATEGORI membandingkan kategori tanpa peka kapitalisasi", async () => {
  const migration = await read(
    "docs/database/migration-category-answer-case-insensitive.sql"
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.exam_answer_is_correct\(/
  );

  const kategori = migration.slice(
    migration.indexOf("WHEN 'PGK_KATEGORI' THEN")
  );

  assert.match(kategori, /upper\(btrim\(p_answer_payload->'category_answers'/);
  assert.match(kategori, /IS DISTINCT FROM upper\(btrim\(ci\.correct_category\)\)/);
  // Jawaban yang belum terisi tetap dinilai salah.
  assert.match(kategori, /IS NULL/);
  assert.match(migration, /^BEGIN;[\s\S]*^COMMIT;/m);
});
