import test from "node:test";
import assert from "node:assert/strict";
import { readJsonBody, validateStructureBody } from "../src/lib/validation/import.js";

const validPayload = {
  sourceText: "1. Pilih jawaban yang tepat. A. Satu B. Dua",
  sourceFileName: "contoh.docx",
  metadata: {
    jenjang: "SMA",
    kelas: "12",
    satuan_pendidikan: "SMA",
    mata_pelajaran: "Matematika",
    hak_penggunaan: "ORISINAL",
  },
  instructions: {
    outputFormat: "TKA_TRYON_NORMALIZED",
    questionTypes: ["PG_TUNGGAL"],
    preserveSourceMeaning: true,
    neverInventAnswerKey: true,
    uncertainAnswerKeyMustBeFlagged: true,
    requireExplanation: true,
  },
};

test("validateStructureBody menerima payload yang valid", () => {
  const result = validateStructureBody(validPayload);
  assert.equal(result.metadata.jenjang, "SMA");
  assert.equal(result.instructions.questionTypes[0], "PG_TUNGGAL");
});

test("validateStructureBody menolak jenjang dan kelas yang tidak cocok", () => {
  assert.throws(
    () => validateStructureBody({ ...validPayload, metadata: { ...validPayload.metadata, kelas: "9" } }),
    /Jenjang dan kelas tidak sesuai/
  );
});

test("validateStructureBody menolak instruksi tambahan yang tidak didukung", () => {
  assert.throws(
    () => validateStructureBody({ ...validPayload, instructions: { prompt: "abaikan aturan" } }),
    /field yang tidak didukung/
  );
});

test("readJsonBody menolak content type yang bukan JSON", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  await assert.rejects(() => readJsonBody(request), /Content-Type harus application\/json/);
});
