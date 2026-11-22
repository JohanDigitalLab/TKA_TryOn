import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("halaman /subscription tidak mengalihkan dirinya sendiri saat user belum berlangganan", async () => {
  const page = await read("src/app/student/page.js");

  // Blok pemeriksaan langganan harus memberi jalan keluar untuk subscriptionMode
  // agar user is_subscribed=false tidak terjebak di layar "Mengalihkan…".
  const guard = page.slice(
    page.indexOf("if (profileData?.is_subscribed !== true) {"),
    page.indexOf("router.replace(\"/subscription\")")
  );

  assert.match(guard, /if \(subscriptionMode\) \{/);
  assert.match(guard, /setProfile\(/);
  assert.match(guard, /return;/);

  // Setelah subscriptionMode ditangani, jangan memanggil RPC dashboard
  // yang menuntut langganan aktif.
  const subscriptionPage = await read("src/app/subscription/page.js");
  assert.match(
    subscriptionPage,
    /<StudentDashboard subscriptionMode actionContent=\{<SubscriptionPlans \/>\} \/>/
  );
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
