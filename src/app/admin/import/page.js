"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

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
const yes = (value) => ["YA", "YES", "TRUE", "1"].includes(upper(value));
const no = (value) => ["TIDAK", "NO", "FALSE", "0"].includes(upper(value));

/* =========================================================
   PEMBACAAN SHEET EXCEL
   Mendukung header TQBS v2.1 dan v3.0
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

  const expectedHeader = headerCandidates[name];

  let headerIndex = -1;

  if (expectedHeader) {
    headerIndex = matrix.findIndex((row) =>
      row.some(
        (cell) => clean(cell).toLowerCase() === expectedHeader
      )
    );
  }

  // Format lama v2.1 menggunakan baris header ke-4.
  if (headerIndex === -1) {
    headerIndex = 3;
  }

  const headers = (matrix[headerIndex] || []).map(clean);

  const rows = matrix
    .slice(headerIndex + 1)
    .map((values, index) => {
      const data = {};

      headers.forEach((header, i) => {
        if (header) {
          data[header] = clean(values[i]);
        }
      });

      return {
        rowNumber: index + headerIndex + 2,
        data,
      };
    })
    .filter(({ data }) =>
      Object.values(data).some((value) => clean(value) !== "")
    );

  return {
    exists: true,
    headers,
    rows,
  };
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
      mapelMap.set(id, { ...data, rowNumber });
    }

    [
      "jenjang",
      "kelas",
      "satuan_pendidikan",
      "mata_pelajaran",
      "kategori_mapel",
      "indikator",
    ].forEach((field) => {
      if (!clean(data[field])) {
        add("ERROR", "MATA_PELAJARAN", rowNumber, field,
          `Kolom ${field} wajib diisi.`);
      }
    });

    if (
      data.jenjang &&
      !["SD", "SMP", "SMA", "SMK"].includes(upper(data.jenjang))
    ) {
      add("ERROR", "MATA_PELAJARAN", rowNumber, "jenjang",
        "Kode jenjang harus SD, SMP, SMA, atau SMK.");
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

    if (
      !clean(data.hak_penggunaan) ||
      !["ORISINAL", "BERLISENSI", "IZIN_TERTULIS", "DOMAIN_PUBLIK"]
        .includes(upper(data.hak_penggunaan))
    ) {
      add("ERROR", "STIMULUS", rowNumber, "hak_penggunaan",
        "Hak penggunaan wajib ORISINAL, BERLISENSI, IZIN_TERTULIS, atau DOMAIN_PUBLIK.");
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
      questionMap.set(id, { ...data, rowNumber });
    }

    [
      "mapel_id",
      "jenjang",
      "kelas",
      "satuan_pendidikan",
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
        `ID mata pelajaran ${data.mapel_id} tidak ditemukan.`);
    } else if (mapel) {
      ["jenjang", "kelas", "mata_pelajaran"].forEach((field) => {
        if (upper(data[field]) !== upper(mapel[field])) {
          add("ERROR", "SOAL", rowNumber, field,
            `Nilai ${field} tidak sesuai dengan data MATA_PELAJARAN.`);
        }
      });
    }

    const structure = upper(data.struktur_soal);
    const type = upper(data.jenis_soal);
    const stimulusId = clean(data.stimulus_id);

    if (!["SOAL_TUNGGAL", "SOAL_GRUP"].includes(structure)) {
      add("ERROR", "SOAL", rowNumber, "struktur_soal",
        "Struktur soal harus SOAL_TUNGGAL atau SOAL_GRUP.");
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

    if (!clean(data.sumber_referensi)) {
      add("WARNING", "SOAL", rowNumber, "sumber_referensi",
        "Referensi sumber soal belum dicantumkan.");
    }

    if (
      !clean(data.hak_penggunaan) ||
      !["ORISINAL", "BERLISENSI", "IZIN_TERTULIS", "DOMAIN_PUBLIK"]
        .includes(upper(data.hak_penggunaan))
    ) {
      add("ERROR", "SOAL", rowNumber, "hak_penggunaan",
        "Hak penggunaan wajib ORISINAL, BERLISENSI, IZIN_TERTULIS, atau DOMAIN_PUBLIK.");
    }
  });

  const responseMap = new Map();

  responseRows.forEach(({ rowNumber, data }) => {
    const id = clean(data.id_soal);

    if (!id) {
      add("ERROR", "RESPON_KUNCI", rowNumber, "id_soal",
        "ID soal pada respons wajib diisi.");
      return;
    }

    if (!questionMap.has(id)) {
      add("ERROR", "RESPON_KUNCI", rowNumber, "id_soal",
        `Soal dengan ID ${id} tidak ditemukan.`);
    }

    if (!responseMap.has(id)) {
      responseMap.set(id, []);
    }

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

    const codes = responses.map((r) => upper(r.data.kode_respon));

    responses.forEach((r) => {
      if (!clean(r.data.kode_respon) && type !== "PGK_KATEGORI") {
        add("ERROR", "RESPON_KUNCI", r.rowNumber, "kode_respon",
          "Kode respons wajib diisi.");
      }

      if (!clean(r.data.teks_respon)) {
        add("ERROR", "RESPON_KUNCI", r.rowNumber, "teks_respon",
          "Teks opsi atau pernyataan wajib diisi.");
      }
    });

    const validCodes = codes.filter(Boolean);

    if (
      type !== "PGK_KATEGORI" &&
      new Set(validCodes).size !== validCodes.length
    ) {
      add("ERROR", "RESPON_KUNCI", rowNumber, "kode_respon",
        `Ada kode respons ganda pada soal ${id}.`);
    }

    if (["PG_TUNGGAL", "PGK_MA"].includes(type)) {
      const correct = responses.filter((r) => yes(r.data.is_correct));

      if (responses.length < 2) {
        add("ERROR", "RESPON_KUNCI", rowNumber, "teks_respon",
          "Soal pilihan jawaban harus memiliki minimal dua opsi.");
      }

      responses.forEach((r) => {
        if (!yes(r.data.is_correct) && !no(r.data.is_correct)) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "is_correct",
            "Isi is_correct harus YA atau TIDAK.");
        }
      });

      if (type === "PG_TUNGGAL" && correct.length !== 1) {
        add("ERROR", "RESPON_KUNCI", rowNumber, "is_correct",
          `PG tunggal harus memiliki tepat satu kunci. Ditemukan ${correct.length}.`);
      }

      if (type === "PGK_MA" && correct.length < 1) {
        add("ERROR", "RESPON_KUNCI", rowNumber, "is_correct",
          "PGK multi-jawaban harus memiliki minimal satu kunci.");
      }
    } else if (type === "PGK_KATEGORI") {
      const seen = new Set();
      const nums = [];

      responses.forEach((r) => {
        const number = clean(r.data.nomor_pernyataan);
        const categories = clean(r.data.kategori_respon)
          .split(/[\/|;,]/)
          .map((v) => v.trim().toUpperCase())
          .filter(Boolean);

        const answer = upper(r.data.kunci_kategori);

        if (!number) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "nomor_pernyataan",
            "Nomor pernyataan wajib diisi.");
        } else if (seen.has(number)) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "nomor_pernyataan",
            "Nomor pernyataan ganda dalam satu soal.");
        } else {
          seen.add(number);
        }

        if (number) nums.push(Number(number));

        if (!categories.length) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "kategori_respon",
            "Daftar kategori wajib diisi, contoh: BENAR/SALAH.");
        }

        if (!answer) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "kunci_kategori",
            "Kunci kategori wajib diisi.");
        } else if (categories.length && !categories.includes(answer)) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "kunci_kategori",
            "Kunci kategori harus sama dengan salah satu kategori_respon.");
        }

        if (clean(r.data.is_correct)) {
          add("WARNING", "RESPON_KUNCI", r.rowNumber, "is_correct",
            "Untuk PGK_KATEGORI, kosongkan is_correct dan gunakan kunci_kategori.");
        }
      });

      const sorted = [...nums].sort((a, b) => a - b);

      if (
        sorted.length === responses.length &&
        sorted.some((n, i) => n !== i + 1)
      ) {
        add("WARNING", "RESPON_KUNCI", rowNumber, "nomor_pernyataan",
          "Nomor pernyataan sebaiknya berurutan mulai dari 1.");
      }
    }

    if (responses.every((r) => !clean(r.data.pembahasan_umum))) {
      add("ERROR", "RESPON_KUNCI", rowNumber, "pembahasan_umum",
        "Pembahasan umum soal belum diisi.");
    }
  });

  const groups = new Map();

  questionRows.forEach(({ rowNumber, data }) => {
    const stimulusId = clean(data.stimulus_id);

    if (
      upper(data.struktur_soal) !== "SOAL_GRUP" ||
      !stimulusId
    ) return;

    if (!groups.has(stimulusId)) {
      groups.set(stimulusId, []);
    }

    groups.get(stimulusId).push({ rowNumber, data });
  });

  groups.forEach((items, stimulusId) => {
    if (items.length < 2) {
      add("WARNING", "SOAL", items[0].rowNumber, "stimulus_id",
        `Stimulus grup ${stimulusId} baru digunakan oleh satu soal.`);
    }
  });

  return issues;
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

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [result, setResult] = useState(null);
  const [saveResult, setSaveResult] = useState(null);
  const [error, setError] = useState("");

  const [filter, setFilter] = useState("ALL");
  const [previewPage, setPreviewPage] = useState(1);

  /* Pemeriksaan hak akses Super Admin */

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

  /* Login */

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
    setResult(null);
    setSaveResult(null);
  }

  /* Membaca dan memvalidasi workbook */

  async function handleFile(file) {
    if (!file) return;

    setLoading(true);
    setError("");
    setResult(null);
    setSaveResult(null);
    setPreviewPage(1);

    try {
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        throw new Error("Format file harus .xlsx.");
      }

      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true,
        cellStyles: false,
      });

      const parsed = {};

      REQUIRED_SHEETS.forEach((name) => {
        parsed[name] = parseSheet(workbook, name);
      });

      const missing = REQUIRED_SHEETS.filter(
        (name) => !parsed[name].exists
      );

      if (missing.length) {
        throw new Error(
          `Sheet wajib tidak ditemukan: ${missing.join(", ")}`
        );
      }

      const issues = validateWorkbook(parsed);

      const counts = {
        ERROR: issues.filter((i) => i.severity === "ERROR").length,
        WARNING: issues.filter((i) => i.severity === "WARNING").length,
      };

      const invalidQuestionRows = new Set(
        issues
          .filter(
            (i) =>
              i.severity === "ERROR" &&
              i.sheet === "SOAL"
          )
          .map((i) => i.row)
      );

      counts.VALID = Math.max(
        0,
        parsed.SOAL.rows.length - invalidQuestionRows.size
      );

      const totalRows = OPERATIONAL_SHEETS.reduce(
        (sum, name) => sum + parsed[name].rows.length,
        0
      );

      setResult({
        fileName: file.name,
        fileSize: (file.size / 1024).toFixed(1),
        parsed,
        issues,
        counts,
        totalRows,
        questionCount: parsed.SOAL.rows.length,
        canProceed: counts.ERROR === 0,
      });

      setFilter("ALL");
    } catch (err) {
      setError(err.message || "File gagal divalidasi.");
    } finally {
      setLoading(false);
    }
  }

  /* Simpan ke Supabase
     Payload RPC tetap menggunakan struktur lama.
  */

  async function handleSave() {
    if (!result?.canProceed || !isAdmin) return;

    setSaving(true);
    setError("");
    setSaveResult(null);

    try {
      const payload = {
        fileName: result.fileName,
        templateVersion: "TQBS v2.1",
        counts: result.counts,
        issues: result.issues,
        sheets: Object.fromEntries(
          OPERATIONAL_SHEETS.map((name) => [
            name,
            result.parsed[name].rows,
          ])
        ),
      };

      const { data, error: rpcError } = await supabase.rpc(
        "save_question_import_batch",
        { p_payload: payload }
      );

      if (rpcError) throw rpcError;

      setSaveResult(data);
    } catch (err) {
      setError(err.message || "Gagal menyimpan batch ke Supabase.");
    } finally {
      setSaving(false);
    }
  }

  /* Data turunan untuk tampilan */

  const visibleIssues = useMemo(() => {
    if (!result) return [];

    return result.issues.filter(
      (issue) =>
        filter === "ALL" || issue.severity === filter
    );
  }, [result, filter]);

  const previewData = useMemo(() => {
    if (!result) return null;

    const responseMap = new Map();
    const stimulusMap = new Map();

    result.parsed.RESPON_KUNCI.rows.forEach((item) => {
      const id = clean(item.data.id_soal);

      if (!responseMap.has(id)) {
        responseMap.set(id, []);
      }

      responseMap.get(id).push(item);
    });

    result.parsed.STIMULUS.rows.forEach((item) => {
      stimulusMap.set(
        clean(item.data.stimulus_id),
        item
      );
    });

    return { responseMap, stimulusMap };
  }, [result]);

  const totalPages = result
    ? Math.max(1, Math.ceil(result.questionCount / PAGE_SIZE))
    : 1;

  const previewRows = result
    ? result.parsed.SOAL.rows.slice(
        (previewPage - 1) * PAGE_SIZE,
        previewPage * PAGE_SIZE
      )
    : [];

  /* Tampilan saat memeriksa sesi */

  if (!authReady) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-600">
        Memeriksa sesi Supabase…
      </main>
    );
  }

  /* Tampilan login */

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-50 p-5 grid place-items-center">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-xl font-bold text-white">
              T
            </div>

            <div>
              <h1 className="text-xl font-bold text-slate-900">
                TKA TryOn
              </h1>
              <p className="text-xs text-slate-500">
                Import Center · Super Admin
              </p>
            </div>
          </div>

          <h2 className="text-lg font-bold text-slate-900">
            Masuk ke Import Center
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Gunakan akun administrator yang sudah terdaftar di Supabase Auth.
          </p>

          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Email
          </label>

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-blue-500"
          />

          <label className="mt-4 block text-sm font-semibold text-slate-700">
            Password
          </label>

          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-blue-500"
          />

          {authError && (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {authError}
            </p>
          )}

          <button
            disabled={authLoading}
            className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {authLoading ? "Memeriksa…" : "Masuk"}
          </button>
        </form>
      </main>
    );
  }

  /* Penolakan akses */

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 p-5 grid place-items-center">
        <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-7 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            Akun belum memiliki akses Super Admin
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Login berhasil, tetapi akun ini belum tercatat dengan role{" "}
            <b>super_admin</b> pada tabel{" "}
            <code>user_global_roles</code>.
          </p>

          <button
            onClick={handleLogout}
            className="mt-5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Keluar
          </button>
        </section>
      </main>
    );
  }

  /* Dashboard Import Center */

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-800 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">

        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-widest text-blue-700">
              ACADEMIC CONTENT / IMPORT CENTER
            </p>

            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              Import Center
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Validasi dan simpan bank soal pusat TKA TryOn ke Supabase.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              ● Super Admin terverifikasi
            </span>

            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            >
              Keluar
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="font-bold text-blue-950">
            Standar workbook TQBS v2.1 / v3.0
          </h2>

          <p className="mt-2 text-sm text-blue-900">
            Sistem membaca posisi header secara otomatis dan memeriksa
            identitas, relasi data, jenis soal, respons, kunci, serta pembahasan.
          </p>

          <p className="mt-2 text-xs font-semibold text-blue-800">
            Lima sheet wajib: PETUNJUK, MATA_PELAJARAN, STIMULUS, SOAL,
            dan RESPON_KUNCI.
          </p>

          <p className="mt-2 text-xs text-blue-800">
            Bank soal yang lolos validasi teknis akan diterbitkan dengan
            status PUBLISHED melalui RPC yang sudah digunakan sebelumnya.
          </p>
        </section>

        <section className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="text-4xl">📊</div>

          <h2 className="mt-4 text-xl font-bold text-slate-900">
            Unggah File Bank Soal
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Pilih workbook Excel TQBS untuk menjalankan validator.
          </p>

          <label className="mt-6 inline-flex cursor-pointer items-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700">
            {loading ? "Memeriksa workbook…" : "Pilih File Excel"}

            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              disabled={loading || saving}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>

          <p className="mt-3 text-xs font-medium text-slate-500">
            Format .xlsx · TQBS v2.1 dan v3.0
          </p>
        </section>

        {loading && (
          <section className="rounded-xl border border-blue-200 bg-white p-5">
            <p className="font-semibold text-blue-800">
              Sedang membaca dan memvalidasi workbook…
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Tunggu sampai proses selesai. Jangan tutup halaman.
            </p>
          </section>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
            {error}
          </div>
        )}

        {saveResult && (
          <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
            <h2 className="font-bold text-emerald-900">
              Impor berhasil disimpan ke Supabase
            </h2>

            <div className="mt-3 grid gap-3 text-sm text-emerald-900 sm:grid-cols-2">
              <p>Kode batch: <b>{saveResult.batch_code}</b></p>
              <p>Soal diterbitkan: <b>{saveResult.questions_imported}</b></p>
              <p>Baris tersimpan: <b>{saveResult.rows_saved}</b></p>
              <p>Status publikasi: <b>{saveResult.publication_status}</b></p>
            </div>

            <p className="mt-2 break-all text-xs text-emerald-800">
              Batch ID: {saveResult.batch_id}
            </p>
          </section>
        )}

        {result && (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-bold text-slate-600">
                FILE DIPERIKSA
              </p>

              <h2 className="mt-1 break-all font-bold text-slate-900">
                {result.fileName}
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                {result.fileSize} KB · {result.totalRows} baris operasional ·{" "}
                {result.questionCount} butir soal
              </p>
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  label: "VALID",
                  value: result.counts.VALID,
                  color: "text-emerald-700",
                },
                {
                  label: "WARNING",
                  value: result.counts.WARNING,
                  color: "text-amber-700",
                },
                {
                  label: "ERROR",
                  value: result.counts.ERROR,
                  color: "text-red-700",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <p className="text-sm font-semibold text-slate-700">
                    {item.label}
                  </p>

                  <p className={`mt-2 text-3xl font-bold ${item.color}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-bold text-slate-900">
                Rincian Pembacaan Sheet
              </h2>

              <div className="mt-4 space-y-3">
                {OPERATIONAL_SHEETS.map((name) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-4"
                  >
                    <span className="font-semibold text-slate-800">
                      {name}
                    </span>

                    <span className="font-bold tabular-nums text-slate-800">
                      {result.parsed[name].rows.length} baris
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">
                    Hasil Validasi
                  </h2>

                  <p className="mt-1 text-sm text-slate-600">
                    Setiap masalah menunjukkan lokasi sheet dan baris Excel.
                  </p>
                </div>

                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                >
                  <option value="ALL">Semua hasil</option>
                  <option value="ERROR">Error</option>
                  <option value="WARNING">Warning</option>
                </select>
              </div>

              <div className="mt-4 space-y-3">
                {visibleIssues.length === 0 ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-medium text-emerald-900">
                    Tidak ditemukan masalah pada kategori ini.
                  </div>
                ) : (
                  visibleIssues.map((issue, index) => (
                    <div
                      key={`${issue.sheet}-${issue.row}-${issue.field}-${index}`}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            issue.severity === "ERROR"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {issue.severity}
                        </span>

                        <span className="text-xs font-bold text-slate-700">
                          {issue.sheet} · Baris {issue.row}
                        </span>

                        <span className="text-xs text-slate-600">
                          {issue.field}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-slate-800">
                        {issue.message}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section
              className={`rounded-xl border p-5 ${
                result.canProceed
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-red-300 bg-red-50"
              }`}
            >
              <h3
                className={`font-bold ${
                  result.canProceed
                    ? "text-emerald-900"
                    : "text-red-900"
                }`}
              >
                {result.canProceed
                  ? "Validasi teknis lolos"
                  : "Perlu perbaikan sebelum proses berikutnya"}
              </h3>

              <p
                className={`mt-2 text-sm ${
                  result.canProceed
                    ? "text-emerald-800"
                    : "text-red-800"
                }`}
              >
                {result.canProceed
                  ? "Tidak ditemukan error teknis. Warning tetap dicatat."
                  : "Perbaiki seluruh error terlebih dahulu. Workbook belum dapat diteruskan."}
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  disabled={
                    !result.canProceed ||
                    saving ||
                    !!saveResult
                  }
                  onClick={handleSave}
                  className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? "Menyimpan ke Supabase…"
                    : saveResult
                      ? "Sudah tersimpan"
                      : "Simpan & Terbitkan Bank Soal"}
                </button>

                <button
                  disabled={saving}
                  onClick={() => {
                    setResult(null);
                    setSaveResult(null);
                    setError("");
                    setFilter("ALL");
                    setPreviewPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                >
                  Periksa File Lain
                </button>
              </div>
            </section>

            {/* PRATINJAU SOAL DENGAN PAGINASI */}

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold tracking-widest text-blue-600">
                    ACADEMIC CONTENT / QUESTION PREVIEW
                  </p>

                  <h2 className="mt-2 text-xl font-bold text-slate-900">
                    Pratinjau Bank Soal
                  </h2>

                  <p className="mt-1 text-sm text-slate-600">
                    Periksa isi soal, stimulus, respons, kunci, dan pembahasan.
                  </p>
                </div>

                <span className="rounded-full bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">
                  {result.questionCount} Butir Soal
                </span>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">
                  Halaman {previewPage} dari {totalPages}
                  {" · "}
                  Menampilkan {previewRows.length} soal
                </p>

                <div className="flex gap-2">
                  <button
                    disabled={previewPage <= 1}
                    onClick={() =>
                      setPreviewPage((page) => Math.max(1, page - 1))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    ← Sebelumnya
                  </button>

                  <button
                    disabled={previewPage >= totalPages}
                    onClick={() =>
                      setPreviewPage((page) =>
                        Math.min(totalPages, page + 1)
                      )
                    }
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    Berikutnya →
                  </button>
                </div>
              </div>

              <div className="mt-5 space-y-5">
                {previewRows.map(({ data, rowNumber }, index) => {
                  const globalIndex =
                    (previewPage - 1) * PAGE_SIZE + index;

                  const responses =
                    previewData.responseMap.get(clean(data.id_soal)) || [];

                  const stimulus = previewData.stimulusMap.get(
                    clean(data.stimulus_id)
                  );

                  const correctAnswers =
                    upper(data.jenis_soal) === "PGK_KATEGORI"
                      ? responses
                          .map(
                            (item) =>
                              `${item.data.nomor_pernyataan}: ${item.data.kunci_kategori}`
                          )
                          .filter((value) => !value.endsWith(": "))
                      : responses
                          .filter((item) => yes(item.data.is_correct))
                          .map((item) => item.data.kode_respon);

                  const explanation =
                    responses.find(
                      (item) => clean(item.data.pembahasan_umum)
                    )?.data.pembahasan_umum || "Belum ada pembahasan.";

                  return (
                    <article
                      key={data.id_soal || rowNumber}
                      className="overflow-hidden rounded-2xl border border-slate-200"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-4">
                        <div>
                          <p className="text-xs font-semibold text-slate-500">
                            SOAL {String(globalIndex + 1).padStart(2, "0")}
                          </p>

                          <h3 className="mt-1 font-bold text-slate-900">
                            {data.id_soal}
                          </h3>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                            {data.jenjang} · KELAS {data.kelas}
                          </span>

                          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">
                            {data.jenis_soal}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-4 p-5">
                        <div className="grid gap-2 text-sm sm:grid-cols-2">
                          <p>
                            <b>Mata pelajaran:</b> {data.mata_pelajaran}
                          </p>

                          <p>
                            <b>Struktur:</b> {data.struktur_soal}
                          </p>
                        </div>

                        {stimulus && (
                          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                            <p className="mb-2 text-xs font-bold text-blue-800">
                              STIMULUS
                            </p>

                            {stimulus.data.judul && (
                              <h4 className="mb-2 font-bold text-slate-900">
                                {stimulus.data.judul}
                              </h4>
                            )}

                            {stimulus.data.konten_teks && (
                              <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
                                {stimulus.data.konten_teks}
                              </div>
                            )}

                            {stimulus.data.file_url && (
                              <a
                                href={stimulus.data.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-block text-sm font-semibold text-blue-700 underline"
                              >
                                Lihat media stimulus
                              </a>
                            )}
                          </div>
                        )}

                        <div>
                          <p className="mb-2 text-xs font-bold text-slate-500">
                            PERTANYAAN
                          </p>

                          <div className="whitespace-pre-wrap text-base font-semibold leading-7 text-slate-900">
                            {data.pertanyaan}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-bold text-slate-500">
                            PILIHAN / RESPONS
                          </p>

                          {responses.map((item, responseIndex) => {
                            const response = item.data;

                            const isCorrect =
                              yes(response.is_correct) ||
                              !!clean(response.kunci_kategori);

                            const isCategory =
                              upper(data.jenis_soal) === "PGK_KATEGORI";

                            return (
                              <div
                                key={`${data.id_soal}-${responseIndex}`}
                                className={`rounded-xl border p-3 ${
                                  isCorrect
                                    ? "border-emerald-200 bg-emerald-50"
                                    : "border-slate-200 bg-white"
                                }`}
                              >
                                <div className="flex flex-wrap items-start gap-3">
                                  <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-slate-100 px-2 text-xs font-bold text-slate-700">
                                    {response.kode_respon ||
                                      response.nomor_pernyataan}
                                  </span>

                                  <div className="min-w-0 flex-1">
                                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                                      {response.teks_respon}
                                    </p>

                                    {isCategory && (
                                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                        <span className="rounded-md bg-white px-2 py-1 font-semibold text-slate-700">
                                          Kategori: {response.kategori_respon}
                                        </span>

                                        <span className="rounded-md bg-emerald-100 px-2 py-1 font-bold text-emerald-800">
                                          Kunci: {response.kunci_kategori}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {isCorrect && (
                                    <span className="text-xs font-bold text-emerald-700">
                                      ✓ KUNCI
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {correctAnswers.length > 0 && (
                          <div className="rounded-xl bg-emerald-50 p-4">
                            <p className="text-xs font-bold text-emerald-800">
                              KUNCI JAWABAN
                            </p>

                            <p className="mt-1 text-lg font-extrabold text-emerald-700">
                              {correctAnswers.join(" · ")}
                            </p>
                          </div>
                        )}

                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                          <p className="text-xs font-bold text-amber-800">
                            PEMBAHASAN
                          </p>

                          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-800">
                            {explanation}
                          </p>
                        </div>

                        <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
                          Sumber: {data.sumber_referensi || "Belum dicantumkan"}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
                <p className="text-sm text-slate-500">
                  Halaman {previewPage} / {totalPages}
                </p>

                <div className="flex gap-2">
                  <button
                    disabled={previewPage <= 1}
                    onClick={() =>
                      setPreviewPage((page) => Math.max(1, page - 1))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    ← Sebelumnya
                  </button>

                  <button
                    disabled={previewPage >= totalPages}
                    onClick={() =>
                      setPreviewPage((page) =>
                        Math.min(totalPages, page + 1)
                      )
                    }
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    Berikutnya →
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

        <footer className="border-t border-slate-200 pt-5 text-center text-xs text-slate-400">
          © 2026 TKA TryOn · SKILL ON • CONFIDENCE ON
        </footer>
      </div>
    </main>
  );
}