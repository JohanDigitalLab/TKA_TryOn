import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("layout admin membatasi akses hanya untuk account_type ADMIN", async () => {
  const layout = await read("src/app/admin/layout.js");
  assert.match(layout, /select\("account_type"\)/);
  assert.match(layout, /accountType === "ADMIN"/);
  assert.match(layout, /router\.replace\("\/home"\)/);
  // Guard render: konten admin tidak tampil sebelum/ditolak pemeriksaan.
  assert.match(layout, /Memeriksa akses admin…/);
  assert.match(layout, /Mengalihkan ke beranda…/);
  assert.match(layout, /const \[adminAccess, setAdminAccess\] = useState\("checking"\)/);
  assert.match(layout, /checkedUserId !== userId/);
  // Tidak ada setState sinkron di body effect.
  assert.match(layout, /await Promise\.resolve\(\);/);
  // Guard harus mendahului return children.
  assert.ok(
    layout.indexOf("Memeriksa akses admin…") < layout.lastIndexOf("return children"),
    "guard render harus sebelum children",
  );
});
