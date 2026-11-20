import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard sekolah membaca kompetensi dari RPC school_competency", async () => {
  const page = await read("src/app/school/page.js");
  assert.match(page, /supabase\.rpc\("get_school_competency"\)/);
  assert.doesNotMatch(page, /get_school_subject_topics/);
  assert.doesNotMatch(page, /setTopics|const \[topics/);
  assert.match(page, /const \[competency, setCompetency\] = useState\(\[\]\)/);

  const sql = await read("docs/database/migration-get-school-competency.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_school_competency\(\)/);
  assert.match(sql, /FROM public\.school_competency c/);
  assert.match(sql, /WHERE c\.school_id = v_school/);
  assert.match(sql, /v_account_type IS DISTINCT FROM 'SCHOOL'/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = pg_catalog/);
  assert.match(sql, /'no_of_valid_scores', sc\.no_of_valid_scores/);
  assert.match(sql, /'average_score', sc\.average_score/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_school_competency\(\) TO authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_school_competency\(\) FROM PUBLIC, anon/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
});

test("tab mapel justified dan baris topik memakai gaya halaman hasil siswa", async () => {
  const page = await read("src/app/school/page.js");
  assert.match(page, /role="tablist"/);
  assert.match(page, /role="tab"/);
  assert.match(page, /aria-selected=\{selected\}/);
  // flex-1 + basis-auto membuat tab mengisi lebar penuh rata kiri dan kanan.
  assert.match(page, /flex w-full flex-wrap gap-2/);
  assert.match(page, /min-h-11 flex-1 basis-auto/);

  assert.match(page, /KUAT: \{ label: "Kuat"/);
  assert.match(page, /CUKUP: \{ label: "Cukup"/);
  assert.match(page, /KURANG: \{ label: "Perlu Pendalaman"/);
  assert.match(page, /Skor valid/);
  assert.match(page, /rata-rata/);
  assert.match(page, /formatScore\(row\.average_score\)/);
  assert.match(page, /row\.no_of_valid_scores/);

  const results = await read("src/app/student/results/page.js");
  assert.match(results, /KUAT: \{ label: "Kuat"/);
  assert.match(results, /KURANG: \{ label: "Perlu Pendalaman"/);
});
