import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("halaman profil siswa memakai header portal dan membatasi akses", async () => {
  const page = await read("src/app/student/profile/page.js");
  assert.match(page, /import PortalHeader from "@\/components\/portal-header"/);
  assert.match(page, /<PortalHeader/);
  assert.match(page, /=== "STUDENT" &&/);
  assert.match(page, /profile\?\.is_managed === false/);
  assert.match(page, /router\.replace\("\/home"\)/);
  assert.match(page, /supabase\.rpc\("update_student_profile"/);
  assert.match(page, /supabase\.storage\s*\n?\s*\.from\(AVATAR_BUCKET\)/);
  assert.match(page, /avatar_file/);
});

test("hanya enam field profil yang dikirim ke RPC (email login tidak dikirim)", async () => {
  const page = await read("src/app/student/profile/page.js");
  const call = page.slice(
    page.indexOf('supabase.rpc("update_student_profile"'),
    page.indexOf("if (rpcError)")
  );
  for (const field of [
    "p_full_name",
    "p_nickname",
    "p_avatar_url",
    "p_education_level",
    "p_nisn",
    "p_wa_number",
  ]) assert.ok(call.includes(field), field);
  // Email tidak lagi bagian dari profiles; tidak ada p_email dan field email read-only.
  assert.doesNotMatch(call, /p_email/);
  assert.match(page, /Email akun/);
  assert.match(page, /Email tidak dapat diubah/);
  assert.doesNotMatch(call, /p_is_subscribed|p_account_type|p_is_managed|p_profile_completed|p_has_tried/);
});

test("dashboard /student menyatukan siswa mandiri dan managed", async () => {
  const page = await read("src/app/student/page.js");
  assert.match(page, /StudentActionTables/);
  assert.match(page, /profile\?\.is_managed === true/);
  assert.doesNotMatch(page, /<StudentDashboard requireIndependentStudent \/>/);

  const mstudent = await read("src/app/mstudent/page.js");
  assert.match(mstudent, /router\.replace\("\/student"\)/);
});

test("redirect tidak menampilkan konten terproteksi terlebih dahulu", async () => {
  for (const path of ["src/app/student/page.js", "src/app/student/profile/page.js", "src/app/school/page.js"]) {
    const page = await read(path);
    assert.match(page, /const \[redirecting, setRedirecting\] = useState\(false\)/, path);
    assert.match(page, /if \(redirecting\) \{/, path);
    assert.match(page, /if \(active && !denied\) setLoading\(false\)|if \(mounted && !denied\) setLoading\(false\)/, path);

    // Render guard harus mendahului seluruh isi halaman.
    const guard = page.indexOf("if (redirecting) {");
    assert.ok(guard > -1, path);
    assert.ok(guard < page.indexOf("<PortalHeader"), path);

    // Setiap router.replace di dalam loader didahului setRedirecting(true).
    const loader = page.slice(page.indexOf("async function load"), page.indexOf("void load"));
    for (const match of loader.matchAll(/router\.replace\(/g)) {
      const before = loader.slice(Math.max(0, match.index - 120), match.index);
      assert.ok(before.includes("setRedirecting(true)"), `${path}: redirect tanpa guard render`);
    }
  }
});

test("kolom profiles.email dihapus dan email hanya dari auth.users", async () => {
  const sql = await read("docs/database/migration-drop-profiles-email.sql");
  assert.match(sql, /DROP INDEX IF EXISTS public\.profiles_email_unique/);
  assert.match(sql, /ALTER TABLE public\.profiles\s*\n?\s*DROP COLUMN IF EXISTS email/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);

  // Fungsi-fungsi yang pernah memakai profiles.email harus sudah bebas darinya.
  for (const path of [
    "docs/database/migration-school-student-management.sql",
    "docs/database/migration-school-profile-operator.sql",
    "docs/database/migration-student-profile-update.sql",
  ]) {
    const fnSql = await read(path);
    assert.doesNotMatch(fnSql, /\bp\.email\b|\bs\.email\b|\bv_profile\.email\b|\bv_student\.email\b|\bo\.email\b/, path);
  }
  // update_student_profile tidak lagi menerima p_email.
  const studentSql = await read("docs/database/migration-student-profile-update.sql");
  assert.match(studentSql, /DROP FUNCTION IF EXISTS public\.update_student_profile\(text, text, text, text, text, text, text\)/);
  assert.doesNotMatch(studentSql, /p_email/);
});

test("migrasi storage avatars berdiri sendiri dan dibungkus SET LOCAL ROLE (hindari must be owner)", async () => {
  const sql = await read("docs/database/migration-storage-avatars-bucket.sql");
  const roleAt = sql.indexOf("SET LOCAL ROLE supabase_storage_admin;");
  const bucketAt = sql.indexOf("INSERT INTO storage.buckets");
  const alterAt = sql.indexOf("ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;");
  const resetAt = sql.indexOf("RESET ROLE;");
  assert.ok(roleAt > -1, "SET LOCAL ROLE tidak ditemukan");
  assert.ok(bucketAt > -1 && roleAt < bucketAt, "peran dipasang sebelum INSERT bucket");
  assert.ok(alterAt > -1 && roleAt < alterAt, "peran dipasang sebelum DDL storage");
  assert.ok(resetAt > -1 && resetAt > alterAt, "RESET ROLE setelah DDL storage");
  // File ini tidak boleh berisi definisi fungsi RPC.
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);

  // migration-student-profile-update.sql tidak lagi menyentuh storage.
  const rpcSql = await read("docs/database/migration-student-profile-update.sql");
  assert.doesNotMatch(rpcSql, /storage\.buckets|storage\.objects|supabase_storage_admin/);
});

test("migrasi profil membuat RPC hitung kelengkapan", async () => {
  const sql = await read("docs/database/migration-student-profile-update.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.update_student_profile\(/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = pg_catalog/);
  assert.match(sql, /COALESCE\(v_profile\.is_managed, false\) IS TRUE/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /v_completed :=[\s\S]*full_name[\s\S]*email[\s\S]*wa_number[\s\S]*education_level/);
  assert.match(sql, /profile_completed = v_completed/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.update_student_profile/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.update_student_profile[\s\S]*FROM PUBLIC, anon/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
});
