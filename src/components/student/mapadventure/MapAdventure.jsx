"use client";

import DashboardBreadcrumb from "@/components/dashboard-breadcrumb";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Backpack, Check, ChevronLeft, Coins, Map, Moon, Settings, Star, Sun, X } from "lucide-react";
import { buildAnswer, categoryLabels, questionSecondsLeft, safeMaterialUrl, STAGES, TOOLS } from "@/lib/student/mapadventure-client";
import { IslandNavigation, TopicMap } from "./IslandMap";
import useMapAdventure from "./useMapAdventure";
import "./mapadventure.css";

const button = "rounded-2xl bg-indigo-600 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-40";
const panel = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const statusText = { LOCKED: "Terkunci", UNLOCKED: "Terbuka", COMPLETED: "Selesai" };
function Stars({ value = 0 }) {
  return <span className="inline-flex items-center gap-1 text-amber-500" aria-label={`${value} bintang`}><Star size={16} fill="currentColor" />{value}</span>;
}
function Modal({ title, onClose, children }) {
  const box = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    box.current?.focus();
    const handle = event => {
      // Dialog notifikasi native berada di top layer dan mengelola fokusnya sendiri.
      if (document.querySelector('dialog[open][data-map-notification]')) return;
      if (event.key === "Escape") onClose?.();
      if (event.key === "Tab") {
        const nodes = box.current?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), iframe, [tabindex="0"]');
        if (!nodes?.length) { event.preventDefault(); return; }
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handle);
    return () => { document.removeEventListener("keydown", handle); previous?.focus?.(); };
  }, [onClose]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
    <section ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 text-slate-800 shadow-2xl dark:bg-slate-900 dark:text-slate-100">
      <header className="mb-5 flex items-center justify-between gap-4"><h2 className="text-xl font-black">{title}</h2>{onClose && <button aria-label="Tutup" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X /></button>}</header>
      {children}
    </section>
  </div>;
}
function Feedback({ game }) {
  const dialog = useRef(null);
  const message = game.error || game.notice;
  useEffect(() => {
    const element = dialog.current;
    if (message && !element.open) element.showModal();
    if (!message && element.open) element.close();
  }, [message]);
  return <dialog ref={dialog} data-map-notification aria-labelledby="map-notification-title" aria-describedby="map-notification-message" onCancel={event => { event.preventDefault(); game.closeFeedback(); }} onClose={game.closeFeedback} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border-0 bg-white p-6 text-slate-800 shadow-2xl backdrop:bg-slate-950/70 dark:bg-slate-900 dark:text-slate-100">
    <header className="mb-4 flex items-center justify-between gap-4"><h2 id="map-notification-title" className={`text-xl font-black ${game.error ? "text-rose-600" : "text-indigo-600"}`}>{game.error ? "Terjadi kesalahan" : "Notifikasi"}</h2><button type="button" aria-label="Tutup notifikasi" onClick={game.closeFeedback} className="rounded-xl p-2"><X size={20} /></button></header>
    <p id="map-notification-message" className="whitespace-pre-wrap leading-relaxed">{message}</p>
    <button type="button" className={`${button} mt-5`} onClick={game.closeFeedback}>Mengerti</button>
  </dialog>;
}
function MaterialReader({ material, game }) {
  const content = useRef(null);
  const [eligible, setEligible] = useState(false);
  const [opened, setOpened] = useState(false);
  const url = safeMaterialUrl(material.url);
  useEffect(() => {
    const element = content.current;
    if (element && element.scrollHeight <= element.clientHeight + 4) setEligible(true);
  }, []);
  async function claim() {
    const saved = await game.run("read_complete", { nodeId: material.nodeId, readToken: material.readToken });
    if (saved) game.closeMaterial();
  }
  return <Modal title="⛺ Kemah Ilmu" onClose={game.closeMaterial}>
    <div ref={content} onScroll={event => {
      const e = event.currentTarget;
      if (e.scrollTop + e.clientHeight >= e.scrollHeight - 8) setEligible(true);
    }} className="mb-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-5 leading-relaxed dark:bg-slate-800">
      {material.text || "Materi teks belum tersedia. Buka sumber materi di bawah bila tersedia."}
    </div>
    {url?.pdf && <iframe title="PDF materi pembelajaran" src={url.href} sandbox="" referrerPolicy="no-referrer" className="mb-3 h-[45vh] w-full rounded-xl border" onLoad={() => setOpened(true)} />}
    {url && <a href={url.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)} className="mb-4 inline-block font-bold text-indigo-600 underline">Buka {url.pdf ? "PDF" : "sumber materi"} di tab baru ↗</a>}
    {material.url && !url && <p className="mb-3 text-rose-600">Tautan materi tidak aman atau tidak valid dan tidak ditampilkan.</p>}
    {!eligible && <p className="mb-3 text-sm">Gulir teks sampai bagian akhir untuk melanjutkan.</p>}

    <button className={`${button} mt-4`} disabled={game.busy || !eligible || (!!url && !opened) || (!material.text && !url)} onClick={claim}>{game.busy ? "Menyimpan…" : "Selesai membaca"}</button>
    <p className="mt-3 text-xs text-slate-500">Penyelesaian dan hadiah diverifikasi server. Materi yang sudah selesai tidak memberi hadiah ulang.</p>
  </Modal>;
}
function Quiz({ session, game }) {
  const [draft, setDraft] = useState({});
  const q = session.question;
  const effects = session.effects || {};
  const [seconds, setSeconds] = useState(() => questionSecondsLeft(session));
  const timeoutBusy = useRef(false);
  const timeoutSent = useRef(null);
  const timed = session.stage !== "practice" && !!q && !!session.deadline_at;
  const { busy, run } = game;
  useEffect(() => {
    if (!timed) return;
    const receivedAt = session.clock_received_at ?? performance.now();
    const key = `${session.attempt_id}:${q.id}`;
    const tick = () => {
      const left = questionSecondsLeft(session, performance.now() - receivedAt);
      setSeconds(left);
      if (left === 0 && !busy && !timeoutBusy.current && timeoutSent.current !== key) {
        timeoutBusy.current = true;
        timeoutSent.current = key;
        void run("timeout", { attempt_id: session.attempt_id, question_id: q.id }).finally(() => { timeoutBusy.current = false; });
      }
    };
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [session, q, timed, busy, run]);
  const expired = timed && seconds === 0;
  async function answer() {
    try {
      const answer_payload = buildAnswer(q, draft, effects);
      await game.run("answer", { attempt_id: session.attempt_id, question_id: q.id, answer_payload }, { retried: effects.retried });
    } catch (error) { game.reportError(error.message); }
  }
  return <Modal title={STAGES.find(s => s.id === session.stage)?.name || "Sesi tersimpan"}>
    <div className="mb-4 flex justify-between text-sm"><span>{session.answered} / {session.total} jawaban tersimpan</span>{timed ? <span role="timer" aria-label="Sisa waktu soal">{Math.floor((seconds ?? 0) / 60)}:{String((seconds ?? 0) % 60).padStart(2, "0")}</span> : <span>{session.stage === "practice" ? "Tanpa batas waktu" : "Sesi soal selesai"}</span>}</div>
    <p className="mb-3 text-sm text-slate-500">{STAGES.find(s => s.id === session.stage)?.requirement} Kelulusan diverifikasi server.</p>
    <p className="mb-3 text-sm text-slate-500">{STAGES.find(s => s.id === session.stage)?.selection}</p>
    <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-500" style={{ width: `${session.answered / session.total * 100}%` }} /></div>
    {q ? <>
      {q.stimulus && <aside className="mb-4 whitespace-pre-wrap rounded-2xl bg-sky-50 p-4 dark:bg-slate-800"><strong>{q.stimulus.title}</strong><p>{q.stimulus.content_text}</p><p>{q.stimulus.media_description}</p>{safeMaterialUrl(q.stimulus.file_url) && <a className="text-indigo-600 underline" href={safeMaterialUrl(q.stimulus.file_url).href} target="_blank" rel="noopener noreferrer">Buka stimulus ↗</a>}</aside>}
      <p className="mb-2 whitespace-pre-wrap text-sm text-slate-500">{q.instruction}</p>
      <h3 className="mb-5 whitespace-pre-wrap text-lg font-bold">{q.text}</h3>
      {q.type === "PGK_MA" && <p className="mb-3 text-sm">Pilih semua jawaban yang sesuai; pilihan kosong juga dapat dikirim.</p>}
      <fieldset disabled={game.busy || expired} className="space-y-3"><legend className="sr-only">Jawaban soal</legend>
        {q.type === "PGK_KATEGORI" ? q.category_items.map(item => <label key={item.item_number} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3"><span className="whitespace-pre-wrap">{item.item_text}</span><select aria-label={`Kategori pernyataan ${item.item_number}`} className="rounded-lg border bg-white p-2 text-slate-800" value={draft.category_answers?.[item.item_number] || ""} onChange={event => setDraft(previous => ({ category_answers: { ...previous.category_answers, [item.item_number]: event.target.value } }))}><option value="">Pilih kategori</option>{categoryLabels(item).map(label => <option key={label}>{label}</option>)}</select></label>) : q.options.map(option => {
          const eliminated = effects.eliminated?.includes(option.option_code);
          return <label key={option.option_code} className={`flex gap-3 rounded-2xl border p-4 ${eliminated ? "opacity-35 line-through" : "cursor-pointer hover:border-indigo-400"}`}><input type={q.type === "PG_TUNGGAL" ? "radio" : "checkbox"} name={`answer-${q.id}`} disabled={eliminated} checked={!eliminated && !!draft.option_codes?.includes(option.option_code)} onChange={() => setDraft(previous => ({ option_codes: q.type === "PG_TUNGGAL" ? [option.option_code] : previous.option_codes?.includes(option.option_code) ? previous.option_codes.filter(code => code !== option.option_code) : [...(previous.option_codes || []), option.option_code] }))} /><span className="whitespace-pre-wrap"><b>{option.option_code}.</b> {option.option_text}</span></label>;
        })}
      </fieldset>
      {effects.clue && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-amber-100 p-4 text-amber-900">💡 {effects.clue}</p>}
      {effects.secondchance && <p className="mt-3 text-sm text-indigo-600">{effects.retried ? "Jawaban pertama belum tepat. Satu kesempatan terakhir tersedia." : "Kesempatan kedua aktif untuk soal ini."}</p>}
      <div className="my-5 flex flex-wrap gap-2">{TOOLS.map(tool => {
        const used = session.tools.some(t => t.tool === tool.id && (t.question_id === q.id || t.question_index === session.index));
        return <button key={tool.id} className="rounded-xl border px-3 py-2 text-sm disabled:opacity-40" title={tool.timedOnly && !timed ? "Hanya tersedia pada soal bertimer." : tool.name} disabled={game.busy || expired || (tool.timedOnly && !timed) || used || !(game.state.inventory[tool.id] > 0) || (tool.id === "fiftyfifty" && q.type !== "PG_TUNGGAL")} onClick={() => game.run("use_tool", { attempt_id: session.attempt_id, question_id: q.id, tool: tool.id })}>{tool.symbol} {tool.name} ({game.state.inventory[tool.id]}){used ? " ✓" : ""}</button>;
      })}</div>
      <p className="mb-3 text-xs text-slate-500">Freeze Time menambah 30 detik sekali per soal bertimer. Kesempatan kedua dan ganti soal tidak mengulang waktu. Alat hanya dikurangi setelah server menyetujui pemakaian.</p>
      {expired && <p role="status" className="mb-3 text-rose-600">Waktu habis. Jawaban dicatat salah oleh server. Jika koneksi terputus, muat ulang sesi atau lanjutkan di bawah.</p>}
      {expired && <button className={button} disabled={game.busy} onClick={() => game.run("timeout", { attempt_id: session.attempt_id, question_id: q.id })}>Lanjutkan setelah waktu habis</button>}
      <button className={button} disabled={game.busy || expired} onClick={answer}>{game.busy ? "Menyimpan…" : "Kirim jawaban"}</button>
    </> : <div className="py-5 text-center"><p className="mb-5">Semua jawaban sudah tersimpan. Selesaikan sesi untuk mendapatkan hasil dari server.</p><button className={button} disabled={game.busy} onClick={() => game.run("complete_node", { nodeId: session.nodeId, attempt_id: session.attempt_id })}>Selesaikan sesi</button></div>}

    <button className="mt-4 text-sm text-indigo-600 underline disabled:opacity-40" disabled={game.busy} onClick={() => game.run("bootstrap")}>Muat ulang sesi tersimpan</button>
    <p className="mt-3 text-xs text-slate-500">Sesi otomatis dilanjutkan saat kembali. Jawaban tidak dinilai di perangkat ini.</p>
  </Modal>;
}
function TopicTrail({ node, game }) {
  const height = 760;
  // Tata letak asimetris versi impor: cabang samping di kiri, penjaga di kanan bawah.
  const coordinates = [[68, 92], [50, 235], [20, 365], [20, 540], [78, 645]];
  const edges = [[0, 1], [1, 2], [2, 3], [1, 4]];
  async function activate(stage) {
    if (stage === "material") return game.run("material", { nodeId: node.id });
    if (stage === "mysterychest") return game.openGachaChest(node.id);
    return game.run("start", { nodeId: node.id, stage });
  }
  return <div className="relative mx-auto max-w-md" style={{ height }}>
    <svg className="pointer-events-none absolute h-full w-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">{edges.map(([from, to]) => {
      const [x, y] = coordinates[from];
      const [nx, ny] = coordinates[to];
      const midY = (y + ny) / 2;
      const bend = from === 1 && to === 4 ? 14 : from === 2 ? -12 : 0;
      return <path key={`${from}-${to}`} d={`M ${x} ${y + 34} C ${x + bend} ${midY}, ${nx + bend} ${midY}, ${nx} ${ny - 34}`} fill="none" stroke={node[`${STAGES[from].id}_status`] === "COMPLETED" ? "#818cf8" : "#cbd5e1"} strokeWidth="4" strokeLinecap="round" strokeDasharray="2 10" vectorEffect="non-scaling-stroke" />;
    })}</svg>
    {STAGES.map((stage, i) => {
      const status = node[`${stage.id}_status`];
      const [x, y] = coordinates[i];
      return <div key={stage.id} className="absolute flex w-[40%] -translate-x-1/2 flex-col items-center text-center" style={{ left: `${x}%`, top: y - 34 }}>
        <motion.button whileHover={{ scale: status !== "LOCKED" ? 1.08 : 1 }} whileTap={{ scale: .96 }} aria-label={`${stage.name}: ${statusText[status]}`} disabled={game.busy || status === "LOCKED" || (status === "COMPLETED" && !["material", "mysterychest"].includes(stage.id))} onClick={() => activate(stage.id)} className={`relative flex h-20 w-20 items-center justify-center rounded-3xl border-4 text-3xl shadow-lg disabled:cursor-default ${status === "COMPLETED" ? "border-emerald-200 bg-emerald-100" : status === "UNLOCKED" ? "border-amber-200 bg-gradient-to-br from-amber-50 to-amber-200" : "border-slate-200 bg-slate-100 grayscale"}`} style={status === "UNLOCKED" ? { animation: "mapadventure-node-pulse 2s infinite" } : undefined}>
          {stage.symbol}{status === "COMPLETED" && <Check size={20} className="absolute -right-2 -top-2 rounded-full bg-emerald-500 p-0.5 text-white" />}
        </motion.button>
        <span className="mt-1 text-sm font-extrabold">{stage.name}</span><span className="text-xs text-slate-500">{statusText[status]}</span>{stage.id !== "mysterychest" && <Stars value={node[`${stage.id}_stars`]} />}
      </div>;
    })}
  </div>;
}
export default function MapAdventure() {
  const game = useMapAdventure();
  const [dark, setDark] = useState(false);
  const [selection, setSelection] = useState(null);
  const [bag, setBag] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mapView = useRef(null);
  const [floatingTop, setFloatingTop] = useState(null);
  const state = game.state;
  const island = state?.islands.find(i => i.id === selection?.island) || state?.islands.find(i => i.status !== "LOCKED");
  const node = state?.nodes.find(n => n.id === selection?.node && n.theme_id === island?.id);
  const topics = state?.nodes.filter(n => n.theme_id === island?.id) || [];
  useEffect(() => {
    const element = mapView.current;
    if (!element) return;
    function updatePosition() {
      const bounds = element.getBoundingClientRect();
      // Ukur header portal yang melekat agar kontrol tidak tertutup pada mobile/desktop.
      let headerBottom = 0;
      document.querySelectorAll("header").forEach(header => {
        const style = window.getComputedStyle(header);
        const rect = header.getBoundingClientRect();
        if (["sticky", "fixed"].includes(style.position) && rect.top <= 1 && rect.bottom > 0) {
          headerBottom = Math.max(headerBottom, rect.bottom);
        }
      });
      const top = Math.max(headerBottom + 16, bounds.top + 16);
      setFloatingTop(top < window.innerHeight - 80 && bounds.bottom > top + 80 ? top : null);
    }
    const frame = requestAnimationFrame(updatePosition);
    const observer = new ResizeObserver(updatePosition);
    observer.observe(element);
    document.querySelectorAll("header").forEach(header => observer.observe(header));
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [island?.id, node?.id]);
  return <div className={`mapadventure-scope ${dark ? "dark" : ""}`}><main className="relative min-h-dvh bg-slate-50 px-3 py-8 text-slate-900 selection:bg-indigo-200 dark:bg-[#090e19] dark:text-slate-100 sm:px-6">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[650px] bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.09),transparent_65%)]" />
    <div className="relative mx-auto max-w-4xl">
    <DashboardBreadcrumb current="Map Adventure" />
    <header className="mb-8 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="rounded-2xl bg-indigo-500 p-2.5 text-white shadow-lg shadow-indigo-500/20"><Map size={24} /></span><div><h1 className="text-xl font-black tracking-tight sm:text-2xl">Map Adventure</h1><p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-indigo-600 dark:text-indigo-400">Jelajah. Belajar. Bertumbuh.</p></div></div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" aria-label="Pengaturan" aria-haspopup="dialog" disabled={!state} onClick={() => setSettingsOpen(true)} className="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-indigo-400 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"><Settings size={19} /></button>
        <button type="button" onClick={() => setDark(!dark)} aria-pressed={dark} aria-label={dark ? "Gunakan tema terang" : "Gunakan tema gelap"} className="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900">{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
      </div>
    </header>
    <div className="space-y-5">

      {!state ? <section className={`${panel} py-16 text-center`}><span className="text-5xl">🧭</span><p role="status" className="mt-5">{game.busy ? "Menyiapkan peta petualanganmu…" : "Peta belum dapat dimuat."}</p>{!game.busy && <button className={`${button} mt-4`} onClick={() => game.run("bootstrap")}>Coba lagi</button>}</section> : <>
        {state.session && !game.tips && <Quiz key={`${state.session.attempt_id}:${state.session.question?.id || "finish"}`} session={state.session} game={game} />}
        <IslandNavigation islands={state.islands} nodes={state.nodes} selectedId={island?.id} busy={game.busy} onSelect={id => setSelection({ island: id })} />
        {island ? <section ref={mapView} className={`${panel} relative pt-24!`} aria-label={node ? "Peta petualangan topik" : "Peta pulau"}>
          <div className="pointer-events-none fixed inset-x-0 z-30" style={{ top: floatingTop ?? 16, visibility: floatingTop === null ? "hidden" : "visible" }}>
          <div className="mx-auto flex max-w-4xl items-start justify-between gap-3 px-8 sm:px-12">
            {node ? <button type="button" aria-label="Kembali ke map pulau" onClick={() => setSelection({ island: island.id })} className="pointer-events-auto flex max-w-[75%] items-center gap-2 rounded-2xl border border-indigo-200 bg-white/95 px-3 py-2 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900/95"><ChevronLeft size={18} className="shrink-0 text-indigo-500" /><span className="min-w-0"><span className="block break-words text-xs font-bold text-indigo-500 sm:text-sm">{island.theme}</span><span className="block break-words text-xs font-extrabold">{node.topic}</span></span></button> : <div aria-label="Saldo dan bintang" className="flex flex-wrap items-center gap-2">
              <span aria-label={`${state.wallet.points} poin`} className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-white/95 px-3 py-3 font-bold shadow-sm dark:border-slate-700 dark:bg-slate-900"><Coins size={20} className="text-amber-500" />{state.wallet.points}</span>
              <span className="rounded-2xl border border-amber-200 bg-white/95 px-3 py-3 font-bold shadow-sm dark:border-slate-700 dark:bg-slate-900"><Stars value={state.status.stars} /></span>
            </div>}
            <button type="button" aria-label="Buka tas perlengkapan" onClick={() => setBag(true)} className="pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl ring-4 ring-white/70 transition hover:scale-105 dark:ring-slate-800"><Backpack size={27} /></button>
          </div>
          </div>
          {node ? <TopicTrail node={node} game={game} /> : <TopicMap topics={topics} busy={game.busy} onSelect={id => setSelection({ island: island.id, node: id })} />}
          {!topics.length && <p className="py-8 text-center text-slate-500">Belum ada topik untuk pulau ini.</p>}
          {island.status === "COMPLETED" && <button disabled={game.busy} className="mt-5 text-sm text-indigo-500 underline" onClick={() => game.run("complete_island", { islandId: island.id })}>Konfirmasi pulau selesai (tanpa hadiah tambahan)</button>}
        </section> : <p className={panel}>Belum ada pulau yang terbuka untuk mata pelajaran ini. Hubungi pengelola materi atau pilih mata pelajaran lain.</p>}
      </>}
    </div>
    {state && settingsOpen && <Modal title="Pengaturan" onClose={() => setSettingsOpen(false)}>
      <label className="block text-sm font-bold">Mata pelajaran
        <select aria-label="Mata pelajaran" className="mt-2 block w-full rounded-xl border bg-white px-3 py-3 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" value={state.settings.SUBJECT} disabled={game.busy || !!state.session} onChange={async event => { const saved = await game.run("settings", { settings: { SUBJECT: event.target.value } }); if (saved) setSelection(null); }}>{state.subjects.map(subject => <option key={subject.subject_code} value={subject.name}>{subject.name}</option>)}</select>
      </label>
      {state.session && <p className="mt-3 text-sm text-slate-500">Selesaikan sesi aktif sebelum mengganti mata pelajaran.</p>}

      <button type="button" className={`${button} mt-5`} disabled={game.busy} onClick={() => setSettingsOpen(false)}>Simpan</button>
    </Modal>}
    {state && game.material && <MaterialReader key={game.material.readToken} material={game.material} game={game} />}
    {state && game.tips && <Modal title="💡 Bekal petualangan" onClose={game.closeTips}><p className="mb-5 whitespace-pre-wrap leading-relaxed">{game.tips.message}</p><label className="mb-5 flex items-center gap-3 text-sm"><input type="checkbox" checked={game.hideTips} disabled={game.busy} onChange={event => game.updateTips(event.target.checked)} />Jangan tampilkan lagi</label><button className={`${button} mt-4`} disabled={game.busy} onClick={game.closeTips}>Mulai jelajah</button></Modal>}
    {state && bag && <Modal title="Tas Alat" onClose={() => setBag(false)}>
      <span aria-label={`${state.wallet.points} poin`} className="mb-5 inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"><Coins size={20} aria-hidden="true" />{state.wallet.points}</span>
      <div className="space-y-3">{TOOLS.map(tool => <div key={tool.id} className="flex items-center gap-3 rounded-2xl border p-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-indigo-50 text-xl leading-none dark:bg-slate-800">{tool.symbol}</span><div className="min-w-0 flex-1"><b>{tool.name}</b><p className="text-sm text-slate-500">Stok: {state.inventory[tool.id]} · {tool.price} poin / item{tool.timedOnly ? " · hanya soal bertimer (+30 detik)" : ""}</p></div><button className={button} disabled={game.busy || state.wallet.points < tool.price} onClick={() => game.run("buy", { tool: tool.id })}>Beli</button></div>)}</div><p className="mt-4 text-xs text-slate-500">Pembelian diproses atomik di server. Bila koneksi putus, periksa saldo dan stok sebelum membeli lagi.</p></Modal>}
    {state && game.result && <Modal title={game.result.passed ? "🏆 Tahap selesai!" : "🌱 Terus bertumbuh"} onClose={game.closeResult}><p className="text-xl font-bold">{game.result.correct} / {game.result.total} benar · nilai {game.result.score}</p><p className="my-4">Hasil tersimpan: +{game.result.points} poin · +{game.result.xp} XP · {game.result.stars} bintang.</p>{!game.result.passed && <p className="mb-5">Percobaan ini tetap tersimpan. Pelajari materi lalu mulai percobaan baru dari tahap yang sama.</p>}<button className={button} onClick={game.closeResult}>Kembali ke peta</button></Modal>}
    {state && game.reward && <Modal title="🎁 Peti Misteri terbuka" onClose={game.closeReward}><motion.div initial={{ scale: .5, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} className="py-5 text-center"><span className="text-7xl">🎁</span><p className="mt-5 text-lg font-black">Peti {game.reward.tier}</p><p className="mt-3">{game.reward.points} poin</p>{Object.entries(game.reward.tools).map(([tool, count]) => <p key={tool}>{TOOLS.find(t => t.id === tool)?.name || tool} +{count}</p>)}</motion.div><p className="mb-5 text-sm text-slate-500">Ini hadiah tersimpan dari server. Membuka peti yang sama tidak mengundi atau membayar ulang.</p><button className={button} onClick={game.closeReward}>Lanjutkan perjalanan</button></Modal>}
    <Feedback game={game} />
    </div>
  </main></div>;
}
