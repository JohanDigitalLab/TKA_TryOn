"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { buildAnswers, categoryLabels, gradeVirtualpetAnswer } from "@/lib/student/virtualpet-client";

function mediaUrl(value) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function VirtualpetAnswerReview({ session, answers }) {
  return <div className="space-y-4">{session.questions.map((question, i) => {
    const answer = answers.find(item => item.question_id === question.id)?.answer_payload || {};
    const correct = gradeVirtualpetAnswer(question, answer);
    return <article key={question.id} className="rounded-2xl border border-[var(--line)] p-4">
      <p className={`mb-2 text-sm font-bold ${correct ? "text-emerald-600" : "text-rose-600"}`}>Soal {i + 1} · {correct ? "Benar" : "Salah"}</p>
      {question.stimulus && <aside className="mb-3 whitespace-pre-wrap rounded-xl bg-[var(--soft)] p-3 text-sm"><p>{question.stimulus.content_text}</p></aside>}
      <h3 className="whitespace-pre-wrap font-bold">{question.text}</h3>
      {question.type === "PGK_KATEGORI" ? question.category_items.map(item => <div key={item.item_number} className="mt-3 text-sm"><p className="whitespace-pre-wrap">{item.item_text}</p><p>Jawabanmu: <b>{answer.category_answers?.[item.item_number] || "—"}</b></p><p className="text-emerald-700">Kunci: {question.answer_keys.category_answers[item.item_number]}</p></div>) : <>
        <ul className="my-3 space-y-1 text-sm">{question.options.map(option => <li key={option.option_code} className={question.answer_keys.option_codes.includes(option.option_code) ? "font-bold text-emerald-700" : ""}>{option.option_code}. {option.option_text}</li>)}</ul>
        <p className="text-sm">Jawabanmu: <b>{answer.option_codes?.join(", ") || "Tidak memilih opsi"}</b></p>
        <p className="text-sm text-emerald-700">Kunci: {question.answer_keys.option_codes.join(", ")}</p>
      </>}
    </article>;
  })}</div>;
}

export default function VirtualpetQuiz({ session, busy, error, onFinish }) {
  const [drafts, setDrafts] = useState({});
  const [confirmed, setConfirmed] = useState({});
  const [index, setIndex] = useState(0);
  const [validation, setValidation] = useState("");
  // Freeze the exact finish payload even on an ambiguous network failure.
  const [submitted, setSubmitted] = useState(null);
  const q = session.questions[index];
  const draft = drafts[q.id] || { option_codes: [], category_answers: {} };
  const locked = Object.hasOwn(confirmed, q.id);
  const frozen = busy || !!submitted || locked;
  const last = index === session.questions.length - 1;
  const allConfirmed = session.questions.every(question => Object.hasOwn(confirmed, question.id));
  const link = mediaUrl(q.stimulus?.file_url);
  function selectOption(code) {
    if (frozen) return;
    const selected = draft.option_codes || [];
    const option_codes = q.type === "PG_TUNGGAL" ? [code] : selected.includes(code) ? selected.filter(item => item !== code) : [...selected, code];
    setDrafts(previous => ({ ...previous, [q.id]: { option_codes } }));
  }
  function confirm() {
    if (frozen) return;
    try {
      const [answer] = buildAnswers({ questions: [q] }, drafts);
      setConfirmed(previous => ({ ...previous, [q.id]: gradeVirtualpetAnswer(q, answer.answer_payload) }));
      setValidation("");
    } catch (failure) { setValidation(failure.message); }
  }
  function navigate(next) { setIndex(next); setValidation(""); }
  async function finish() {
    if (!last || !allConfirmed || busy) return;
    try {
      const payload = submitted || { attempt_id: session.attempt_id, answers: buildAnswers(session, drafts) };
      setSubmitted(payload);
      setValidation("");
      await onFinish(payload);
    } catch (failure) { setValidation(failure.message); }
  }
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="vp-question-title" className="vp-panel vp-modal w-full max-w-3xl p-5 sm:p-7">
      <p className="text-sm font-bold">{session.scenario} · Soal {index + 1}/{session.total} · Tanpa batas waktu</p>
      <p className="mt-1 text-xs vp-muted">{q.subject} · Lulus minimal 80%</p>
      {q.stimulus && <aside className="my-4 whitespace-pre-wrap rounded-xl bg-[var(--soft)] p-4">
        <p>{q.stimulus.content_text}</p><p>{q.stimulus.media_description}</p>
        {link && <a href={link} target="_blank" rel="noopener noreferrer" className="underline">Buka media stimulus</a>}
      </aside>}
      {q.instruction && <p className="my-3 whitespace-pre-wrap text-sm">{q.instruction}</p>}
      <h2 id="vp-question-title" className="my-4 whitespace-pre-wrap text-lg font-bold">{q.text}</h2>
      <fieldset disabled={frozen} className="space-y-3">
        <legend className="mb-3 text-sm">{q.type === "PGK_MA" ? "Pilih semua jawaban yang benar (boleh tidak memilih)." : q.type === "PGK_KATEGORI" ? "Tentukan kategori setiap pernyataan." : "Pilih satu jawaban."}</legend>
        {q.type === "PGK_KATEGORI" ? q.category_items.map(item => <fieldset key={item.item_number} className="rounded-xl border border-[var(--line)] p-3">
          <legend className="whitespace-pre-wrap px-1 text-sm">{item.item_text}</legend>
          <div className="mt-2 flex flex-wrap gap-3">{categoryLabels(item).map(label => <label key={label} className="flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--soft)] px-3 py-2 text-sm">
            <input type="radio" name={`vp-${q.id}-${item.item_number}`} value={label} checked={draft.category_answers?.[item.item_number] === label} onChange={() => { if (!frozen) setDrafts(previous => ({ ...previous, [q.id]: { category_answers: { ...draft.category_answers, [item.item_number]: label } } })); }} />{label}
          </label>)}</div>
        </fieldset>) : q.options.map(option => <label key={option.option_code} className="flex gap-3 rounded-xl border border-[var(--line)] p-3">
          <input type={q.type === "PGK_MA" ? "checkbox" : "radio"} name={`vp-${q.id}`} checked={(draft.option_codes || []).includes(option.option_code)} onChange={() => selectOption(option.option_code)} />
          <span className="whitespace-pre-wrap">{option.option_code}. {option.option_text}</span>
        </label>)}
      </fieldset>
      {locked && <p role="status" className={`mt-4 rounded-xl p-3 text-sm font-bold ${confirmed[q.id] ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{confirmed[q.id] ? "Jawaban benar!" : "Jawaban salah."} Jawaban sudah dikunci.</p>}
      {(validation || error) && <p role="alert" className="mt-4 text-sm text-red-600">{validation || error}</p>}
      {submitted && <p className="mt-2 text-xs vp-muted">Jawaban dikunci untuk pengiriman ulang sesi yang sama. Hadiah hanya diputuskan server.</p>}
      {last && !allConfirmed && <p className="mt-3 text-xs vp-muted">Konfirmasi seluruh jawaban sebelum menyelesaikan kuis.</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button className="vp-btn bg-[#73895d] text-white" disabled={frozen} onClick={confirm}><span className="sm:hidden">Jawab</span><span className="hidden sm:inline">Konfirmasi Jawaban</span></button>
        <div className="ml-auto flex items-center gap-2">
          <button aria-label="Sebelumnya" className="vp-btn bg-[var(--soft)]" disabled={index === 0 || busy} onClick={() => navigate(index - 1)}><ArrowLeft size={18} className="sm:hidden" /><span className="hidden sm:inline">Sebelumnya</span></button>
          {last ? <button className="vp-btn bg-[#73895d] text-white" disabled={busy || !allConfirmed} onClick={finish}>{busy ? "Mengirim…" : submitted ? "Kirim ulang" : <><span className="sm:hidden">Selesai</span><span className="hidden sm:inline">Selesaikan kuis</span></>}</button> : <button aria-label="Berikutnya" className="vp-btn bg-[var(--soft)]" disabled={busy} onClick={() => navigate(index + 1)}><span className="hidden sm:inline">Berikutnya</span><ArrowRight size={18} className="sm:hidden" /></button>}
        </div>
      </div>
    </section>
  </div>;
}
