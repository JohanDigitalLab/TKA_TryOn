"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { assignmentMutationPayload } from "@/lib/school/assignments.mjs";

const emptyForm = { class_id: "", title: "", subject_name: "Matematika", question_count: 20, duration_minutes: 60, opens_at: "", due_at: "" };
const inputClass = "mt-2 min-h-11 w-full border border-slate-300 bg-white px-3 py-2 text-sm";
const buttonClass = "min-h-11 border border-slate-300 bg-white px-4 py-2 text-sm font-bold disabled:opacity-50";
const formatDate = (v) => new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
function localDate(v) { const d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

export default function TeacherPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState([]);
  const [schoolId, setSchoolId] = useState("");
  const [workspace, setWorkspace] = useState({ classes: [], assignments: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const dialogRef = useRef(null);
  const schoolRef = useRef("");

  const load = useCallback(async (id) => {
    const { data, error: rpcError } = await supabase.rpc("get_teacher_workspace", { p_school_id: id });
    if (rpcError) throw rpcError;
    if (schoolRef.current === id) setWorkspace(data || { classes: [], assignments: [] });
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth.user) { router.replace("/login"); return; }
        const { data, error: membershipError } = await supabase.from("school_memberships").select("school_id,role").eq("user_id", auth.user.id).eq("status", "active").in("role", ["teacher", "school_admin"]);
        if (membershipError) throw membershipError;
        if (!active) return;
        const ids = (data || []).map((m) => m.school_id);
        let schools = [];
        if (ids.length) {
          const result = await supabase.from("schools").select("id,name").in("id", ids);
          if (result.error) throw result.error;
          schools = result.data || [];
        }
        if (!active) return;
        setMemberships((data || []).map((m) => ({ ...m, name: schools.find((s) => s.id === m.school_id)?.name || "Sekolah" })));
        if (ids.length) {
          schoolRef.current = ids[0];
          setSchoolId(ids[0]);
          await load(ids[0]);
        }
      } catch (err) { if (active) setError(err.message || "Ruang guru belum dapat dimuat."); }
      finally { if (active) setLoading(false); }
    }
    void init();
    return () => { active = false; };
  }, [load, router]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirm && dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [confirm]);

  async function changeSchool(id) {
    schoolRef.current = id;
    setSchoolId(id); setEditing(null); setForm(emptyForm); setRanking(null); setError(""); setMessage(""); setLoading(true);
    try { await load(id); } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const payload = assignmentMutationPayload(form, schoolId, editing);
      const { error: rpcError } = await supabase.rpc("save_school_assignment", payload);
      if (rpcError) throw rpcError;
      setEditing(null); setForm(emptyForm); setMessage("Draft tersimpan. Terbitkan agar tersedia untuk siswa.");
      await load(schoolId);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function changeStatus() {
    if (!confirm || busy) return;
    const action = confirm;
    setBusy(true); setError(""); setMessage("");
    try {
      const { error: rpcError } = await supabase.rpc("set_school_assignment_status", { p_assignment_id: action.item.id, p_status: action.status });
      if (rpcError) throw rpcError;
      setConfirm(null); setRanking(null); setMessage(action.status === "published" ? "Tugas diterbitkan untuk siswa aktif dalam kelas." : "Tugas dibatalkan. Histori ujian tetap disimpan.");
      await load(schoolId);
    } catch (err) { setConfirm(null); setError(err.message); } finally { setBusy(false); }
  }
  async function openRanking(item) {
    setBusy(true); setError(""); setRanking(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_school_assignment_ranking", { p_assignment_id: item.id });
      if (rpcError) throw rpcError;
      setRanking({ title: item.title, rows: data || [] });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function edit(item) {
    setEditing(item); setMessage("");
    setForm({ ...item, opens_at: localDate(item.opens_at), due_at: localDate(item.due_at) });
    document.getElementById("assignment-title")?.focus();
  }
  function field(key, value) { setForm((old) => ({ ...old, [key]: value })); }

  return <main className="min-h-screen bg-[#f5f6f3] px-5 py-8 text-slate-900"><div className="mx-auto max-w-7xl">
    <nav className="flex flex-wrap justify-between gap-4 border-b border-slate-300 pb-5 text-sm font-bold"><Link href="/school">← Ruang sekolah</Link><Link href="/school/manage">Kelola sekolah</Link><Link href="/school/messages">Pesan sekolah</Link><Link href="/student">Ruang siswa →</Link></nav>
    <p className="mt-4 text-sm text-slate-600">Akses guru legacy masih tingkat sekolah, belum per kelas/mapel. Undangan atau promosi guru baru tidak tersedia.</p>
    <header className="flex flex-wrap items-end justify-between gap-6 py-9"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Workspace guru & admin</p><h1 className="mt-3 text-4xl font-black tracking-tight">Susun tugas. Pantau hasil.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Paket soal dikunci saat terbit. Semua penerima mengerjakan versi soal yang sama, dengan satu kesempatan per siswa.</p></div>{memberships.length > 0 && <label className="text-sm font-bold">Sekolah<select className={inputClass} value={schoolId} disabled={busy || loading} onChange={(e) => changeSchool(e.target.value)}>{memberships.map((m) => <option key={m.school_id} value={m.school_id}>{m.name}</option>)}</select></label>}</header>
    {error && <p role="alert" className="mb-5 border-l-2 border-amber-600 bg-amber-50 p-4 text-sm">{error}</p>}
    {message && <p role="status" className="mb-5 border-l-2 border-emerald-600 bg-emerald-50 p-4 text-sm">{message}</p>}
    {loading ? <p role="status">Memuat ruang guru…</p> : !memberships.length ? <section className="border border-slate-300 bg-white p-7"><h2 className="text-xl font-bold">Akses guru atau admin diperlukan</h2><p className="mt-3 text-sm text-slate-600">Hubungi administrator sekolah untuk memperoleh keanggotaan aktif.</p></section> : <div className="grid items-start gap-8 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="border border-slate-300 bg-white p-6"><h2 className="text-xl font-black">{editing ? "Edit draft" : "Tugas baru"}</h2><p className="mt-2 text-xs leading-6 text-slate-500">Tersedia untuk kelas 6 dan 9 sesuai dukungan engine saat ini. Buat kelas dan keanggotaan siswa melalui administrasi sekolah sebelum menerbitkan tugas.</p>
        <form onSubmit={save} className="mt-5"><fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          <label className="block text-sm font-bold">Judul<input id="assignment-title" required minLength={3} maxLength={160} className={inputClass} value={form.title} onChange={(e) => field("title", e.target.value)} /></label>
          <label className="block text-sm font-bold">Kelas<select required className={inputClass} value={form.class_id} onChange={(e) => field("class_id", e.target.value)}><option value="">Pilih kelas</option>{workspace.classes.filter((c) => [6, 9].includes(c.grade)).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.academic_year || c.grade}</option>)}</select></label>
          <label className="block text-sm font-bold">Mata pelajaran<input required maxLength={100} className={inputClass} value={form.subject_name} onChange={(e) => field("subject_name", e.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-500">Gunakan nama persis seperti pada bank soal terbit.</span></label>
          <div className="grid grid-cols-2 gap-4"><label className="text-sm font-bold">Jumlah soal<input type="number" required min={1} max={100} className={inputClass} value={form.question_count} onChange={(e) => field("question_count", e.target.value)} /></label><label className="text-sm font-bold">Durasi (menit)<input type="number" required min={1} max={240} className={inputClass} value={form.duration_minutes} onChange={(e) => field("duration_minutes", e.target.value)} /></label></div>
          <label className="block text-sm font-bold">Dibuka (waktu lokal perangkat)<input type="datetime-local" required className={inputClass} value={form.opens_at} onChange={(e) => field("opens_at", e.target.value)} /></label>
          <label className="block text-sm font-bold">Batas akhir (waktu lokal perangkat)<input type="datetime-local" required className={inputClass} value={form.due_at} onChange={(e) => field("due_at", e.target.value)} /></label>
          <div className="flex flex-wrap gap-3"><button type="submit" className="min-h-11 bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? "Memproses…" : "Simpan draft"}</button>{editing && <button type="button" className={buttonClass} onClick={() => { setEditing(null); setForm(emptyForm); }}>Batal edit</button>}</div>
        </fieldset></form>
      </section>
      <section><div className="mb-4 flex items-center justify-between border-b border-slate-300 pb-4"><h2 className="text-2xl font-black">Daftar tugas</h2><button type="button" className={buttonClass} disabled={busy} onClick={() => changeSchool(schoolId)}>Muat ulang</button></div>
        {!workspace.assignments.length ? <p className="border border-slate-200 bg-white p-6 text-sm text-slate-500">Belum ada tugas. Mulai dengan menyimpan draft.</p> : <div className="divide-y divide-slate-200 border-y border-slate-300 bg-white">{workspace.assignments.map((item) => <article key={item.id} className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">{item.status} · {workspace.classes.find((c) => c.id === item.class_id)?.name || "Kelas"}</p><h3 className="mt-2 text-xl font-bold">{item.title}</h3><p className="mt-2 text-sm text-slate-600">{item.subject_name} · {item.question_count} soal · {item.duration_minutes} menit</p><p className="mt-2 text-xs leading-6 text-slate-500">{formatDate(item.opens_at)} — {formatDate(item.due_at)}<br />{item.submitted}/{item.recipients} penerima telah submit</p><div className="mt-4 flex flex-wrap gap-2">{item.status === "draft" && <><button type="button" disabled={busy} className={buttonClass} onClick={() => edit(item)}>Edit</button><button type="button" disabled={busy} className={buttonClass} onClick={() => setConfirm({ item, status: "published" })}>Terbitkan</button></>}{item.status !== "cancelled" && <button type="button" disabled={busy} className={buttonClass} onClick={() => setConfirm({ item, status: "cancelled" })}>Batalkan tugas</button>}<button type="button" disabled={busy} className={buttonClass} onClick={() => openRanking(item)}>Top 5 hasil</button></div></article>)}</div>}
        {ranking && <section className="mt-7 border border-slate-300 bg-white p-5"><h2 className="text-xl font-black">Top 5 · {ranking.title}</h2><p className="mt-2 text-xs leading-6 text-slate-500">Khusus staf sekolah. Urutan berdasarkan nilai tertinggi, waktu submit lebih awal, lalu ID sesi. Hanya hasil final yang dihitung.</p>{ranking.rows.length ? <ol className="mt-4 divide-y divide-slate-200">{ranking.rows.map((r) => <li key={r.position} className="flex justify-between gap-4 py-3 text-sm"><span>{r.position}. {r.student_name}</span><strong>{Number(r.score).toFixed(1)} <small className="font-normal text-slate-500">({r.correct_answers}/{r.total_questions})</small></strong></li>)}</ol> : <p className="mt-4 text-sm text-slate-500">Belum ada hasil yang disubmit.</p>}</section>}
      </section>
    </div>}
    <dialog ref={dialogRef} onCancel={() => setConfirm(null)} className="fixed inset-0 m-auto w-[min(92vw,30rem)] border border-slate-300 bg-white p-6 text-slate-900 backdrop:bg-slate-950/40" aria-labelledby="confirm-title"><h2 id="confirm-title" className="text-xl font-black">{confirm?.status === "published" ? "Terbitkan tugas?" : "Batalkan tugas?"}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{confirm?.status === "published" ? "Daftar siswa dan paket soal akan dikunci. Konfigurasi tidak bisa diedit setelah terbit." : "Siswa tidak dapat memulai tugas ini lagi. Sesi yang sudah berjalan dan histori hasil tidak dihapus."}</p><div className="mt-6 flex gap-3"><button autoFocus type="button" className={buttonClass} disabled={busy} onClick={() => setConfirm(null)}>Kembali</button><button type="button" className={buttonClass} disabled={busy} onClick={changeStatus}>{busy ? "Memproses…" : "Konfirmasi"}</button></div></dialog>
  </div></main>;
}
