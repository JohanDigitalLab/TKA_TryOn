import { ApiError, readBoundedBody } from "../server/http.mjs";

export const MAX_SOURCE_LENGTH = 60000;
export const MAX_JSON_BODY_SIZE = 256 * 1024;
export const QUESTION_TYPES = ["PG_TUNGGAL", "PGK_MA", "PGK_KATEGORI"];
const METADATA_KEYS = ["jenjang", "kelas", "satuan_pendidikan", "mata_pelajaran", "hak_penggunaan"];
const INSTRUCTIONS = {
  outputFormat: "TKA_TRYON_NORMALIZED",
  preserveSourceMeaning: true,
  neverInventAnswerKey: true,
  uncertainAnswerKeyMustBeFlagged: true,
  requireExplanation: true,
};

function invalid(message = "Payload tidak valid.") {
  throw new ApiError(400, message);
}

export function objectWithKeys(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid("Payload mengandung field yang tidak didukung.");
  return value;
}

export function text(value, name, { required = false, max = 120 } = {}) {
  if (value === undefined) {
    if (required) invalid(`${name} wajib diisi.`);
    return "";
  }
  if (typeof value !== "string") invalid(`${name} tidak valid.`);
  if (value.length > max) invalid(`${name} terlalu panjang.`);
  const result = value.trim();
  if (required && !result) invalid(`${name} wajib diisi.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) invalid(`${name} tidak valid.`);
  return result;
}

export function validateStructureBody(body) {
  objectWithKeys(body, ["sourceText", "sourceFileName", "metadata", "instructions"]);
  if (typeof body.sourceText === "string" && body.sourceText.length > MAX_SOURCE_LENGTH) {
    throw new ApiError(413, "Teks sumber maksimal 60.000 karakter.");
  }
  const sourceText = text(body.sourceText, "Teks sumber", { required: true, max: MAX_SOURCE_LENGTH });
  const sourceFileName = text(body.sourceFileName, "Nama file", { max: 255 });
  const raw = objectWithKeys(body.metadata, METADATA_KEYS);
  const metadata = {};
  for (const key of METADATA_KEYS) {
    metadata[key] = text(raw[key], `Metadata ${key}`, { required: ["jenjang", "kelas", "mata_pelajaran"].includes(key) });
  }
  const grades = { SD: "6", SMP: "9", SMA: "12", SMK: "12" };
  if (!grades[metadata.jenjang] || grades[metadata.jenjang] !== metadata.kelas) invalid("Jenjang dan kelas tidak sesuai.");
  if (metadata.hak_penggunaan && !["ORISINAL", "BERLISENSI", "IZIN_TERTULIS", "DOMAIN_PUBLIK"].includes(metadata.hak_penggunaan)) invalid("Hak penggunaan tidak valid.");

  const instructions = objectWithKeys(body.instructions === undefined ? {} : body.instructions, [...Object.keys(INSTRUCTIONS), "questionTypes"]);
  for (const [key, value] of Object.entries(instructions)) {
    if (key === "questionTypes") {
      if (!Array.isArray(value) || value.length < 1 || value.length > 3 || new Set(value).size !== value.length || value.some((item) => !QUESTION_TYPES.includes(item))) invalid("Jenis soal pada instruksi tidak valid.");
    } else if (value !== INSTRUCTIONS[key]) invalid("Instruksi tidak didukung.");
  }
  return { sourceText, sourceFileName, metadata, instructions };
}

export async function readJsonBody(request, maxBytes = MAX_JSON_BODY_SIZE) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "Content-Type harus application/json.");
  }
  const bytes = await readBoundedBody(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "Body JSON tidak valid.");
  }
}
