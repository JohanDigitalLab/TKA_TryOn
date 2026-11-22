"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PortalHeader from "@/components/portal-header";
import { supabase } from "@/lib/supabase";
import { normalizePayload, normalizeType, getTypeLabel } from "@/lib/student/exam";
import DashboardBreadcrumb from "@/components/dashboard-breadcrumb";

function typeLabel(type) {
  const value = String(type || "").toUpperCase();
  return value === "TRYOUT" ? "Simulasi TKA" : value === "ASSIGNMENT" ? "Tugas Sekolah" : "Latihan Soal";
}

function AnswerReview({ item }) {
  const payload = normalizePayload(item.answer_payload);
  const type = normalizeType(item.question_type);

  if (type === "PGK_KATEGORI") {
    return (
      <div className="mt-4 space-y-3">
        {(item.category_items || []).map((category) => {
          const student = String(
            payload.category_answers[String(category.item_number)] || "Belum dijawab"
          ).toUpperCase();
          const correct = String(category.correct_category || "-").toUpperCase();
          const isCorrect = student === correct;
          return (
            <div key={category.item_number} className={`rounded-lg border p-3 text-sm ${isCorrect ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
            <div className="flex flex-wrap items-start gap-2">
              <span className="font-bold">{category.item_number}.</span>
              <span className="min-w-0 flex-1">{category.item_text}</span>
              <div className="ml-auto flex w-full shrink-0 flex-col items-start gap-1 text-left text-xs sm:w-auto sm:items-end sm:text-right">
                <span>Jawaban siswa: <strong>{student}</strong></span>
                <span className="font-semibold text-green-700">Kunci jawaban: {correct}</span>
              </div>
            </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {(item.options || []).map((option) => {
        const selected = payload.option_codes.includes(option.option_code);
        return (
          <div key={option.option_code} className={`rounded-lg border p-3 text-sm ${option.is_correct ? "border-green-300 bg-green-50" : selected ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-start gap-2">
              <span className="font-bold">{option.option_code}.</span>
              <span className="min-w-0 flex-1">{option.option_text}</span>
              {(selected || option.is_correct) && (
                <span className="ml-auto flex shrink-0 flex-col items-end gap-1 text-right text-xs font-bold">
                  {selected && <span className="text-slate-700">Jawaban siswa</span>}
                  {option.is_correct && <span className="text-green-700">Kunci jawaban</span>}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StudentReviewPage({ attemptId }) {
  const router = useRouter();
  const [review, setReview] = useState(null);
  const [historyItem, setHistoryItem] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showBackToNavigation, setShowBackToNavigation] = useState(false);

  useEffect(() => {
    if (!attemptId) return undefined;
    const decodedAttemptId = decodeURIComponent(attemptId);
    let mounted = true;
    async function load() {
      try {
        const [reviewResponse, historyResponse, userResponse] = await Promise.all([
          supabase.rpc("get_exam_attempt_review", { p_attempt_id: decodedAttemptId }),
          supabase.rpc("get_student_history", { p_limit: 0 }),
          supabase.auth.getUser(),
        ]);
        if (reviewResponse.error) throw reviewResponse.error;
        if (!reviewResponse.data) throw new Error("Data review belum tersedia.");
        if (!mounted) return;
        setReview(reviewResponse.data);
        setHistoryItem((Array.isArray(historyResponse.data) ? historyResponse.data : []).find((item) => item.attempt_id === decodedAttemptId) || null);
        if (userResponse.data?.user?.id) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("full_name, is_managed")
            .eq("id", userResponse.data.user.id)
            .maybeSingle();
          if (mounted) setProfile(profileData);
        }
      } catch (err) {
        if (mounted) setError(err.message || "Review belum berhasil dimuat.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [attemptId]);

  useEffect(() => {
    const navigation = document.getElementById("review-question-navigation");
    if (!navigation) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setShowBackToNavigation(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(navigation);
    return () => observer.disconnect();
  }, [review]);

  const questions = useMemo(() => review?.questions || [], [review]);
  const attemptType = String(review?.attempt_type || historyItem?.attempt_type || "EXERCISE").toUpperCase();
  const startedAt = review?.started_at || historyItem?.started_at || review?.created_at || historyItem?.created_at;
  const submittedAt = review?.submitted_at || historyItem?.submitted_at;
  const createdAt = review?.created_at || historyItem?.created_at;
  const calculatedDurationSeconds = submittedAt && createdAt
    ? Math.max(0, Math.floor((new Date(submittedAt).getTime() - new Date(createdAt).getTime()) / 1000))
    : 0;
  const durationSeconds = calculatedDurationSeconds || Number(review?.duration_seconds ?? review?.duration ?? historyItem?.duration_seconds ?? 0);
  const durationLabel = durationSeconds > 0
    ? `${Math.floor(durationSeconds / 60)} menit ${durationSeconds % 60} detik`
    : "-";
  const answered = useMemo(() => questions.filter((item) => {
    const payload = normalizePayload(item.answer_payload);
    return payload.option_codes.length > 0 || Object.keys(payload.category_answers).length > 0;
  }).length, [questions]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-600">Memuat review…</main>;
  if (error) return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><div className="rounded-2xl bg-white p-7 text-red-700 shadow-sm">{error}</div></main>;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <PortalHeader displayName={profile?.full_name || "Siswa"} isManaged={profile?.is_managed} onSignOut={async () => { await supabase.auth.signOut(); router.push("/"); }} />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
         <DashboardBreadcrumb current="Review Hasil" />

        {/* PAGE TITLE */}
        <section className="mb-8">
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Review Hasil {typeLabel(attemptType)}
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Durasi pengerjaan: {durationLabel} | Tanggal mulai: {startedAt ? new Date(startedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-"}
          </p>
        </section>


        <section id="summary" className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="font-extrabold">Ringkasan</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-blue-50 p-4"><p className="text-xs text-blue-700">Nilai</p><p className="mt-1 text-3xl font-black text-blue-700">{Number(review?.score || 0).toFixed(2)}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Jumlah Soal</p><p className="mt-1 text-2xl font-bold">{review?.total_questions ?? questions.length}</p></div>
            <div className="rounded-xl bg-green-50 p-4"><p className="text-xs text-green-700">Benar</p><p className="mt-1 text-2xl font-bold text-green-700">{review?.correct_answers ?? 0}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Soal Dijawab</p><p className="mt-1 text-2xl font-bold">{answered}</p></div>
          </div>
        </section>

        <section id="review-question-navigation" className="mt-6 scroll-mt-24 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-extrabold">Navigasi Soal</h2>
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Navigasi soal review">
            {questions.map((item, index) => <a key={item.question_id || index} href={`#review-question-${index + 1}`} className={`grid h-10 w-10 place-items-center rounded-lg border text-sm font-bold ${item.is_correct === true ? "border-green-300 bg-green-100 text-green-700" : item.is_correct === false ? "border-red-300 bg-red-100 text-red-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>{item.question_order || index + 1}</a>)}
          </nav>
        </section>

        <section className="mt-6 space-y-5">
          {questions.map((item, index) => <article id={`review-question-${index + 1}`} key={item.question_id || index} className={`scroll-mt-24 rounded-2xl border bg-white p-5 shadow-sm ${item.is_correct === true ? "border-green-200" : item.is_correct === false ? "border-red-200" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Soal Nomor {item.question_order || index + 1}</h2><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.is_correct === true ? "bg-green-100 text-green-700" : item.is_correct === false ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{item.is_correct === true ? "BENAR" : item.is_correct === false ? "SALAH" : "PERIKSA JAWABAN"}</span></div>
            <p className="mt-2 text-xs font-semibold text-blue-700">{getTypeLabel(normalizeType(item.question_type))}</p>
            {item.stimulus?.content_text && <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm leading-6">{item.stimulus.content_text}</div>}
            <p className="mt-4 text-sm font-medium leading-7 text-slate-900">{item.question_text}</p>
            <AnswerReview item={item} />
            {item.explanation && <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4"><p className="text-xs font-bold uppercase text-blue-700">Pembahasan</p><p className="mt-2 text-sm leading-6 text-slate-700">{item.explanation}</p></div>}
          </article>)}
        </section>
      </div>
      {questions.length > 0 && <button type="button" aria-label="Kembali ke navigasi soal" onClick={() => document.getElementById("review-question-navigation")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="fixed bottom-5 left-auto right-5 z-[100] grid h-12 w-12 place-items-center rounded-full bg-blue-700 text-xl font-bold text-white shadow-lg hover:bg-blue-800 lg:left-[calc(50%+32rem+0.75rem)] lg:right-auto">↑</button>}
    </main>
  );
}
