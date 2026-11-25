
"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BrandLogo from "@/components/brand-logo";
import { formatTime, getExamConfig, normalizeSubjects, normalizeGrade, normalizeType, normalizePayload, hasAnswer, getTypeLabel, getCategoryOptions, getSimulationResults } from "@/lib/student/exam";
import { supabase } from "@/lib/supabase";
import { studentAttemptRequest, studentAttemptQuestions, attemptRemainingSeconds } from "@/lib/student/rpc-contract.mjs";
import { schoolRpc } from "@/lib/school/rpc-contract.mjs";
import { requireAdvanced } from "@/lib/school/advanced.mjs";

// =====================================================
// HELPER
// =====================================================

// =====================================================
// HALAMAN CBT
// =====================================================

function ChallengeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeAttemptId = searchParams.get("attemptId");
  const assignmentId = searchParams.get("assignmentId");
  const scheduledId = searchParams.get("scheduledId");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [error, setError] = useState("");

  const [questions, setQuestions] = useState([]);
  const [attemptId, setAttemptId] = useState(null);

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [marked, setMarked] = useState([]);

  const [remaining, setRemaining] = useState(3600);
  const [finished, setFinished] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [navigationWarning, setNavigationWarning] = useState(false);

  const [result, setResult] = useState(null);
  const [review, setReview] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [showReview, setShowReview] = useState(false);

  const [isFinishing, setIsFinishing] = useState(false);

  const [examInfo, setExamInfo] = useState({
    grade: 6,
    subject: "Matematika",
    subjectIndex: 0,
    totalSubjects: 1,
    simulationId: null,
    resumed: false,
  });

  const startedRef = useRef(false);
  const timerAnchor = useRef(null);
  const finishingRef = useRef(false);
  const answersRef = useRef({});
  const pendingSavesRef = useRef(new Map());
  const confirmDialogRef = useRef(null);

  useEffect(() => {
    const dialog = confirmDialogRef.current;
    if (!showConfirm || !dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [showConfirm]);

  const question = questions[current];

  const answeredCount = useMemo(() => {
    return questions.filter((q) =>
      hasAnswer(answers[q.question_id], q.type)
    ).length;
  }, [questions, answers]);

  const config = scheduledId !== null ? {} : getExamConfig();
  const subjects = normalizeSubjects(config);
  const subjectIndex = Number(config.currentSubjectIndex || 0);
  const hasNextSubject = config.source !== "server" && scheduledId === null && !assignmentId && !resumeAttemptId && subjectIndex < subjects.length - 1;

  // =====================================================
  // MEMULAI / MEMULIHKAN SESI MATA PELAJARAN
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

      const currentConfig = scheduledId !== null ? {} : getExamConfig();
      const subjectList = normalizeSubjects(currentConfig);
      const index = Number(currentConfig.currentSubjectIndex || 0);
      const subject = subjectOverride || subjectList[index] || subjectList[0] || "Matematika";
      const grade = normalizeGrade(currentConfig);
      const duration = Math.min(240, Math.max(1, Number(currentConfig.duration) || 60));
      // Local grouping only; never generate or reinterpret a browser UUID as a TKA code.
      const simulationId = currentConfig.source === "server" ? null : currentConfig.simulationId || null;

      const request = studentAttemptRequest({ assignmentId, scheduledId, resumeAttemptId, config: currentConfig });
      if (scheduledId !== null) {
        const context = await schoolRpc(supabase, "school_portal_context");
        const memberships = context.memberships.filter(m => m.role === "student");
        if (memberships.length !== 1) throw new Error("Membership siswa ambigu atau tidak tersedia. Buka kembali agenda sekolah.");
        await requireAdvanced(supabase, memberships[0].school_id);
      }

      if (!resumeAttemptId && !assignmentId && scheduledId === null) {
        currentConfig.simulationId = simulationId;
        currentConfig.currentSubjectIndex = index;
        sessionStorage.setItem("tryon-exam-config", JSON.stringify(currentConfig));
      }

      setExamInfo({
        grade,
        subject,
        subjectIndex: assignmentId || scheduledId !== null ? 0 : index,
        totalSubjects: assignmentId || scheduledId !== null ? 1 : subjectList.length || 1,
        simulationId,
        resumed: Boolean(resumeAttemptId),
      });

      const { data, error: rpcError } = await supabase.rpc(request.name, request.args);

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

      setExamInfo((previous) => ({
        ...previous,
        grade: Number(data.grade || previous.grade),
        subject: data.subject_name || data.subject || previous.subject,
        resumed: Boolean(resumeAttemptId || data.resumed),
      }));

      const mapped = studentAttemptQuestions(data).map((item) => ({
        ...item,
        type: normalizeType(item.type),
      }));

      // Agenda must not fall back to a browser duration or a different session.
      if (scheduledId !== null && (data.schedule_id !== scheduledId || data.remaining_seconds == null || !Number.isFinite(Date.parse(data.deadline_at)))) {
        throw new Error("Identitas atau waktu agenda dari server tidak valid. Buka kembali agenda; jangan mulai sesi mandiri.");
      }
      // Timer menggunakan sisa waktu dari server.
      const serverRemaining = attemptRemainingSeconds(data, duration);
      setAttemptId(data.attempt_id);
      setQuestions(mapped);
      timerAnchor.current = serverRemaining === null ? null : { at: performance.now(), seconds: serverRemaining };
      setRemaining(serverRemaining);

      // Jawaban kosong untuk semua soal sebagai nilai awal.
      const initialAnswers = {};

      mapped.forEach((item) => {
        initialAnswers[item.question_id] = normalizePayload(item.answer_payload);
      });

      // Pulihkan jawaban yang telah tersimpan di database.
      if (data.answers && typeof data.answers === "object") {
        Object.entries(data.answers).forEach(([questionId, payload]) => {
          if (initialAnswers[questionId]) {
            initialAnswers[questionId] = normalizePayload(payload);
          }
        });
      }

      answersRef.current = initialAnswers;
      setAnswers(initialAnswers);
      setCurrent(0);
      setNavigationWarning(false);

      // Jika waktu sudah habis ketika siswa membuka kembali halaman,
      // sesi langsung diproses sebagai ujian yang telah berakhir.
      if (data.remaining_seconds != null && Number(data.remaining_seconds) <= 0) {
        setRemaining(0);
      }
    } catch (err) {
      startedRef.current = false;
      setError(err?.message?.includes("LEARNING_PACKAGE_EXPIRED") ? "Batas waktu paket sudah berakhir. Sesi yang sudah dimulai tetap dapat dilanjutkan dari riwayat." : err?.message || "Ujian gagal dimulai.");
    } finally {
      setLoading(false);
    }
  }, [resumeAttemptId, assignmentId, scheduledId]);

  useEffect(() => {
    const timer = setTimeout(() => startExam(), 0);
    return () => clearTimeout(timer);
  }, [startExam]);

  // =====================================================
  // SIMPAN JAWABAN KE SUPABASE
  // =====================================================

  const persistAnswer = useCallback(
    (questionId, payload) => {
      if (!attemptId) {
        return Promise.reject(new Error("Sesi ujian belum siap."));
      }

      setSaving(true);
      setSaveStatus("saving");
      setError("");

      // Serialisasi penyimpanan per soal.
      // Jawaban terbaru tidak boleh tertimpa respons lama.
      const previousSave = pendingSavesRef.current.get(questionId);

      const savePromise = Promise.resolve(previousSave)
        .catch(() => {})
        .then(async () => {
          const { error: saveError } = await supabase.rpc(
            "save_exam_answer",
            {
              p_attempt_id: attemptId,
              p_question_id: questionId,
              p_answer_payload: payload,
            }
          );

          if (saveError) throw saveError;
          setSaveStatus("saved");
        })
        .catch((err) => {
          setSaveStatus("error");
          setError(
            `Jawaban belum berhasil disimpan: ${
              err?.message || "Kesalahan koneksi"
            }`
          );
          throw err;
        })
        .finally(() => {
          if (pendingSavesRef.current.get(questionId) === savePromise) {
            pendingSavesRef.current.delete(questionId);
          }

          const hasPendingSaves = pendingSavesRef.current.size > 0;
          setSaving(hasPendingSaves);
          if (hasPendingSaves) setSaveStatus("saving");
        });

      pendingSavesRef.current.set(questionId, savePromise);

      return savePromise;
    },
    [attemptId]
  );

  // =====================================================
  // UPDATE JAWABAN
  // =====================================================

  const updateAnswer = (questionId, payload) => {
    if (finishingRef.current || finished) return;

    const next = {
      ...answersRef.current,
      [questionId]: payload,
    };

    answersRef.current = next;
    setAnswers(next);

    persistAnswer(questionId, payload).catch(() => {});
  };

  const chooseSingle = (optionCode) => {
    if (!question || finished || finishingRef.current) return;

    updateAnswer(question.question_id, {
      option_codes: [optionCode],
      category_answers: {},
    });
  };

  const toggleMultiple = (optionCode) => {
    if (!question || finished || finishingRef.current) return;

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
    if (!question || finished || finishingRef.current) return;

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
      return data;
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

  const saveSessionResult = useCallback(
    (data, reviewData) => {
      // Hasil tugas tersimpan di database; jangan menimpa cache simulasi mandiri.
      if (assignmentId || scheduledId !== null || resumeAttemptId) return;
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
    },
    [answeredCount, attemptId, assignmentId, scheduledId, resumeAttemptId, examInfo, questions.length]
  );

  // =====================================================
  // MENYELESAIKAN SESI
  // =====================================================

  const finishExam = useCallback(async () => {
    if (!attemptId || finishingRef.current || finished) return;

    finishingRef.current = true;
    setIsFinishing(true);
    setSaving(true);
    setError("");

    try {
      // Pastikan semua jawaban yang sedang dikirim selesai
      // sebelum database menerima perintah submit.
      await Promise.all([...pendingSavesRef.current.values()]);

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

      const reviewData = await loadReview(attemptId);

      saveSessionResult(data, reviewData);
    } catch (err) {
      finishingRef.current = false;
      setIsFinishing(false);

      setError(
        err?.message ||
          "Ujian belum berhasil diselesaikan. Silakan coba kembali."
      );
    } finally {
      setSaving(false);
    }
  }, [attemptId, finished, loadReview, saveSessionResult]);

  // =====================================================
  // LANJUT KE MATA PELAJARAN BERIKUTNYA
  // =====================================================

  const nextSubject = () => {
    const currentConfig = scheduledId !== null ? {} : getExamConfig();
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

    // Reset state sesi sebelumnya.
    startedRef.current = false;
    finishingRef.current = false;
    setIsFinishing(false);
    answersRef.current = {};
    pendingSavesRef.current.clear();

    setLoading(true);
    setSaving(false);
    setSaveStatus("idle");
    setError("");
    setQuestions([]);
    setAttemptId(null);
    setCurrent(0);
    setAnswers({});
    setMarked([]);
    setRemaining(3600);
    setFinished(false);
    setShowConfirm(false);
    setNavigationWarning(false);
    setResult(null);
    setReview(null);
    setReviewError("");
    setShowReview(false);

    startExam(subjectList[nextIndex]);
  };

  // =====================================================
  // PENGAMAN NAVIGASI SAAT UJIAN AKTIF
  // =====================================================

  useEffect(() => {
    if (!attemptId || finished) return;

    const lockState = { tkaExamLock: attemptId };

    // Tambahkan satu entri history untuk menahan tombol Back.
    window.history.pushState(
      lockState,
      "",
      window.location.href
    );

    const handlePopState = () => {
      // Ketika tombol Back ditekan, kembalikan history ke halaman CBT.
      window.history.pushState(
        lockState,
        "",
        window.location.href
      );

      setNavigationWarning(true);
    };

    const handleBeforeUnload = (event) => {
      event.preventDefault();

      event.returnValue =
        "Ujian masih berlangsung. Jika meninggalkan halaman, sesi tetap berjalan.";

      return event.returnValue;
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [attemptId, finished]);

  // =====================================================
  // TIMER
  // =====================================================

  const isUntimed = remaining === null;
  const isTimeExpired = !isUntimed && remaining <= 0;
  const timerWarning = remaining > 0 && remaining <= 300;
  const timerCritical = remaining > 0 && remaining <= 60;

  useEffect(() => {
    if (loading || finished || !attemptId || isUntimed) return;

    if (isTimeExpired) {
      const timer = setTimeout(() => finishExam(), 0);
      return () => clearTimeout(timer);
    }

    const timer = setInterval(() => {
      setRemaining((previous) => {
        if (previous <= 1) {
          clearInterval(timer);
          return 0;
        }

        const anchor = timerAnchor.current;
        return anchor ? Math.max(0, Math.ceil(anchor.seconds - (performance.now() - anchor.at) / 1000)) : previous - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [loading, finished, attemptId, isUntimed, isTimeExpired, finishExam]);

  // =====================================================
  // TANDA RAGU-RAGU
  // =====================================================

  const toggleMark = () => {
    if (finishingRef.current || finished) return;

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
                className="rounded-lg border border-line p-3"
              >
                <p className="text-sm font-medium text-ink-body">
                  {category.item_number}. {category.item_text}
                </p>
                <p className="mt-2 text-sm">
                  Jawaban siswa: <strong>{studentAnswer}</strong>
                </p>
                <p className="text-sm text-success-ink">
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
                  ? "border-success-line bg-success-soft"
                  : selected
                  ? "border-danger-line bg-danger-soft"
                  : "border-line bg-surface"
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

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-surface-raised text-ink-secondary">
        <div className="rounded-2xl bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-accent-line border-t-accent" />
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
      <main className="min-h-screen grid place-items-center bg-surface-raised p-5 text-ink-body">
        <section className="w-full max-w-xl rounded-2xl bg-surface p-7 shadow-sm">
          <h1 className="text-xl font-extrabold text-ink">
            Sesi ujian belum dapat dimulai
          </h1>

          <p className="mt-3 rounded-lg bg-danger-soft p-4 text-sm leading-6 text-danger-ink">
            {error}
          </p>

          <p className="mt-3 text-sm text-ink-muted">
            Periksa status akses melalui halaman Paket. Untuk sesi yang sudah dimulai, buka riwayat hasil dan lanjutkan sesi yang masih berjalan.
          </p>

          <button
            onClick={() => router.push("/student")}
            className="mt-5 rounded-lg bg-primary px-5 py-3 font-bold text-on-primary"
          >
            Kembali ke Dashboard
          </button>
          <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold text-accent-ink">
            <button onClick={() => router.push("/subscription")} className="min-h-11 underline">Paket dan aktivasi langganan</button>
            <button onClick={() => router.push("/student/results")} className="min-h-11 underline">Riwayat dan sesi berjalan</button>
          </div>
        </section>
      </main>
    );
  }

  // =====================================================
  // HASIL SESI MATA PELAJARAN
  // =====================================================

  if (finished) {
    return (
      <main className="min-h-screen bg-surface-raised px-4 py-8 text-ink-body">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-2xl bg-surface p-6 text-center shadow-sm sm:p-8">
            <div className="text-5xl text-success-ink">✓</div>

            <h1 className="mt-4 text-2xl font-extrabold text-ink">
              Sesi Mata Pelajaran Selesai
            </h1>

            <p className="mt-2 text-sm text-ink-secondary">
              Hasil penilaian telah dihitung oleh Supabase.
            </p>

            <div className="mt-5 rounded-xl bg-accent-soft p-4">
              <p className="text-sm font-bold text-accent-ink">
                {examInfo.subject}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Kelas {examInfo.grade} · Sesi{" "}
                {examInfo.subjectIndex + 1} dari {examInfo.totalSubjects}
              </p>
            </div>

            <div className="mt-7 rounded-2xl bg-accent-soft p-6">
              <p className="text-sm font-semibold text-accent-ink">
                NILAI AKHIR
              </p>
              <p className="mt-2 text-6xl font-black text-accent-ink">
                {Number(result?.score ?? 0).toFixed(2)}
              </p>
              <p className="mt-2 text-xs text-ink-muted">
                Skala nilai 0–100 · Penilaian server
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-surface-muted p-4">
                <p className="text-xs text-ink-muted">Total Soal</p>
                <p className="mt-1 text-2xl font-bold">
                  {result?.total_questions ?? questions.length}
                </p>
              </div>

              <div className="rounded-xl bg-success-soft p-4">
                <p className="text-xs text-success-ink">Benar</p>
                <p className="mt-1 text-2xl font-bold text-success-ink">
                  {result?.correct_answers ?? 0}
                </p>
              </div>

              <div className="rounded-xl bg-danger-soft p-4">
                <p className="text-xs text-danger-ink">Salah</p>
                <p className="mt-1 text-2xl font-bold text-danger-ink">
                  {result?.incorrect_or_unanswered ?? 0}
                </p>
              </div>

              <div className="rounded-xl bg-surface-muted p-4">
                <p className="text-xs text-ink-muted">Terjawab</p>
                <p className="mt-1 text-2xl font-bold">
                  {answeredCount}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowReview((value) => !value)}
              className="mt-6 w-full rounded-lg bg-success px-7 py-3 font-bold text-on-inverse hover:bg-success"
            >
              {showReview
                ? "Tutup Rincian Jawaban"
                : "Lihat Rincian Jawaban"}
            </button>

            {reviewLoading && (
              <p className="mt-5 text-sm text-ink-muted">
                Mengambil rincian jawaban…
              </p>
            )}

            {reviewError && (
              <div className="mt-5 rounded-lg bg-danger-soft p-4 text-left text-sm text-danger-ink">
                <strong>Review belum tersedia.</strong>
                <p className="mt-1">{reviewError}</p>
                <button
                  onClick={() => loadReview(attemptId)}
                  className="mt-3 rounded-lg bg-danger px-4 py-2 font-bold text-on-inverse"
                >
                  Coba Muat Ulang
                </button>
              </div>
            )}
          </section>

          {showReview && review && (
            <section className="mt-6 space-y-5">
              <div className="rounded-xl bg-surface p-5 shadow-sm">
                <h2 className="text-xl font-extrabold">
                  Review Hasil Ujian
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Periksa jawaban, kunci, dan pembahasan setiap soal.
                </p>
              </div>

              {reviewQuestions.map((item, index) => (
                <article
                  key={item.question_id || index}
                  className="rounded-xl border border-line bg-surface p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-ink">
                      Soal Nomor {item.question_order || index + 1}
                    </h3>

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
                        : "PERIKSA JAWABAN"}
                    </span>
                  </div>

                  <p className="mt-2 text-xs font-semibold text-accent-ink">
                    {getTypeLabel(normalizeType(item.question_type))}
                  </p>

                  {item.stimulus?.content_text && (
                    <div className="mt-4 rounded-lg bg-surface-muted p-4 text-sm leading-6">
                      {item.stimulus.content_text}
                    </div>
                  )}

                  <p className="mt-4 text-sm font-medium leading-7 text-ink">
                    {item.question_text}
                  </p>

                  {renderReviewAnswer(item)}

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
            </section>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {hasNextSubject ? (
              <button
                onClick={nextSubject}
                className="flex-1 rounded-lg bg-primary px-7 py-3 font-bold text-on-primary hover:bg-primary-hover"
              >
                Lanjut ke Mata Pelajaran Berikutnya →
              </button>
            ) : (
              <button
                onClick={() => router.push("/student/results")}
                className="flex-1 rounded-lg bg-primary px-7 py-3 font-bold text-on-primary hover:bg-primary-hover"
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

  return (
    <main className="min-h-screen bg-surface-raised text-ink-body">
      {navigationWarning && (
        <div className="fixed left-1/2 top-4 z-[60] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning-ink shadow-lg">
          <p className="font-bold">Ujian masih berlangsung</p>
          <p className="mt-1">
            Tombol Back tidak mengakhiri ujian. Sesi dan waktu ujian tetap
            berjalan. Gunakan tombol Selesai jika memang ingin mengakhiri ujian.
          </p>
          <button
            type="button"
            onClick={() => setNavigationWarning(false)}
            className="mt-3 rounded-lg bg-warning px-3 py-2 text-xs font-bold text-on-inverse"
          >
            Mengerti
          </button>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <BrandLogo className="h-12 w-14" />

          <div>
            <h1 className="text-lg font-extrabold text-ink">
              TKA <span className="text-accent-ink">TryOn</span>
            </h1>
            <p className="text-xs text-ink-muted">
              {examInfo.subject} · Kelas {examInfo.grade}
            </p>
            <p className="text-xs text-ink-muted">
              Sesi {examInfo.subjectIndex + 1} dari{" "}
              {examInfo.totalSubjects}
            </p>
          </div>

          <div
            className={`rounded-lg border px-4 py-2 text-center ${
              timerCritical
                ? "border-danger-line bg-danger-soft"
                : timerWarning
                  ? "border-warning-line bg-warning-soft"
                  : "border-line"
            }`}
          >
            <p className="text-[10px] font-bold uppercase text-ink-muted">
              Sisa Waktu
            </p>
            <p
              role="timer"
              aria-live="off"
              aria-label="Sisa waktu ujian"
              className={`font-mono text-xl font-extrabold ${
                timerCritical
                  ? "animate-pulse text-danger-ink"
                  : timerWarning
                    ? "text-warning-ink"
                    : "text-accent-ink"
              }`}
            >
              {isUntimed ? "Tanpa batas waktu" : formatTime(remaining)}
            </p>
            {timerCritical && (
              <p
                role="status"
                aria-live="assertive"
                className="mt-1 max-w-[10rem] text-[10px] font-bold leading-4 text-danger-ink"
              >
                Waktu hampir habis. Ujian akan dikirim otomatis.
              </p>
            )}
            {timerWarning && !timerCritical && (
              <p
                role="status"
                aria-live="polite"
                className="mt-1 max-w-[10rem] text-[10px] font-semibold leading-4 text-warning-ink"
              >
                Sisa waktu kurang dari 5 menit.
              </p>
            )}
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            disabled={isFinishing || saving}
            className="rounded-lg bg-danger px-4 py-2 text-sm font-bold text-on-inverse hover:bg-danger disabled:opacity-50"
          >
            Selesai
          </button>
        </div>
      </header>

      {examInfo.resumed && (
        <div className="mx-auto mt-4 max-w-7xl px-4 lg:px-6">
          <div className="rounded-lg border border-accent-line bg-accent-soft px-4 py-3 text-sm text-accent-strong">
            <strong>Sesi ujian dipulihkan.</strong> Kamu melanjutkan sesi ujian
            sebelumnya. Jawaban yang tersimpan dimuat kembali. Sisa waktu mengikuti batas akhir sesi.
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-5 p-4 lg:grid-cols-[1fr_290px] lg:p-6">
        <section className="rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-7">
          {error && (
            <p className="mb-4 rounded-lg bg-danger-soft p-3 text-sm text-danger-ink">
              {error}
            </p>
          )}

          {saveStatus === "saving" && (
            <p
              role="status"
              aria-live="polite"
              className="mb-4 rounded-lg bg-accent-soft p-3 text-xs font-semibold text-accent-ink"
            >
              Menyimpan jawaban ke server…
            </p>
          )}

          {saveStatus === "saved" && !saving && (
            <p
              role="status"
              aria-live="polite"
              className="mb-4 rounded-lg bg-success-soft p-3 text-xs font-semibold text-success-ink"
            >
              Jawaban tersimpan.
            </p>
          )}

          {saveStatus === "error" && !saving && (
            <p
              role="status"
              aria-live="assertive"
              className="mb-4 rounded-lg bg-danger-soft p-3 text-xs font-semibold text-danger-ink"
            >
              Jawaban gagal tersimpan. Periksa koneksi lalu pilih jawaban lagi
              untuk mencoba kembali.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-accent-ink">
                {question.subject}
              </p>
              <h2 className="mt-1 text-lg font-bold">
                Soal Nomor {current + 1}
              </h2>
            </div>

            <span className="rounded-md bg-accent-soft px-3 py-2 text-xs font-semibold text-accent-ink">
              {getTypeLabel(question.type)}
            </span>
          </div>

          {question.stimulus && (
            <div className="mt-6 rounded-lg bg-surface-muted p-4 text-sm leading-7 text-ink-body">
              {question.stimulus}
            </div>
          )}

          {question.instruction && (
            <p className="mt-5 text-sm italic text-ink-muted">
              {question.instruction}
            </p>
          )}

          <p className="mt-6 text-base font-semibold leading-8 text-ink">
            {question.question}
          </p>

          {/* PILIHAN GANDA TUNGGAL */}

          {question.type === "PG_TUNGGAL" && (
            <div className="mt-6 space-y-3">
              <p className="text-xs font-semibold text-ink-muted">
                Pilih satu jawaban yang paling tepat.
              </p>

              {question.options.map((option) => {
                const active =
                  currentPayload.option_codes.includes(option.code);

                return (
                  <button
                    key={option.code}
                    disabled={isFinishing}
                    onClick={() => chooseSingle(option.code)}
                    className={`flex w-full items-start gap-4 rounded-lg border p-4 text-left transition ${
                      active
                        ? "border-accent bg-accent-soft"
                        : "border-line hover:border-accent"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        active
                          ? "bg-primary text-on-primary"
                          : "bg-surface-raised text-ink-body"
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
              <div className="rounded-lg bg-accent-soft p-3 text-sm text-accent-strong">
                Pilih semua jawaban yang benar. Jawaban dapat lebih dari satu.
              </div>

              {question.options.map((option) => {
                const active =
                  currentPayload.option_codes.includes(option.code);

                return (
                  <button
                    key={option.code}
                    disabled={isFinishing}
                    onClick={() => toggleMultiple(option.code)}
                    className={`flex w-full items-start gap-4 rounded-lg border p-4 text-left transition ${
                      active
                        ? "border-accent bg-accent-soft"
                        : "border-line hover:border-accent"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border text-sm font-bold ${
                        active
                          ? "border-accent bg-primary text-on-primary"
                          : "border-line-strong bg-surface"
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

              <p className="text-xs text-ink-muted">
                Dipilih: {currentPayload.option_codes.length} jawaban
              </p>
            </div>
          )}

          {/* PILIHAN GANDA KATEGORI */}

          {question.type === "PGK_KATEGORI" && (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg bg-accent-soft p-3 text-sm text-accent-strong">
                Tentukan kategori yang tepat untuk setiap pernyataan.
                Pilih salah satu kategori yang tersedia pada masing-masing pernyataan.
              </div>

              {question.category_items.length === 0 && (
                <p className="rounded-lg bg-danger-soft p-4 text-sm text-danger-ink">
                  Data pernyataan untuk soal kategori belum tersedia.
                </p>
              )}

              {question.category_items.map((item) => {
                const number = String(item.item_number);
                const selectedCategory =
                  currentPayload.category_answers[number] || "";

                return (
                  <div
                    key={number}
                    className="rounded-xl border border-line bg-surface p-4 transition"
                  >
                    <p className="text-sm font-semibold leading-6 text-ink">
                      {item.item_number}. {item.item_text}
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {getCategoryOptions([item]).map((category) => {
                        const active = selectedCategory === category;

                        return (
                          <label
                            key={category}
                            className={`flex cursor-pointer items-center justify-center gap-3 rounded-lg border px-4 py-3 transition ${
                              active
                                ? category === "BENAR"
                                  ? "border-success-line bg-success-soft text-success-ink"
                                  : "border-danger-line bg-danger-soft text-danger-ink"
                                : "border-line bg-surface text-ink-secondary hover:border-line-strong"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`category-${question.question_id}-${number}`}
                              value={category}
                              checked={active}
                              disabled={isFinishing}
                              onChange={() =>
                                chooseCategory(number, category)
                              }
                              className={`h-4 w-4 ${
                                category === "BENAR"
                                  ? "accent-success"
                                  : "accent-danger"
                              }`}
                            />

                            <span className="text-sm font-bold">
                              {category}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <p className="text-xs text-ink-muted">
                Terisi:{" "}
                {Object.keys(currentPayload.category_answers).length} dari{" "}
                {question.category_items.length} pernyataan
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <button
              aria-pressed={marked.includes(current)}
              onClick={toggleMark}
              className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
                marked.includes(current)
                  ? "border-warning-line bg-warning-soft text-warning-ink"
                  : "border-line text-ink-secondary"
              }`}
            >
              {marked.includes(current)
                ? "★ Ditandai"
                : "☆ Tandai Ragu-ragu"}
            </button>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <button
                disabled={current === 0}
                onClick={() => setCurrent((value) => value - 1)}
                className="rounded-lg border border-line px-5 py-3 text-sm font-bold disabled:opacity-40"
              >
                Sebelumnya
              </button>

              {current < questions.length - 1 ? (
                <button
                  onClick={() => setCurrent((value) => value + 1)}
                  className="rounded-lg bg-primary px-5 py-3 text-sm font-bold text-on-primary hover:bg-primary-hover"
                >
                  Berikutnya →
                </button>
              ) : (
                <button
                  onClick={() => setShowConfirm(true)}
                  className="rounded-lg bg-primary px-5 py-3 text-sm font-bold text-on-primary"
                >
                  Selesai Sesi
                </button>
              )}
            </div>
          </div>
        </section>

        {/* NAVIGASI SOAL */}

        <aside className="h-fit rounded-xl border border-line bg-surface p-5 shadow-sm">
          <h3 className="font-bold text-ink">Navigasi Soal</h3>

          <div className="mt-4 grid grid-cols-5 gap-2">
            {questions.map((item, index) => {
              const answered = hasAnswer(
                answers[item.question_id],
                item.type
              );

              return (
                <button
                  key={item.question_id}
                  aria-current={current === index ? "step" : undefined}
                  aria-label={`Soal ${index + 1}, ${answered ? "sudah dijawab" : "belum dijawab"}${marked.includes(index) ? ", ditandai ragu-ragu" : ""}`}
                  onClick={() => setCurrent(index)}
                  className={`relative h-11 rounded-lg border text-sm font-bold ${
                    current === index
                      ? "border-accent bg-primary text-on-primary"
                      : answered
                      ? "border-success-line bg-success-soft text-success-ink"
                      : "border-line text-ink-secondary"
                  }`}
                >
                  {index + 1}
                  {marked.includes(index) && (
                    <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-warning" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 space-y-3 border-t border-line pt-5 text-xs text-ink-secondary">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-primary" />
              Soal aktif
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-success" />
              Sudah dijawab
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-warning" />
              Ditandai ragu-ragu
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-surface-muted p-4">
            <p className="text-xs text-ink-muted">Progres pengerjaan</p>
            <p className="mt-1 text-xl font-extrabold text-ink">
              {answeredCount}/{questions.length}
            </p>
            <p
              role="status"
              aria-live="polite"
              className={`mt-1 text-xs ${
                saveStatus === "error"
                  ? "font-semibold text-danger-ink"
                  : saveStatus === "saved"
                    ? "font-semibold text-success-ink"
                    : "text-ink-muted"
              }`}
            >
              {saveStatus === "saving"
                ? "Menyimpan jawaban…"
                : saveStatus === "error"
                  ? "Gagal tersimpan"
                  : saveStatus === "saved"
                    ? "Tersimpan"
                    : "Jawaban tersimpan otomatis"}
            </p>
          </div>
        </aside>
      </div>

      {/* KONFIRMASI AKHIR SESI */}

      {showConfirm && (
        <dialog
          ref={confirmDialogRef}
          aria-labelledby="finish-dialog-title"
          aria-describedby="finish-dialog-description"
          onCancel={(event) => {
            if (saving) event.preventDefault();
            else setShowConfirm(false);
          }}
          className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl bg-surface p-0 shadow-xl backdrop:bg-black/50"
        >
          <div className="p-6">
            <h3 id="finish-dialog-title" className="text-xl font-extrabold text-ink">
              Akhiri Sesi Ujian?
            </h3>

            <p id="finish-dialog-description" className="mt-3 text-sm leading-6 text-ink-secondary">
              Kamu telah menjawab {answeredCount} dari{" "}
              {questions.length} soal untuk mata pelajaran{" "}
              <strong>{examInfo.subject}</strong>.
              Setelah diakhiri, jawaban tidak dapat diubah.
            </p>

            {saving && (
              <p className="mt-3 rounded-lg bg-accent-soft p-3 text-xs text-accent-ink">
                Sistem sedang menyimpan jawaban. Mohon tunggu sebelum
                mengakhiri ujian.
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                disabled={saving}
                onClick={() => setShowConfirm(false)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                Kembali
              </button>

              <button
                disabled={saving}
                onClick={finishExam}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-bold text-on-inverse disabled:opacity-50"
              >
                {saving ? "Memproses…" : "Ya, Akhiri"}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </main>
  );
}

function ChallengeSession() {
  const params = useSearchParams();
  return <ChallengeContent key={params.toString()} />;
}

export default function ChallengePage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-surface-raised text-ink-secondary">
          <p className="font-semibold">Menyiapkan sesi ujian…</p>
        </main>
      }
    >
      <ChallengeSession />
    </Suspense>
  );
}
