"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ReviewSession } from "../../results/page";

function AttemptReview() {
  const { attemptId } = useParams();
  const [review, setReview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      setReview(null);
      try {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(attemptId))) {
          throw new Error("ID sesi simulasi tidak valid.");
        }
        const { data: userData, error: authError } = await supabase.auth.getUser();
        if (authError || !userData?.user) throw new Error("Silakan masuk terlebih dahulu untuk melihat review milik Anda.");
        const { data, error: requestError } = await supabase.rpc("get_exam_attempt_review", { p_attempt_id: attemptId });
        if (requestError) throw requestError;
        if (!Array.isArray(data?.questions)) throw new Error("Respons review server tidak valid.");
        if (active) setReview(data);
      } catch (caught) {
        if (active) setError(caught.message || "Review belum berhasil dimuat.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [attemptId, retry]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <Link href="/student" className="font-bold text-accent-ink hover:underline">← Kembali ke dashboard siswa</Link>
      <h1 className="text-2xl font-extrabold text-ink">Review Simulasi TKA</h1>
      {loading && <p role="status">Memuat review jawaban…</p>}
      {error && <div role="alert" className="rounded-xl bg-warning-soft p-5 text-warning-ink"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-3 rounded-lg border border-warning-line px-4 py-2 font-bold">Coba lagi</button></div>}
      {!loading && review && <ReviewSession key={attemptId} initiallyExpanded session={{ subjectIndex: 0, subject: "Simulasi TKA", score: review.score, totalQuestions: review.total_questions, correctAnswers: review.correct_answers, incorrectOrUnanswered: Math.max(0, Number(review.total_questions || 0) - Number(review.correct_answers || 0)), answeredCount: review.questions.filter((question) => Object.keys(question.answer_payload || {}).length > 0).length, review }} />}
    </main>
  );
}

export default function AttemptReviewPage() {
  return <Suspense fallback={<p role="status">Memuat review jawaban…</p>}><AttemptReview /></Suspense>;
}
