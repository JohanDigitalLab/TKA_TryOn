"use client";

import { useState } from "react";
import { buildAnswers, categoryLabels } from "@/lib/student/virtualpet-client";

function mediaUrl(value) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export default function VirtualpetQuiz({ session, busy, error, onFinish }) {
  const [drafts, setDrafts] = useState({});
  const [index, setIndex] = useState(0);
  const [validation, setValidation] = useState("");
  // Freeze the exact finish payload even on an ambiguous network failure.
  const [submitted, setSubmitted] = useState(null);
  const q = session.questions[index];
  const draft = drafts[q.id] || { option_codes: [], category_answers: {} };
  const frozen = busy || !!submitted;
  const link = mediaUrl(q.stimulus?.file_url);
  function selectOption(code) {
    const selected = draft.option_codes || [];
    const option_codes = q.type === "PG_TUNGGAL" ? [code] : selected.includes(code) ? selected.filter(item => item !== code) : [...selected, code];
    setDrafts(previous => ({ ...previous, [q.id]: { option_codes } }));
  }
  async function finish() {
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
      <p className="mt-1 text-xs vp-muted">Lintas mata pelajaran · {q.subject} · {q.type} · Lulus minimal 80%</p>
      {q.stimulus && <aside className="my-4 whitespace-pre-wrap rounded-xl bg-[var(--soft)] p-4">
        {q.stimulus.title && <h3 className="font-bold">{q.stimulus.title}</h3>}
        <p>{q.stimulus.content_text}</p><p>{q.stimulus.media_description}</p>
        {link && <a href={link} target="_blank" rel="noopener noreferrer" className="underline">Buka media stimulus</a>}
      </aside>}
      {q.instruction && <p className="my-3 whitespace-pre-wrap text-sm">{q.instruction}</p>}
      <h2 id="vp-question-title" className="my-4 whitespace-pre-wrap text-lg font-bold">{q.text}</h2>
      <fieldset disabled={frozen} className="space-y-3">
        <legend className="mb-3 text-sm">{q.type === "PGK_MA" ? "Pilih semua jawaban yang benar (boleh tidak memilih)." : q.type === "PGK_KATEGORI" ? "Tentukan kategori setiap pernyataan." : "Pilih satu jawaban."}</legend>
        {q.type === "PGK_KATEGORI" ? q.category_items.map(item => <label key={item.item_number} className="block rounded-xl border border-[var(--line)] p-3">
          <span className="whitespace-pre-wrap">{item.item_text}</span>
          <select aria-label={`Kategori pernyataan ${item.item_number}`} className="mt-2 block w-full rounded border bg-[var(--panel)] p-2" value={draft.category_answers?.[item.item_number] || ""} onChange={event => setDrafts(previous => ({ ...previous, [q.id]: { category_answers: { ...draft.category_answers, [item.item_number]: event.target.value } } }))}>
            <option value="">Pilih kategori</option>{categoryLabels(item).map(label => <option key={label} value={label}>{label}</option>)}
          </select>
        </label>) : q.options.map(option => <label key={option.option_code} className="flex gap-3 rounded-xl border border-[var(--line)] p-3">
          <input type={q.type === "PGK_MA" ? "checkbox" : "radio"} name={`vp-${q.id}`} checked={(draft.option_codes || []).includes(option.option_code)} onChange={() => selectOption(option.option_code)} />
          <span className="whitespace-pre-wrap">{option.option_code}. {option.option_text}</span>
        </label>)}
      </fieldset>
      {(validation || error) && <p role="alert" className="mt-4 text-sm text-red-600">{validation || error}</p>}
      {submitted && <p className="mt-2 text-xs vp-muted">Jawaban dikunci untuk pengiriman ulang sesi yang sama. Hadiah hanya diputuskan server.</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="vp-btn bg-[var(--soft)]" disabled={index === 0 || busy} onClick={() => setIndex(value => value - 1)}>Sebelumnya</button>
        <button className="vp-btn bg-[var(--soft)]" disabled={index === session.questions.length - 1 || busy} onClick={() => setIndex(value => value + 1)}>Berikutnya</button>
        <button className="vp-btn bg-[#73895d] text-white" disabled={busy} onClick={finish}>{busy ? "Mengirim…" : submitted ? "Coba kirim ulang jawaban yang sama" : "Selesaikan kuis"}</button>
      </div>
    </section>
  </div>;
}
