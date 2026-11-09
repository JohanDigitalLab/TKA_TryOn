
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// =====================================================
// HELPER
// =====================================================

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(
    safe % 60
  ).padStart(2, "0")}`;
}

function getExamConfig() {
  try {
    return JSON.parse(sessionStorage.getItem("tryon-exam-config") || "{}");
  } catch {
    return {};
  }
}

function normalizeSubjects(config) {
  const subjects = Array.isArray(config.subjects)
    ? config.subjects
    : [config.subject || config.mataPelajaran || "Matematika"];

  return subjects.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeGrade(config) {
  const raw = config.grade ?? config.kelas ?? config.level;
  const text = String(raw || "").toLowerCase();

  if (text.includes("sma") || text.includes("ma") || text === "12") {
    return 12;
  }

  if (text.includes("smp") || text.includes("mts") || text === "9") {
    return 9;
  }

  if (text.includes("sd") || text.includes("mi") || text === "6") {
    return 6;
  }

  const number = Number(raw);
  return [6, 9, 12].includes(number) ? number : 6;
}

function normalizeType(type) {
  const value = String(type || "").toUpperCase();

  if (value === "PGK_MA") return "PGK_MA";
  if (value === "PGK_KATEGORI") return "PGK_KATEGORI";

  return "PG_TUNGGAL";
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

function hasAnswer(payload, type) {
  const answer = normalizePayload(payload);

  if (type === "PGK_KATEGORI") {
    return Object.keys(answer.category_answers).length > 0;
  }

  return answer.option_codes.length > 0;
}

function getTypeLabel(type) {
  if (type === "PGK_MA") return "Pilihan Ganda Kompleks";
  if (type === "PGK_KATEGORI") return "Pilihan Ganda Kategori";
  return "Pilihan Ganda Tunggal";
}

function getCategoryOptions(items = []) {
  const values = [];

  items.forEach((item) => {
    if (item.category_label) values.push(item.category_label);
    if (item.category_options && Array.isArray(item.category_options)) {
      values.push(...item.category_options);
    }
  });

  return [...new Set(values.filter(Boolean))];
}

function getSimulationResults() {
  try {
    return JSON.parse(
      sessionStorage.getItem("tryon-simulation-results") || "[]"
    );
  } catch {
    return [];
  }
}

// =====================================================
// HALAMAN CBT
// =====================================================

export default function ChallengePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [questions, setQuestions] = useState([]);
  const [attemptId, setAttemptId] = useState(null);

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [marked, setMarked] = useState([]);

  const [remaining, setRemaining] = useState(3600);
  const [finished, setFinished] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [result, setResult] = useState(null);
  const [review, setReview] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [showReview, setShowReview] = useState(false);

  const [examInfo, setExamInfo] = useState({
    grade: 6,
    subject: "Matematika",
    subjectIndex: 0,
    totalSubjects: 1,
    simulationId: null,
  });

  const startedRef = useRef(false);
  const finishingRef = useRef(false);
  const answersRef = useRef({});

  const question = questions[current];

  const answeredCount = useMemo(() => {
    return questions.filter((q) =>
      hasAnswer(answers[q.question_id], q.type)
    ).length;
  }, [questions, answers]);

  const config = getExamConfig();
  const subjects = normalizeSubjects(config);
  const subjectIndex = Number(config.currentSubjectIndex || 0);
  const hasNextSubject = subjectIndex < subjects.length - 1;

  // =====================================================
  // MEMULAI SESI MATA PELAJARAN
  // =====================================================

  const startExam = useCallback(async (subjectOverride = null) => {
    if (startedRef.current) return;

    startedRef.current = true;
    setLoading(true);
    setError("");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!sessionData?.session) {
        throw new Error(
          "Siswa harus login terlebih dahulu sebelum memulai ujian."
        );
      }

      const currentConfig = getExamConfig();
      const subjectList = normalizeSubjects(currentConfig);
      const index = Number(currentConfig.currentSubjectIndex || 0);

      const subject =
        subjectOverride ||
        subjectList[index] ||
        subjectList[0] ||
        "Matematika";

      const grade = normalizeGrade(currentConfig);

      const duration = Math.min(
        240,
        Math.max(1, Number(currentConfig.duration) || 60)
      );

      const questionCount = Math.min(
        100,
        Math.max(
          1,
          Number(
            currentConfig.questionCount || currentConfig.totalQuestions
          ) || 20
        )
      );

      const simulationId =
        currentConfig.simulationId || `sim-${Date.now()}`;

      currentConfig.simulationId = simulationId;
      currentConfig.currentSubjectIndex = index;

      sessionStorage.setItem(
        "tryon-exam-config",
        JSON.stringify(currentConfig)
      );

      setExamInfo({
        grade,
        subject,
        subjectIndex: index,
        totalSubjects: subjectList.length,
        simulationId,
      });

      const { data, error: rpcError } = await supabase.rpc(
        "start_exam_attempt",
        {
          p_grade: grade,
          p_subject_name: subject,
          p_question_count: questionCount,
          p_duration_minutes: duration,
        }
      );

      if (rpcError) throw rpcError;

      if (
        !data?.attempt_id ||
        !Array.isArray(data.questions) ||
        data.questions.length === 0
      ) {
        throw new Error(
          `Soal untuk mata pelajaran ${subject} belum tersedia di bank soal.`
        );
      }

      const mapped = data.questions.map((item, index) => ({
        ...item,
        number: item.question_order || index + 1,
        subject,
        type: normalizeType(item.question_type),
        question: item.question_text,
        stimulus:
          item.stimulus?.content_text ||
          item.stimulus?.title ||
          "",
        options: (item.options || []).map((option) => ({
          code: option.option_code,
          text: option.option_text,
          is_correct: option.is_correct,
          explanation: option.explanation,
        })),
        category_items: (item.category_items || []).map((category) => ({
          item_number: category.item_number,
          item_text: category.item_text,
          category_label: category.category_label,
          category_options: category.category_options,
          correct_category: category.correct_category,
          explanation: category.explanation,
        })),
      }));

      setAttemptId(data.attempt_id);
      setQuestions(mapped);
      setRemaining(Number(data.duration_minutes || duration) * 60);

      const initialAnswers = {};

      mapped.forEach((item) => {
        initialAnswers[item.question_id] = {
          option_codes: [],
          category_answers: {},
        };
      });

      answersRef.current = initialAnswers;
      setAnswers(initialAnswers);
    } catch (err) {
      startedRef.current = false;
      setError(err?.message || "Ujian gagal dimulai.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startExam();
  }, [startExam]);

  // =====================================================
  // SIMPAN JAWABAN KE SUPABASE
  // =====================================================

  const persistAnswer = useCallback(
    async (questionId, payload) => {
      if (!attemptId) return;

      setSaving(true);
      setError("");

      try {
        const { error: saveError } = await supabase.rpc(
          "save_exam_answer",
          {
            p_attempt_id: attemptId,
            p_question_id: questionId,
            p_answer_payload: payload,
          }
        );

        if (saveError) throw saveError;
      } catch (err) {
        setError(
          `Jawaban belum berhasil disimpan: ${
            err?.message || "Kesalahan koneksi"
          }`
        );
      } finally {
        setSaving(false);
      }
    },
    [attemptId]
  );

  // =====================================================
  // UPDATE JAWABAN
  // =====================================================

  const updateAnswer = (questionId, payload) => {
    const next = {
      ...answersRef.current,
      [questionId]: payload,
    };

    answersRef.current = next;
    setAnswers(next);
    persistAnswer(questionId, payload);
  };

  const chooseSingle = (optionCode) => {
    if (!question || finished) return;

    updateAnswer(question.question_id, {
      option_codes: [optionCode],
      category_answers: {},
    });
  };

  const toggleMultiple = (optionCode) => {
    if (!question || finished) return;

    const currentPayload = normalizePayload(
      answersRef.current[question.question_id]
    );

    const selected = currentPayload.option_codes;

    const nextSelected = selected.includes(optionCode)
      ? selected.filter((code) => code !== optionCode)
      : [...selected, optionCode];

    updateAnswer(question.question_id, {
      option_codes: nextSelected,
      category_answers: {},
    });
  };

  const chooseCategory = (itemNumber, category) => {
    if (!question || finished) return;

    const currentPayload = normalizePayload(
      answersRef.current[question.question_id]
    );

    const nextCategories = {
      ...currentPayload.category_answers,
      [String(itemNumber)]: category,
    };

    updateAnswer(question.question_id, {
      option_codes: [],
      category_answers: nextCategories,
    });
  };

  // =====================================================
  // REVIEW HASIL UJIAN
  // =====================================================

  const loadReview = useCallback(async (id) => {
    if (!id) return;

    setReviewLoading(true);
    setReviewError("");

    try {
      const { data, error: reviewRpcError } = await supabase.rpc(
        "get_exam_attempt_review",
        {
          p_attempt_id: id,
        }
      );

      if (reviewRpcError) throw reviewRpcError;
      if (!data) throw new Error("Data review belum tersedia.");

      setReview(data);
    } catch (err) {
      setReviewError(
        err?.message || "Rincian hasil ujian belum berhasil dimuat."
      );
    } finally {
      setReviewLoading(false);
    }
  }, []);

  // =====================================================
  // SIMPAN HASIL SESI
  // =====================================================

  const saveSessionResult = (data, reviewData) => {
    const currentConfig = getExamConfig();
    const currentSubjects = normalizeSubjects(currentConfig);
    const index = Number(currentConfig.currentSubjectIndex || 0);

    const sessionResult = {
      simulationId:
        currentConfig.simulationId || examInfo.simulationId,
      subject: examInfo.subject,
      grade: examInfo.grade,
      subjectIndex: index,
      totalSubjects: currentSubjects.length,
      attemptId,
      score: Number(data?.score ?? 0),
      totalQuestions: Number(data?.total_questions ?? questions.length),
      correctAnswers: Number(data?.correct_answers ?? 0),
      incorrectOrUnanswered: Number(
        data?.incorrect_or_unanswered ?? 0
      ),
      answeredCount,
      result: data,
      review: reviewData || null,
      completedAt: new Date().toISOString(),
    };

    const previousResults = getSimulationResults();

    const updatedResults = [
      ...previousResults.filter(
        (item) => item.subjectIndex !== index
      ),
      sessionResult,
    ].sort((a, b) => a.subjectIndex - b.subjectIndex);

    sessionStorage.setItem(
      "tryon-simulation-results",
      JSON.stringify(updatedResults)
    );

    sessionStorage.setItem(
      "tryon-exam-result",
      JSON.stringify(data)
    );
  };

  // =====================================================
  // MENYELESAIKAN SESI
  // =====================================================

  const finishExam = useCallback(async () => {
    if (!attemptId || finishingRef.current || finished) return;

    finishingRef.current = true;
    setSaving(true);
    setError("");

    try {
      const { data, error: submitError } = await supabase.rpc(
        "submit_exam_attempt",
        {
          p_attempt_id: attemptId,
        }
      );

      if (submitError) throw submitError;

      setResult(data);
      setFinished(true);
      setShowConfirm(false);

      await loadReview(attemptId);

      const { data: reviewData } = await supabase.rpc(
        "get_exam_attempt_review",
        {
          p_attempt_id: attemptId,
        }
      );

      saveSessionResult(data, reviewData);
    } catch (err) {
      finishingRef.current = false;
      setError(
        err?.message ||
          "Ujian belum berhasil diselesaikan. Silakan coba kembali."
      );
    } finally {
      setSaving(false);
    }
  }, [
    attemptId,
    finished,
    loadReview,
    examInfo,
    questions.length,
    answeredCount,
  ]);

  // =====================================================
  // LANJUT KE MATA PELAJARAN BERIKUTNYA
  // =====================================================

  const nextSubject = () => {
    const currentConfig = getExamConfig();
    const subjectList = normalizeSubjects(currentConfig);
    const nextIndex =
      Number(currentConfig.currentSubjectIndex || 0) + 1;

    if (nextIndex >= subjectList.length) {
      router.push("/student/results");
      return;
    }

    currentConfig.currentSubjectIndex = nextIndex;

    sessionStorage.setItem(
      "tryon-exam-config",
      JSON.stringify(currentConfig)
    );

    // Reset seluruh state sesi sebelumnya.
    startedRef.current = false;
    finishingRef.current = false;
    answersRef.current = {};

    setLoading(true);
    setSaving(false);
    setError("");
    setQuestions([]);
    setAttemptId(null);
    setCurrent(0);
    setAnswers({});
    setMarked([]);
    setRemaining(3600);
    setFinished(false);
    setShowConfirm(false);
    setResult(null);
    setReview(null);
    setReviewError("");
    setShowReview(false);

    startExam(subjectList[nextIndex]);
  };

  // =====================================================
  // TIMER
  // =====================================================

  useEffect(() => {
    if (loading || finished || !attemptId) return;

    const timer = setInterval(() => {
      setRemaining((previous) => {
        if (previous <= 1) {
          clearInterval(timer);
          finishExam();
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [loading, finished, attemptId, finishExam]);

  // =====================================================
  // TANDA RAGU-RAGU
  // =====================================================

  const toggleMark = () => {
    setMarked((previous) =>
      previous.includes(current)
        ? previous.filter((n) => n !== current)
        : [...previous, current]
    );
  };

  // =====================================================
  // REVIEW JAWABAN
  // =====================================================

  const reviewQuestions = review?.questions || [];

  const renderReviewAnswer = (item) => {
    const type = normalizeType(item.question_type);
    const payload = normalizePayload(item.answer_payload);

    if (type === "PGK_KATEGORI") {
      return (
        <div className="mt-4 space-y-3">
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
                <p className="mt-2 text-sm">
                  Jawaban siswa: <strong>{studentAnswer}</strong>
                </p>
                <p className="text-sm text-green-700">
                  Kunci: <strong>{category.correct_category}</strong>
                </p>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="mt-4 space-y-2">
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
                <span className="font-bold">
                  {option.option_code}.
                </span>
                <span className="flex-1">{option.option_text}</span>
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

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-100 text-slate-600">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-700" />
          <p className="font-semibold">
            Menyiapkan soal dari bank TKA TryOn…
          </p>
        </div>
      </main>
    );
  }

  // =====================================================
  // ERROR MEMULAI UJIAN
  // =====================================================

  if (error && !questions.length) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-100 p-5 text-slate-800">
        <section className="w-full max-w-xl rounded-2xl bg-white p-7 shadow-sm">
          <h1 className="text-xl font-extrabold text-slate-900">
            Sesi ujian belum dapat dimulai
          </h1>

          <p className="mt-3 rounded-lg bg-red-50 p-4 text-sm leading-6 text-red-700">
            {error}
          </p>

          <p className="mt-3 text-sm text-slate-500">
            Pastikan akun siswa sudah login, konfigurasi jenjang
            dan mata pelajaran sudah dipilih, serta soal tersedia
            di Supabase.
          </p>

          <button
            onClick={() => router.push("/student")}
            className="mt-5 rounded-lg bg-blue-700 px-5 py-3 font-bold text-white"
          >
            Kembali ke Dashboard
          </button>
        </section>
      </main>
    );
  }

  // =====================================================
  // HASIL SESI MATA PELAJARAN
  // =====================================================

  if (finished) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-800">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-2xl bg-white p-6 text-center shadow-sm sm:p-8">
            <div className="text-5xl text-green-600">✓</div>

            <h1 className="mt-4 text-2xl font-extrabold text-slate-900">
              Sesi Mata Pelajaran Selesai
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Hasil penilaian telah dihitung oleh Supabase.
            </p>

            <div className="mt-5 rounded-xl bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-700">
                {examInfo.subject}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Kelas {examInfo.grade} · Sesi{" "}
                {examInfo.subjectIndex + 1} dari {examInfo.totalSubjects}
              </p>
            </div>

            <div className="mt-7 rounded-2xl bg-blue-50 p-6">
              <p className="text-sm font-semibold text-blue-700">
                NILAI AKHIR
              </p>
              <p className="mt-2 text-6xl font-black text-blue-700">
                {Number(result?.score ?? 0).toFixed(2)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Skala nilai 0–100 · Penilaian server
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Total Soal</p>
                <p className="mt-1 text-2xl font-bold">
                  {result?.total_questions ?? questions.length}
                </p>
              </div>

              <div className="rounded-xl bg-green-50 p-4">
                <p className="text-xs text-green-700">Benar</p>
                <p className="mt-1 text-2xl font-bold text-green-700">
                  {result?.correct_answers ?? 0}
                </p>
              </div>

              <div className="rounded-xl bg-red-50 p-4">
                <p className="text-xs text-red-700">Salah</p>
                <p className="mt-1 text-2xl font-bold text-red-700">
                  {result?.incorrect_or_unanswered ?? 0}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Terjawab</p>
                <p className="mt-1 text-2xl font-bold">
                  {answeredCount}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowReview((value) => !value)}
              className="mt-6 w-full rounded-lg bg-green-700 px-7 py-3 font-bold text-white hover:bg-green-800"
            >
              {showReview
                ? "Tutup Rincian Jawaban"
                : "Lihat Rincian Jawaban"}
            </button>

            {reviewLoading && (
              <p className="mt-5 text-sm text-slate-500">
                Mengambil rincian jawaban…
              </p>
            )}

            {reviewError && (
              <div className="mt-5 rounded-lg bg-red-50 p-4 text-left text-sm text-red-700">
                <strong>Review belum tersedia.</strong>
                <p className="mt-1">{reviewError}</p>
                <button
                  onClick={() => loadReview(attemptId)}
                  className="mt-3 rounded-lg bg-red-700 px-4 py-2 font-bold text-white"
                >
                  Coba Muat Ulang
                </button>
              </div>
            )}
          </section>

          {showReview && review && (
            <section className="mt-6 space-y-5">
              <div className="rounded-xl bg-white p-5 shadow-sm">
                <h2 className="text-xl font-extrabold">
                  Review Hasil Ujian
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Periksa jawaban, kunci, dan pembahasan setiap soal.
                </p>
              </div>

              {reviewQuestions.map((item, index) => (
                <article
                  key={item.question_id || index}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-900">
                      Soal Nomor {item.question_order || index + 1}
                    </h3>

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
                        : "PERIKSA JAWABAN"}
                    </span>
                  </div>

                  <p className="mt-2 text-xs font-semibold text-blue-700">
                    {getTypeLabel(normalizeType(item.question_type))}
                  </p>

                  {item.stimulus?.content_text && (
                    <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm leading-6">
                      {item.stimulus.content_text}
                    </div>
                  )}

                  <p className="mt-4 text-sm font-medium leading-7 text-slate-900">
                    {item.question_text}
                  </p>

                  {renderReviewAnswer(item)}

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
            </section>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {hasNextSubject ? (
              <button
                onClick={nextSubject}
                className="flex-1 rounded-lg bg-blue-700 px-7 py-3 font-bold text-white hover:bg-blue-800"
              >
                Lanjut ke Mata Pelajaran Berikutnya →
              </button>
            ) : (
              <button
                onClick={() => router.push("/student/results")}
                className="flex-1 rounded-lg bg-blue-700 px-7 py-3 font-bold text-white hover:bg-blue-800"
              >
                Lihat Rekap Seluruh Hasil →
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // =====================================================
  // HALAMAN CBT
  // =====================================================

  if (!question) return null;

  const currentPayload = normalizePayload(
    answers[question.question_id]
  );

  const categoryOptions = getCategoryOptions(
    question.category_items
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-800">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">
              TKA <span className="text-blue-700">TryOn</span>
            </h1>
            <p className="text-xs text-slate-500">
              {examInfo.subject} · Kelas {examInfo.grade}
            </p>
            <p className="text-xs text-slate-400">
              Sesi {examInfo.subjectIndex + 1} dari{" "}
              {examInfo.totalSubjects}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 px-4 py-2 text-center">
            <p className="text-[10px] font-bold uppercase text-slate-500">
              Sisa Waktu
            </p>
            <p
              className={`font-mono text-xl font-extrabold ${
                remaining < 300 ? "text-red-600" : "text-blue-700"
              }`}
            >
              {formatTime(remaining)}
            </p>
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            Selesai
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 p-4 lg:grid-cols-[1fr_290px] lg:p-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                {question.subject}
              </p>
              <h2 className="mt-1 text-lg font-bold">
                Soal Nomor {current + 1}
              </h2>
            </div>

            <span className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
              {getTypeLabel(question.type)}
            </span>
          </div>

          {question.stimulus && (
            <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {question.stimulus}
            </div>
          )}

          {question.instruction && (
            <p className="mt-5 text-sm italic text-slate-500">
              {question.instruction}
            </p>
          )}

          <p className="mt-6 text-base font-semibold leading-8 text-slate-900">
            {question.question}
          </p>

          {/* PILIHAN GANDA TUNGGAL */}

          {question.type === "PG_TUNGGAL" && (
            <div className="mt-6 space-y-3">
              <p className="text-xs font-semibold text-slate-500">
                Pilih satu jawaban yang paling tepat.
              </p>

              {question.options.map((option) => {
                const active =
                  currentPayload.option_codes.includes(option.code);

                return (
                  <button
                    key={option.code}
                    onClick={() => chooseSingle(option.code)}
                    className={`flex w-full items-start gap-4 rounded-lg border p-4 text-left transition ${
                      active
                        ? "border-blue-600 bg-blue-50"
                        : "border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        active
                          ? "bg-blue-700 text-white"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {option.code}
                    </span>
                    <span className="pt-1 text-sm leading-6">
                      {option.text}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* PILIHAN GANDA KOMPLEKS */}

          {question.type === "PGK_MA" && (
            <div className="mt-6 space-y-3">
              <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                Pilih semua jawaban yang benar. Jawaban dapat lebih dari satu.
              </div>

              {question.options.map((option) => {
                const active =
                  currentPayload.option_codes.includes(option.code);

                return (
                  <button
                    key={option.code}
                    onClick={() => toggleMultiple(option.code)}
                    className={`flex w-full items-start gap-4 rounded-lg border p-4 text-left transition ${
                      active
                        ? "border-blue-600 bg-blue-50"
                        : "border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border text-sm font-bold ${
                        active
                          ? "border-blue-700 bg-blue-700 text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {active ? "✓" : ""}
                    </span>
                    <span className="text-sm font-bold">
                      {option.code}.
                    </span>
                    <span className="text-sm leading-6">
                      {option.text}
                    </span>
                  </button>
                );
              })}

              <p className="text-xs text-slate-500">
                Dipilih: {currentPayload.option_codes.length} jawaban
              </p>
            </div>
          )}

          {/* PILIHAN GANDA KATEGORI */}

          {question.type === "PGK_KATEGORI" && (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                Tentukan kategori yang tepat untuk setiap pernyataan.
              </div>

              {question.category_items.length === 0 && (
                <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
                  Data pernyataan untuk soal kategori belum tersedia.
                </p>
              )}

              {question.category_items.map((item) => {
                const number = String(item.item_number);

                return (
                  <div
                    key={number}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <p className="text-sm font-semibold leading-6 text-slate-900">
                      {item.item_number}. {item.item_text}
                    </p>

                    <select
                      value={
                        currentPayload.category_answers[number] || ""
                      }
                      onChange={(event) =>
                        chooseCategory(number, event.target.value)
                      }
                      className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">Pilih kategori jawaban</option>
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}

              <p className="text-xs text-slate-500">
                Terisi:{" "}
                {Object.keys(currentPayload.category_answers).length} dari{" "}
                {question.category_items.length} pernyataan
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
            <button
              onClick={toggleMark}
              className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
                marked.includes(current)
                  ? "border-amber-400 bg-amber-50 text-amber-800"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              {marked.includes(current)
                ? "★ Ditandai"
                : "☆ Tandai Ragu-ragu"}
            </button>

            <div className="flex gap-2">
              <button
                disabled={current === 0}
                onClick={() => setCurrent((value) => value - 1)}
                className="rounded-lg border border-slate-200 px-5 py-3 text-sm font-bold disabled:opacity-40"
              >
                Sebelumnya
              </button>

              {current < questions.length - 1 ? (
                <button
                  onClick={() => setCurrent((value) => value + 1)}
                  className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800"
                >
                  Berikutnya →
                </button>
              ) : (
                <button
                  onClick={() => setShowConfirm(true)}
                  className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white"
                >
                  Selesai Sesi
                </button>
              )}
            </div>
          </div>
        </section>

        {/* NAVIGASI SOAL */}

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-slate-900">Navigasi Soal</h3>

          <div className="mt-4 grid grid-cols-5 gap-2">
            {questions.map((item, index) => {
              const answered = hasAnswer(
                answers[item.question_id],
                item.type
              );

              return (
                <button
                  key={item.question_id}
                  onClick={() => setCurrent(index)}
                  className={`relative h-10 rounded-lg border text-sm font-bold ${
                    current === index
                      ? "border-blue-700 bg-blue-700 text-white"
                      : answered
                      ? "border-green-300 bg-green-50 text-green-700"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  {index + 1}
                  {marked.includes(index) && (
                    <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-amber-500" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 space-y-3 border-t border-slate-200 pt-5 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-blue-700" />
              Soal aktif
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-green-500" />
              Sudah dijawab
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-amber-500" />
              Ditandai ragu-ragu
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Progres pengerjaan</p>
            <p className="mt-1 text-xl font-extrabold text-slate-900">
              {answeredCount}/{questions.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {saving
                ? "Menyimpan jawaban…"
                : "Jawaban tersimpan otomatis"}
            </p>
          </div>
        </aside>
      </div>

      {/* KONFIRMASI AKHIR SESI */}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-extrabold text-slate-900">
              Akhiri Sesi Ujian?
            </h3>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              Anda telah menjawab {answeredCount} dari{" "}
              {questions.length} soal untuk mata pelajaran{" "}
              <strong>{examInfo.subject}</strong>.
              Setelah diakhiri, jawaban tidak dapat diubah.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                disabled={saving}
                onClick={() => setShowConfirm(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                Kembali
              </button>

              <button
                disabled={saving}
                onClick={finishExam}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? "Memproses…" : "Ya, Akhiri"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
