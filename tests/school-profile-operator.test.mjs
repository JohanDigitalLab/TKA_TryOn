import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("halaman profil sekolah membatasi akses dan memakai RPC sekolah", async () => {
  const page = await read("src/app/school/profile/page.js");
  assert.match(page, /import PortalHeader from "@\/components\/portal-header"/);
  assert.match(page, /<PortalHeader/);
  assert.match(page, /accountType !== "SCHOOL" && accountType !== "ADMIN"/);
  assert.match(page, /router\.replace\("\/home"\)/);
  assert.match(page, /supabase\.rpc\(\s*"get_school_profile"/);
  assert.match(page, /supabase\.rpc\(\s*"update_school_profile"/);
  assert.match(page, /supabase\.rpc\(\s*"set_school_operator"/);
  assert.match(page, /p_school_id: accountType === "ADMIN" \? schoolId \|\| null : null/);
  assert.match(page, /const \[redirecting, setRedirecting\] = useState\(false\)/);
  assert.match(page, /if \(redirecting\) \{/);
  assert.match(page, /if \(active && !denied\) setLoading\(false\)/);
});

test("pesan akun sekolah belum terhubung dan tabel operator lengkap", async () => {
  const page = await read("src/app/school/profile/page.js");
  assert.match(
    page,
    /Kamu belum terdaftar untuk menjadi admin sekolah manapun\.\s*Minta\s+admin yang sekarang\s+untuk/
  );
  assert.match(page, /role === "SCHOOL" && !data\?\.school/);
  assert.match(page, /Pengelola Akun Sekolah/);
  assert.match(page, /\{operator\.full_name \|\| "-"\}/);
  assert.match(page, /\{operator\.email \|\| "-"\}/);
  assert.match(page, /\{adding \? "Tutup" : "Tambah"\}/);
  assert.match(page, />\s*Hapus\s*</);
  // Tombol hapus wajib melewati konfirmasi eksplisit.
  assert.match(page, /setPendingRemoval\(operator\.user_id\)/);
  assert.match(page, /Lepas dari sekolah ini\?/);
  assert.match(page, /toggleOperator\(operator\.user_id, false\)/);
  // Menambah operator memilih dari kandidat SCHOOL tanpa sekolah.
  assert.match(page, /Akun sekolah yang belum terhubung/);
  assert.match(page, /toggleOperator\(candidate\.user_id, true\)/);
});

test("halaman profil sekolah memfilter operator SCHOOL dan mengurutkan tipe sekolah", async () => {
  const page = await read("src/app/school/profile/page.js");
  // Filter defensif: hanya account_type SCHOOL yang boleh tampil di daftar operator.
  assert.match(
    page,
    /String\(operator\.account_type \|\| ""\)\.toUpperCase\(\) === "SCHOOL"/,
  );
  // Urutan defensif tipe sekolah berdasarkan grade, lalu nama.
  assert.match(page, /const gradeOf = \(type\) => \{/);
  assert.match(page, /Number\.MAX_SAFE_INTEGER/);
  assert.match(page, /gradeOf\(a\) - gradeOf\(b\)/);
});

test("halaman profil operator membatasi akses, email read-only, dan hanya mengirim empat field", async () => {
  const page = await read("src/app/school/operator/page.js");
  assert.match(page, /<PortalHeader/);
  assert.match(page, /type !== "SCHOOL" && type !== "ADMIN"/);
  assert.match(page, /router\.replace\("\/home"\)/);
  assert.match(page, /const \[redirecting, setRedirecting\] = useState\(false\)/);
  assert.match(page, /if \(redirecting\) \{/);
  assert.match(page, /supabase\.rpc\("update_operator_profile"/);

  const call = page.slice(
    page.indexOf('supabase.rpc("update_operator_profile"'),
    page.indexOf("if (rpcError)")
  );
  for (const field of ["p_full_name", "p_nickname", "p_avatar_url", "p_wa_number"]) {
    assert.ok(call.includes(field), field);
  }
  // Input email sudah dihapus dari halaman operator.
  assert.doesNotMatch(call, /p_email/);
  assert.doesNotMatch(page, /name="email"/);
  assert.match(page, /Email tidak dapat diubah dari halaman ini/);
  assert.doesNotMatch(call, /p_education_level|p_school_id|p_account_type|p_profile_completed/);
  assert.match(page, /supabase\.storage\s*\n?\s*\.from\(AVATAR_BUCKET\)/);
});

test("RPC operator tidak lagi menyentuh kolom email profiles", async () => {
  const sql = await read("docs/database/migration-school-profile-operator.sql");
  assert.doesNotMatch(sql, /p_email/);
  assert.doesNotMatch(sql, /email = coalesce\(v_email, email\)/);
  // Email operator dan kandidat dibaca dari auth.users.
  assert.match(sql, /'email', nullif\(btrim\(coalesce\(u\.email, ''\)\), ''\)/);
  assert.match(sql, /SELECT nullif\(btrim\(coalesce\(u\.email, ''\)\), ''\) INTO v_email\s*\n\s*FROM auth\.users u/);
});

test("migrasi sekolah/operator mendefinisikan empat RPC terotorisasi", async () => {
  const sql = await read("docs/database/migration-school-profile-operator.sql");
  for (const name of [
    "public.get_school_profile(p_school_id uuid DEFAULT NULL)",
    "public.update_school_profile(",
    "public.set_school_operator(",
    "public.update_operator_profile(",
  ]) assert.ok(sql.includes(name), name);

  assert.match(sql, /v_role IS DISTINCT FROM 'SCHOOL' AND v_role IS DISTINCT FROM 'ADMIN'/);
  assert.match(sql, /WHERE p\.school_id = v_target\s*\n\s*AND upper\(btrim\(coalesce\(p\.account_type, ''\)\)\) = 'SCHOOL'/);
  // Email operator memakai email login (auth.users.email).
  assert.match(sql, /'email', nullif\(btrim\(coalesce\(u\.email, ''\)\), ''\),/);
  assert.match(sql, /LEFT JOIN auth\.users u ON u\.id = p\.id/);
  assert.match(sql, /upper\(btrim\(coalesce\(p\.account_type, ''\)\)\) = 'SCHOOL'\s*\n\s*AND p\.school_id IS NULL/);
  assert.match(sql, /UPDATE public\.schools/);
  assert.match(sql, /SET school_id = v_target,\s*education_level = NULLIF\(v_level, ''\)/);
  assert.match(sql, /SET school_id = NULL/);
  assert.match(sql, /v_member\.school_id IS DISTINCT FROM v_target/);
  assert.match(sql, /v_completed :=[\s\S]*full_name[\s\S]*email[\s\S]*wa_number[\s\S]*education_level/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION %s TO authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
  assert.doesNotMatch(sql, /RETURN jsonb_build_object\([\s\S]*\) FROM public\.profiles/);
});
