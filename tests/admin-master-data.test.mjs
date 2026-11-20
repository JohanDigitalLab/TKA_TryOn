import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("sidebar admin memiliki group MASTER DATA di bawah Ujian & Evaluasi", async () => {
  const sidebar = await read("src/components/admin/admin-sidebar.js");
  const ujianAt = sidebar.indexOf('section: "UJIAN & EVALUASI"');
  const masterAt = sidebar.indexOf('section: "MASTER DATA"');
  const manajemenAt = sidebar.indexOf('section: "MANAJEMEN"');
  assert.ok(ujianAt > -1 && masterAt > -1 && manajemenAt > -1);
  assert.ok(ujianAt < masterAt, "MASTER DATA harus setelah Ujian & Evaluasi");
  assert.ok(masterAt < manajemenAt, "MASTER DATA harus sebelum Manajemen");

  const routes = {
    "Pengguna": "/admin/master/users",
    "Mata Pelajaran": "/admin/master/subjects",
    "Tema dan Topik": "/admin/master/topics",
    "Sekolah": "/admin/master/schools",
    "Tipe Sekolah": "/admin/master/school-types",
    "Jenjang Pendidikan": "/admin/master/education-levels",
  };
  for (const [label, href] of Object.entries(routes)) {
    assert.ok(sidebar.includes(`label: "${label}"`), label);
    assert.ok(sidebar.includes(`href: "${href}"`), href);
  }

  // Dashboard memakai sidebar bersama, bukan menu inline.
  const page = await read("src/app/admin/page.js");
  assert.match(page, /import AdminSidebar from "@\/components\/admin\/admin-sidebar"/);
  assert.match(page, /<AdminSidebar active=\{activeMenu\} onSelect=\{selectMenu\} \/>/);
  assert.doesNotMatch(page, /const menu = \[/);
});

test("enam halaman master data memakai workspace dengan konfigurasi yang benar", async () => {
  const pages = {
    "src/app/admin/master/users/page.js": ['table="profiles"', "Pengguna"],
    "src/app/admin/master/subjects/page.js": ['table="subjects"', "Mata Pelajaran"],
    "src/app/admin/master/topics/page.js": ['table="subject_topics"', "Tema dan Topik"],
    "src/app/admin/master/schools/page.js": ['table="schools"', "Sekolah"],
    "src/app/admin/master/school-types/page.js": ['table="school_types"', "Tipe Sekolah"],
    "src/app/admin/master/education-levels/page.js": ['table="education_levels"', "Jenjang Pendidikan"],
  };
  for (const [path, [tableAttr, title]] of Object.entries(pages)) {
    const source = await read(path);
    assert.match(source, /import MasterDataWorkspace from "@\/components\/admin\/master-data-workspace"/, path);
    assert.ok(source.includes(tableAttr), `${path} :: ${tableAttr}`);
    assert.ok(source.includes(`title="${title}"`), `${path} :: ${title}`);
    assert.match(source, /columns=\{\[/, path);
    assert.match(source, /fields=\{\[/, path);
  }
});

test("workspace master data memakai RPC admin_master_list/save/delete", async () => {
  const source = await read("src/components/admin/master-data-workspace.js");
  assert.match(source, /supabase\.rpc\("admin_master_list"/);
  assert.match(source, /supabase\.rpc\("admin_master_save"/);
  assert.match(source, /supabase\.rpc\("admin_master_delete"/);
  assert.match(source, /migration-admin-master-data\.sql/);
  // Konfirmasi eksplisit sebelum hapus + paging.
  assert.match(source, /Ya, hapus/);
  assert.match(source, /setPendingDelete\(row\.id\)/);
  assert.match(source, /const PAGE_SIZE = 25;/);
  assert.match(source, /aria-label=\{`Paging \$\{heading\}`\}/);
  // Modal dengan judul dialog.
  assert.match(source, /aria-labelledby="master-modal-title"/);
  // Tidak ada setState sinkron di body effect (pola debounce + loader).
  assert.match(source, /await Promise\.resolve\(\);/);
});

test("tabel settings dibuat sesuai spesifikasi", async () => {
  const sql = await read("docs/database/migration-create-settings-table.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.settings \(/);
  assert.match(sql, /id uuid NOT NULL DEFAULT gen_random_uuid\(\)/);
  assert.match(sql, /"group" varchar\(50\) NOT NULL DEFAULT 'SYSTEM'/);
  assert.match(sql, /name varchar\(50\) NOT NULL/);
  assert.match(sql, /value varchar\(255\) NOT NULL/);
  assert.match(sql, /CONSTRAINT settings_pkey PRIMARY KEY \(id\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS settings_group_idx/);
  assert.match(sql, /ALTER TABLE public\.settings ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
});

test("migrasi admin_master membatasi tabel whitelist dan otorisasi super admin", async () => {
  const sql = await read("docs/database/migration-admin-master-data.sql");
  for (const name of [
    "public.admin_master_list(",
    "public.admin_master_save(",
    "public.admin_master_delete(",
  ]) assert.ok(sql.includes(name), name);

  assert.match(sql, /private\.is_super_admin\(\)/g);
  assert.match(sql, /'profiles', 'subjects', 'subject_topics', 'schools', 'school_types', 'education_levels'/);
  // Whitelist kolom per tabel.
  assert.match(sql, /WHEN 'subjects' THEN ARRAY\['subject_code', 'name', 'education_level_id', 'is_active'\]/);
  assert.match(sql, /WHEN 'education_levels' THEN ARRAY\['name', 'grade'\]/);
  // Email profil dibaca dari auth.users, bukan profiles.email.
  assert.match(sql, /coalesce\(u\.email, ''''\)\), ''''\) AS email/);
  assert.match(sql, /LEFT JOIN auth\.users u ON u\.id = x\.id/);
  // Penolakan kolom di luar whitelist.
  assert.match(sql, /tidak diizinkan untuk tabel/);
  // ACL + reload schema.
  assert.match(sql, /REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION %s TO authenticated/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  // Regresi: CASE yang tidak ditutup END membuat "syntax error at end of input".
  assert.doesNotMatch(sql, /USING CASE/);
  for (const line of sql.split(/\r?\n/)) {
    if (/CASE WHEN/.test(line)) assert.match(line, /END\b/, `CASE tanpa END: ${line.trim()}`);
  }
  // Pola LIKE dibangun di variabel terpisah, bukan inline di USING.
  assert.match(sql, /v_like text;/);
  assert.match(sql, /INTO v_total USING v_like;/);
});
