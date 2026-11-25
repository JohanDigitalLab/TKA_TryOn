"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { assignmentAvailability, normalizeStudentAssignments } from "@/lib/school/assignments.mjs";

const date = (value) => new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

export default function StudentAssignmentsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true);
    setItems([]);
    setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) { router.replace("/login"); return; }
      const { data, error: rpcError } = await supabase.rpc("get_student_assignments");
      if (rpcError) throw rpcError;
      const items = normalizeStudentAssignments(data);
      if (generation.current === version) { setItems(items); setNow(Date.now()); }
    } catch (err) { if (generation.current === version) setError(err.message || "Tugas belum dapat dimuat."); }
    finally { if (generation.current === version) setLoading(false); }
  }, [router]);
  useEffect(() => {
    const requestGeneration = generation;
    const initialLoad = setTimeout(() => { void load(); }, 0);
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => { requestGeneration.current++; clearTimeout(initialLoad); clearInterval(timer); };
  }, [load]);

  return <main className="min-h-screen bg-background px-5 py-8 text-ink">
    <div className="mx-auto max-w-5xl">
      <nav className="flex justify-between border-b border-line-strong pb-5 text-sm font-bold"><Link href="/student">← Ruang siswa</Link><button type="button" onClick={load} disabled={loading}>Muat ulang</button></nav>
      <header className="py-9"><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-ink">Tugas sekolah</p><h1 className="mt-3 text-4xl font-black tracking-tight">Agenda belajarmu.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-ink-secondary">Setiap tugas memiliki satu kesempatan pengerjaan. Mulai saat tersedia cukup waktu untuk menyelesaikan seluruh durasi ujian.</p></header>
      <Link className="mb-5 inline-block font-bold text-accent-strong underline" href="/student/agenda">Buka agenda sekolah SET →</Link>
      {error && <p role="alert" className="mb-5 border-l-2 border-warning-line bg-warning-soft p-4 text-sm">{error}</p>}
      {loading ? <p role="status">Memuat tugas…</p> : !error && !items.length ? <p className="border border-line-strong bg-surface p-7 text-ink-secondary">Belum ada tugas dari sekolah. Latihan mandiri tetap tersedia di ruang siswa.</p> : <div className="divide-y divide-line border-y border-line-strong bg-surface">{items.map((item) => {
        const availability = assignmentAvailability(item, now);
        return <article key={item.id} className="flex flex-wrap items-center justify-between gap-5 p-6">
          <div><p className="text-xs font-bold text-accent-ink">{item.school_name} · {item.subject_name}</p><h2 className="mt-2 text-xl font-bold">{item.title}</h2><p className="mt-2 text-sm text-ink-secondary">{item.question_count} soal · {item.duration_minutes} menit</p><p className="mt-1 text-xs leading-6 text-ink-muted">Dibuka {date(item.opens_at)}<br />Batas akhir {date(item.due_at)}</p></div>
          <div className="text-right">{item.attempt_status === "SUBMITTED" && <p className="mb-2 text-2xl font-black">{Number(item.score || 0).toFixed(0)}</p>}{availability.canStart ? <Link className="inline-flex min-h-11 items-center bg-primary px-5 py-3 text-sm font-bold text-on-primary" href={`/student/challenge?assignmentId=${item.id}`}>{availability.label} →</Link> : <span className="text-sm font-bold text-ink-muted">{availability.label}</span>}{item.attempt_status === "SUBMITTED" && <Link href="/student/results" className="mt-3 block text-sm font-bold text-accent-ink">Buka histori hasil</Link>}</div>
        </article>;
      })}</div>}
    </div>
  </main>;
}
