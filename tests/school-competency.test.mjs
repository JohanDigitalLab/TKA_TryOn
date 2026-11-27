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

test("recalc_student_competency generate saat kosong dan update incremental saat sudah ada", async () => {
  const sql = await read("docs/database/migration-recalc-competency.sql");
  const fn = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.recalc_student_competency"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.recalc_school_competency")
  );

  assert.match(fn, /p_user_uid uuid,\s*p_exam_attempt_uid uuid/);
  assert.match(fn, /RETURNS void/);
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path = pg_catalog/);
  // 1. kosong -> panggil fungsi generate yang tersedia
  assert.match(fn, /IF NOT v_has_rows THEN/);
  assert.match(fn, /public\.generate_student_competency\(p_user_uid, v_subject\)/);
  // 2. incremental: tambah answered & correct, hitung skor & level
  assert.match(fn, /no_of_questions = student_competency\.no_of_questions \+ EXCLUDED\.no_of_questions/);
  assert.match(fn, /correct_anwers = student_competency\.correct_anwers \+ EXCLUDED\.correct_anwers/);
  assert.match(fn, /NULLIF\(student_competency\.no_of_questions \+ EXCLUDED\.no_of_questions, 0\)/);
  assert.match(fn, /public\.get_competency_level\(/);
  assert.match(fn, /attempt_status <> 'SUBMITTED'/);
  assert.match(fn, /private\.is_super_admin\(\)/);
  assert.match(fn, /ON CONFLICT \(user_id, subject, theme, topic\) DO UPDATE/);
});

test("recalc_school_competency generate saat kosong dan rata-rata ulang skor siswa", async () => {
  const sql = await read("docs/database/migration-recalc-competency.sql");
  const fn = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.recalc_school_competency")
  );

  assert.match(fn, /p_school_uid uuid,\s*p_exam_attempt_uid uuid/);
  assert.match(fn, /RETURNS void/);
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /private\.school_require\(p_school_uid\)/);
  assert.match(fn, /IF NOT v_has_rows THEN/);
  assert.match(fn, /public\.generate_school_competency\(p_school_uid, v_subject\)/);
  // 2.1 total siswa, 2.2 siswa berskor > 0, 2.3 rata-rata, 2.4 level
  assert.match(fn, /count\(DISTINCT sc\.user_id\)::integer AS students/);
  assert.match(fn, /count\(DISTINCT sc\.user_id\) FILTER \(WHERE sc\.score > 0\)::integer AS valid_scores/);
  assert.match(fn, /avg\(sc\.score\) FILTER \(WHERE sc\.score > 0\) AS average_score/);
  assert.match(fn, /public\.get_competency_level\(COALESCE\(stats\.average_score, 0\)\)/);
  assert.match(fn, /ON CONFLICT \(school_id, subject_name, theme, topic\) DO UPDATE/);
  assert.match(fn, /FROM public\.student_competency sc\s+JOIN public\.profiles p ON p\.id = sc\.user_id AND p\.school_id = p_school_uid/);
});

test("recalc competency memakai transaksi, ACL ketat, dan reload schema", async () => {
  const sql = await read("docs/database/migration-recalc-competency.sql");
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
  for (const name of ["recalc_student_competency(uuid, uuid)", "recalc_school_competency(uuid, uuid)"]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name.replace(/[().]/g, "\\$&")} FROM PUBLIC, anon`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name.replace(/[().]/g, "\\$&")} TO authenticated`));
  }
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
});

test("setting AUTO_CALC_COMPETENCY dibaca lewat RPC get_setting", async () => {
  const sql = await read("docs/database/migration-auto-calc-competency.sql");
  assert.match(sql, /'AUTO_CALC_COMPETENCY'/);
  assert.match(sql, /'BOOL'/);
  assert.match(sql, /WHERE NOT EXISTS/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_setting\(/);
  assert.match(sql, /FROM public\.settings s/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_setting\(text, text\) FROM PUBLIC, anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_setting\(text, text\) TO authenticated/);
  assert.match(sql, /^BEGIN;[\s\S]*^COMMIT;/m);
});

test("challenge page memicu recalc kompetensi setelah submit sesuai setting", async () => {
  const page = await read("src/app/student/challenge/page.js");
  assert.match(page, /async function recalcCompetency|const recalcCompetency = useCallback\(async/);
  assert.match(page, /supabase\.rpc\("get_setting",\s*\{\s*p_name: "AUTO_CALC_COMPETENCY",?\s*\}\)/);
  assert.match(page, /\["1", "TRUE"\]\.includes/);
  assert.match(page, /supabase\.rpc\("recalc_student_competency",\s*\{\s*p_user_uid: userId,\s*p_exam_attempt_uid: id,/);
  assert.match(page, /supabase\.rpc\("recalc_school_competency",\s*\{\s*p_school_uid: profileData\.school_id,\s*p_exam_attempt_uid: id,/);
  // Recalc dipanggil setelah submit sukses dan hasil disimpan.
  assert.match(
    page,
    /saveSessionResult\(data, reviewData\);\s*\n\s*await recalcCompetency\(attemptId\);/
  );
  assert.match(page, /\[attemptId, finished, loadReview, recalcCompetency, saveSessionResult\]/);
});
