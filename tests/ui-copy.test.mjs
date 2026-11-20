import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(new URL(directory, root), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:[cm]?js|jsx|tsx?|html|svg)$/.test(entry.name)) files.push(path);
  }
  return files;
}

test("teks aplikasi memakai sapaan kamu/-mu tanpa mengubah kata seperti beranda", async () => {
  const paths = [...await sourceFiles("src"), ...await sourceFiles("public"), "index.html"];
  const violations = [];
  for (const path of paths) {
    const lines = (await read(path)).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/\banda\b/i.test(line)) violations.push(`${path}:${index + 1}`);
    });
  }
  assert.deepEqual(violations, [], "Sapaan formal masih ditemukan pada teks aplikasi");
});

test("halaman hasil memakai header portal dan kompetensi dari server", async () => {
  const source = await read("src/app/student/results/page.js");
  assert.match(source, /import PortalHeader from "@\/components\/portal-header"/);
  assert.match(source, /<PortalHeader/);
  assert.match(source, /supabase\.rpc\("get_student_results"/);
  assert.match(source, /kompetensi/i);
  assert.match(source, /KUAT: \{ label: "Kuat"/);
  assert.match(source, /CUKUP: \{ label: "Cukup"/);
  assert.match(source, /KURANG: \{ label: "Perlu Pendalaman"/);
  assert.match(source, /Skor Tryout/);
  assert.match(source, /Skor Latihan & Tugas/);
  assert.match(source, /slice\(-5\)/);
});

test("pemulihan ujian tidak menjanjikan pengaturan ulang waktu", async () => {
  const source = await read("src/app/student/challenge/page.js");
  assert.ok(source.includes("Jawaban yang tersimpan dimuat kembali. Sisa waktu mengikuti batas akhir sesi."));
  assert.ok(source.includes("Setelah diakhiri, jawaban tidak dapat diubah."));
});

test("pendaftaran satu alur dengan konfirmasi password", async () => {
  const register = await read("src/app/register/page.js");
  assert.ok(register.includes("Daftar Akun"));
  assert.ok(register.includes('name="confirm_password"'));
  assert.ok(register.includes("values.password !== values.confirm_password"));
  assert.ok(!register.includes("Siswa undangan sekolah"));
  assert.ok(!register.includes("Siswa mandiri"));
});
