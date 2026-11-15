import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as XLSX from "xlsx";
import { readSpreadsheet, SPREADSHEET_LIMITS } from "../src/lib/import/spreadsheet.js";
import { V81_HEADERS, V81_SOURCES, V81_STATUSES, parseV81Workbook, parseV81Options, isV81Workbook } from "../src/lib/import/v81.js";

function fixture() {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["id_soal", "archive-not-a-question"]]), "ARSIP");
  for (const [name, config] of Object.entries(V81_SOURCES)) {
    const headers = [...V81_HEADERS].reverse(); // Mapping must never depend on column position.
    const rows = Array.from({ length: config.count }, (_, i) => {
      const q = {
        "ID Soal": `${name}-${i}`, Jenjang: config.level === "sd" ? "SD/MI Kelas 6" : "SMP/MTs Kelas 9",
        "Mata Pelajaran": config.subject, "Tema / Cakupan": "Tema penting", "Topik / Submateri": "Topik penting",
        "Bentuk Soal": i % 3 === 0 ? "PGK MCMA" : i % 3 === 1 ? "PGK Kategori" : "Pilihan Ganda (PG)",
        Pertanyaan: "Pilih jawaban", "Pilihan Jawaban": "A. Satu\nB. Dua\nC. Tiga",
        "Kunci Jawaban": i % 3 === 0 ? "A, C" : i % 3 === 1 ? "A-Benar; B-Salah; C-Benar" : "B",
        Status: V81_STATUSES[i % 2], "Tingkat Kesulitan": "Sedang",
      };
      return headers.map(header => q[header] || "");
    });
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ...rows]), name);
  }
  for (let i = 0; i < 20; i++) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["ignore"]]), `SUPPORT-${i}`);
  return book;
}
const change = (book, sheet, header, value, row = 1) => {
  const ws = book.Sheets[sheet];
  const headers = XLSX.utils.sheet_to_json(ws, { header: 1 })[0];
  ws[XLSX.utils.encode_cell({ r: row, c: headers.indexOf(header) })] = { t: "s", v: value };
};

test("v8.1 membaca 25 sheets tetapi hanya memproses 4 sumber, header by-name dan metadata utuh", () => {
  const book = readSpreadsheet(XLSX.write(fixture(), { type: "buffer", bookType: "xlsx" }));
  assert.equal(isV81Workbook(book), true);
  const result = parseV81Workbook(book);
  assert.equal(result.totalSheets, 25); assert.equal(result.ignoredSheets.length, 21);
  assert.equal(result.questionCount, 474); assert.deepEqual(result.issues, []);
  assert.equal(new Set(result.questions.map(q => q.id)).size, 474);
  const q = result.questions[0];
  assert.equal(q.material, "Tema penting"); assert.equal(q.sub_material, "Topik penting");
  assert.equal(q.options.filter(o => o.is_correct).length, 2);
  assert.equal(result.questions[1].category_items[1].correct_category, "Salah");
  assert.equal(Object.getPrototypeOf(q.raw), null);
});
for (const [label, mutate, pattern] of [
  ["sheet hilang", b => { delete b.Sheets.SD_Matematika; b.SheetNames = b.SheetNames.filter(n => n !== "SD_Matematika"); }, /sumber wajib/],
  ["ID duplikat", b => change(b, "SD_Matematika", "ID Soal", "SD_Bahasa_Indonesia-0"), /unik/],
  ["kunci hilang", b => change(b, "SD_Matematika", "Kunci Jawaban", ""), /Kunci|wajib/],
  ["kunci di luar pilihan", b => change(b, "SD_Matematika", "Kunci Jawaban", "Z"), /tersedia/],
  ["PG lebih dari satu kunci", b => change(b, "SD_Matematika", "Kunci Jawaban", "A, B", 3), /tepat satu/],
  ["kategori tidak lengkap", b => change(b, "SD_Matematika", "Kunci Jawaban", "A-Benar", 2), /setiap kode/],
  ["status asing", b => change(b, "SD_Matematika", "Status", "PUBLISHED"), /Status sumber/],
  ["salah jenjang", b => change(b, "SD_Matematika", "Jenjang", "SMA"), /tidak sesuai/],
  ["opsi duplikat", b => change(b, "SD_Matematika", "Pilihan Jawaban", "A. Satu\nA. Dua"), /kode unik/],
  ["header berbahaya", b => { const ws = b.Sheets.SD_Matematika; ws.A1 = { t: "s", v: "__proto__" }; }, /tidak aman/],
]) {
  test(`v8.1 menolak ${label}`, () => {
    const book = fixture(); mutate(book);
    const result = parseV81Workbook(book);
    assert(result.counts.ERROR > 0); assert(result.issues.some(i => pattern.test(i.message)));
  });
}
test("opsi multiline dipertahankan tanpa menjalankan isi sel", () => {
  assert.equal(parseV81Options("A. Baris satu\nlanjutan\nB. =FORMULA()")[0].text, "Baris satu\nlanjutan");
});
test("batas 50 sheets dipertahankan", () => {
  assert.equal(SPREADSHEET_LIMITS.sheets, 50);
  const book = fixture();
  for (let i = 25; i < 51; i++) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["support"]]), `Sheet-${i}`);
  assert.throws(() => readSpreadsheet(XLSX.write(book, { type: "buffer", bookType: "xlsx" })), /50 sheet/);
});
test("migrasi memperluas entrypoint lama, status aman dan private ACL", () => {
  const sql = fs.readFileSync(new URL("../docs/database/migration-stage-8-workbook-v81.sql", import.meta.url), "utf8");
  assert.match(sql, /public\.save_question_import_batch\(jsonb\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION private\.save_v81_import_batch\(jsonb\) FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /pg_advisory_xact_lock/); assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /'NEEDS_REVISION' ELSE 'PENDING_REVIEW'/);
  assert.match(sql, /Hak penggunaan belum diverifikasi/);
  assert.match(sql, /rekonstruksi wajib direvisi/);
});
