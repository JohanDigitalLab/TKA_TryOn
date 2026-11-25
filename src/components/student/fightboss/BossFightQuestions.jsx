"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QuestionNavigation, QuestionReviewList, RenderAnswer } from "@/components/student/question-review";
import { getTypeLabel } from "@/lib/student/exam";
import { categoryOptions } from "@/lib/student/bossfight-client";

export function BossFightChoices({ question, selection, categories, selected, disabled, onSelect, onCategory }) {
  if (question.type === "PGK_KATEGORI") return <div className="space-y-4">
    {question.category_items.map(item => <fieldset key={item.item_number} disabled={disabled} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <legend className="sr-only">Pernyataan {item.item_number}</legend>
      <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">{item.item_number}. {item.item_text}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">{categoryOptions([item]).map(category => {
        const active = categories[item.item_number] === category;
        const negative = category.trim().toUpperCase() === "SALAH";
        return <label key={category} className={`flex cursor-pointer items-center justify-center gap-3 rounded-lg border px-4 py-3 transition ${active ? negative ? "border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200" : "border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
          <input type="radio" name={`boss-category-${question.id}-${item.item_number}`} checked={active} value={category} onChange={() => onCategory(item.item_number, category)} className={`h-4 w-4 ${negative ? "accent-red-600" : "accent-green-600"}`} /><span className="text-sm font-bold">{category}</span>
        </label>;
      })}</div>
    </fieldset>)}
    <p className="text-xs text-slate-500">Terisi: {Object.keys(categories).length} dari {question.category_items.length} pernyataan</p>
  </div>;
  const multiple = question.type === "PGK_MA";
  return <div className="space-y-3">{question.options.map((option, index) => {
    const active = multiple ? selection.includes(index) : selected === index;
    const code = question.optionDetails?.[index]?.option_code || String.fromCharCode(65 + index);
    return <button key={`${question.id}-${code}`} type="button" disabled={disabled} onClick={() => onSelect(index)} aria-pressed={active} className={`flex w-full items-start gap-4 rounded-lg border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed ${active ? "border-blue-600 bg-blue-50 dark:bg-blue-950" : "border-slate-200 bg-white hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900"}`}>
      {multiple ? <><span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border text-sm font-bold ${active ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white dark:bg-slate-800"}`}>{active ? "✓" : ""}</span><span className="text-sm font-bold">{code}.</span></> : <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>{code}</span>}
      <span className={`min-w-0 whitespace-pre-wrap text-sm leading-6 ${multiple ? "" : "pt-1"}`}>{option}</span>
    </button>;
  })}{multiple && <p className="text-xs text-slate-500">Dipilih: {selection.length} jawaban</p>}</div>;
}

export function BossFightReview({ records, names, pvp }) {
  const navigation = useRef(null);
  const [passed, setPassed] = useState(false);
  const [buttonPosition, setButtonPosition] = useState(null);
  useEffect(() => {
    const element = navigation.current;
    const root = element?.closest('[role="dialog"]');
    if (!element || !root) return;
    const observer = new IntersectionObserver(([entry]) => setPassed(!entry.isIntersecting && entry.boundingClientRect.top < entry.rootBounds.top), { root });
    observer.observe(element);
    // Anchor to the dialog viewport, not the page or its scrolling content.
    const updatePosition = () => {
      const bounds = root.getBoundingClientRect();
      setButtonPosition({
        right: Math.max(20, window.innerWidth - bounds.right + 20),
        bottom: Math.max(20, window.innerHeight - bounds.bottom + 20),
      });
    };
    const resize = new ResizeObserver(updatePosition);
    resize.observe(root);
    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    root.addEventListener("transitionend", updatePosition);
    root.addEventListener("animationend", updatePosition);
    return () => {
      observer.disconnect(); resize.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      root.removeEventListener("transitionend", updatePosition);
      root.removeEventListener("animationend", updatePosition);
    };
  }, []);
  const questions = records.map(record => {
    const question = record.question;
    const keys = question.answer_keys;
    const options = question.options.map((text, index) => ({
      option_code: question.optionDetails?.[index]?.option_code || String.fromCharCode(65 + index),
      option_text: text,
      ...(keys ? { is_correct: keys.options?.includes(question.optionDetails?.[index]?.option_code || String.fromCharCode(65 + index)) || false } : {}),
    }));
    const selected = record.selected;
    return {
      question_id: question.id, question_order: record.questionIndex + 1,
      question_type: question.type, question_text: question.question,
      stimulus: question.stimulus || (question.passage ? { content_text: question.passage } : null),
      explanation: question.explanation, is_correct: record.correct,
      options, category_items: (question.category_items || []).map(item => ({ ...item, correct_category: keys?.categories?.[item.item_number] })),
      answer_payload: question.type === "PGK_KATEGORI" ? { category_answers: selected || {} } : { option_codes: (selected === null ? [] : Array.isArray(selected) ? selected : [selected]).map(index => options[index]?.option_code).filter(Boolean) },
      record, hasKeys: !!keys,
    };
  });
  return <div className="space-y-5 text-slate-900">
    <div ref={navigation}><QuestionNavigation id="bossfight-review-navigation" title="Review Hasil Pertarungan" questions={questions} renderItem={(item, index) => <a href={`#review-question-${index + 1}`} className={`grid h-9 w-9 place-items-center rounded-lg border text-sm font-bold transition hover:scale-105 ${item.is_correct ? "border-green-300 bg-green-100 text-green-800" : "border-red-300 bg-red-100 text-red-800"}`}>{item.question_order}</a>} /></div>
    <QuestionReviewList questions={questions} getTypeLabel={item => getTypeLabel(item.question_type)} getStatus={item => item.record.selected === null ? "WAKTU HABIS" : item.is_correct ? "BENAR" : "SALAH"} renderAnswer={item => <>
      {pvp && <p className="mt-2 text-xs font-semibold text-blue-700">{names[item.record.player]}</p>}
      {item.hasKeys ? <RenderAnswer item={item} /> : <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm"><p>Jawaban siswa: {item.question_type === "PGK_KATEGORI" ? Object.entries(item.answer_payload.category_answers).map(([key, value]) => `${key}: ${value}`).join(", ") : item.answer_payload.option_codes.join(", ") || "Tidak menjawab"}</p><p className="mt-2 text-xs text-slate-500">Kunci belum tersedia untuk sesi lama ini. Mulai sesi baru setelah migrasi diterapkan.</p></div>}
    </>} />
    {buttonPosition && createPortal(<button type="button" aria-label="Kembali ke navigasi soal" disabled={!passed} style={buttonPosition} onClick={() => navigation.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className={`fixed z-[100] grid h-12 w-12 place-items-center rounded-full bg-blue-700 text-xl font-bold text-white shadow-lg transition-opacity hover:bg-blue-800 ${passed ? "opacity-100" : "pointer-events-none opacity-0"}`}>↑</button>, document.body)}
  </div>;
}

