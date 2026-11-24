"use client";

import DashboardBreadcrumb from "@/components/dashboard-breadcrumb";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Backpack, Check, ChevronLeft, Coins, Lock, Moon, Star, Sun, X } from "lucide-react";
import { buildAnswer, categoryLabels, questionSecondsLeft, safeMaterialUrl, STAGES, TOOLS } from "@/lib/student/mapadventure-client";
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
  return <div aria-live="polite" className="space-y-2">
    {game.error && <p role="alert" className="rounded-xl bg-rose-100 p-3 text-sm text-rose-900">{game.error}</p>}
    {game.notice && <p className="rounded-xl bg-sky-100 p-3 text-sm text-sky-900">{game.notice}</p>}
  </div>;
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
    <Feedback game={game} />
    <button className={`${button} mt-4`} disabled={game.busy || !eligible || (!!url && !opened) || (!material.text && !url)} onClick={claim}>{game.busy ? "Menyimpan…" : "Selesai membaca"}</button>
    <p className="mt-3 text-xs text-slate-500">Penyelesaian dan hadiah diverifikasi server. Materi yang sudah selesai tidak memberi hadiah ulang.</p>
  </Modal>;
}
function Quiz({ session, game }) {
  const [draft, setDraft] = useState({});
  const [validation, setValidation] = useState("");
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
      setValidation("");
      await game.run("answer", { attempt_id: session.attempt_id, question_id: q.id, answer_payload }, { retried: effects.retried });
    } catch (error) { setValidation(error.message); }
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
      {validation && <p role="alert" className="mb-3 text-rose-600">{validation}</p>}
      <button className={button} disabled={game.busy || expired} onClick={answer}>{game.busy ? "Menyimpan…" : "Kirim jawaban"}</button>
    </> : <div className="py-5 text-center"><p className="mb-5">Semua jawaban sudah tersimpan. Selesaikan sesi untuk mendapatkan hasil dari server.</p><button className={button} disabled={game.busy} onClick={() => game.run("complete_node", { nodeId: session.nodeId, attempt_id: session.attempt_id })}>Selesaikan sesi</button></div>}
    <div className="mt-4"><Feedback game={game} /></div>
    <button className="mt-4 text-sm text-indigo-600 underline disabled:opacity-40" disabled={game.busy} onClick={() => game.run("bootstrap")}>Muat ulang sesi tersimpan</button>
    <p className="mt-3 text-xs text-slate-500">Sesi otomatis dilanjutkan saat kembali. Jawaban tidak dinilai di perangkat ini.</p>
  </Modal>;
}
function TopicTrail({ node, game }) {
  const height = 610;
  const coordinates = [[30, 65], [68, 180], [30, 295], [68, 410], [40, 525]];
  async function activate(stage) {
    if (stage === "material") return game.run("material", { nodeId: node.id });
    if (stage === "mysterychest") return game.openGachaChest(node.id);
    return game.run("start", { nodeId: node.id, stage });
  }
  return <div className="relative mx-auto max-w-md" style={{ height }}>
    <svg className="absolute h-full w-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">{coordinates.slice(0, -1).map(([x, y], i) => {
      const [nx, ny] = coordinates[i + 1];
      return <path key={i} d={`M ${x} ${y} C ${x} ${y + 65}, ${nx} ${ny - 65}, ${nx} ${ny}`} fill="none" stroke={node[`${STAGES[i].id}_status`] === "COMPLETED" ? "#818cf8" : "#cbd5e1"} strokeWidth="2" strokeDasharray="3 3" />;
    })}</svg>
    {STAGES.map((stage, i) => {
      const status = node[`${stage.id}_status`];
      const [x, y] = coordinates[i];
      return <div key={stage.id} className="absolute flex w-40 -translate-x-1/2 flex-col items-center" style={{ left: `${x}%`, top: y - 34 }}>
        <motion.button whileHover={{ scale: status !== "LOCKED" ? 1.08 : 1 }} whileTap={{ scale: .96 }} aria-label={`${stage.name}: ${statusText[status]}`} disabled={game.busy || status === "LOCKED" || (status === "COMPLETED" && !["material", "mysterychest"].includes(stage.id))} onClick={() => activate(stage.id)} className={`relative flex h-20 w-20 items-center justify-center rounded-3xl border-4 text-3xl shadow-lg disabled:cursor-default ${status === "COMPLETED" ? "border-emerald-200 bg-emerald-100" : status === "UNLOCKED" ? "border-amber-200 bg-gradient-to-br from-amber-50 to-amber-200" : "border-slate-200 bg-slate-100 grayscale"}`} style={status === "UNLOCKED" ? { animation: "mapadventure-node-pulse 2s infinite" } : undefined}>
          {status === "LOCKED" ? <Lock className="text-slate-400" /> : stage.symbol}{status === "COMPLETED" && <Check size={20} className="absolute -right-2 -top-2 rounded-full bg-emerald-500 p-0.5 text-white" />}
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
  const state = game.state;
  const island = state?.islands.find(i => i.id === selection?.island);
  const node = state?.nodes.find(n => n.id === selection?.node);
  const topics = state?.nodes.filter(n => n.theme_id === island?.id) || [];
  return <div className={`mapadventure-scope ${dark ? "dark" : ""}`}><main className="min-h-screen bg-gradient-to-b from-sky-50 via-indigo-50 to-white p-4 text-slate-800 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-950 dark:text-slate-100 sm:p-7">
    <DashboardBreadcrumb />
    <header className="mx-auto mb-6 flex max-w-5xl flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[.25em] text-indigo-500">Jelajah · Belajar · Bertumbuh</p><h1 className="mt-2 text-3xl font-black">🗺️ Map Adventure</h1><p className="mt-2 text-sm text-slate-500">Satu perjalanan, selangkah lebih hebat.</p></div><div className="flex gap-2"><button onClick={() => setDark(!dark)} aria-label="Ganti tampilan terang atau gelap" className="rounded-2xl border p-3">{dark ? <Sun /> : <Moon />}</button><button disabled={!state} onClick={() => setBag(true)} className={`${button} flex gap-2`}><Backpack />Tas alat</button></div></header>
    <div className="mx-auto max-w-5xl space-y-5">
      <Feedback game={game} />
      <div className="flex flex-wrap items-center gap-3">{state && <><span className={`${panel} flex items-center gap-2 !p-3`}><Coins className="text-amber-500" />{state.wallet.points} poin</span><span className={`${panel} !p-3`}><Stars value={state.status.stars} /> global</span><span className={`${panel} !p-3`}>{state.profile_xp} XP profil</span></>}<button className="ml-auto rounded-xl border px-4 py-3 text-sm font-bold disabled:opacity-40" disabled={game.busy} onClick={() => game.run("bootstrap")}>{game.busy ? "Memuat…" : "Muat ulang data"}</button></div>
      {!state ? <section className={`${panel} py-16 text-center`}><span className="text-5xl">🧭</span><p className="mt-5">{game.busy ? "Menyiapkan peta petualanganmu…" : "Peta belum dapat dimuat. Gunakan Muat ulang data untuk mencoba lagi."}</p></section> : <>
        <label className="flex flex-wrap items-center gap-3 text-sm font-bold">Mata pelajaran<select className="rounded-xl border bg-white px-4 py-3 text-slate-800" value={state.settings.SUBJECT} disabled={game.busy || !!state.session} onChange={async event => { const saved = await game.run("settings", { settings: { SUBJECT: event.target.value } }); if (saved) setSelection(null); }}>{state.subjects.map(subject => <option key={subject.subject_code} value={subject.name}>{subject.name}</option>)}</select><span className="font-normal text-slate-500">{state.education_level.toUpperCase()} · progres tersimpan otomatis</span></label>
        {state.session && !game.tips && <Quiz key={`${state.session.attempt_id}:${state.session.question?.id || "finish"}`} session={state.session} game={game} />}
        {island ? <section className={panel}><button className="mb-5 flex items-center gap-1 text-sm font-bold text-indigo-500" onClick={() => setSelection(node ? { island: island.id } : null)}><ChevronLeft size={18} />{node ? "Semua topik" : "Semua pulau"}</button><header className="mb-4 flex items-center justify-between"><div><h2 className="text-2xl font-black">{node ? node.topic : island.theme}</h2><p className="mt-1 text-sm text-slate-500">{node ? "Ikuti jalur: materi → latihan → misi → peti → penjaga." : `${topics.length} topik · ${statusText[island.status]}`}</p></div><Stars value={island.stars} /></header>{node ? <TopicTrail node={node} game={game} /> : <div className="space-y-4">{topics.map((topic, i) => <motion.button whileHover={{ x: 4 }} key={topic.id} className="flex w-full items-center gap-4 rounded-2xl border p-5 text-left hover:border-indigo-400" onClick={() => setSelection({ island: island.id, node: topic.id })}><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-xl text-indigo-700">{topic.material_status === "LOCKED" ? <Lock /> : i + 1}</span><span className="flex-1"><b>{topic.topic}</b><span className="mt-1 block text-xs text-slate-500">{STAGES.filter(s => topic[`${s.id}_status`] === "COMPLETED").length} / 5 tahap selesai</span></span><Stars value={topic.gatekeeper_stars} /></motion.button>)}</div>}{island.status === "COMPLETED" && <button disabled={game.busy} className="mt-5 text-sm text-indigo-500 underline" onClick={() => game.run("complete_island", { islandId: island.id })}>Konfirmasi pulau selesai (tanpa hadiah tambahan)</button>}<p className="mt-5 text-xs text-slate-500">Bintang pulau hanya menjumlahkan bintang Pos Penjaga tiap topik.</p></section> : <>
          <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 p-7 text-white shadow-xl"><div className="absolute -right-10 -top-16 h-52 w-52 rounded-full border-[28px] border-white/10" /><span className="text-5xl">⛵</span><h2 className="mt-4 text-2xl font-black">Kepulauan Pengetahuan</h2><p className="mt-2 max-w-lg text-sm text-indigo-100">Selesaikan setiap topik untuk membuka jalur berikutnya. Hadiah, alat, dan hasil perjalananmu disimpan di server.</p></section>
          {!state.islands.length && <p className={panel}>Belum ada tema dan topik untuk mata pelajaran ini. Hubungi pengelola materi atau pilih mata pelajaran lain.</p>}
          <div className="grid gap-5 sm:grid-cols-2">{state.islands.map((item, i) => <motion.button key={item.id} whileHover={{ y: -5 }} onClick={() => setSelection({ island: item.id })} className={`${panel} relative overflow-hidden text-left`}><div className={`mb-4 flex h-36 items-center justify-center rounded-2xl bg-gradient-to-br ${i % 2 ? "from-violet-100 to-rose-100" : "from-sky-100 to-emerald-100"}`}><svg viewBox="0 0 220 130" className="h-32 w-56" aria-hidden="true"><ellipse cx="110" cy="105" rx="85" ry="17" fill="#7dd3fc" opacity=".5" /><path d="M30 78 Q55 38 100 56 Q145 28 190 78 L165 101 Q110 123 50 100Z" fill="#a78bfa" /><path d="M30 78 Q65 40 105 53 Q150 25 190 78 Q125 106 30 78" fill={item.status === "LOCKED" ? "#cbd5e1" : "#6ee7b7"} /><path d="M82 65 L111 18 L140 65Z" fill="#818cf8" /><path d="M101 34 L111 18 L123 37 L112 32Z" fill="white" /><path d="M144 70 V37 M133 48 L144 28 L156 48Z" stroke="#059669" fill="#34d399" strokeWidth="5" /><path d="M53 78 Q95 55 128 79" fill="none" stroke="#fef3c7" strokeWidth="6" strokeDasharray="7 3" /></svg></div><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-indigo-500">PULAU {item.order_number}</p><h3 className="mt-1 text-xl font-black">{item.theme}</h3><p className="mt-2 text-sm text-slate-500">{statusText[item.status]} · {state.nodes.filter(n => n.theme_id === item.id).length} topik</p></div><Stars value={item.stars} /></div></motion.button>)}</div>
        </>}
      </>}
    </div>
    {state && game.material && <MaterialReader key={game.material.readToken} material={game.material} game={game} />}
    {state && game.tips && <Modal title="💡 Bekal petualangan" onClose={game.closeTips}><p className="mb-5 whitespace-pre-wrap leading-relaxed">{game.tips.message}</p><label className="mb-5 flex items-center gap-3 text-sm"><input type="checkbox" checked={game.hideTips} disabled={game.busy} onChange={event => game.updateTips(event.target.checked)} />Jangan tampilkan lagi</label><Feedback game={game} /><button className={`${button} mt-4`} disabled={game.busy} onClick={game.closeTips}>Mulai jelajah</button></Modal>}
    {state && bag && <Modal title="🎒 Tas & toko alat" onClose={() => setBag(false)}><p className="mb-5">Saldo server: <b>{state.wallet.points} poin</b></p><div className="space-y-3">{TOOLS.map(tool => <div key={tool.id} className="flex items-center gap-3 rounded-2xl border p-4"><span className="text-2xl">{tool.symbol}</span><div className="flex-1"><b>{tool.name}</b><p className="text-sm text-slate-500">Stok: {state.inventory[tool.id]} · {tool.price} poin / item{tool.timedOnly ? " · hanya soal bertimer (+30 detik)" : ""}</p></div><button className={button} disabled={game.busy || state.wallet.points < tool.price} onClick={() => game.run("buy", { tool: tool.id })}>Beli</button></div>)}</div><div className="mt-4"><Feedback game={game} /></div><p className="mt-4 text-xs text-slate-500">Pembelian diproses atomik di server. Bila koneksi putus, periksa saldo dan stok sebelum membeli lagi.</p></Modal>}
    {state && game.result && <Modal title={game.result.passed ? "🏆 Tahap selesai!" : "🌱 Terus bertumbuh"} onClose={game.closeResult}><p className="text-xl font-bold">{game.result.correct} / {game.result.total} benar · nilai {game.result.score}</p><p className="my-4">Hasil tersimpan: +{game.result.points} poin · +{game.result.xp} XP · {game.result.stars} bintang.</p>{!game.result.passed && <p className="mb-5">Percobaan ini tetap tersimpan. Pelajari materi lalu mulai percobaan baru dari tahap yang sama.</p>}<button className={button} onClick={game.closeResult}>Kembali ke peta</button></Modal>}
    {state && game.reward && <Modal title="🎁 Peti Misteri terbuka" onClose={game.closeReward}><motion.div initial={{ scale: .5, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} className="py-5 text-center"><span className="text-7xl">🎁</span><p className="mt-5 text-lg font-black">Peti {game.reward.tier}</p><p className="mt-3">{game.reward.points} poin</p>{Object.entries(game.reward.tools).map(([tool, count]) => <p key={tool}>{TOOLS.find(t => t.id === tool)?.name || tool} +{count}</p>)}</motion.div><p className="mb-5 text-sm text-slate-500">Ini hadiah tersimpan dari server. Membuka peti yang sama tidak mengundi atau membayar ulang.</p><button className={button} onClick={game.closeReward}>Lanjutkan perjalanan</button></Modal>}
  </main></div>;
}
