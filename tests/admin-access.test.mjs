import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("guard portal memverifikasi login dan account_type lewat getHomeHref", async () => {
  const guard = await read("src/components/portal-guard.js");
  assert.match(guard, /"use client"/);
  assert.match(guard, /supabase\.auth\.getUser\(\)/);
  // Belum login / verifikasi gagal -> halaman utama.
  assert.match(guard, /window\.location\.replace\("\/"\)/);
  // Tipe akun tidak sesuai -> dashboard milik akun tersebut.
  assert.match(guard, /getHomeHref,[\s\S]*?HOME_HREF_PROFILE_COLUMNS/);
  assert.match(guard, /select\(HOME_HREF_PROFILE_COLUMNS\)/);
  assert.match(guard, /window\.location\.replace\(getHomeHref\(profile\)\)/);
  assert.match(guard, /wanted\.includes\(accountType\)/);
  // Layout tidak mengimpor next/navigation (menariknya ke shell statis rute dinamis).
  assert.doesNotMatch(guard, /from "next\/navigation"/);
  // Konten hanya terbuka setelah akses boleh; saat diperiksa anak ditutup overlay
  // agar shell statis rute dinamis tidak kosong (build Cache Components).
  assert.match(guard, /if \(access === "denied"\) \{/);
  assert.match(guard, /\{children\}/);
  assert.match(guard, /access === "checking" && \(/);
  assert.match(guard, /const \[access, setAccess\] = useState\("checking"\)/);
  // Tidak ada setState sinkron di body effect.
  assert.match(guard, /await Promise\.resolve\(\);/);
  assert.match(guard, /Memeriksa akses…/);
  assert.match(guard, /Mengalihkan…/);
});

test("layout admin membatasi akses hanya untuk account_type ADMIN", async () => {
  const layout = await read("src/app/admin/layout.js");
  assert.match(layout, /import PortalGuard from "@\/components\/portal-guard"/);
  assert.match(layout, /<PortalGuard allowedTypes=\{\["ADMIN"\]\}>\{children\}<\/PortalGuard>/);
});

test("layout school mengizinkan SCHOOL dan ADMIN, menolak tipe lain", async () => {
  const layout = await read("src/app/school/layout.js");
  assert.match(layout, /import PortalGuard from "@\/components\/portal-guard"/);
  assert.match(layout, /<PortalGuard allowedTypes=\{\["SCHOOL", "ADMIN"\]\}>\{children\}<\/PortalGuard>/);
});

test("layout student mensyaratkan login tanpa membatasi tipe akun", async () => {
  const layout = await read("src/app/student/layout.js");
  assert.match(layout, /import PortalGuard from "@\/components\/portal-guard"/);
  assert.match(layout, /<PortalGuard>\{children\}<\/PortalGuard>/);
  assert.doesNotMatch(layout, /allowedTypes/);
});

test("layout home mensyaratkan login untuk seluruh halaman turunannya", async () => {
  const layout = await read("src/app/home/layout.js");
  assert.match(layout, /import PortalGuard from "@\/components\/portal-guard"/);
  assert.match(layout, /<PortalGuard>\{children\}<\/PortalGuard>/);
  assert.doesNotMatch(layout, /allowedTypes/);
});

test("halaman portal tidak lagi mengarahkan ke rute login yang tidak ada", async () => {
  const assignments = await read("src/app/student/assignments/page.js");
  assert.doesNotMatch(assignments, /router\.replace\("\/login"\)/);
  assert.match(assignments, /router\.replace\("\/"\)/);
});
