"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { buildAnswers, gradeVirtualpetAnswer } from "@/lib/student/virtualpet-client";
import { BossFightChoices, BossFightReview } from "@/components/student/fightboss/BossFightQuestions";

function mediaUrl(value) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function VirtualpetAnswerReview({ session, answers }) {
  const records = session.questions.map((question, questionIndex) => {
    const answer = answers.find(item => item.question_id === question.id)?.answer_payload || {};
    const options = question.options || [];
    const indices = (answer.option_codes || []).map(code => options.findIndex(option => option.option_code === code)).filter(index => index >= 0);
    return {
      questionIndex, correct: gradeVirtualpetAnswer(question, answer),
      selected: question.type === "PGK_KATEGORI" ? answer.category_answers || {} : question.type === "PGK_MA" ? indices : indices[0] ?? null,
      question: { ...question, question: question.text, optionDetails: options, options: options.map(option => option.option_text), answer_keys: { options: question.answer_keys.option_codes, categories: question.answer_keys.category_answers } },
    };
  });
  return <BossFightReview records={records} pvp={false} title="Review Hasil Kuis" navigationId="virtualpet-review-navigation" />;
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
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-5">
    <section role="dialog" aria-modal="true" aria-labelledby="vp-question-title" className="vp-panel vp-modal m-0 w-full max-w-3xl rounded-t-3xl! rounded-b-none! p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl! sm:p-7">
      <p className="text-sm font-bold">{session.scenario} · Soal {index + 1}/{session.total} · Tanpa batas waktu</p>
      <p className="mt-1 text-xs vp-muted">{q.subject} · Lulus minimal 80%</p>
      {q.stimulus && <aside className="my-4 whitespace-pre-wrap rounded-xl bg-[var(--soft)] p-4">
        <p>{q.stimulus.content_text}</p><p>{q.stimulus.media_description}</p>
        {link && <a href={link} target="_blank" rel="noopener noreferrer" className="underline">Buka media stimulus</a>}
      </aside>}
      {q.instruction && <p className="my-3 whitespace-pre-wrap text-sm">{q.instruction}</p>}
      <h2 id="vp-question-title" className="my-4 whitespace-pre-wrap text-lg font-bold">{q.text}</h2>
      <fieldset disabled={frozen} className="space-y-3">
        <BossFightChoices
          question={{ ...q, optionDetails: q.options || [], options: (q.options || []).map(option => option.option_text) }}
          selection={(q.options || []).flatMap((option, i) => draft.option_codes?.includes(option.option_code) ? [i] : [])}
          selected={(q.options || []).findIndex(option => draft.option_codes?.includes(option.option_code))}
          categories={draft.category_answers || {}} disabled={frozen}
          onSelect={i => selectOption(q.options[i].option_code)}
          onCategory={(number, value) => { if (!frozen) setDrafts(previous => ({ ...previous, [q.id]: { category_answers: { ...draft.category_answers, [number]: value } } })); }}
        />
      </fieldset>
      {locked && <p role="status" className={`mt-4 rounded-xl p-3 text-sm font-bold ${confirmed[q.id] ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{confirmed[q.id] ? "Jawaban benar!" : "Jawaban salah."} Jawaban sudah dikunci.</p>}
      {(validation || error) && <p role="alert" className="mt-4 text-sm text-red-600">{validation || error}</p>}
      {submitted && <p className="mt-2 text-xs vp-muted">Jawaban dikunci untuk pengiriman ulang sesi yang sama. Hadiah hanya diputuskan server.</p>}
      {last && !allConfirmed && <p className="mt-3 text-xs vp-muted">Konfirmasi seluruh jawaban sebelum menyelesaikan kuis.</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button className="vp-btn bg-[#73895d] text-white" disabled={frozen} onClick={confirm}><span className="sm:hidden">Jawab</span><span className="hidden sm:inline">Kirim Jawaban</span></button>
        <div className="ml-auto flex items-center gap-2">
          <button aria-label="Sebelumnya" className="vp-btn bg-[var(--soft)]" disabled={index === 0 || busy} onClick={() => navigate(index - 1)}><ArrowLeft size={18} className="sm:hidden" /><span className="hidden sm:inline">Sebelumnya</span></button>
          {last ? <button className="vp-btn bg-[#73895d] text-white" disabled={busy || !allConfirmed} onClick={finish}>{busy ? "Mengirim…" : submitted ? "Kirim ulang" : <><span className="sm:hidden">Selesai</span><span className="hidden sm:inline">Selesaikan kuis</span></>}</button> : <button aria-label="Berikutnya" className="vp-btn bg-[var(--soft)]" disabled={busy} onClick={() => navigate(index + 1)}><span className="hidden sm:inline">Berikutnya</span><ArrowRight size={18} className="sm:hidden" /></button>}
        </div>
      </div>
    </section>
  </div>;
}
