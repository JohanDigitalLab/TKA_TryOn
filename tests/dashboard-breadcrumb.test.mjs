import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("komponen breadcrumb menunjuk Home ke /home (router dashboard per akun)", async () => {
  const component = await read("src/components/dashboard-breadcrumb.js");
  assert.match(component, /href="\/home"/);
  assert.match(component, /aria-label="Breadcrumb"/);
  assert.match(component, /aria-current="page"/);
  assert.match(component, /export default function DashboardBreadcrumb/);
});

test("enam halaman memasang DashboardBreadcrumb di atas greeting/title", async () => {
  const pages = {
    "src/app/school/operator/page.js": 'current="Profil Operator"',
    "src/app/school/profile/page.js": 'current="Profil Sekolah"',
    "src/app/student/results/page.js": 'current="Hasil Belajar"',
    "src/app/student/profile/page.js": 'current="Profil Siswa"',
    "src/app/student/exercise/page.js": 'current="Latihan Soal"',
    "src/app/student/tryout/page.js": 'current="Simulasi TKA"',
  };
  for (const [path, usage] of Object.entries(pages)) {
    const source = await read(path);
    assert.match(source, /import DashboardBreadcrumb from "@\/components\/dashboard-breadcrumb"/, path);
    assert.ok(source.includes(`<DashboardBreadcrumb ${usage} />`), `${path} :: ${usage}`);
    // Breadcrumb harus berada sebelum judul halaman (heading h1/h2 setelah tag breadcrumb).
    const bcIndex = source.indexOf(`<DashboardBreadcrumb ${usage} />`);
    assert.ok(bcIndex > -1, `${path} tag breadcrumb tidak ditemukan`);
    assert.match(source.slice(bcIndex), /<h[12]/, `${path} judul setelah breadcrumb`);
  }
});
