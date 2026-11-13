import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { readSpreadsheet, parseSheet, readCsvRows, SPREADSHEET_LIMITS } from "../src/lib/import/spreadsheet.js";
import { validateWorkbook } from "../src/lib/import/tqbs.js";

function workbook(matrix, name = "SOAL", bookType = "xlsx") {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(matrix), name);
  return XLSX.write(book, { type: "buffer", bookType });
}

for (const format of ["xlsx", "xls"]) {
  test(`membaca ${format}, header TQBS, nomor baris dan teks`, () => {
    const book = readSpreadsheet(workbook([["Petunjuk"], [], ["id_soal", "pertanyaan"], ["001", "Soal satu"], []], "SOAL", format));
    const parsed = parseSheet(book, "SOAL");
    assert.equal(parsed.rows[0].rowNumber, 4);
    assert.equal(parsed.rows[0].data.id_soal, "001");
    assert.equal(parsed.rows[0].data.pertanyaan, "Soal satu");
    assert.equal(Object.getPrototypeOf(parsed.rows[0].data), null);
    assert.equal(parseSheet(book, "TIDAK_ADA").exists, false);
  });
}

test("CSV mempertahankan koma dan baris baru di field berpetik", () => {
  const rows = readCsvRows(readSpreadsheet(new TextEncoder().encode('id,teks\n001,"Satu, dua\nTiga"')));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].teks, "Satu, dua\nTiga");
});

for (const header of ["__proto__", "constructor", "prototype"]) {
  test(`menolak header berbahaya ${header}`, () => {
    assert.throws(() => parseSheet(readSpreadsheet(workbook([["id_soal", header], ["Q1", "nilai"]])), "SOAL"), /tidak aman/);
    assert.throws(() => readCsvRows(readSpreadsheet(new TextEncoder().encode(`${header},teks\na,b`))), /tidak aman/);
    assert.equal({}.polluted, undefined);
  });
}

test("menolak header duplikat", () => {
  assert.throws(() => parseSheet(readSpreadsheet(workbook([["id_soal", "id_soal"], ["1", "2"]])), "SOAL"), /duplikat/);
});

test("menolak file kosong dan terlalu besar", () => {
  assert.throws(() => readSpreadsheet(new Uint8Array()), /10 MB/);
  assert.throws(() => readSpreadsheet(new Uint8Array(SPREADSHEET_LIMITS.bytes + 1)), /10 MB/);
});

test("menolak range sparse yang melampaui batas baris", () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, { A1: { t: "s", v: "id_soal" }, A10001: { t: "s", v: "Q" }, "!ref": "A1:A10001" }, "SOAL");
  assert.throws(() => readSpreadsheet(XLSX.write(book, { type: "buffer", bookType: "xlsx" })), /10000 baris/);
});

test("validator hasil ekstraksi mendeteksi soal tanpa kunci", () => {
  const sheets = Object.fromEntries(["MATA_PELAJARAN", "STIMULUS", "SOAL", "RESPON_KUNCI"].map((name) => [name, { rows: [] }]));
  sheets.SOAL.rows.push({ rowNumber: 2, data: { id_soal: "Q1", jenis_soal: "PG_TUNGGAL" } });
  assert.ok(validateWorkbook(sheets).some((issue) => issue.message.includes("belum memiliki respons")));
});
