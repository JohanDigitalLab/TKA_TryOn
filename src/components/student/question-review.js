import React from "react";
import { normalizeType, normalizePayload } from "@/lib/student/exam";

export function QuestionNavigation({
  questions = [],
  id = "review-question-navigation",
  title = "Navigasi Soal",
  getHref = (index) => `#review-question-${index + 1}`,
  renderItem,
  className = "",
}) {
  return (
    <div id={id} className={`scroll-mt-24 rounded-xl bg-white p-5 shadow-sm ${className}`}>
      <h2 className="text-xl font-extrabold">{title}</h2>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Navigasi soal">
        {questions.map((item, index) => (
          <React.Fragment key={item.question_id || index}>
            {renderItem ? renderItem(item, index) : (
              <a
                href={getHref(index)}
                className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-slate-100 text-sm font-bold text-slate-600 transition hover:scale-105"
              >
                {item.question_order || index + 1}
              </a>
            )}
          </React.Fragment>
        ))}
      </nav>
    </div>
  );
}

export function QuestionReviewList({
  questions = [],
  getStatus = (item) => item.is_correct === true ? "BENAR" : item.is_correct === false ? "SALAH" : "PERIKSA JAWABAN",
  getTypeLabel,
  renderAnswer = (item) => <RenderAnswer item={item} />,
  className = "",
}) {
  return (
    <section className={`space-y-5 ${className}`}>
      {questions.map((item, index) => {
        const correct = item.is_correct === true;
        const incorrect = item.is_correct === false;
        return (
          <article
            id={`review-question-${index + 1}`}
            key={item.question_id || index}
            className={`scroll-mt-24 rounded-xl border p-5 shadow-sm ${
              correct ? "border-green-200 bg-green-50/30" : incorrect ? "border-red-200 bg-red-50/30" : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-slate-900">Soal Nomor {item.question_order || index + 1}</h3>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${correct ? "bg-green-100 text-green-700" : incorrect ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                {getStatus(item)}
              </span>
            </div>
            {getTypeLabel && <p className="mt-2 text-xs font-semibold text-blue-700">{getTypeLabel(item)}</p>}
            {item.stimulus?.content_text && <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm leading-6">{item.stimulus.content_text}</div>}
            <p className="mt-4 text-sm font-medium leading-7 text-slate-900">{item.question_text}</p>
            {renderAnswer(item)}
            {item.explanation && <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4"><p className="text-xs font-bold uppercase text-blue-700">Pembahasan</p><p className="mt-2 text-sm leading-6 text-slate-700">{item.explanation}</p></div>}
          </article>
        );
      })}
    </section>
  );
}

export function RenderAnswer({ item }) {
  if (!item) return null;
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