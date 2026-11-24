import test from "node:test";
import assert from "node:assert/strict";
import { formatTime, normalizeGrade, normalizeSubjects, normalizeType, normalizePayload, hasAnswer, getCategoryOptions, getExamConfig, getSimulationResults } from "../src/lib/student/exam.js";

test("helper ujian mempertahankan kontrak kelas, mapel dan tipe", () => {
  assert.equal(normalizeGrade({ level: "smp" }), 9);
  assert.equal(normalizeGrade({ grade: 12 }), 12);
  assert.deepEqual(normalizeSubjects({ subjects: [" Matematika ", ""] }), ["Matematika"]);
  assert.equal(normalizeType("pgk_ma"), "PGK_MA");
  assert.equal(normalizeType("unknown"), "PG_TUNGGAL");
  assert.equal(formatTime(65), "01:05");
  assert.equal(formatTime(-1), "00:00");
});

test("payload dan deteksi jawaban ketiga tipe soal", () => {
  assert.deepEqual(normalizePayload(null), { option_codes: [], category_answers: {} });
  assert.equal(hasAnswer({ option_codes: ["A"] }, "PG_TUNGGAL"), true);
  assert.equal(hasAnswer({ option_codes: ["A", "B"] }, "PGK_MA"), true);
  assert.equal(hasAnswer({ category_answers: { 1: "BENAR" } }, "PGK_KATEGORI"), true);
  assert.equal(hasAnswer(null, "PGK_KATEGORI"), false);
  assert.deepEqual(getCategoryOptions([{ category_label: "BENAR", category_options: ["BENAR", "SALAH"] }]), ["BENAR", "SALAH"]);
});

test("kategori aktif mengikuti label server per item tanpa opsi boolean buatan", () => {
  const items = [
    { item_number: 1, category_label: " Sesuai / Tidak Sesuai " },
    { item_number: 2, category_label: "Fakta / Opini / Prediksi" },
  ];
  assert.deepEqual(getCategoryOptions([items[0]]), ["Sesuai", "Tidak Sesuai"]);
  assert.deepEqual(getCategoryOptions([items[1]]), ["Fakta", "Opini", "Prediksi"]);
  assert.deepEqual(getCategoryOptions([{ category_label: "A / B", category_options: ["BENAR", "SALAH"] }]), ["A", "B"]);
  assert.deepEqual(getCategoryOptions([{ category_options: ["Ya", "Tidak", "Ya", null] }]), ["Ya", "Tidak"]);
  assert.deepEqual(getCategoryOptions([{}]), []);
});

test("akses storage tidak tersedia tidak menggagalkan prerender", () => {
  assert.deepEqual(getExamConfig(), {});
  assert.deepEqual(getSimulationResults(), []);
});
