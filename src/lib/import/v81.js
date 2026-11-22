import * as XLSX from "xlsx";
import { validateHeaders } from "./spreadsheet.js";

export const V81_SOURCES = Object.freeze({
  SD_Bahasa_Indonesia: { count: 100, level: "sd", grade: 6, subject: "Bahasa Indonesia" },
  SD_Matematika: { count: 136, level: "sd", grade: 6, subject: "Matematika" },
  SMP_Bahasa_Indonesia: { count: 100, level: "smp", grade: 9, subject: "Bahasa Indonesia" },
  SMP_Matematika: { count: 138, level: "smp", grade: 9, subject: "Matematika" },
});
export const V81_HEADERS = Object.freeze([
  "ID Soal", "Jenjang", "Mata Pelajaran", "Kompetensi Membaca TKA", "Tema / Cakupan",
  "Topik / Submateri", "Indikator / Subkompetensi", "Fokus Proses Membaca", "Tingkat Kesulitan",
  "Bentuk Soal", "Stimulus", "Pertanyaan", "Pilihan Jawaban", "Kunci Jawaban", "Pembahasan",
  "Status", "Catatan", "ID Stimulus", "Jenis Stimulus", "Catatan Telaah V6", "Sumber Bank",
  "Status Variasi", "Rekomendasi Pool", "Catatan Rekonstruksi v8.1",
]);
export const V81_STATUSES = Object.freeze([
  "KANDIDAT INTERNAL — REVIEW GURU WAJIB",
  "REKONSTRUKSI WAJIB — BELUM SIAP DIGUNAKAN",
]);
const TYPES = { "Pilihan Ganda (PG)": "PG_TUNGGAL", "PGK MCMA": "PGK_MA", "PGK Kategori": "PGK_KATEGORI" };
const clean = value => String(value ?? "").trim();
const countBy = (rows, field) => rows.reduce((counts, row) => {
  const key = row[field];
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, Object.create(null));

export function isV81Workbook(workbook) {
  return Object.keys(V81_SOURCES).some(name => workbook.SheetNames.includes(name));
}

// Labels must begin a line; continuation lines belong to the previous option.
export function parseV81Options(text) {
  const options = [];
  for (const line of clean(text).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z])[.)]\s+(.+)$/);
    if (match) options.push({ code: match[1], text: match[2].trim() });
    else if (options.length) options[options.length - 1].text += `\n${line}`;
    else if (line.trim()) throw new Error("Pilihan harus dimulai label A., B., dan seterusnya.");
  }
  if (options.length < 2 || new Set(options.map(o => o.code)).size !== options.length || options.some(o => !o.text.trim())) {
    throw new Error("Minimal dua pilihan/pernyataan dengan kode unik dan teks wajib diisi.");
  }
  return options;
}

export function parseV81Workbook(workbook, fileName = "workbook-v8.1.xlsx") {
  const issues = [];
  const questions = [];
  const seen = new Set();
  const sourceCounts = Object.create(null);
  const add = (sheet, row, field, message) => issues.push({ severity: "ERROR", sheet, row, field, message });
  for (const [sheet, config] of Object.entries(V81_SOURCES)) {
    const source = workbook.Sheets[sheet];
    sourceCounts[sheet] = 0;
    if (!source) { add(sheet, 1, "sheet", "Sheet sumber wajib tidak ditemukan."); continue; }
    const matrix = XLSX.utils.sheet_to_json(source, { header: 1, defval: "", raw: false });
    const headerIndex = matrix.findIndex(row => row.some(value => clean(value) === "ID Soal"));
    const headers = (matrix[headerIndex] || []).map(clean);
    try { validateHeaders(headers); } catch (error) { add(sheet, headerIndex + 1, "header", error.message); continue; }
    const missing = V81_HEADERS.filter(header => !headers.includes(header));
    if (missing.length) { add(sheet, headerIndex + 1, "header", `Kolom wajib tidak ditemukan: ${missing.join(", ")}`); continue; }
    for (let index = headerIndex + 1; index < matrix.length; index++) {
      const values = matrix[index];
      if (!values.some(value => clean(value))) continue;
      sourceCounts[sheet]++;
      const raw = Object.create(null);
      headers.forEach((header, i) => { if (header) raw[header] = clean(values[i]); });
      const row = index + 1;
      const id = raw["ID Soal"];
      if (!id || id.length > 200 || seen.has(id)) add(sheet, row, "ID Soal", "ID wajib diisi, maksimal 200 karakter, dan unik dalam workbook.");
      seen.add(id);
      const type = TYPES[raw["Bentuk Soal"]];
      if (!type) add(sheet, row, "Bentuk Soal", "Jenis soal tidak dikenal.");
      if (raw.Jenjang !== (config.level === "sd" ? "SD/MI Kelas 6" : "SMP/MTs Kelas 9") || raw["Mata Pelajaran"] !== config.subject) {
        add(sheet, row, "Jenjang / Mata Pelajaran", "Jenjang atau mata pelajaran tidak sesuai sheet sumber.");
      }
      for (const field of ["Pertanyaan", "Tema / Cakupan", "Topik / Submateri", "Kunci Jawaban"]) {
        if (!raw[field]) add(sheet, row, field, "Nilai wajib diisi.");
      }
      if (!V81_STATUSES.includes(raw.Status)) add(sheet, row, "Status", "Status sumber tidak dikenali; impor diblokir.");
      if (!["Mudah", "Sedang", "Sulit"].includes(raw["Tingkat Kesulitan"])) add(sheet, row, "Tingkat Kesulitan", "Kesulitan tidak dikenali.");
      let options = [], category_items = [];
      try {
        const parsed = parseV81Options(raw["Pilihan Jawaban"]);
        if (type === "PGK_KATEGORI") {
          const keys = raw["Kunci Jawaban"].split(";").map(value => value.trim().match(/^([A-Z])\s*-\s*(Benar|Salah)$/));
          if (keys.some(key => !key) || keys.length !== parsed.length || new Set(keys.map(key => key[1])).size !== keys.length || keys.some(key => !parsed.some(o => o.code === key[1]))) {
            throw new Error("Kunci kategori harus memetakan setiap kode tepat sekali ke Benar/Salah.");
          }
          category_items = parsed.map((option, i) => ({ item_number: i + 1, item_text: option.text, category_label: "Benar/Salah", correct_category: keys.find(key => key[1] === option.code)[2] }));
        } else {
          const keys = raw["Kunci Jawaban"].split(",").map(clean);
          if (keys.some(key => !parsed.some(o => o.code === key)) || new Set(keys).size !== keys.length || (type === "PG_TUNGGAL" && keys.length !== 1)) {
            throw new Error("Kunci harus menunjuk pilihan yang tersedia; PG tepat satu, MCMA minimal satu, tanpa kunci duplikat.");
          }
          options = parsed.map((option, i) => ({ option_code: option.code, option_text: option.text, option_order: i + 1, is_correct: keys.includes(option.code) }));
        }
      } catch (error) { add(sheet, row, "Pilihan / Kunci Jawaban", error.message); }
      questions.push({
        id, sheet, rowNumber: row, raw, level: config.level, grade: config.grade, subject: config.subject,
        type, material: raw["Tema / Cakupan"], sub_material: raw["Topik / Submateri"],
        competency: raw["Kompetensi Membaca TKA"], indicator: raw["Indikator / Subkompetensi"],
        element: raw["Fokus Proses Membaca"], difficulty: raw["Tingkat Kesulitan"].toUpperCase(),
        question_text: raw.Pertanyaan, explanation: raw.Pembahasan, stimulus: raw.Stimulus,
        source_status: raw.Status, needs_reconstruction: raw.Status === V81_STATUSES[1], options, category_items,
      });
    }
    if (sourceCounts[sheet] !== config.count) add(sheet, 1, "jumlah", `Diharapkan ${config.count} soal, ditemukan ${sourceCounts[sheet]}.`);
  }
  if (questions.length !== 474) add("WORKBOOK", 1, "jumlah", `Diharapkan total 474 soal, ditemukan ${questions.length}.`);
  const invalid = new Set(issues.map(issue => `${issue.sheet}:${issue.row}`));
  return {
    format: "TRYOUT_V8_1", fileName, questions, issues,
    totalSheets: workbook.SheetNames.length,
    recognizedSheets: workbook.SheetNames.filter(name => Object.hasOwn(V81_SOURCES, name)),
    ignoredSheets: workbook.SheetNames.filter(name => !Object.hasOwn(V81_SOURCES, name)),
    sourceCounts, questionCount: questions.length, totalRows: questions.length,
    counts: { ERROR: issues.length, WARNING: 0, VALID: questions.filter(q => !invalid.has(`${q.sheet}:${q.rowNumber}`)).length },
    breakdown: { jenjang: countBy(questions, "level"), mapel: countBy(questions, "subject"), jenis: countBy(questions, "type"), status: countBy(questions, "source_status") },
  };
}
