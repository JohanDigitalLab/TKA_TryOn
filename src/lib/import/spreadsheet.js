import * as XLSX from "xlsx";

export const SPREADSHEET_LIMITS = Object.freeze({
  bytes: 10 * 1024 * 1024,
  sheets: 20,
  rows: 10000,
  columns: 100,
  cells: 250000,
});
const forbiddenHeaders = new Set(["__proto__", "prototype", "constructor"]);
const clean = (value) => String(value ?? "").trim();

function validateHeaders(headers) {
  const seen = new Set();
  for (const header of headers) {
    if (!header) continue;
    if (forbiddenHeaders.has(header.toLowerCase())) {
      throw new Error(`Header tidak aman: ${header}.`);
    }
    if (seen.has(header)) throw new Error(`Header duplikat: ${header}.`);
    seen.add(header);
  }
}

export function readSpreadsheet(buffer) {
  if (!buffer?.byteLength || buffer.byteLength > SPREADSHEET_LIMITS.bytes) {
    throw new Error("Spreadsheet harus berisi data dan berukuran maksimal 10 MB.");
  }
  const workbook = XLSX.read(buffer, {
    type: "array", cellDates: true, raw: false,
    sheetRows: SPREADSHEET_LIMITS.rows + 1,
    cellHTML: false, cellFormula: false, bookVBA: false,
  });
  if (workbook.SheetNames.length > SPREADSHEET_LIMITS.sheets) {
    throw new Error("Spreadsheet maksimal memiliki 20 sheet.");
  }
  let cells = 0;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const reference = sheet?.["!fullref"] || sheet?.["!ref"];
    if (!reference) continue;
    const range = XLSX.utils.decode_range(reference);
    // Absolute bounds also reject sparse ranges placed far outside the template.
    if (range.e.r >= SPREADSHEET_LIMITS.rows || range.e.c >= SPREADSHEET_LIMITS.columns) {
      throw new Error("Spreadsheet maksimal 10000 baris dan 100 kolom per sheet.");
    }
    cells += (range.e.r + 1) * (range.e.c + 1);
    if (cells > SPREADSHEET_LIMITS.cells) {
      throw new Error("Spreadsheet melampaui batas 250000 sel.");
    }
  }
  return workbook;
}

export function parseSheet(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) return { exists: false, headers: [], rows: [] };
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const expected = {
    MATA_PELAJARAN: "mapel_id", STIMULUS: "stimulus_id",
    SOAL: "id_soal", RESPON_KUNCI: "id_soal",
  }[name];
  let headerIndex = matrix.findIndex((row) => row.some(
    (cell) => clean(cell).toUpperCase() === (expected || "__NONE__").toUpperCase()
  ));
  if (headerIndex < 0) headerIndex = 3;
  const headers = (matrix[headerIndex] || []).map(clean);
  validateHeaders(headers);
  const rows = matrix.slice(headerIndex + 1).map((values, index) => {
    const data = Object.create(null);
    headers.forEach((header, i) => { if (header) data[header] = clean(values[i]); });
    return { rowNumber: headerIndex + index + 2, data };
  }).filter(({ data }) => Object.values(data).some(Boolean));
  return { exists: true, headers, rows };
}

export function readCsvRows(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("CSV tidak memiliki sheet yang dapat dibaca.");
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const headers = (matrix[0] || []).map(clean);
  validateHeaders(headers);
  return matrix.slice(1).filter((row) => row.some((value) => clean(value))).map((row) => {
    const data = Object.create(null);
    headers.forEach((header, index) => { if (header) data[header] = row[index] ?? ""; });
    return data;
  });
}
