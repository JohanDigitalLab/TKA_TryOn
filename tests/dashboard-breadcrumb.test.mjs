import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getHomeHref } from "../src/lib/dashboard/home-href.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("getHomeHref memetakan profil ke URL dashboard yang benar", () => {
  assert.equal(getHomeHref({ is_subscribed: false, account_type: "ADMIN" }), "/subscription");
  assert.equal(getHomeHref({ is_subscribed: false }), "/subscription");
  assert.equal(getHomeHref({ is_subscribed: true, account_type: "STUDENT", is_managed: false }), "/student");
  assert.equal(getHomeHref({ is_subscribed: true, account_type: "STUDENT", is_managed: true }), "/mstudent");
  assert.equal(getHomeHref({ is_subscribed: true, account_type: "student", is_managed: null }), "/student");
  assert.equal(
    getHomeHref({ is_subscribed: true, account_type: "SCHOOL", school_id: "school-1" }),
    "/school",
  );
  assert.equal(getHomeHref({ is_subscribed: true, account_type: "SCHOOL" }), "/home");
  assert.equal(getHomeHref({ is_subscribed: true, account_type: "ADMIN" }), "/admin");
  assert.equal(getHomeHref({ is_subscribed: null, account_type: "TEACHER" }), "/home");
  assert.equal(getHomeHref(null), "/home");
  assert.equal(getHomeHref(undefined), "/home");
  assert.equal(getHomeHref({}), "/home");
  // Parameter fallback dipakai saat profil tidak ada/tidak dikenali.
  assert.equal(getHomeHref(null, "/"), "/");
  assert.equal(getHomeHref({ account_type: "TEACHER" }, "/"), "/");
  // Aturan tetap menang atas fallback.
  assert.equal(
    getHomeHref({ is_subscribed: true, account_type: "SCHOOL", school_id: "school-1" }, "/"),
    "/school",
  );
  assert.equal(getHomeHref({ is_subscribed: true, account_type: "SCHOOL" }, "/"), "/");
});

test("halaman /home memakai getHomeHref dengan fallback /", async () => {
  const page = await read("src/app/home/page.js");
  assert.match(
    page,
    /import \{ getHomeHref, HOME_HREF_PROFILE_COLUMNS \} from "@\/lib\/dashboard\/home-href\.mjs"/,
  );
  assert.match(page, /router\.push\(getHomeHref\(profile, "\/"\)\)/);
  assert.match(page, /select\(HOME_HREF_PROFILE_COLUMNS\)/);
  // Tidak boleh ada lagi fungsi duplikat getDashboardPath di /home.
  assert.doesNotMatch(page, /getDashboardPath/);
});

test("komponen breadcrumb memakai getHomeHref, bukan hardcode /home", async () => {
  const component = await read("src/components/dashboard-breadcrumb.js");
  assert.match(component, /import \{ getHomeHref, HOME_HREF_PROFILE_COLUMNS \} from "@\/lib\/dashboard\/home-href\.mjs"/);
  assert.match(component, /setHref\(getHomeHref\(profile\)\)/);
  assert.match(component, /<Link href=\{href\}/);
  assert.match(component, /aria-label="Breadcrumb"/);
  assert.match(component, /aria-current="page"/);
  assert.match(component, /export default function DashboardBreadcrumb/);
  // Fallback awal tetap /home selama profil dimuat.
  assert.match(component, /useState\("\/home"\)/);
  // Tidak ada setState sinkron di body effect.
  assert.match(component, /await Promise\.resolve\(\);/);
});

test("rute school tidak mengembalikan profil tidak lengkap ke /home", async () => {
  const page = await read("src/app/school/page.js");
  assert.match(page, /router\.replace\("\/register"\)/);
  assert.doesNotMatch(page, /if \(accountType !== "SCHOOL" \|\| !profileData\?\.school_id\)[\s\S]{0,180}router\.replace\("\/home"\)/);
  assert.match(page, /String\(profile\.account_type \|\| ""\)\.toUpperCase\(\) !== "SCHOOL"/);
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
