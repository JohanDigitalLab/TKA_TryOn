
"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import { normalizePayload } from "@/lib/student/exam";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ScoreLineChart from "@/components/student/score-line-chart";
import { studentHistoryRequest, normalizeStudentHistory, studentResultSessions } from "@/lib/student/rpc-contract.mjs";

// =====================================================
// HELPER
// =====================================================

function formatDate(value) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
    });
  } catch {
    return "-";
  }
}

function getTypeLabel(type) {
  const value = String(type || "").toUpperCase();

  if (value === "PGK_MA") return "Pilihan Ganda Kompleks";
  if (value === "PGK_KATEGORI") return "Pilihan Ganda Kategori";

  return "Pilihan Ganda Tunggal";
}

function performanceLabel(score) {
  if (score >= 80) {
    return {
      label: "Kuat",
      tone: "text-success-ink bg-success-soft border-success-line",
    };
  }

  if (score >= 60) {
    return {
      label: "Cukup",
      tone: "text-warning-ink bg-warning-soft border-warning-line",
    };
  }

  return {
    label: "Perlu Pendalaman",
    tone: "text-danger-ink bg-danger-soft border-danger-line",
  };
}

function officialMathTheme(value, grade) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const themes = grade === 9
    ? new Map([
        ["bilangan", "Bilangan"],
        ["aljabar", "Aljabar"],
        ["geometri dan pengukuran", "Geometri dan Pengukuran"],
        ["data dan peluang", "Data dan Peluang"],
        ["objek geometri", "Geometri dan Pengukuran"],
        ["bangun datar", "Geometri dan Pengukuran"],
        ["bangun ruang", "Geometri dan Pengukuran"],
        ["transformasi geometri", "Geometri dan Pengukuran"],
        ["pengukuran", "Geometri dan Pengukuran"],
        ["data", "Data dan Peluang"],
        ["penyajian data", "Data dan Peluang"],
        ["peluang", "Data dan Peluang"],
      ])
    : new Map([
        ["bilangan", "Bilangan"],
        ["bilangan rasional", "Bilangan"],
        ["kelipatan dan faktor", "Bilangan"],
        ["operasi perkalian dan penjumlahan", "Bilangan"],
        ["operasi perkalian", "Bilangan"],
        ["operasi penjumlahan", "Bilangan"],
        ["operasi campuran", "Bilangan"],
        ["operasi bilangan cacah", "Bilangan"],
        ["operasi bilangan dan pemecahan masalah", "Bilangan"],
        ["kpk dan fpb", "Bilangan"],
        ["pecahan senilai", "Bilangan"],
        ["pembagian pecahan dengan bilangan asli", "Bilangan"],
        ["pengurangan pecahan", "Bilangan"],
        ["penjumlahan pecahan", "Bilangan"],
        ["perbandingan dan pengurutan pecahan", "Bilangan"],
        ["persentase dalam konteks belanja", "Bilangan"],
        ["persentase dan aritmetika sosial", "Bilangan"],
        ["geometri dan pengukuran", "Geometri dan Pengukuran"],
        ["objek geometri", "Geometri dan Pengukuran"],
        ["bangun datar", "Geometri dan Pengukuran"],
        ["bangun ruang", "Geometri dan Pengukuran"],
        ["pengukuran", "Geometri dan Pengukuran"],
        ["waktu", "Geometri dan Pengukuran"],
        ["konversi satuan panjang", "Geometri dan Pengukuran"],
        ["satuan massa", "Geometri dan Pengukuran"],
        ["waktu dan durasi", "Geometri dan Pengukuran"],
        ["pengukuran dan geometri", "Geometri dan Pengukuran"],
        ["keliling dan luas", "Geometri dan Pengukuran"],
        ["keliling persegi panjang", "Geometri dan Pengukuran"],
        ["luas gabungan sederhana", "Geometri dan Pengukuran"],
        ["volume balok", "Geometri dan Pengukuran"],
        ["kubus dan balok", "Geometri dan Pengukuran"],
        ["luas persegi panjang", "Geometri dan Pengukuran"],
        ["konstruksi bangun ruang dan visualisasi spasial", "Geometri dan Pengukuran"],
        ["data", "Data"],
        ["penyajian data", "Data"],
        ["diagram gambar", "Data"],
      ]);
  return themes.get(normalized) || "";
}

function getClassification(question, session = {}) {
  const classification = question.classification || {};
  const source = question.source_metadata || classification.source_metadata || classification.source || {};
  const topicNode = classification.topic && typeof classification.topic === "object"
    ? classification.topic
    : {};
  const topicFromNodes = Array.isArray(classification.nodes)
    ? classification.nodes.find((node) => node?.dimension === "topic")
    : null;
  const isMathematics = String(session.subject || question.subject || "").toLowerCase().includes("matematika");
  const grade = Number(session.grade || question.grade);
  const mathGrade = grade === 9 ? 9 : 6;
  const mathTheme = [
    question.element,
    source.element,
    classification.element,
    classification.math_domain,
    Array.isArray(classification.nodes)
      ? classification.nodes.find((node) => node?.dimension === "math_domain")?.label
      : "",
    // Data historis lama dapat menyimpan subelemen resmi pada material.
    source.material,
    source.sub_material,
  ].map((value) => officialMathTheme(value, mathGrade)).find(Boolean) || "";

  return {
    // Material/Tema lama dapat berisi konteks stimulus seperti "Belanja kebutuhan sekolah".
    // Untuk Matematika, hanya elemen resmi TKA yang boleh menjadi tema analitik.
    theme: isMathematics
      ? mathTheme
      : String(question.theme || source.material || source.theme || classification.material || "").trim(),
    topic: String(
      question.topic
      || source.sub_material
      || source.topic
      || classification.sub_material
      || topicNode.label
      || topicFromNodes?.label
      || question.competency
      || question.indicator
      || ""
    ).trim(),
  };
}

function buildAnalysis(results, field) {
  const buckets = new Map();

  results.forEach((session) => {
    (session.review?.questions || []).forEach((question) => {
      const classification = getClassification(question, session);
      const theme = classification.theme || "Tema belum tersedia";
      const topic = classification.topic || "Topik belum tersedia";
      const label = field === "theme" ? theme : `${theme} · ${topic}`;
      const current = buckets.get(label) || { label, theme, topic, total: 0, correct: 0 };
      current.total += 1;
      current.correct += question.is_correct === true ? 1 : 0;
      buckets.set(label, current);
    });
  });

  return Array.from(buckets.values())
    .map((item) => ({ ...item, score: item.total ? (item.correct / item.total) * 100 : 0 }))
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
}

function packageKey(item) {
  return item.packageId || item.simulationId || item.configSnapshot?.simulationId || item.attemptId;
}

function packageLabel(item) {
  const mode = item.mode === "mission" ? "Latihan" : "Simulasi TKA";
  return `${mode} · Kelas ${item.grade || "-"} · ${item.subject || "Paket"}`;
}
// =====================================================
// KOMPONEN REVIEW
// =====================================================

export function ReviewSession({ session, initiallyExpanded = false }) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const reviewId = useId();

  const questions = session.review?.questions || [];

  const renderAnswer = (item) => {
    const type = String(item.question_type || "").toUpperCase();
    const payload = normalizePayload(item.answer_payload);

    if (type === "PGK_KATEGORI") {
      return (
        <div className="mt-3 space-y-3">
          {(item.category_items || []).map((category) => {
            const number = String(category.item_number);
            const studentAnswer =
              payload.category_answers[number] || "Belum dijawab";

            return (
              <div
                key={number}
                className="rounded-lg border border-line p-3"
              >
                <p className="text-sm font-medium text-ink-body">
                  {category.item_number}. {category.item_text}
                </p>

                <p className="mt-2 text-sm text-ink-body">
                  Jawaban siswa:{" "}
                  <strong>{studentAnswer}</strong>
                </p>

                <p className="mt-1 text-sm text-success-ink">
                  Kunci:{" "}
                  <strong>{category.correct_category || "-"}</strong>
                </p>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="mt-3 space-y-2">
        {(item.options || []).map((option) => {
          const selected = payload.option_codes.includes(
            option.option_code
          );

          return (
            <div
              key={option.option_code}
              className={`rounded-lg border p-3 text-sm ${
                option.is_correct
                  ? "border-success-line bg-success-soft"
                  : selected
                  ? "border-danger-line bg-danger-soft"
                  : "border-line bg-surface"
              }`}
            >
              <div className="flex flex-wrap items-start gap-2 break-words">
                <strong>{option.option_code}.</strong>

                <span className="flex-1">
                  {option.option_text}
                </span>

                {selected && (
                  <span className="text-xs font-bold">
                    Jawaban siswa
                  </span>
                )}

                {option.is_correct && (
                  <span className="text-xs font-bold text-success-ink">
                    Kunci
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={reviewId}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-wrap items-center justify-between gap-4 p-5 text-left hover:bg-surface-muted"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">
            Sesi {session.subjectIndex + 1}
          </p>

          <h3 className="mt-1 text-lg font-extrabold text-ink">
            {session.subject}
          </h3>

          <p className="mt-1 text-xs text-ink-muted">
            {session.correctAnswers} benar dari{" "}
            {session.totalQuestions} soal
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-ink-muted">Nilai</p>
            <p className="text-2xl font-black text-accent-ink">
              {Number(session.score || 0).toFixed(2)}
            </p>
          </div>

          <span className="text-xl text-ink-muted">
            {expanded ? "−" : "+"}
          </span>
        </div>
      </button>

      {expanded && (
        <div id={reviewId} className="border-t border-line p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-surface-muted p-3">
              <p className="text-xs text-ink-muted">Total Soal</p>
              <p className="mt-1 text-xl font-bold">
                {session.totalQuestions}
              </p>
            </div>

            <div className="rounded-lg bg-success-soft p-3">
              <p className="text-xs text-success-ink">Benar</p>
              <p className="mt-1 text-xl font-bold text-success-ink">
                {session.correctAnswers}
              </p>
            </div>

            <div className="rounded-lg bg-danger-soft p-3">
              <p className="text-xs text-danger-ink">Salah</p>
              <p className="mt-1 text-xl font-bold text-danger-ink">
                {session.incorrectOrUnanswered}
              </p>
            </div>

            <div className="rounded-lg bg-surface-muted p-3">
              <p className="text-xs text-ink-muted">Terjawab</p>
              <p className="mt-1 text-xl font-bold">
                {session.answeredCount ?? "—"}
              </p>
            </div>
          </div>

          {!session.review && (
            <p className="mt-4 rounded-lg bg-warning-soft p-4 text-sm text-warning-ink">
              Data rincian review belum tersedia untuk sesi ini.
            </p>
          )}

          {session.review && questions.length === 0 && (
            <p className="mt-4 rounded-lg bg-surface-muted p-4 text-sm text-ink-secondary">
              Belum ada rincian soal yang dapat ditampilkan.
            </p>
          )}

          {questions.length > 0 && (
            <div className="mt-6 space-y-4">
              <h4 className="font-bold text-ink">
                Review Jawaban
              </h4>

              {questions.map((item, index) => (
                <article
                  key={item.question_id || index}
                  className="rounded-xl border border-line p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="font-bold text-ink">
                      Soal Nomor{" "}
                      {item.question_order || index + 1}
                    </h5>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        item.is_correct === true
                          ? "bg-success-tint text-success-ink"
                          : item.is_correct === false
                          ? "bg-danger-tint text-danger-ink"
                          : "bg-surface-raised text-ink-secondary"
                      }`}
                    >
                      {item.is_correct === true
                        ? "BENAR"
                        : item.is_correct === false
                        ? "SALAH"
                        : "PERIKSA"}
                    </span>
                  </div>

                  <p className="mt-2 text-xs font-semibold text-accent-ink">
                    {getTypeLabel(item.question_type)}
                  </p>

                  {item.stimulus?.content_text && (
                    <div className="mt-3 rounded-lg bg-surface-muted p-3 text-sm leading-6 text-ink-body">
                      {item.stimulus.content_text}
                    </div>
                  )}

                  <p className="mt-3 text-sm font-medium leading-7 text-ink">
                    {item.question_text}
                  </p>

                  {renderAnswer(item)}

                  {item.explanation && (
                    <div className="mt-4 rounded-lg border border-accent-line bg-accent-soft p-4">
                      <p className="text-xs font-bold uppercase text-accent-ink">
                        Pembahasan
                      </p>

                      <p className="mt-2 text-sm leading-6 text-ink-body">
                        {item.explanation}
                      </p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// =====================================================
// HALAMAN REKAP HASIL
// =====================================================

function subscribeToResults(onChange) {
  window.addEventListener("storage", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("focus", onChange);
  };
}

function getResultsSnapshot() {
  try {
    return JSON.stringify([
      sessionStorage.getItem("tryon-simulation-results"),
      sessionStorage.getItem("tryon-exam-config"),
    ]);
  } catch {
    return "[null,null]";
  }
}

function getServerResultsSnapshot() {
  return null;
}

export default function StudentResultsPage() {
  const router = useRouter();
  const [history, setHistory] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState("all");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [reloadHistory, setReloadHistory] = useState(0);
  const [reviewAttemptId, setReviewAttemptId] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const snapshot = useSyncExternalStore(
    subscribeToResults,
    getResultsSnapshot,
    getServerResultsSnapshot
  );
  const loading = snapshot === null || historyLoading;

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError("");
      setReviewError("");
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        if (mounted) {
          setHistoryError("Sesi login tidak ditemukan. Silakan masuk kembali.");
          setHistoryLoading(false);
        }
        return;
      }

      const request = studentHistoryRequest();
      const { data, error: rpcError } = await supabase.rpc(request.name, request.args);
      if (!mounted) return;
      if (rpcError) {
        setHistoryError(rpcError.message || "Histori hasil belum berhasil dimuat.");
        setHistoryLoading(false);
        return;
      }
      try {
        setHistory(normalizeStudentHistory(data));
      } catch (error) {
        setHistoryError(error.message || "Respons riwayat server tidak valid.");
      }
      setHistoryLoading(false);
    }

    void loadHistory();
    return () => { mounted = false; };
  }, [reloadHistory]);

  const { localResults, config } = useMemo(() => {
    try {
      const [rawResults, rawConfig] = JSON.parse(snapshot || "[null,null]");
      const savedResults = JSON.parse(rawResults || "[]");
      const savedConfig = JSON.parse(rawConfig || "{}");
      return {
        localResults: Array.isArray(savedResults) ? savedResults : [],
        config: savedConfig && typeof savedConfig === "object" && !Array.isArray(savedConfig)
          ? savedConfig
          : {},
      };
    } catch {
      return { localResults: [], config: {} };
    }
  }, [snapshot]);

  const results = useMemo(() => {
    // Database adalah sumber kebenaran. Cache session hanya dipakai sebagai
    // fallback transisi ketika RPC histori benar-benar gagal, bukan ketika
    // akun memang belum memiliki hasil.
    if (historyError) return localResults;
    return studentResultSessions(history);
  }, [history, historyError, localResults]);

  useEffect(() => {
    const pending = results.filter((item) => item.attemptId && !item.review && !item.reviewError && String(item.status || "").toUpperCase() === "SUBMITTED");
    if (!pending.length) return undefined;
    let active = true;
    Promise.all(pending.map(async (item) => {
      try {
        const { data, error } = await supabase.rpc("get_exam_attempt_review", { p_attempt_id: item.attemptId });
        if (error) throw error;
        if (!Array.isArray(data?.questions)) throw new Error("Respons review server tidak valid.");
        return { attemptId: item.attemptId, review: data, reviewError: "" };
      } catch (error) {
        return { attemptId: item.attemptId, review: null, reviewError: error.message || "Review belum berhasil dimuat." };
      }
    })).then((reviews) => {
      if (!active) return;
      const failed = reviews.find((review) => review.reviewError);
      if (failed) setReviewError(failed.reviewError);
      setHistory((previous) => previous.map((item) => {
        const found = reviews.find((review) => review.attemptId === item.attempt_id);
        return found ? { ...item, review: found.review, reviewError: found.reviewError } : item;
      }));
    });
    return () => { active = false; };
  }, [results]);

  async function openReview(attemptId) {
    if (!attemptId || reviewAttemptId === attemptId) {
      setReviewAttemptId(null);
      return;
    }
    setReviewAttemptId(attemptId);
    setReviewLoading(true);
    setReviewError("");
    const { data, error: reviewError } = await supabase.rpc("get_exam_attempt_review", {
      p_attempt_id: attemptId,
    });
    setReviewLoading(false);
    if (reviewError) {
      setReviewError(reviewError.message || "Review jawaban belum berhasil dimuat.");
      return;
    }
    setHistory((previous) => previous.map((item) =>
      item.attempt_id === attemptId ? { ...item, review: data, reviewError: "" } : item
    ));
  }

  const displayResults = results.filter((item) =>
    String(item.status || "SUBMITTED").toUpperCase() === "SUBMITTED"
    && (selectedPackage === "all" || packageKey(item) === selectedPackage)
  );

  const packageOptions = useMemo(() => {
    const seen = new Map();
    results.filter((item) => String(item.status || "").toUpperCase() === "SUBMITTED").forEach((item) => {
      const key = packageKey(item);
      if (!seen.has(key)) seen.set(key, { key, label: packageLabel(item), count: 0 });
      seen.get(key).count += 1;
    });
    return [...seen.values()];
  }, [results]);
  const weakestSubject = displayResults.length > 0
    ? displayResults.reduce((weakest, item) =>
        Number(item.score || 0) < Number(weakest.score || 0) ? item : weakest
      )
    : null;

  const summary = useMemo(() => {
    const totalSubjects = Array.isArray(config.subjects)
      ? config.subjects.length
      : 1;

    const completedSubjects = displayResults.length;

    const totalQuestions = displayResults.reduce(
      (sum, item) => sum + Number(item.totalQuestions || 0),
      0
    );

    const correctAnswers = displayResults.reduce(
      (sum, item) => sum + Number(item.correctAnswers || 0),
      0
    );

    const incorrectAnswers = displayResults.reduce(
      (sum, item) =>
        sum + Number(item.incorrectOrUnanswered || 0),
      0
    );

    const averageScore =
      completedSubjects > 0
        ? displayResults.reduce(
            (sum, item) => sum + Number(item.score || 0),
            0
          ) / completedSubjects
        : 0;

    return {
      totalSubjects,
      completedSubjects,
      totalQuestions,
      correctAnswers,
      incorrectAnswers,
      averageScore,
      isComplete:
        completedSubjects >= totalSubjects &&
        totalSubjects > 0,
    };
  }, [displayResults, config]);

  const simulationId =
    displayResults[0]?.simulationId || config.simulationId || "-";

  const themeAnalysis = useMemo(() => buildAnalysis(displayResults, "theme"), [displayResults]);
  const topicAnalysis = useMemo(() => buildAnalysis(displayResults, "topic"), [displayResults]);
  const trend = useMemo(() => displayResults.slice().sort((a, b) => new Date(a.completedAt || 0) - new Date(b.completedAt || 0)), [displayResults]);
  const isUsingLocalFallback = Boolean(historyError && history.length === 0 && localResults.length > 0);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface-raised">
        <p className="font-semibold text-ink-secondary">
          Memuat rekap hasil…
        </p>
      </main>
    );
  }

  if (!historyLoading && displayResults.length === 0) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface-raised p-5 text-ink-body">
        <section className="w-full max-w-xl rounded-2xl bg-surface p-8 text-center shadow-sm">
          <div aria-hidden="true" className="text-5xl">📊</div>

          <h1 className="mt-4 text-2xl font-extrabold text-ink">
            {historyError ? "Hasil belum dapat dimuat" : "Belum Ada Hasil Ujian"}
          </h1>

          <p className="mt-3 text-sm leading-6 text-ink-secondary">
            {historyError || "Hasil latihan dan simulasi akan muncul di sini setelah kamu menyelesaikan sesi mata pelajaran."}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {historyError ? (
              <button type="button" onClick={() => setReloadHistory((value) => value + 1)} className="min-h-11 rounded-lg bg-primary px-6 py-3 font-bold text-on-primary hover:bg-primary-hover">Coba kembali</button>
            ) : (
              <Link href="/student/subjects?activityType=latihan" className="min-h-11 rounded-lg bg-primary px-6 py-3 font-bold text-on-primary hover:bg-primary-hover">Mulai latihan pertama</Link>
            )}
            <Link href="/student" className="min-h-11 rounded-lg border border-line-strong px-6 py-3 font-bold text-ink-body">Dashboard</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-raised px-4 py-8 text-ink-body">
      <div className="mx-auto max-w-5xl">
        <nav aria-label="Navigasi hasil" className="mb-5 flex flex-wrap gap-3 print:hidden">
          <Link href="/student" className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-bold text-ink-body">← Dashboard</Link>
          <Link href="/student/subjects?activityType=latihan" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-bold text-on-primary">Mulai latihan</Link>
        </nav>

        <header className="rounded-2xl bg-surface p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <BrandLogo className="h-14 w-14" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-accent-ink">
                  TKA TryOn · Hasil dan Evaluasi
                </p>

                <h1 className="mt-2 text-2xl font-extrabold text-ink sm:text-3xl">
                  Rekap Hasil Simulasi
                </h1>

                <p className="mt-2 text-sm text-ink-muted">
                  Kelas {config.grade || config.level || "-"} ·{" "}
                  {config.activityType === "simulasi"
                    ? "Simulasi TKA"
                    : "Latihan Akademik"}
                </p>
              </div>
            </div>

            <span
              className={`rounded-full px-4 py-2 text-xs font-bold ${
                summary.isComplete
                  ? "bg-success-tint text-success-ink"
                  : "bg-warning-tint text-warning-ink"
              }`}
            >
              {summary.isComplete
                ? "SIMULASI SELESAI"
                : "BELUM SELESAI"}
            </span>
          </div>

          <div className="mt-5 rounded-lg bg-surface-muted p-3">
            <p className="text-xs text-ink-muted">
              ID Simulasi
            </p>
            <p className="mt-1 break-all font-mono text-xs text-ink-body">
              {simulationId}
            </p>
          </div>
        </header>

        {historyError && (
          <div role="alert" className="mt-5 rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning-ink">
            {historyError}
            {isUsingLocalFallback && " Menampilkan cache perangkat sementara; hasil server tetap menjadi sumber kebenaran."}
          </div>
        )}

        {/* NILAI RATA-RATA */}

        <section className="mt-5 rounded-2xl bg-primary p-6 text-on-primary shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-on-primary">
            NILAI RATA-RATA SELURUH MATA PELAJARAN
          </p>

          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <p className="text-5xl font-black sm:text-6xl">
              {summary.averageScore.toFixed(2)}
            </p>

            <p className="text-sm text-on-primary">
              {summary.completedSubjects} dari{" "}
              {summary.totalSubjects} mata pelajaran selesai
            </p>
          </div>

          <div className="mt-5 h-3 overflow-hidden rounded-full bg-accent-deep/40">
            <div
              className="h-full rounded-full bg-surface transition-all"
              style={{
                width: `${
                  summary.totalSubjects > 0
                    ? Math.min(
                        100,
                        (summary.completedSubjects /
                          summary.totalSubjects) *
                          100
                      )
                    : 0
                }%`,
              }}
            />
          </div>
        </section>

        {weakestSubject && (
          <section className="mt-5 rounded-2xl border border-warning-line bg-warning-soft p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-warning-ink">REKOMENDASI BELAJAR</p>
            <h2 className="mt-2 text-lg font-extrabold text-warning-ink">Fokus latihan berikutnya: {weakestSubject.subject}</h2>
            <p className="mt-2 text-sm leading-6 text-warning-ink">Nilai terakhirmu di mata pelajaran ini adalah {Number(weakestSubject.score || 0).toFixed(2)}. Ulangi latihan dan tinjau pembahasan soal yang masih salah atau kosong.</p>
            <button type="button" onClick={() => router.push(`/student/subjects?activityType=latihan&subject=${encodeURIComponent(weakestSubject.subject)}`)} className="mt-4 rounded-lg bg-warning px-4 py-2.5 text-sm font-bold text-on-inverse hover:bg-warning">Mulai latihan {weakestSubject.subject}</button>
          </section>
        )}

        <section className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-ink">Paket evaluasi</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-ink">Perkembangan sesuai paket</h2>
            </div>
            <label className="text-sm font-semibold text-ink-body">Pilih paket
              <select value={selectedPackage} onChange={(event) => setSelectedPackage(event.target.value)} className="ml-2 rounded-lg border border-line-strong bg-surface px-3 py-2 font-semibold">
                <option value="all">Semua sesi</option>
                {packageOptions.map((option) => <option key={option.key} value={option.key}>{option.label} ({option.count})</option>)}
              </select>
            </label>
          </div>
          <ScoreLineChart sessions={trend} />
        </section>

        <section className="mt-8 border-y border-line-strong py-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-ink">Evaluasi kemampuan</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-ink">Peta topik yang sudah terukur</h2>
            </div>
            <p className="max-w-sm text-right text-xs leading-5 text-ink-muted">Klasifikasi hanya dihitung dari metadata topik yang dikirim oleh review server. Tidak ada topik yang ditebak dari urutan soal.</p>
          </div>
          {reviewError && (
            <div role="alert" className="mt-5 rounded-lg border border-warning-line bg-warning-soft p-4 text-sm text-warning-ink">
              <p>Review tema dan topik belum berhasil dimuat. Riwayat dan nilai tetap tersedia.</p>
              <p className="mt-1 text-xs">{reviewError}</p>
              <button type="button" onClick={() => setReloadHistory((value) => value + 1)} className="mt-3 rounded-lg border border-warning-line px-4 py-2 font-bold">Coba muat ulang review</button>
            </div>
          )}
          {themeAnalysis.length ? <>
            <h3 className="mt-6 text-lg font-extrabold text-ink">Hasil per Tema</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {themeAnalysis.map((item) => { const status = performanceLabel(item.score); return <article key={item.label} className="border border-line bg-surface p-4"><div className="flex items-start justify-between gap-3"><h4 className="font-bold text-ink">{item.label}</h4><span className={`shrink-0 border px-2 py-1 text-[11px] font-bold ${status.tone}`}>{status.label}</span></div><div className="mt-4 flex items-end justify-between"><strong className="text-2xl font-black text-ink">{item.score.toFixed(0)}%</strong><span className="text-xs text-ink-muted">{item.correct}/{item.total} benar</span></div><div className="mt-3 h-1.5 bg-surface-raised"><div className="h-full bg-success" style={{ width: `${Math.min(100, item.score)}%` }} /></div></article>; })}
            </div>
            <h3 className="mt-6 text-lg font-extrabold text-ink">Hasil per Topik</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topicAnalysis.map((item) => {
                const status = performanceLabel(item.score);
                return <article key={item.label} className="border border-line bg-surface p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-bold text-ink">{item.topic}</h3><span className={`shrink-0 border px-2 py-1 text-[11px] font-bold ${status.tone}`}>{status.label}</span></div><div className="mt-4 flex items-end justify-between"><strong className="text-2xl font-black text-ink">{item.score.toFixed(0)}%</strong><span className="text-xs text-ink-muted">{item.correct}/{item.total} benar</span></div><div className="mt-3 h-1.5 bg-surface-raised"><div className="h-full bg-primary" style={{ width: `${Math.min(100, item.score)}%` }} /></div></article>;
              })}
            </div>
          </> : <div className="mt-5 border border-dashed border-line-strong bg-surface-muted p-5 text-sm leading-6 text-ink-secondary">Analisis tema dan topik akan tampil setelah review server menyediakan metadata klasifikasi.</div>}
        </section>

        {/* RINGKASAN STATISTIK */}

        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-surface p-4 shadow-sm">
            <p className="text-xs text-ink-muted">
              Mata Pelajaran
            </p>
            <p className="mt-2 text-2xl font-extrabold text-ink">
              {summary.completedSubjects}/{summary.totalSubjects}
            </p>
          </div>

          <div className="rounded-xl bg-surface p-4 shadow-sm">
            <p className="text-xs text-ink-muted">Total Soal</p>
            <p className="mt-2 text-2xl font-extrabold text-ink">
              {summary.totalQuestions}
            </p>
          </div>

          <div className="rounded-xl bg-surface p-4 shadow-sm">
            <p className="text-xs text-ink-muted">Jawaban Benar</p>
            <p className="mt-2 text-2xl font-extrabold text-success-ink">
              {summary.correctAnswers}
            </p>
          </div>

          <div className="rounded-xl bg-surface p-4 shadow-sm">
            <p className="text-xs text-ink-muted">
              Salah / Kosong
            </p>
            <p className="mt-2 text-2xl font-extrabold text-danger-ink">
              {summary.incorrectAnswers}
            </p>
          </div>
        </section>

        {/* RINCIAN PER MATA PELAJARAN */}

        <section className="mt-8">
          <div className="mb-4">
            <h2 className="text-xl font-extrabold text-ink">
              Hasil per Mata Pelajaran
            </h2>

            <p className="mt-1 text-sm text-ink-muted">
              Tekan setiap mata pelajaran untuk melihat rincian
              jawaban dan pembahasannya.
            </p>
          </div>

          <div className="space-y-4">
            {displayResults
              .slice()
              .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
              .map((session, index) => (
                <div key={session.attemptId || `${session.subject}-${index}`}>
                  <ReviewSession session={session} />
                  {session.attemptId && (
                    <button
                      type="button"
                      onClick={() => openReview(session.attemptId)}
                      className="mt-2 w-full rounded-lg border border-accent-line bg-surface px-4 py-3 text-sm font-bold text-accent-ink hover:bg-accent-soft"
                    >
                      {reviewAttemptId === session.attemptId
                        ? "Tutup review jawaban"
                        : "Lihat review jawaban dari server"}
                    </button>
                  )}
                  {reviewAttemptId === session.attemptId && reviewLoading && (
                    <p className="mt-2 rounded-lg bg-surface-muted p-3 text-sm text-ink-secondary">Memuat review jawaban…</p>
                  )}
                  {reviewAttemptId === session.attemptId && session.review && (
                    <ReviewSession session={{ ...session, review: session.review }} initiallyExpanded />
                  )}
                </div>
              ))}
          </div>
        </section>

        {/* CATATAN */}

        {!summary.isComplete && (
          <section className="mt-6 rounded-xl border border-warning-line bg-warning-soft p-5">
            <h3 className="font-bold text-warning-ink">
              Simulasi Belum Lengkap
            </h3>

            <p className="mt-2 text-sm leading-6 text-warning-ink">
              Masih ada mata pelajaran yang belum diselesaikan.
              Nilai rata-rata di atas hanya dihitung dari sesi
              yang sudah selesai.
            </p>
          </section>
        )}

        {/* TOMBOL NAVIGASI */}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => router.push("/student")}
            className="flex-1 rounded-lg border border-line-strong bg-surface px-6 py-3 font-bold text-ink-body hover:bg-surface-muted"
          >
            Kembali ke Dashboard
          </button>

          <button
            onClick={() => window.print()}
            className="flex-1 rounded-lg bg-primary px-6 py-3 font-bold text-on-primary hover:bg-primary-hover"
          >
            Cetak Rekap Hasil
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-ink-muted">
          TKA TryOn · Hasil evaluasi berdasarkan sesi ujian yang
          telah diselesaikan.
        </p>
      </div>
    </main>
  );
}
