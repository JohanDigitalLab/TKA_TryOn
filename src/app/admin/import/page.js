
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

/* =========================================================
   TKA TRYON — SMART IMPORT CENTER
   Satu pintu masuk seluruh sumber bank soal.
   Alur: Upload → Extract → Structure → Validate → Review → DRAFT
========================================================= */

const ACCEPTED_DOCUMENTS = [
  "docx", "pdf", "jpg", "jpeg", "png",
];

const ACCEPTED_SPREADSHEETS = [
  "xlsx", "xls", "csv",
];

const REQUIRED_SHEETS = [
  "PETUNJUK",
  "MATA_PELAJARAN",
  "STIMULUS",
  "SOAL",
  "RESPON_KUNCI",
];

const OPERATIONAL_SHEETS = REQUIRED_SHEETS.slice(1);
const PAGE_SIZE = 10;

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

const yes = (value) =>
  ["YA", "YES", "TRUE", "1"].includes(upper(value));

const no = (value) =>
  ["TIDAK", "NO", "FALSE", "0"].includes(upper(value));

const makeId = () =>
  `Q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const formatBytes = (bytes) => {
  if (!bytes) return "0 KB";
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
};

const normalizeJenjang = (value) => {
  const v = upper(value);

  if (["SD", "MI"].includes(v)) return "SD";
  if (["SMP", "MTS", "MTs".toUpperCase()].includes(v)) return "SMP";
  if (["SMA", "MA"].includes(v)) return "SMA";
  if (["SMK"].includes(v)) return "SMK";

  return v;
};

/* =========================================================
   PEMBACAAN WORKBOOK TQBS
========================================================= */

function parseSheet(workbook, name) {
  const ws = workbook.Sheets[name];

  if (!ws) {
    return { exists: false, headers: [], rows: [] };
  }

  const matrix = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    raw: false,
  });

  const headerCandidates = {
    MATA_PELAJARAN: "mapel_id",
    STIMULUS: "stimulus_id",
    SOAL: "id_soal",
    RESPON_KUNCI: "id_soal",
  };

  const expected = headerCandidates[name];

  let headerIndex = matrix.findIndex((row) =>
    row.some((cell) => upper(cell) === upper(expected || "__NONE__"))
  );

  if (headerIndex < 0) {
    headerIndex = 3;
  }

  const headers = (matrix[headerIndex] || []).map(clean);

  const rows = matrix
    .slice(headerIndex + 1)
    .map((values, index) => {
      const data = {};

      headers.forEach((header, i) => {
        if (header) data[header] = clean(values[i]);
      });

      return {
        rowNumber: headerIndex + index + 2,
        data,
      };
    })
    .filter(({ data }) =>
      Object.values(data).some((value) => clean(value))
    );

  return { exists: true, headers, rows };
}

/* =========================================================
   VALIDATOR TQBS
========================================================= */

function validateWorkbook(sheets) {
  const issues = [];

  const add = (severity, sheet, row, field, message) => {
    issues.push({ severity, sheet, row, field, message });
  };

  const mapelRows = sheets.MATA_PELAJARAN.rows;
  const stimulusRows = sheets.STIMULUS.rows;
  const questionRows = sheets.SOAL.rows;
  const responseRows = sheets.RESPON_KUNCI.rows;

  const mapelMap = new Map();
  const stimulusMap = new Map();
  const questionMap = new Map();
  const responseMap = new Map();

  mapelRows.forEach(({ rowNumber, data }) => {
    const id = clean(data.mapel_id);

    if (!id) {
      add("ERROR", "MATA_PELAJARAN", rowNumber, "mapel_id",
        "ID mata pelajaran wajib diisi.");
      return;
    }

    if (mapelMap.has(id)) {
      add("ERROR", "MATA_PELAJARAN", rowNumber, "mapel_id",
        `ID mata pelajaran duplikat: ${id}.`);
    } else {
      mapelMap.set(id, data);
    }

    [
      "jenjang",
      "kelas",
      "satuan_pendidikan",
      "mata_pelajaran",
      "kategori_mapel",
    ].forEach((field) => {
      if (!clean(data[field])) {
        add("ERROR", "MATA_PELAJARAN", rowNumber, field,
          `Kolom ${field} wajib diisi.`);
      }
    });

    if (
      data.jenjang &&
      !["SD", "SMP", "SMA", "SMK"].includes(
        normalizeJenjang(data.jenjang)
      )
    ) {
      add("ERROR", "MATA_PELAJARAN", rowNumber, "jenjang",
        "Jenjang harus SD/MI, SMP/MTs, SMA/MA, atau SMK.");
    }
  });

  stimulusRows.forEach(({ rowNumber, data }) => {
    const id = clean(data.stimulus_id);

    if (!id) {
      add("ERROR", "STIMULUS", rowNumber, "stimulus_id",
        "ID stimulus wajib diisi.");
      return;
    }

    if (stimulusMap.has(id)) {
      add("ERROR", "STIMULUS", rowNumber, "stimulus_id",
        `ID stimulus duplikat: ${id}.`);
    } else {
      stimulusMap.set(id, data);
    }

    if (!clean(data.jenis_stimulus)) {
      add("ERROR", "STIMULUS", rowNumber, "jenis_stimulus",
        "Jenis stimulus wajib diisi.");
    }

    if (!clean(data.konten_teks) && !clean(data.file_url)) {
      add("ERROR", "STIMULUS", rowNumber, "konten_teks",
        "Stimulus harus memiliki teks atau file media.");
    }
  });

  questionRows.forEach(({ rowNumber, data }) => {
    const id = clean(data.id_soal);

    if (!id) {
      add("ERROR", "SOAL", rowNumber, "id_soal",
        "ID soal wajib diisi.");
      return;
    }

    if (questionMap.has(id)) {
      add("ERROR", "SOAL", rowNumber, "id_soal",
        `ID soal duplikat: ${id}.`);
    } else {
      questionMap.set(id, data);
    }

    [
      "mapel_id",
      "jenjang",
      "kelas",
      "mata_pelajaran",
      "struktur_soal",
      "jenis_soal",
      "pertanyaan",
    ].forEach((field) => {
      if (!clean(data[field])) {
        add("ERROR", "SOAL", rowNumber, field,
          `Kolom ${field} wajib diisi.`);
      }
    });

    const mapel = mapelMap.get(clean(data.mapel_id));

    if (clean(data.mapel_id) && !mapel) {
      add("ERROR", "SOAL", rowNumber, "mapel_id",
        `Mata pelajaran ${data.mapel_id} tidak ditemukan.`);
    }

    if (mapel) {
      ["jenjang", "kelas", "mata_pelajaran"].forEach((field) => {
        if (upper(data[field]) !== upper(mapel[field])) {
          add("ERROR", "SOAL", rowNumber, field,
            `Data ${field} tidak sesuai dengan MATA_PELAJARAN.`);
        }
      });
    }

    const structure = upper(data.struktur_soal);
    const type = upper(data.jenis_soal);
    const stimulusId = clean(data.stimulus_id);

    if (!["SOAL_TUNGGAL", "SOAL_GRUP"].includes(structure)) {
      add("ERROR", "SOAL", rowNumber, "struktur_soal",
        "Struktur harus SOAL_TUNGGAL atau SOAL_GRUP.");
    }

    if (!["PG_TUNGGAL", "PGK_MA", "PGK_KATEGORI"].includes(type)) {
      add("ERROR", "SOAL", rowNumber, "jenis_soal",
        "Jenis soal tidak dikenali.");
    }

    if (structure === "SOAL_GRUP" && !stimulusId) {
      add("ERROR", "SOAL", rowNumber, "stimulus_id",
        "Soal grup wajib menggunakan stimulus.");
    }

    if (stimulusId && !stimulusMap.has(stimulusId)) {
      add("ERROR", "SOAL", rowNumber, "stimulus_id",
        `Stimulus ${stimulusId} tidak ditemukan.`);
    }

    if (!clean(data.hak_penggunaan)) {
      add("WARNING", "SOAL", rowNumber, "hak_penggunaan",
        "Hak penggunaan sumber belum dicantumkan.");
    }
  });

  responseRows.forEach(({ rowNumber, data }) => {
    const id = clean(data.id_soal);

    if (!id) {
      add("ERROR", "RESPON_KUNCI", rowNumber, "id_soal",
        "ID soal pada respons wajib diisi.");
      return;
    }

    if (!questionMap.has(id)) {
      add("ERROR", "RESPON_KUNCI", rowNumber, "id_soal",
        `Soal ${id} tidak ditemukan.`);
    }

    if (!responseMap.has(id)) responseMap.set(id, []);
    responseMap.get(id).push({ rowNumber, data });
  });

  questionRows.forEach(({ rowNumber, data }) => {
    const id = clean(data.id_soal);
    if (!id) return;

    const type = upper(data.jenis_soal);
    const responses = responseMap.get(id) || [];

    if (!responses.length) {
      add("ERROR", "SOAL", rowNumber, "id_soal",
        "Soal belum memiliki respons atau kunci jawaban.");
      return;
    }

    responses.forEach((response) => {
      const item = response.data;

      if (type !== "PGK_KATEGORI" && !clean(item.kode_respon)) {
        add("ERROR", "RESPON_KUNCI", response.rowNumber, "kode_respon",
          "Kode respons wajib diisi.");
      }

      if (!clean(item.teks_respon)) {
        add("ERROR", "RESPON_KUNCI", response.rowNumber, "teks_respon",
          "Teks opsi/pernyataan wajib diisi.");
      }
    });

    if (["PG_TUNGGAL", "PGK_MA"].includes(type)) {
      const codes = responses.map((r) => upper(r.data.kode_respon));
      const correct = responses.filter((r) => yes(r.data.is_correct));

      if (responses.length < 2) {
        add("ERROR", "RESPON_KUNCI", rowNumber, "teks_respon",
          "Soal pilihan jawaban minimal memiliki dua opsi.");
      }

      if (new Set(codes).size !== codes.length) {
        add("ERROR", "RESPON_KUNCI", rowNumber, "kode_respon",
          "Kode opsi tidak boleh duplikat.");
      }

      responses.forEach((r) => {
        if (!yes(r.data.is_correct) && !no(r.data.is_correct)) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "is_correct",
            "is_correct harus YA atau TIDAK.");
        }
      });

      if (type === "PG_TUNGGAL" && correct.length !== 1) {
        add("ERROR", "RESPON_KUNCI", rowNumber, "is_correct",
          "PG tunggal harus memiliki tepat satu kunci jawaban.");
      }

      if (type === "PGK_MA" && correct.length < 1) {
        add("ERROR", "RESPON_KUNCI", rowNumber, "is_correct",
          "PGK multi-jawaban minimal memiliki satu kunci.");
      }
    }

    if (type === "PGK_KATEGORI") {
      const numbers = new Set();

      responses.forEach((r) => {
        const number = clean(r.data.nomor_pernyataan);
        const categories = clean(r.data.kategori_respon)
          .split(/[\/|;,]/)
          .map((v) => upper(v))
          .filter(Boolean);

        const answer = upper(r.data.kunci_kategori);

        if (!number || numbers.has(number)) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "nomor_pernyataan",
            "Nomor pernyataan wajib diisi dan tidak boleh duplikat.");
        }

        numbers.add(number);

        if (!categories.length || !answer) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "kategori_respon",
            "Kategori dan kunci kategori wajib diisi.");
        } else if (!categories.includes(answer)) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "kunci_kategori",
            "Kunci harus sesuai dengan salah satu kategori.");
        }
      });
    }

    if (responses.every((r) => !clean(r.data.pembahasan_umum))) {
      add("WARNING", "RESPON_KUNCI", rowNumber, "pembahasan_umum",
        "Pembahasan belum dicantumkan.");
    }
  });

  return issues;
}

/* =========================================================
   KONVERSI HASIL AI KE FORMAT EDITOR
========================================================= */

function normalizeAIQuestions(input, metadata) {
  const questions = Array.isArray(input)
    ? input
    : Array.isArray(input?.questions)
      ? input.questions
      : [];

  return questions.map((item, index) => ({
    id: item.id || makeId(),
    sourceNumber: index + 1,
    jenjang: normalizeJenjang(item.jenjang || metadata.jenjang),
    kelas: clean(item.kelas || metadata.kelas),
    satuan_pendidikan: clean(
      item.satuan_pendidikan || metadata.satuan_pendidikan
    ),
    mata_pelajaran: clean(
      item.mata_pelajaran || metadata.mata_pelajaran
    ),
    subject_code: clean(item.subject_code),
    struktur_soal: upper(item.struktur_soal || "SOAL_TUNGGAL"),
    jenis_soal: upper(item.jenis_soal || "PG_TUNGGAL"),
    pertanyaan: clean(item.pertanyaan || item.question_text),
    stimulus: clean(item.stimulus || item.stimulus_text),
    pembahasan: clean(item.pembahasan || item.explanation),
    hak_penggunaan: clean(
      item.hak_penggunaan || metadata.hak_penggunaan
    ),
    sumber_referensi: clean(item.sumber_referensi),
    kunci_confidence: item.kunci_confidence ?? null,
    perlu_verifikasi_kunci: item.perlu_verifikasi_kunci !== false,
    options: Array.isArray(item.options)
      ? item.options.map((option, optionIndex) => ({
          kode_respon: clean(
            option.kode_respon || option.code ||
            String.fromCharCode(65 + optionIndex)
          ),
          teks_respon: clean(option.teks_respon || option.text),
          is_correct: option.is_correct === true ||
            yes(option.is_correct),
        }))
      : [],
    category_items: Array.isArray(item.category_items)
      ? item.category_items.map((category, categoryIndex) => ({
          nomor_pernyataan: clean(
            category.nomor_pernyataan || category.number ||
            categoryIndex + 1
          ),
          teks_respon: clean(category.teks_respon || category.text),
          kategori_respon: clean(
            category.kategori_respon || category.categories || "BENAR/SALAH"
          ),
          kunci_kategori: clean(
            category.kunci_kategori || category.answer
          ),
        }))
      : [],
    review_status: "NEEDS_HUMAN_REVIEW",
  }));
}

/* =========================================================
   KOMPONEN UTAMA
========================================================= */

export default function ImportCenterPage() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [file, setFile] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [structuring, setStructuring] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedBatch, setSavedBatch] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [documentResult, setDocumentResult] = useState(null);
  const [workbookResult, setWorkbookResult] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [activeQuestion, setActiveQuestion] = useState(0);

  const [filter, setFilter] = useState("ALL");
  const [previewPage, setPreviewPage] = useState(1);

  const [metadata, setMetadata] = useState({
    jenjang: "",
    kelas: "",
    satuan_pendidikan: "",
    mata_pelajaran: "",
    hak_penggunaan: "ORISINAL",
  });

  /* -------------------------------------------------------
     AUTHENTICATION
  ------------------------------------------------------- */

  async function verifyAdmin(currentSession) {
    if (!currentSession?.user) {
      setIsAdmin(false);
      return;
    }

    const { data, error: roleError } = await supabase
      .from("user_global_roles")
      .select("role")
      .eq("user_id", currentSession.user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    setIsAdmin(!roleError && !!data);
  }

  useEffect(() => {
    let alive = true;

    async function init() {
      const { data } = await supabase.auth.getSession();

      if (!alive) return;

      setSession(data.session);
      await verifyAdmin(data.session);

      if (alive) setAuthReady(true);
    }

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);

        if (!nextSession) {
          setIsAdmin(false);
        } else {
          Promise.resolve().then(() => verifyAdmin(nextSession));
        }
      }
    );

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (loginError) throw loginError;
    } catch (err) {
      setAuthError(err.message || "Login gagal.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    setSession(null);
    setIsAdmin(false);
    resetImport();
  }

  /* -------------------------------------------------------
     RESET DAN METADATA
  ------------------------------------------------------- */

  function resetImport() {
    setFile(null);
    setFileInfo(null);
    setDocumentResult(null);
    setWorkbookResult(null);
    setSavedBatch(null);
    setSavingDraft(false);
    setQuestions([]);
    setActiveQuestion(0);
    setError("");
    setNotice("");
    setFilter("ALL");
    setPreviewPage(1);
  }

  function updateMetadata(field, value) {
    setMetadata((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  /* -------------------------------------------------------
     PROSES UPLOAD
  ------------------------------------------------------- */

  async function handleFile(selectedFile) {
    if (!selectedFile) return;

    resetImport();

    setFile(selectedFile);
    setLoading(true);

    try {
      if (selectedFile.size > 20 * 1024 * 1024) {
        throw new Error("Ukuran file melebihi batas 20 MB.");
      }

      const extension = selectedFile.name
        .split(".")
        .pop()
        .toLowerCase();

      setFileInfo({
        name: selectedFile.name,
        extension,
        size: formatBytes(selectedFile.size),
        type: selectedFile.type,
      });

      if (
        ACCEPTED_SPREADSHEETS.includes(extension)
      ) {
        await processSpreadsheet(selectedFile, extension);
        return;
      }

      if (
        ACCEPTED_DOCUMENTS.includes(extension)
      ) {
        await processDocument(selectedFile);
        return;
      }

      throw new Error(
        "Format file belum didukung. Gunakan XLSX, XLS, CSV, DOCX, PDF, JPG, JPEG, atau PNG."
      );
    } catch (err) {
      setError(err.message || "File gagal diproses.");
    } finally {
      setLoading(false);
    }
  }

  async function processSpreadsheet(selectedFile, extension) {
    const buffer = await selectedFile.arrayBuffer();

    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
      raw: false,
    });

    if (extension === "csv") {
      const firstSheet = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(
        workbook.Sheets[firstSheet],
        { defval: "", raw: false }
      );

      setDocumentResult({
        fileName: selectedFile.name,
        extractionMethod: "CSV Parser",
        extractedText: JSON.stringify(rows, null, 2),
        pageCount: 1,
        warnings: [
          "CSV dibaca sebagai data tabel. Pemetaan kolom ke format TQBS perlu diperiksa.",
        ],
      });

      setNotice(
        "CSV berhasil dibaca. Lanjutkan pemetaan menjadi struktur soal."
      );
      return;
    }

    const parsed = {};

    REQUIRED_SHEETS.forEach((name) => {
      parsed[name] = parseSheet(workbook, name);
    });

    const missing = REQUIRED_SHEETS.filter(
      (name) => !parsed[name].exists
    );

    if (missing.length) {
      throw new Error(
        `Sheet wajib tidak ditemukan: ${missing.join(", ")}. Untuk workbook non-TQBS, gunakan proses konversi dokumen.`
      );
    }

    const issues = validateWorkbook(parsed);

    const counts = {
      ERROR: issues.filter((item) => item.severity === "ERROR").length,
      WARNING: issues.filter((item) => item.severity === "WARNING").length,
    };

    const invalidQuestionRows = new Set(
      issues
        .filter((item) =>
          item.severity === "ERROR" && item.sheet === "SOAL"
        )
        .map((item) => item.row)
    );

    counts.VALID = Math.max(
      0,
      parsed.SOAL.rows.length - invalidQuestionRows.size
    );

    const totalRows = OPERATIONAL_SHEETS.reduce(
      (sum, name) => sum + parsed[name].rows.length,
      0
    );

    setWorkbookResult({
      fileName: selectedFile.name,
      parsed,
      issues,
      counts,
      totalRows,
      questionCount: parsed.SOAL.rows.length,
    });

    setNotice(
      "Workbook TQBS berhasil dibaca dan divalidasi. Periksa hasilnya sebelum melanjutkan."
    );
  }

  async function processDocument(selectedFile) {
    if (!session?.access_token) {
      throw new Error(
        "Sesi login tidak ditemukan. Silakan login kembali."
      );
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    const response = await fetch("/api/import/extract", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.success) {
      throw new Error(
        payload.message || "Dokumen gagal diekstrak."
      );
    }

    setDocumentResult(payload.data);

    setNotice(
      "Ekstraksi selesai. Teks sumber siap diproses menjadi struktur soal."
    );
  }

  /* -------------------------------------------------------
     AI STRUCTURING
     Endpoint server-side: /api/import/structure
     API ini harus dibuat sebelum fitur AI dapat digunakan.
  ------------------------------------------------------- */

  async function handleAIProcess() {
    if (!documentResult?.extractedText) {
      setError("Tidak ada teks hasil ekstraksi untuk diproses.");
      return;
    }

    if (!metadata.jenjang || !metadata.kelas ||
        !metadata.mata_pelajaran) {
      setError(
        "Lengkapi jenjang, kelas, dan mata pelajaran sebelum menyusun soal."
      );
      return;
    }

    if (!session?.access_token) {
      setError("Sesi login tidak ditemukan.");
      return;
    }

    setStructuring(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/import/structure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          sourceText: documentResult.extractedText,
          sourceFileName: fileInfo?.name || "",
          metadata,
          instructions: {
            outputFormat: "TKA_TRYON_NORMALIZED",
            questionTypes: [
              "PG_TUNGGAL",
              "PGK_MA",
              "PGK_KATEGORI",
            ],
            preserveSourceMeaning: true,
            neverInventAnswerKey: true,
            uncertainAnswerKeyMustBeFlagged: true,
            requireExplanation: true,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.message ||
          "AI belum dapat menyusun struktur soal. Pastikan endpoint /api/import/structure sudah tersedia."
        );
      }

      const normalized = normalizeAIQuestions(
        payload.data,
        metadata
      );

      if (!normalized.length) {
        throw new Error(
          "AI tidak menghasilkan soal terstruktur dari sumber ini."
        );
      }

      setQuestions(normalized);
      setActiveQuestion(0);
      setNotice(
        `${normalized.length} soal berhasil disusun. Seluruh soal tetap berstatus perlu telaah manusia.`
      );
    } catch (err) {
      setError(err.message || "Pemrosesan AI gagal.");
    } finally {
      setStructuring(false);
    }
  }

  /* -------------------------------------------------------
     SIMPAN HASIL AI SEBAGAI DRAFT
     RPC: public.save_ai_question_draft_batch
  ------------------------------------------------------- */

  async function handleSaveDraft() {
    if (savingDraft) return;

    setError("");
    setNotice("");

    if (!session?.access_token) {
      setError("Sesi login tidak ditemukan. Silakan login kembali.");
      return;
    }

    if (!isAdmin) {
      setError("Akses ditolak. Fitur ini hanya untuk Super Admin.");
      return;
    }

    if (!questions.length) {
      setError("Belum ada soal yang dapat disimpan.");
      return;
    }

    // Penandaan verifikasi kunci bukan penghalang penyimpanan DRAFT.
    // Soal tetap berstatus PENDING_REVIEW di database.
    const blockingIssues = questionIssues.filter(
      (issue) => !issue.includes("kunci jawaban masih harus diverifikasi manusia")
    );

    if (blockingIssues.length > 0) {
      setError(
        `Masih ada ${blockingIssues.length} kekurangan teknis. Perbaiki terlebih dahulu sebelum menyimpan DRAFT.`
      );
      return;
    }

    if (
      !metadata.jenjang ||
      !metadata.kelas ||
      !metadata.mata_pelajaran
    ) {
      setError(
        "Lengkapi jenjang, kelas, dan mata pelajaran terlebih dahulu."
      );
      return;
    }

    setSavingDraft(true);

    try {
      const payload = {
        fileName: fileInfo?.name || "smart-import-ai",
        metadata: {
          jenjang: metadata.jenjang,
          kelas: metadata.kelas,
          satuan_pendidikan: metadata.satuan_pendidikan || "",
          mata_pelajaran: metadata.mata_pelajaran,
          hak_penggunaan: metadata.hak_penggunaan || "ORISINAL",
        },
        questions: questions.map((question) => ({
          jenjang: question.jenjang || metadata.jenjang,
          kelas: question.kelas || metadata.kelas,
          satuan_pendidikan:
            question.satuan_pendidikan ||
            metadata.satuan_pendidikan ||
            "",
          mata_pelajaran:
            question.mata_pelajaran || metadata.mata_pelajaran,
          subject_code: question.subject_code || "",
          struktur_soal: question.struktur_soal || "SOAL_TUNGGAL",
          jenis_soal: question.jenis_soal || "PG_TUNGGAL",
          pertanyaan: question.pertanyaan || "",
          stimulus: question.stimulus || "",
          pembahasan: question.pembahasan || "",
          hak_penggunaan:
            question.hak_penggunaan ||
            metadata.hak_penggunaan ||
            "ORISINAL",
          sumber_referensi: question.sumber_referensi || "",
          options: Array.isArray(question.options)
            ? question.options.map((option) => ({
                kode_respon: option.kode_respon,
                teks_respon: option.teks_respon,
                is_correct: option.is_correct === true,
              }))
            : [],
          category_items: Array.isArray(question.category_items)
            ? question.category_items.map((item) => ({
                nomor_pernyataan: item.nomor_pernyataan,
                teks_respon: item.teks_respon,
                kategori_respon: item.kategori_respon,
                kunci_kategori: item.kunci_kategori,
              }))
            : [],
        })),
      };

      const { data, error: rpcError } = await supabase.rpc(
        "save_ai_question_draft_batch",
        { p_payload: payload }
      );

      if (rpcError) throw rpcError;

      if (!data?.success) {
        throw new Error(
          data?.message || "Supabase tidak mengonfirmasi penyimpanan."
        );
      }

      setSavedBatch(data);
      setNotice(
        `${data.questions_saved} soal berhasil disimpan sebagai DRAFT. Batch: ${data.batch_code}`
      );
    } catch (err) {
      console.error("Smart Import Draft Error:", err);
      setError(
        err.message ||
          "Terjadi kesalahan saat menyimpan DRAFT ke Supabase."
      );
    } finally {
      setSavingDraft(false);
    }
  }

  /* -------------------------------------------------------
     EDITOR SOAL
  ------------------------------------------------------- */

  function updateQuestion(index, field, value) {
    setQuestions((previous) =>
      previous.map((question, i) =>
        i === index
          ? { ...question, [field]: value }
          : question
      )
    );
  }

  function updateOption(questionIndex, optionIndex, field, value) {
    setQuestions((previous) =>
      previous.map((question, i) => {
        if (i !== questionIndex) return question;

        return {
          ...question,
          options: question.options.map((option, j) =>
            j === optionIndex
              ? { ...option, [field]: value }
              : option
          ),
        };
      })
    );
  }

  function updateCategoryItem(
    questionIndex,
    itemIndex,
    field,
    value
  ) {
    setQuestions((previous) =>
      previous.map((question, i) => {
        if (i !== questionIndex) return question;

        return {
          ...question,
          category_items: question.category_items.map((item, j) =>
            j === itemIndex
              ? { ...item, [field]: value }
              : item
          ),
        };
      })
    );
  }

  function addOption(questionIndex) {
    setQuestions((previous) =>
      previous.map((question, i) => {
        if (i !== questionIndex) return question;

        return {
          ...question,
          options: [
            ...question.options,
            {
              kode_respon: String.fromCharCode(
                65 + question.options.length
              ),
              teks_respon: "",
              is_correct: false,
            },
          ],
        };
      })
    );
  }

  function removeOption(questionIndex, optionIndex) {
    setQuestions((previous) =>
      previous.map((question, i) => {
        if (i !== questionIndex) return question;

        return {
          ...question,
          options: question.options.filter(
            (_, j) => j !== optionIndex
          ),
        };
      })
    );
  }

  function addCategoryItem(questionIndex) {
    setQuestions((previous) =>
      previous.map((question, i) => {
        if (i !== questionIndex) return question;

        return {
          ...question,
          category_items: [
            ...question.category_items,
            {
              nomor_pernyataan:
                String(question.category_items.length + 1),
              teks_respon: "",
              kategori_respon: "BENAR/SALAH",
              kunci_kategori: "",
            },
          ],
        };
      })
    );
  }

  /* -------------------------------------------------------
     VALIDASI HASIL NORMALISASI
  ------------------------------------------------------- */

  const questionIssues = useMemo(() => {
    const issues = [];

    questions.forEach((question, index) => {
      const prefix = `Soal ${index + 1}`;

      if (!question.pertanyaan) {
        issues.push(`${prefix}: teks pertanyaan kosong.`);
      }

      if (!question.jenjang || !question.kelas) {
        issues.push(`${prefix}: jenjang atau kelas belum lengkap.`);
      }

      if (!question.mata_pelajaran) {
        issues.push(`${prefix}: mata pelajaran belum diisi.`);
      }

      if (!question.pembahasan) {
        issues.push(`${prefix}: pembahasan belum tersedia.`);
      }

      if (!question.hak_penggunaan) {
        issues.push(`${prefix}: hak penggunaan belum ditentukan.`);
      }

      if (question.jenis_soal === "PG_TUNGGAL") {
        const correct = question.options.filter(
          (option) => option.is_correct
        );

        if (question.options.length < 2) {
          issues.push(`${prefix}: minimal dua pilihan jawaban.`);
        }

        if (correct.length !== 1) {
          issues.push(`${prefix}: PG tunggal harus memiliki tepat satu kunci.`);
        }
      }

      if (question.jenis_soal === "PGK_MA") {
        if (question.options.length < 2) {
          issues.push(`${prefix}: minimal dua pilihan jawaban.`);
        }

        if (!question.options.some((option) => option.is_correct)) {
          issues.push(`${prefix}: kunci PGK multi-jawaban belum ditentukan.`);
        }
      }

      if (question.jenis_soal === "PGK_KATEGORI") {
        if (!question.category_items.length) {
          issues.push(`${prefix}: pernyataan kategori belum tersedia.`);
        }

        question.category_items.forEach((item, itemIndex) => {
          if (!item.teks_respon || !item.kunci_kategori) {
            issues.push(
              `${prefix}: pernyataan ${itemIndex + 1} belum lengkap.`
            );
          }
        });
      }

      if (question.perlu_verifikasi_kunci) {
        issues.push(
          `${prefix}: kunci jawaban masih harus diverifikasi manusia.`
        );
      }
    });

    return issues;
  }, [questions]);

  const visibleQuestions = questions.slice(
    (previewPage - 1) * PAGE_SIZE,
    previewPage * PAGE_SIZE
  );

  const totalPages = Math.max(
    1,
    Math.ceil(questions.length / PAGE_SIZE)
  );

  /* -------------------------------------------------------
     LOGIN VIEW
  ------------------------------------------------------- */

  if (!authReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-600">
        Memeriksa sesi Supabase…
      </main>
    );
  }

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-5">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-700 text-xl font-bold text-white">
              T
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                TKA TryOn
              </h1>
              <p className="text-xs text-slate-500">
                Smart Import Center
              </p>
            </div>
          </div>

          <h2 className="text-lg font-bold text-slate-900">
            Masuk ke Import Center
          </h2>

          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900"
          />

          <label className="mt-4 block text-sm font-semibold text-slate-700">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900"
          />

          {authError && (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {authError}
            </p>
          )}

          <button
            disabled={authLoading}
            className="mt-5 w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {authLoading ? "Memeriksa…" : "Masuk"}
          </button>
        </form>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-5">
        <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-7">
          <h1 className="text-xl font-bold text-slate-900">
            Akses Super Admin diperlukan
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Akun ini belum memiliki role super_admin pada
            user_global_roles.
          </p>
          <button
            onClick={handleLogout}
            className="mt-5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            Keluar
          </button>
        </section>
      </main>
    );
  }

  /* =======================================================
     DASHBOARD SMART IMPORT
  ======================================================= */

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-800 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* HEADER */}

        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                <span>⌂</span>
                Dashboard
              </Link>
              <Link
                href="/admin/questions"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                <span>▤</span>
                Bank Soal
              </Link>
            </div>
            <p className="text-xs font-bold tracking-[0.18em] text-blue-700">
              TKA TRYON / ACADEMIC CONTENT
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              Smart Import Center
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Satu pintu masuk untuk seluruh sumber Bank Soal TKA TryOn.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              Super Admin terverifikasi
            </span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold"
            >
              Keluar
            </button>
          </div>
        </header>

        {/* PIPELINE */}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-900">
            Alur Smart Import
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["01", "Unggah"],
              ["02", "Ekstraksi"],
              ["03", "AI Structuring"],
              ["04", "Validasi"],
              ["05", "Telaah"],
              ["06", "DRAFT"],
            ].map(([number, label], index) => (
              <div
                key={number}
                className={`rounded-xl border p-3 ${
                  index === 0
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <p className="text-xs font-bold text-slate-500">
                  {number}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-800">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FORMAT SUMBER */}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              1. Unggah Sumber Bank Soal
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Pilih sumber soal yang akan dimasukkan ke Bank Soal TKA TryOn.
            </p>
          </div>

          <label className="mt-5 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-blue-400 hover:bg-blue-50">
            <span className="text-4xl">📚</span>
            <span className="mt-3 font-bold text-slate-900">
              {loading ? "Sedang memproses file…" : "Pilih atau jatuhkan file di sini"}
            </span>
            <span className="mt-2 text-sm text-slate-500">
              XLSX · XLS · CSV · DOCX · PDF · JPG · JPEG · PNG
            </span>
            <span className="mt-1 text-xs text-slate-400">
              Maksimal 20 MB per file
            </span>

            <input
              type="file"
              accept=".xlsx,.xls,.csv,.docx,.pdf,.jpg,.jpeg,.png"
              className="hidden"
              disabled={loading || structuring}
              onChange={(event) => {
                handleFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>

          {fileInfo && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
              <div className="min-w-0">
                <p className="break-all text-sm font-bold text-slate-900">
                  {fileInfo.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {fileInfo.extension.toUpperCase()} · {fileInfo.size}
                </p>
              </div>
              <button
                onClick={resetImport}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Hapus file
              </button>
            </div>
          )}
        </section>

        {/* METADATA */}

        {(documentResult || workbookResult) && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-900">
              2. Identitas Akademik Sumber
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Lengkapi informasi ini agar hasil impor masuk ke jenjang dan mata pelajaran yang tepat.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700">
                Jenjang
                <select
                  value={metadata.jenjang}
                  onChange={(event) => updateMetadata("jenjang", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                >
                  <option value="">Pilih jenjang</option>
                  <option value="SD">SD / MI</option>
                  <option value="SMP">SMP / MTs</option>
                  <option value="SMA">SMA / MA</option>
                  <option value="SMK">SMK</option>
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Kelas
                <select
                  value={metadata.kelas}
                  onChange={(event) => updateMetadata("kelas", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                >
                  <option value="">Pilih kelas</option>
                  {["6", "9", "12"].map((grade) => (
                    <option key={grade} value={grade}>
                      Kelas {grade}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Satuan Pendidikan
                <input
                  value={metadata.satuan_pendidikan}
                  onChange={(event) => updateMetadata("satuan_pendidikan", event.target.value)}
                  placeholder="Contoh: SD, MI, SMP, MTs, SMA, MA, SMK"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Mata Pelajaran
                <input
                  value={metadata.mata_pelajaran}
                  onChange={(event) => updateMetadata("mata_pelajaran", event.target.value)}
                  placeholder="Contoh: Matematika"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Hak Penggunaan
                <select
                  value={metadata.hak_penggunaan}
                  onChange={(event) => updateMetadata("hak_penggunaan", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                >
                  <option value="ORISINAL">Orisinal</option>
                  <option value="BERLISENSI">Berlisensi</option>
                  <option value="IZIN_TERTULIS">Izin tertulis</option>
                  <option value="DOMAIN_PUBLIK">Domain publik</option>
                </select>
              </label>
            </div>
          </section>
        )}

        {/* STATUS DAN ERROR */}

        {loading && (
          <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="font-semibold text-blue-900">
              Sedang membaca dan memproses sumber…
            </p>
            <p className="mt-1 text-sm text-blue-800">
              Proses dapat membutuhkan waktu, khususnya untuk dokumen hasil scan.
            </p>
          </section>
        )}

        {structuring && (
          <section className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <p className="font-semibold text-violet-900">
              AI sedang menyusun struktur soal…
            </p>
            <p className="mt-1 text-sm text-violet-800">
              AI mengekstrak pertanyaan, pilihan jawaban, stimulus, pembahasan, dan metadata. Kunci yang tidak meyakinkan harus ditandai untuk verifikasi manusia.
            </p>
          </section>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {notice}
          </div>
        )}

        {/* HASIL EKSTRAKSI DOKUMEN */}

        {documentResult && (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-widest text-blue-700">
                  EXTRACTION RESULT
                </p>
                <h2 className="mt-2 break-all text-lg font-bold text-slate-900">
                  {documentResult.fileName || fileInfo?.name}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Metode: {documentResult.extractionMethod || "Document Parser"}
                  {" · "}
                  {documentResult.pageCount || 1} halaman/lembar
                </p>
              </div>

              <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                HASIL EKSTRAKSI
              </span>
            </div>

            {documentResult.warnings?.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-bold text-amber-900">
                  Catatan proses ekstraksi
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                  {documentResult.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="font-bold text-slate-900">
                  Teks sumber
                </h3>
                <span className="text-xs text-slate-500">
                  {(documentResult.extractedText || "").length.toLocaleString("id-ID")} karakter
                </span>
              </div>

              <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-800">
                {documentResult.extractedText ||
                  "Tidak ditemukan teks yang dapat ditampilkan."}
              </pre>
            </div>

            {documentResult.pageResults?.length > 0 && (
              <details className="rounded-xl border border-slate-200 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  Lihat hasil ekstraksi per halaman
                </summary>
                <div className="mt-3 space-y-3">
                  {documentResult.pageResults.map((page, index) => (
                    <div
                      key={page.pageNumber || index}
                      className="rounded-lg bg-slate-50 p-3"
                    >
                      <p className="mb-1 text-xs font-bold text-slate-500">
                        HALAMAN {page.pageNumber || index + 1}
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {page.text || page.extractedText || "Tidak ada teks."}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={handleAIProcess}
                disabled={structuring || !documentResult.extractedText}
                className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {structuring ? "Menyusun soal…" : "Susun Soal dengan AI"}
              </button>

              <button
                onClick={() => {
                  setDocumentResult(null);
                  setQuestions([]);
                  setNotice("");
                }}
                className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700"
              >
                Tutup hasil ekstraksi
              </button>
            </div>
          </section>
        )}

        {/* HASIL WORKBOOK TQBS */}

        {workbookResult && (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
            <div>
              <p className="text-xs font-bold tracking-widest text-blue-700">
                TQBS VALIDATION
              </p>
              <h2 className="mt-2 break-all text-lg font-bold text-slate-900">
                {workbookResult.fileName}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {workbookResult.totalRows} baris operasional ·{" "}
                {workbookResult.questionCount} soal
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ["VALID", workbookResult.counts.VALID, "text-emerald-700"],
                ["WARNING", workbookResult.counts.WARNING, "text-amber-700"],
                ["ERROR", workbookResult.counts.ERROR, "text-red-700"],
              ].map(([label, value, color]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <p className="text-xs font-semibold text-slate-500">
                    {label}
                  </p>
                  <p className={`mt-2 text-3xl font-bold ${color}`}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-slate-900">
                Rincian validasi
              </h3>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="ALL">Semua</option>
                <option value="ERROR">Error</option>
                <option value="WARNING">Warning</option>
              </select>
            </div>

            <div className="space-y-2">
              {workbookResult.issues
                .filter((issue) =>
                  filter === "ALL" || issue.severity === filter
                )
                .map((issue, index) => (
                  <div
                    key={`${issue.sheet}-${issue.row}-${issue.field}-${index}`}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                        issue.severity === "ERROR"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {issue.severity}
                      </span>
                      <span className="text-xs font-semibold text-slate-700">
                        {issue.sheet} · Baris {issue.row}
                      </span>
                      <span className="text-xs text-slate-500">
                        {issue.field}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">
                      {issue.message}
                    </p>
                  </div>
                ))}

              {workbookResult.issues.filter((issue) =>
                filter === "ALL" || issue.severity === filter
              ).length === 0 && (
                <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
                  Tidak ditemukan masalah pada kategori ini.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                Workbook lolos validasi bukan berarti soal otomatis diterbitkan.
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Soal tetap harus melewati penyimpanan DRAFT dan telaah akademik.
              </p>
            </div>
          </section>
        )}

        {/* EDITOR SOAL HASIL AI */}

        {questions.length > 0 && (
          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-widest text-blue-700">
                  NORMALIZED QUESTION EDITOR
                </p>
                <h2 className="mt-2 text-xl font-bold text-slate-900">
                  3. Editor dan Telaah Awal Soal
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Periksa dan koreksi struktur soal sebelum diajukan ke telaah akademik.
                </p>
              </div>

              <span className="rounded-full bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">
                {questions.length} soal
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              {/* DAFTAR SOAL */}

              <aside className="space-y-2">
                <h3 className="mb-3 text-sm font-bold text-slate-700">
                  Daftar soal
                </h3>

                {questions.map((question, index) => (
                  <button
                    key={question.id}
                    onClick={() => setActiveQuestion(index)}
                    className={`w-full rounded-xl border p-3 text-left ${
                      activeQuestion === index
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-800">
                        Soal {index + 1}
                      </span>
                      <span className="text-[10px] font-bold text-amber-700">
                        PERLU TELAAH
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {question.pertanyaan || "Pertanyaan belum tersedia"}
                    </p>
                  </button>
                ))}
              </aside>

              {/* FORM EDITOR */}

              {questions[activeQuestion] && (() => {
                const question = questions[activeQuestion];
                const index = activeQuestion;

                return (
                  <div className="min-w-0 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-bold text-slate-900">
                        Edit Soal {index + 1}
                      </h3>
                      <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                        {question.review_status}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-semibold text-slate-700">
                        Jenjang
                        <select
                          value={question.jenjang}
                          onChange={(event) => updateQuestion(index, "jenjang", event.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                        >
                          <option value="SD">SD / MI</option>
                          <option value="SMP">SMP / MTs</option>
                          <option value="SMA">SMA / MA</option>
                          <option value="SMK">SMK</option>
                        </select>
                      </label>

                      <label className="text-sm font-semibold text-slate-700">
                        Kelas
                        <input
                          value={question.kelas}
                          onChange={(event) => updateQuestion(index, "kelas", event.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </label>

                      <label className="text-sm font-semibold text-slate-700">
                        Mata Pelajaran
                        <input
                          value={question.mata_pelajaran}
                          onChange={(event) => updateQuestion(index, "mata_pelajaran", event.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </label>

                      <label className="text-sm font-semibold text-slate-700">
                        Jenis Soal
                        <select
                          value={question.jenis_soal}
                          onChange={(event) => updateQuestion(index, "jenis_soal", event.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                        >
                          <option value="PG_TUNGGAL">Pilihan Ganda Tunggal</option>
                          <option value="PGK_MA">Pilihan Ganda Kompleks</option>
                          <option value="PGK_KATEGORI">Pilihan Ganda Kategori</option>
                        </select>
                      </label>
                    </div>

                    <label className="block text-sm font-semibold text-slate-700">
                      Stimulus
                      <textarea
                        rows={3}
                        value={question.stimulus}
                        onChange={(event) => updateQuestion(index, "stimulus", event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                        placeholder="Teks stimulus jika ada…"
                      />
                    </label>

                    <label className="block text-sm font-semibold text-slate-700">
                      Pertanyaan
                      <textarea
                        rows={5}
                        value={question.pertanyaan}
                        onChange={(event) => updateQuestion(index, "pertanyaan", event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                        placeholder="Teks pertanyaan…"
                      />
                    </label>

                    {question.jenis_soal !== "PGK_KATEGORI" && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-sm font-bold text-slate-800">
                            Pilihan jawaban
                          </h4>
                          <button
                            onClick={() => addOption(index)}
                            className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-bold text-blue-700"
                          >
                            + Tambah opsi
                          </button>
                        </div>

                        {question.options.map((option, optionIndex) => (
                          <div
                            key={`${question.id}-option-${optionIndex}`}
                            className="flex items-start gap-2 rounded-xl border border-slate-200 p-3"
                          >
                            <div className="w-12 shrink-0">
                              <input
                                value={option.kode_respon}
                                onChange={(event) => updateOption(index, optionIndex, "kode_respon", event.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-center text-sm font-bold"
                              />
                            </div>

                            <textarea
                              rows={2}
                              value={option.teks_respon}
                              onChange={(event) => updateOption(index, optionIndex, "teks_respon", event.target.value)}
                              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              placeholder="Teks pilihan jawaban"
                            />

                            <label className="flex shrink-0 flex-col items-center gap-1 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                checked={option.is_correct}
                                onChange={(event) => updateOption(index, optionIndex, "is_correct", event.target.checked)}
                                className="h-4 w-4"
                              />
                              Kunci
                            </label>

                            <button
                              onClick={() => removeOption(index, optionIndex)}
                              title="Hapus opsi"
                              className="rounded-lg px-2 py-1 text-sm font-bold text-red-600"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {question.jenis_soal === "PGK_KATEGORI" && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-sm font-bold text-slate-800">
                            Pernyataan dan kategori
                          </h4>
                          <button
                            onClick={() => addCategoryItem(index)}
                            className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-bold text-blue-700"
                          >
                            + Tambah pernyataan
                          </button>
                        </div>

                        {question.category_items.map((item, itemIndex) => (
                          <div
                            key={`${question.id}-category-${itemIndex}`}
                            className="space-y-2 rounded-xl border border-slate-200 p-3"
                          >
                            <p className="text-xs font-bold text-slate-500">
                              PERNYATAAN {itemIndex + 1}
                            </p>
                            <textarea
                              rows={2}
                              value={item.teks_respon}
                              onChange={(event) => updateCategoryItem(index, itemIndex, "teks_respon", event.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              placeholder="Tulis pernyataan…"
                            />
                            <div className="grid gap-2 sm:grid-cols-2">
                              <input
                                value={item.kategori_respon}
                                onChange={(event) => updateCategoryItem(index, itemIndex, "kategori_respon", event.target.value)}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                placeholder="Kategori, contoh BENAR/SALAH"
                              />
                              <input
                                value={item.kunci_kategori}
                                onChange={(event) => updateCategoryItem(index, itemIndex, "kunci_kategori", event.target.value)}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                placeholder="Kunci kategori"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <label className="block text-sm font-semibold text-slate-700">
                      Pembahasan
                      <textarea
                        rows={4}
                        value={question.pembahasan}
                        onChange={(event) => updateQuestion(index, "pembahasan", event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                        placeholder="Penjelasan jawaban…"
                      />
                    </label>

                    <label className="block text-sm font-semibold text-slate-700">
                      Referensi sumber
                      <input
                        value={question.sumber_referensi}
                        onChange={(event) => updateQuestion(index, "sumber_referensi", event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                        placeholder="Sumber atau referensi soal"
                      />
                    </label>

                    <label className="block text-sm font-semibold text-slate-700">
                      Hak penggunaan
                      <select
                        value={question.hak_penggunaan}
                        onChange={(event) => updateQuestion(index, "hak_penggunaan", event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      >
                        <option value="">Pilih hak penggunaan</option>
                        <option value="ORISINAL">Orisinal</option>
                        <option value="BERLISENSI">Berlisensi</option>
                        <option value="IZIN_TERTULIS">Izin tertulis</option>
                        <option value="DOMAIN_PUBLIK">Domain publik</option>
                      </select>
                    </label>

                    <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <input
                        type="checkbox"
                        checked={question.perlu_verifikasi_kunci}
                        onChange={(event) => updateQuestion(index, "perlu_verifikasi_kunci", event.target.checked)}
                        className="mt-1"
                      />
                      <span>
                        Kunci jawaban masih perlu diverifikasi oleh Guru/Moderator.
                      </span>
                    </label>

                    <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
                      <button
                        disabled={index === 0}
                        onClick={() => setActiveQuestion(index - 1)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40"
                      >
                        ← Soal sebelumnya
                      </button>
                      <button
                        disabled={index === questions.length - 1}
                        onClick={() => setActiveQuestion(index + 1)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40"
                      >
                        Soal berikutnya →
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {/* VALIDASI NORMALISASI */}

        {questions.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  4. Validasi Hasil Normalisasi
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Pemeriksaan teknis sebelum proses penyimpanan.
                </p>
              </div>
              <span className={`rounded-full px-3 py-2 text-xs font-bold ${
                questionIssues.length
                  ? "bg-amber-50 text-amber-800"
                  : "bg-emerald-50 text-emerald-800"
              }`}>
                {questionIssues.length
                  ? `${questionIssues.length} catatan`
                  : "Pemeriksaan teknis lolos"}
              </span>
            </div>

            {questionIssues.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {questionIssues.map((issue, index) => (
                  <li
                    key={index}
                    className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                  >
                    {issue}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
                Tidak ditemukan kekurangan teknis pada struktur soal. Validasi akademik tetap menjadi kewenangan Guru/Moderator.
              </p>
            )}

            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-950">
                Status penyimpanan: siap disimpan sebagai DRAFT
              </p>
              <p className="mt-1 text-sm leading-6 text-blue-900">
                Soal akan disimpan ke database TKA TryOn dalam status DRAFT.
                Kunci jawaban yang masih perlu diverifikasi tetap ditandai untuk
                telaah Guru/Moderator. Soal tidak otomatis dipublikasikan.
              </p>

              {questionIssues.length > 0 && (
                <p className="mt-2 text-xs leading-5 text-blue-900">
                  Catatan verifikasi kunci jawaban tidak menghalangi penyimpanan
                  DRAFT. Kekurangan teknis lainnya tetap harus diperbaiki.
                </p>
              )}

              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={
                  savingDraft ||
                  questionIssues.some(
                    (issue) =>
                      !issue.includes(
                        "kunci jawaban masih harus diverifikasi manusia"
                      )
                  ) ||
                  !questions.length
                }
                className="mt-4 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              >
                {savingDraft ? "Menyimpan Draft..." : "Simpan sebagai DRAFT"}
              </button>

              {savedBatch && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-bold text-emerald-800">
                    Draft berhasil disimpan!
                  </p>
                  <p className="mt-2 text-sm text-emerald-800">
                    Kode Batch: {savedBatch.batch_code}
                  </p>
                  <p className="text-sm text-emerald-800">
                    Jumlah soal: {savedBatch.questions_saved}
                  </p>
                  <p className="text-sm text-emerald-800">
                    Status publikasi: DRAFT
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* FOOTER */}

        <footer className="border-t border-slate-200 pt-5 text-center text-xs text-slate-400">
          © 2026 TKA TryOn · SKILL ON • CONFIDENCE ON
        </footer>
      </div>
    </main>
  );
}
