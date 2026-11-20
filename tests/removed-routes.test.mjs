import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { registrationContext } from "../src/lib/student/registration.mjs";

const root = new URL("../", import.meta.url);
const removed = ["/teacher", "/school/join", "/school/manage", "/school/messages", "/school/register", "/student/xmissions", "/student/xsubjects", "/admin/schools", "/admin/subscriptions"];
async function sources(directory) {
  const paths = [];
  for (const entry of await readdir(new URL(directory, root), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...await sources(path));
    else if (/\.(?:js|mjs|jsx|ts|tsx)$/.test(path)) paths.push(path);
  }
  return paths;
}

test("route yang dipensiunkan dan komponen eksklusif tidak tersedia", () => {
  for (const route of removed) assert.equal(existsSync(new URL(`src/app${route}/page.js`, root)), false, route);
  assert.equal(existsSync(new URL("src/components/learning-access.js", root)), false);
  for (const path of ["src/app/school/page.js", "src/components/school/portal.js"]) {
    assert.ok(existsSync(new URL(path, root)), path);
  }
  for (const path of ["src/components/school/communications.js", "src/components/school/transfers.js"]) {
    assert.equal(existsSync(new URL(path, root)), false, path);
  }
});

test("tujuan pendaftaran lama jatuh ke dashboard siswa tanpa merusak tujuan tersisa", () => {
  for (const route of removed) {
    for (const suffix of ["", "?code=legacy#preview", "/"]) {
      assert.equal(registrationContext(new URLSearchParams({ next: route + suffix })).next, "/student");
    }
  }
  for (const route of ["/school", "/student/tryout", "/student/exercise"]) {
    assert.equal(registrationContext(new URLSearchParams({ next: route })).next, route);
  }
});

test("semua import lokal sumber tetap dapat diresolusikan setelah removal", async () => {
  for (const path of await sources("src")) {
    const source = await readFile(new URL(path, root), "utf8");
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (!specifier.startsWith("@/") && !specifier.startsWith(".")) continue;
      const target = specifier.startsWith("@/") ? new URL(`src/${specifier.slice(2)}`, root) : new URL(specifier, new URL(path, root));
      assert.ok(["", ".js", ".mjs", ".jsx", ".ts", ".tsx", "/index.js"].some(suffix => existsSync(new URL(target.href + suffix))), `${path}: ${specifier}`);
    }
  }
});

test("halaman aktif tidak menawarkan tautan ke route yang dihapus", async () => {
  for (const path of ["src/app/school/page.js", "src/app/register/page.js", "src/components/portal-header.js", "src/components/school/portal.js"]) {
    const source = await readFile(new URL(path, root), "utf8");
    for (const route of removed) assert.ok(!source.includes(route), `${path}: ${route}`);
  }
});
