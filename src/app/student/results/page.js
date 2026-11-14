
"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { normalizePayload } from "@/lib/student/exam";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
      tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
    };
  }

  if (score >= 60) {
    return {
      label: "Cukup",
      tone: "text-amber-700 bg-amber-50 border-amber-200",
    };
  }

  return {
    label: "Perlu Pendalaman",
    tone: "text-rose-700 bg-rose-50 border-rose-200",
  };
}

function getQuestionTopic(item) {
  return item.topic || item.theme || item.competency || item.indicator || "";
}

function buildTopicAnalysis(results) {
  const buckets = new Map();

  results.forEach((session) => {
    (session.review?.questions || []).forEach((question) => {
      const topic = String(getQuestionTopic(question)).trim();
      if (!topic) return;

      const current = buckets.get(topic) || { topic, total: 0, correct: 0 };
      current.total += 1;
      current.correct += question.is_correct === true ? 1 : 0;
      buckets.set(topic, current);
    });
  });

  return Array.from(buckets.values())
    .map((item) => ({
      ...item,
      score: item.total ? (item.correct / item.total) * 100 : 0,
    }))
    .sort((a, b) => a.score - b.score);
}

// =====================================================
// KOMPONEN REVIEW
// =====================================================

function ReviewSession({ session }) {
  const [expanded, setExpanded] = useState(false);
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
                className="rounded-lg border border-slate-200 p-3"
              >
                <p className="text-sm font-medium text-slate-800">
                  {category.item_number}. {category.item_text}
                </p>

                <p className="mt-2 text-sm text-slate-700">
                  Jawaban siswa:{" "}
                  <strong>{studentAnswer}</strong>
                </p>

                <p className="mt-1 text-sm text-green-700">
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
                  ? "border-green-300 bg-green-50"
                  : selected
                  ? "border-red-300 bg-red-50"
                  : "border-slate-200 bg-white"
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
                  <span className="text-xs font-bold text-green-700">
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
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={reviewId}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-wrap items-center justify-between gap-4 p-5 text-left hover:bg-slate-50"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Sesi {session.subjectIndex + 1}
          </p>

          <h3 className="mt-1 text-lg font-extrabold text-slate-900">
            {session.subject}
          </h3>

          <p className="mt-1 text-xs text-slate-500">
            {session.correctAnswers} benar dari{" "}
            {session.totalQuestions} soal
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-slate-500">Nilai</p>
            <p className="text-2xl font-black text-blue-700">
              {Number(session.score || 0).toFixed(2)}
            </p>
          </div>

          <span className="text-xl text-slate-400">
            {expanded ? "−" : "+"}
          </span>
        </div>
      </button>

      {expanded && (
        <div id={reviewId} className="border-t border-slate-200 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Total Soal</p>
              <p className="mt-1 text-xl font-bold">
                {session.totalQuestions}
              </p>
            </div>

            <div className="rounded-lg bg-green-50 p-3">
              <p className="text-xs text-green-700">Benar</p>
              <p className="mt-1 text-xl font-bold text-green-700">
                {session.correctAnswers}
              </p>
            </div>

            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-xs text-red-700">Salah</p>
              <p className="mt-1 text-xl font-bold text-red-700">
                {session.incorrectOrUnanswered}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Terjawab</p>
              <p className="mt-1 text-xl font-bold">
                {session.answeredCount}
              </p>
            </div>
          </div>

          {!session.review && (
            <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
              Data rincian review belum tersedia untuk sesi ini.
            </p>
          )}

          {session.review && questions.length === 0 && (
            <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              Belum ada rincian soal yang dapat ditampilkan.
            </p>
          )}

          {questions.length > 0 && (
            <div className="mt-6 space-y-4">
              <h4 className="font-bold text-slate-900">
                Review Jawaban
              </h4>

              {questions.map((item, index) => (
                <article
                  key={item.question_id || index}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="font-bold text-slate-900">
                      Soal Nomor{" "}
                      {item.question_order || index + 1}
                    </h5>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        item.is_correct === true
                          ? "bg-green-100 text-green-700"
                          : item.is_correct === false
                          ? "bg-red-100 text-red-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.is_correct === true
                        ? "BENAR"
                        : item.is_correct === false
                        ? "SALAH"
                        : "PERIKSA"}
                    </span>
                  </div>

                  <p className="mt-2 text-xs font-semibold text-blue-700">
                    {getTypeLabel(item.question_type)}
                  </p>

                  {item.stimulus?.content_text && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                      {item.stimulus.content_text}
                    </div>
                  )}

                  <p className="mt-3 text-sm font-medium leading-7 text-slate-900">
                    {item.question_text}
                  </p>

                  {renderAnswer(item)}

                  {item.explanation && (
                    <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
                      <p className="text-xs font-bold uppercase text-blue-700">
                        Pembahasan
                      </p>

                      <p className="mt-2 text-sm leading-6 text-slate-700">
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
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [reloadHistory, setReloadHistory] = useState(0);
  const [reviewAttemptId, setReviewAttemptId] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
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
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        if (mounted) {
          setHistoryError("Sesi login tidak ditemukan. Silakan masuk kembali.");
          setHistoryLoading(false);
        }
        return;
      }

      const { data, error: rpcError } = await supabase.rpc("get_student_exam_history", {
        p_limit: 50,
        p_before: null,
      });
      if (!mounted) return;
      if (rpcError) {
        setHistoryError(rpcError.message || "Histori hasil belum berhasil dimuat.");
        setHistoryLoading(false);
        return;
      }
      setHistory(Array.isArray(data) ? data : []);
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
    return history.map((item, index) => ({
      attemptId: item.attempt_id,
      subject: item.subject || item.subject_name || "Mata pelajaran",
      grade: item.grade,
      subjectIndex: index,
      totalSubjects: history.length,
      score: Number(item.score || 0),
      totalQuestions: Number(item.total_questions || 0),
      correctAnswers: Number(item.correct_answers || 0),
      incorrectOrUnanswered: Number(item.incorrect_or_unanswered || 0),
      answeredCount: Math.max(0, Number(item.total_questions || 0) - Number(item.incorrect_or_unanswered || 0)),
      completedAt: item.submitted_at || item.created_at,
      status: item.status || item.attempt_status,
      review: item.review || null,
    }));
  }, [history, historyError, localResults]);

  async function openReview(attemptId) {
    if (!attemptId || reviewAttemptId === attemptId) {
      setReviewAttemptId(null);
      return;
    }
    setReviewAttemptId(attemptId);
    setReviewLoading(true);
    const { data, error: reviewError } = await supabase.rpc("get_exam_attempt_review", {
      p_attempt_id: attemptId,
    });
    setReviewLoading(false);
    if (reviewError) {
      setHistoryError(reviewError.message || "Review jawaban belum berhasil dimuat.");
      return;
    }
    setHistory((previous) => previous.map((item) =>
      item.attempt_id === attemptId ? { ...item, review: data } : item
    ));
  }

  const displayResults = results.filter((item) =>
    String(item.status || "SUBMITTED").toUpperCase() === "SUBMITTED"
  );

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

  const topicAnalysis = useMemo(() => buildTopicAnalysis(displayResults), [displayResults]);
  const isUsingLocalFallback = Boolean(historyError && history.length === 0 && localResults.length > 0);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100">
        <p className="font-semibold text-slate-600">
          Memuat rekap hasil…
        </p>
      </main>
    );
  }

  if (!historyLoading && displayResults.length === 0) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-5 text-slate-800">
        <section className="w-full max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm">
          <div aria-hidden="true" className="text-5xl">📊</div>

          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">
            {historyError ? "Hasil belum dapat dimuat" : "Belum Ada Hasil Ujian"}
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            {historyError || "Hasil latihan dan simulasi akan muncul di sini setelah kamu menyelesaikan sesi mata pelajaran."}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {historyError ? (
              <button type="button" onClick={() => setReloadHistory((value) => value + 1)} className="min-h-11 rounded-lg bg-blue-700 px-6 py-3 font-bold text-white hover:bg-blue-800">Coba kembali</button>
            ) : (
              <Link href="/student/subjects?activityType=latihan" className="min-h-11 rounded-lg bg-blue-700 px-6 py-3 font-bold text-white hover:bg-blue-800">Mulai latihan pertama</Link>
            )}
            <Link href="/student" className="min-h-11 rounded-lg border border-slate-300 px-6 py-3 font-bold text-slate-700">Dashboard</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-5xl">
        <nav aria-label="Navigasi hasil" className="mb-5 flex flex-wrap gap-3 print:hidden">
          <Link href="/student" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700">← Dashboard</Link>
          <Link href="/student/subjects?activityType=latihan" className="inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 text-sm font-bold text-white">Mulai latihan</Link>
        </nav>

        <header className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                TKA TryOn · Hasil dan Evaluasi
              </p>

              <h1 className="mt-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">
                Rekap Hasil Simulasi
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                Kelas {config.grade || config.level || "-"} ·{" "}
                {config.activityType === "simulasi"
                  ? "Simulasi TKA"
                  : "Latihan Akademik"}
              </p>
            </div>

            <span
              className={`rounded-full px-4 py-2 text-xs font-bold ${
                summary.isComplete
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {summary.isComplete
                ? "SIMULASI SELESAI"
                : "BELUM SELESAI"}
            </span>
          </div>

          <div className="mt-5 rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">
              ID Simulasi
            </p>
            <p className="mt-1 break-all font-mono text-xs text-slate-700">
              {simulationId}
            </p>
          </div>
        </header>

        {historyError && (
          <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {historyError}
            {isUsingLocalFallback && " Menampilkan cache perangkat sementara; hasil server tetap menjadi sumber kebenaran."}
          </div>
        )}

        {/* NILAI RATA-RATA */}

        <section className="mt-5 rounded-2xl bg-blue-700 p-6 text-white shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-blue-100">
            NILAI RATA-RATA SELURUH MATA PELAJARAN
          </p>

          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <p className="text-5xl font-black sm:text-6xl">
              {summary.averageScore.toFixed(2)}
            </p>

            <p className="text-sm text-blue-100">
              {summary.completedSubjects} dari{" "}
              {summary.totalSubjects} mata pelajaran selesai
            </p>
          </div>

          <div className="mt-5 h-3 overflow-hidden rounded-full bg-blue-900/40">
            <div
              className="h-full rounded-full bg-white transition-all"
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
          <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">REKOMENDASI BELAJAR</p>
            <h2 className="mt-2 text-lg font-extrabold text-amber-950">Fokus latihan berikutnya: {weakestSubject.subject}</h2>
            <p className="mt-2 text-sm leading-6 text-amber-900">Nilai terakhirmu di mata pelajaran ini adalah {Number(weakestSubject.score || 0).toFixed(2)}. Ulangi latihan dan tinjau pembahasan soal yang masih salah atau kosong.</p>
            <button type="button" onClick={() => router.push(`/student/subjects?activityType=latihan&subject=${encodeURIComponent(weakestSubject.subject)}`)} className="mt-4 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-700">Mulai latihan {weakestSubject.subject}</button>
          </section>
        )}

        <section className="mt-8 border-y border-slate-300 py-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Evaluasi kemampuan</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Peta topik yang sudah terukur</h2>
            </div>
            <p className="max-w-sm text-right text-xs leading-5 text-slate-500">Klasifikasi hanya dihitung dari metadata topik yang dikirim oleh review server. Tidak ada topik yang ditebak dari urutan soal.</p>
          </div>
          {topicAnalysis.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topicAnalysis.map((item) => {
                const status = performanceLabel(item.score);
                return <article key={item.topic} className="border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-bold text-slate-900">{item.topic}</h3><span className={`shrink-0 border px-2 py-1 text-[11px] font-bold ${status.tone}`}>{status.label}</span></div><div className="mt-4 flex items-end justify-between"><strong className="text-2xl font-black text-slate-950">{item.score.toFixed(0)}%</strong><span className="text-xs text-slate-500">{item.correct}/{item.total} benar</span></div><div className="mt-3 h-1.5 bg-slate-100"><div className="h-full bg-blue-700" style={{ width: `${Math.min(100, item.score)}%` }} /></div></article>;
              })}
            </div>
          ) : <div className="mt-5 border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">Analisis topik akan tampil setelah review server menyediakan metadata topik atau indikator kompetensi. Untuk saat ini, gunakan ringkasan per mata pelajaran di bawah sebagai acuan belajar.</div>}
        </section>

        {/* RINGKASAN STATISTIK */}

        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">
              Mata Pelajaran
            </p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {summary.completedSubjects}/{summary.totalSubjects}
            </p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Total Soal</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {summary.totalQuestions}
            </p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Jawaban Benar</p>
            <p className="mt-2 text-2xl font-extrabold text-green-700">
              {summary.correctAnswers}
            </p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">
              Salah / Kosong
            </p>
            <p className="mt-2 text-2xl font-extrabold text-red-700">
              {summary.incorrectAnswers}
            </p>
          </div>
        </section>

        {/* RINCIAN PER MATA PELAJARAN */}

        <section className="mt-8">
          <div className="mb-4">
            <h2 className="text-xl font-extrabold text-slate-900">
              Hasil per Mata Pelajaran
            </h2>

            <p className="mt-1 text-sm text-slate-500">
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
                      className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50"
                    >
                      {reviewAttemptId === session.attemptId
                        ? "Tutup review jawaban"
                        : "Lihat review jawaban dari server"}
                    </button>
                  )}
                  {reviewAttemptId === session.attemptId && reviewLoading && (
                    <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Memuat review jawaban…</p>
                  )}
                  {reviewAttemptId === session.attemptId && session.review && (
                    <ReviewSession session={{ ...session, review: session.review }} />
                  )}
                </div>
              ))}
          </div>
        </section>

        {/* CATATAN */}

        {!summary.isComplete && (
          <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="font-bold text-amber-900">
              Simulasi Belum Lengkap
            </h3>

            <p className="mt-2 text-sm leading-6 text-amber-800">
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
            className="flex-1 rounded-lg border border-slate-300 bg-white px-6 py-3 font-bold text-slate-700 hover:bg-slate-50"
          >
            Kembali ke Dashboard
          </button>

          <button
            onClick={() => window.print()}
            className="flex-1 rounded-lg bg-blue-700 px-6 py-3 font-bold text-white hover:bg-blue-800"
          >
            Cetak Rekap Hasil
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          TKA TryOn · Hasil evaluasi berdasarkan sesi ujian yang
          telah diselesaikan.
        </p>
      </div>
    </main>
  );
}
