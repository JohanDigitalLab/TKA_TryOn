"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import QuestionsWorkspace from "@/components/admin/questions-workspace";

function QuestionDetail() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  return <QuestionsWorkspace key={id} questionId={id} />;
}

export default function QuestionDetailPage() {
  return (
    <Suspense fallback={<main className="p-8" role="status">Memuat halaman detail soal...</main>}>
      <QuestionDetail />
    </Suspense>
  );
}
