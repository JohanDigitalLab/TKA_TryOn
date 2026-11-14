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

test("pemulihan ujian tidak menjanjikan pengaturan ulang waktu", async () => {
  const source = await read("src/app/student/challenge/page.js");
  assert.ok(source.includes("Jawaban yang tersimpan dimuat kembali. Sisa waktu mengikuti batas akhir sesi."));
  assert.ok(source.includes("Setelah diakhiri, jawaban tidak dapat diubah."));
});

test("pendaftaran dan pesan menjelaskan langkah berikutnya tanpa jargon teknis", async () => {
  const register = await read("src/app/register/page.js");
  assert.ok(register.includes("Keanggotaanmu baru aktif setelah disetujui admin sekolah."));
  const messages = await read("src/components/school/communications.js");
  assert.ok(messages.includes("Pesanmu mungkin sudah terkirim; mengirim ulang dapat membuat pesan ganda."));
  assert.ok(messages.includes("Sudah kamu tandai dibaca"));
  assert.ok(!messages.includes("kunci idempotensi"));
});

test("penerimaan koordinator menjelaskan perpindahan akses dan tanggung jawab", async () => {
  const source = await read("src/components/school/transfers.js");
  assert.ok(source.includes("keanggotaan koordinator utama sebelumnya akan dinonaktifkan"));
  assert.ok(source.includes("tanggung jawab administrasi sekolah akan beralih kepadamu"));
});

test("pendaftar sekolah diarahkan ke admin melalui nomor WhatsApp yang dikonfigurasi", async () => {
  const source = await read("src/app/school/register/page.js");
  assert.ok(source.includes("Wahyu Yoga Pratama"));
  assert.ok(source.includes("https://wa.me/6282138171938"));
  assert.ok(source.includes("Nomor admin: +62 821-3817-1938"));
});
