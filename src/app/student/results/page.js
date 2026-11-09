
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { option_codes: [], category_answers: {} };
  }

  return {
    option_codes: Array.isArray(payload.option_codes)
      ? payload.option_codes
      : [],
    category_answers:
      payload.category_answers &&
      typeof payload.category_answers === "object"
        ? payload.category_answers
        : {},
  };
}

function getTypeLabel(type) {
  const value = String(type || "").toUpperCase();

  if (value === "PGK_MA") return "Pilihan Ganda Kompleks";
  if (value === "PGK_KATEGORI") return "Pilihan Ganda Kategori";

  return "Pilihan Ganda Tunggal";
}

// =====================================================
// KOMPONEN REVIEW
// =====================================================

function ReviewSession({ session }) {
  const [expanded, setExpanded] = useState(false);

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
              <div className="flex items-start gap-2">
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
        <div className="border-t border-slate-200 p-5">
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

export default function StudentResultsPage() {
  const router = useRouter();

  const [results, setResults] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const savedResults = JSON.parse(
        sessionStorage.getItem("tryon-simulation-results") || "[]"
      );

      const savedConfig = JSON.parse(
        sessionStorage.getItem("tryon-exam-config") || "{}"
      );

      setResults(
        Array.isArray(savedResults) ? savedResults : []
      );

      setConfig(savedConfig || {});
    } catch {
      setResults([]);
      setConfig({});
    } finally {
      setLoading(false);
    }
  }, []);

  const summary = useMemo(() => {
    const totalSubjects = Array.isArray(config.subjects)
      ? config.subjects.length
      : 1;

    const completedSubjects = results.length;

    const totalQuestions = results.reduce(
      (sum, item) => sum + Number(item.totalQuestions || 0),
      0
    );

    const correctAnswers = results.reduce(
      (sum, item) => sum + Number(item.correctAnswers || 0),
      0
    );

    const incorrectAnswers = results.reduce(
      (sum, item) =>
        sum + Number(item.incorrectOrUnanswered || 0),
      0
    );

    const averageScore =
      completedSubjects > 0
        ? results.reduce(
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
  }, [results, config]);

  const simulationId =
    results[0]?.simulationId || config.simulationId || "-";

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100">
        <p className="font-semibold text-slate-600">
          Memuat rekap hasil…
        </p>
      </main>
    );
  }

  if (results.length === 0) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-5 text-slate-800">
        <section className="w-full max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="text-5xl">📊</div>

          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">
            Belum Ada Hasil Ujian
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            Hasil simulasi akan muncul di halaman ini setelah
            siswa menyelesaikan sesi mata pelajaran.
          </p>

          <button
            onClick={() => router.push("/student")}
            className="mt-6 rounded-lg bg-blue-700 px-6 py-3 font-bold text-white hover:bg-blue-800"
          >
            Kembali ke Dashboard
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-5xl">
        {/* HEADER */}

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
            {results
              .slice()
              .sort((a, b) => a.subjectIndex - b.subjectIndex)
              .map((session, index) => (
                <ReviewSession
                  key={
                    session.attemptId ||
                    `${session.subject}-${index}`
                  }
                  session={session}
                />
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
