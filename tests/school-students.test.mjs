import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("daftar siswa memakai pencarian, paging lima baris, dan modal tambah/edit", async () => {
  const page = await read("src/app/school/page.js");
  assert.match(page, /const pageSize = 5;/);
  assert.match(page, /htmlFor="student-search"/);
  assert.match(page, /Cari nama, NISN, atau email…/);
  assert.match(page, /setStudentSearch\(event\.target\.value\)/);
  assert.match(page, /filteredStudents\.slice\(/);
  assert.match(page, /openAddStudent/);
  assert.match(page, /openEditStudent\(student\)/);
  assert.match(page, /<StudentFormModal/);
  assert.match(page, /supabase\.rpc\("create_school_student"/);
  assert.match(page, /supabase\.rpc\("update_school_student"/);
  assert.match(page, /supabase\.rpc\(\s*"get_school_students_detail"/);
});

test("modal siswa memvalidasi field wajib, NISN, dan konfirmasi password", async () => {
  const page = await read("src/app/school/page.js");
  const modal = page.slice(page.indexOf("function StudentFormModal"), page.indexOf("export default function SchoolPage"));
  assert.ok(modal.length > 200);
  assert.match(modal, /NISN wajib diisi\./);
  assert.match(modal, /NISN harus tepat 10 digit angka\./);
  assert.match(modal, /Email wajib diisi\./);
  assert.match(modal, /Nama lengkap wajib diisi\./);
  assert.match(modal, /Password minimal 8 karakter\./);
  assert.match(modal, /Konfirmasi password tidak sama dengan password\./);
  assert.match(modal, /name="confirm_password"/);
  // Mode edit: NISN dan email baca-saja, tanpa field password.
  assert.match(modal, /readOnly=\{isEdit\}/);
  assert.match(modal, /\{!isEdit \? \(/);
  assert.match(modal, /NISN dan email login tidak dapat diubah\./);
  assert.match(modal, /School ID dan jenjang pendidikan terisi otomatis dari data sekolah\./);
  // Email form memakai email login, bukan email profil.
  assert.match(modal, /Email login<span/);
  assert.match(modal, /Email ini dipakai siswa untuk masuk\./);
  assert.match(modal, /readOnly=\{isEdit\}/);
});

test("tombol Review membuka results dengan user_id dan Reset Password memakai modal", async () => {
  const page = await read("src/app/school/page.js");
  assert.match(page, /function openReviewStudent\(student\)/);
  assert.match(page, /`\/student\/results\?userId=\$\{encodeURIComponent\(student\.id\)\}`/);
  assert.match(page, /onClick=\{\(\) => openReviewStudent\(student\)\}/);
  assert.match(page, /onClick=\{\(\) => openResetPassword\(student\)\}/);
  assert.match(page, /function ResetPasswordModal/);
  assert.match(page, /aria-labelledby="reset-password-title"/);
  assert.match(page, /supabase\.rpc\("reset_school_student_password"/);
  assert.match(page, /Konfirmasi password tidak sama dengan password\./);
  assert.match(page, /Password minimal 8 karakter\./);
  assert.match(page, /name="confirm_password"/);
  // Tombol tidak lagi hanya menyetel state tanpa efek.
  assert.doesNotMatch(page, /setSelected\(\{ student, action \}\)/);

  const sql = await read("docs/database/migration-school-student-management.sql");
  assert.match(sql, /public\.reset_school_student_password\(/);
  assert.match(sql, /encrypted_password = crypt\(p_password, gen_salt\('bf'\)\)/);
  assert.match(sql, /'email', nullif\(btrim\(coalesce\(u\.email, ''\)\), ''\),/);
  // profiles.email sudah dihapus; fungsi tidak boleh merujuk kolom itu lagi.
  assert.doesNotMatch(sql, /\bs\.email\b|\bp\.email\b/);
  assert.doesNotMatch(sql, /email = EXCLUDED\.email/);
  assert.match(sql, /LEFT JOIN auth\.users u ON u\.id = s\.id/);
  assert.match(sql, /AND p\.is_managed IS TRUE/);
  assert.match(sql, /char_length\(p_password\) < 8/);
  assert.match(sql, /'reset_school_student_password'/);
});

test("migrasi siswa membatasi operator, mengurutkan tipe sekolah, dan mengunci kolom", async () => {
  const profileSql = await read("docs/database/migration-school-profile-operator.sql");
  assert.match(
    profileSql,
    /LEFT JOIN public\.education_levels el\s*\n\s*ON lower\(btrim\(el\.id\)\) = lower\(btrim\(coalesce\(st\.education_level_id, ''\)\)\)/,
  );
  assert.match(profileSql, /ORDER BY t\.grade NULLS LAST, t\.name/);
  assert.match(profileSql, /WHERE p\.school_id = v_target\s*\n\s*AND upper\(btrim\(coalesce\(p\.account_type, ''\)\)\) = 'SCHOOL'/);

  const sql = await read("docs/database/migration-school-student-management.sql");
  for (const name of [
    "public.get_school_students_detail(p_school_id uuid DEFAULT NULL)",
    "public.create_school_student(",
    "public.update_school_student(",
  ]) assert.ok(sql.includes(name), name);

  assert.match(sql, /AND s\.is_managed IS TRUE/);
  assert.match(sql, /INSERT INTO auth\.users/);
  assert.match(sql, /crypt\(p_password, gen_salt\('bf'\)\)/);
  assert.match(sql, /'STUDENT', true,\s*\n?\s*v_target/);
  assert.match(sql, /v_email = '' OR char_length\(v_email\) > 50/);
  assert.match(sql, /v_nisn = '' OR v_nisn !~ '\^\[0-9\]\{10\}\$'/);
  assert.match(sql, /char_length\(v_name\) NOT BETWEEN 2 AND 160/);
  assert.match(sql, /char_length\(p_password\) < 8/);
  // Pembaruan siswa tidak menyentuh nisn/email.
  const updateBody = sql.slice(sql.indexOf("public.update_school_student("), sql.indexOf("COMMENT ON FUNCTION public.get_school_students_detail"));
  assert.doesNotMatch(updateBody, /SET[\s\S]*nisn =/);
  assert.match(updateBody, /SET full_name = v_name,\s*\n\s*wa_number = v_wa/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION %s TO authenticated/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
});

test("daftar provinsi tersedia dari API dengan fallback statis", async () => {
  const helper = await read("src/lib/indonesia/provinces.mjs");
  assert.match(helper, /https:\/\/www\.emsifa\.com\/api-wilayah-indonesia\/api\/provinces\.json/);
  assert.match(helper, /export async function fetchProvinces/);
  assert.match(helper, /fetchImpl\("\/api\/provinces"/);
  assert.match(helper, /FALLBACK_PROVINCES/);
  assert.match(helper, /Papua Barat Daya/);

  const route = await read("src/app/api/provinces/route.js");
  assert.match(route, /export async function GET/);
  assert.match(route, /loadProvinces/);

  const page = await read("src/app/school/profile/page.js");
  assert.match(page, /fetchProvinces/);
  // Provinsi menjadi dropdown, bukan input bebas.
  const provinceBlock = page.slice(page.indexOf('label="Provinsi"'), page.indexOf('hint={'));
  assert.match(provinceBlock, /as="select"/);
  assert.doesNotMatch(provinceBlock, /type="text"/);
  assert.match(page, /provinceOptions\.map/);
});

test("RETURN COALESCE((SELECT ...)) menutup subquery sebelum argumen default", async () => {
  const studentsSql = await read("docs/database/migration-school-student-management.sql");
  const profileSql = await read("docs/database/migration-school-profile-operator.sql");
  // Pola lama menempatkan '[]'::jsonb di dalam jsonb_agg sebelum FROM/ORDER BY → paren tidak seimbang.
  assert.match(studentsSql, /AND s\.is_managed IS TRUE\s*\n\s*\), '\[\]'::jsonb\);/);
  assert.match(profileSql, /ORDER BY t\.grade NULLS LAST, t\.name\), '\[\]'::jsonb\)/);
  assert.doesNotMatch(profileSql, /'grade', t\.grade\), '\[\]'::jsonb\)/);
  // Semua body $$ harus seimbang kurungnya (strip string & komentar).
  for (const sql of [studentsSql, profileSql]) {
    for (const [index, part] of sql.split("$$").entries()) {
      if (index % 2 === 0) continue;
      const cleaned = part.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, " ");
      let depth = 0;
      for (const ch of cleaned) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        assert.ok(depth >= 0, `kurung tertutup sebelum dibuka (blok $$ #${index})`);
      }
      assert.equal(depth, 0, `kurung tidak seimbang (blok $$ #${index})`);
    }
  }
});

test("paging siswa selalu tampil dengan lima baris per halaman", async () => {
  const page = await read("src/app/school/page.js");
  const start = page.indexOf('aria-label="Paging daftar siswa"');
  assert.ok(start > -1, "blok paging tidak ditemukan");
  const nav = page.slice(start, page.indexOf("</nav>", start));
  assert.ok(nav.length > 100);

  // Kontrol tidak lagi disembunyikan saat jumlah siswa <= 5.
  assert.doesNotMatch(page, /filteredStudents\.length > pageSize &&/);
  assert.match(page, /allStudents\.length > 0 && \(/);

  assert.match(nav, /baris per halaman/);
  assert.match(nav, /Halaman \{safeStudentPage\} dari \{totalStudentPages\}/);
  assert.match(nav, /aria-label="Halaman sebelumnya"/);
  assert.match(nav, /aria-label="Halaman berikutnya"/);
  assert.match(nav, /disabled=\{safeStudentPage === 1\}/);
  assert.match(nav, /disabled=\{safeStudentPage === totalStudentPages\}/);

  // Rentang baris yang ditampilkan memakai pageSize.
  assert.match(page, /Math\.min\(\s*safeStudentPage \* pageSize,\s*filteredStudents\.length,\s*\)/);
});
