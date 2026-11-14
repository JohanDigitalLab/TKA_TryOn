"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { assignmentAvailability } from "@/lib/school/assignments.mjs";

const date = (value) => new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

export default function StudentAssignmentsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) { router.replace("/login"); return; }
      const { data, error: rpcError } = await supabase.rpc("get_student_assignments");
      if (rpcError) throw rpcError;
      setItems(data || []);
      setNow(Date.now());
    } catch (err) { setError(err.message || "Tugas belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [router]);
  useEffect(() => {
    const initialLoad = setTimeout(() => { void load(); }, 0);
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => { clearTimeout(initialLoad); clearInterval(timer); };
  }, [load]);

  return <main className="min-h-screen bg-[#f5f6f3] px-5 py-8 text-slate-900">
    <div className="mx-auto max-w-5xl">
      <nav className="flex justify-between border-b border-slate-300 pb-5 text-sm font-bold"><Link href="/student">← Ruang siswa</Link><button type="button" onClick={load} disabled={loading}>Muat ulang</button></nav>
      <header className="py-9"><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Tugas sekolah</p><h1 className="mt-3 text-4xl font-black tracking-tight">Agenda belajarmu.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Setiap tugas memiliki satu kesempatan pengerjaan. Mulai saat tersedia cukup waktu untuk menyelesaikan seluruh durasi ujian.</p></header>
      {error && <p role="alert" className="mb-5 border-l-2 border-amber-600 bg-amber-50 p-4 text-sm">{error}</p>}
      {loading ? <p role="status">Memuat tugas…</p> : !error && !items.length ? <p className="border border-slate-300 bg-white p-7 text-slate-600">Belum ada tugas dari sekolah. Latihan mandiri tetap tersedia di ruang siswa.</p> : <div className="divide-y divide-slate-200 border-y border-slate-300 bg-white">{items.map((item) => {
        const availability = assignmentAvailability(item, now);
        return <article key={item.id} className="flex flex-wrap items-center justify-between gap-5 p-6">
          <div><p className="text-xs font-bold text-blue-700">{item.school_name} · {item.subject_name}</p><h2 className="mt-2 text-xl font-bold">{item.title}</h2><p className="mt-2 text-sm text-slate-600">{item.question_count} soal · {item.duration_minutes} menit</p><p className="mt-1 text-xs leading-6 text-slate-500">Dibuka {date(item.opens_at)}<br />Batas akhir {date(item.due_at)}</p></div>
          <div className="text-right">{item.attempt_status === "SUBMITTED" && <p className="mb-2 text-2xl font-black">{Number(item.score || 0).toFixed(0)}</p>}{availability.canStart ? <Link className="inline-flex min-h-11 items-center bg-blue-700 px-5 py-3 text-sm font-bold text-white" href={`/student/challenge?assignmentId=${item.id}`}>{availability.label} →</Link> : <span className="text-sm font-bold text-slate-500">{availability.label}</span>}{item.attempt_status === "SUBMITTED" && <Link href="/student/results" className="mt-3 block text-sm font-bold text-blue-700">Buka histori hasil</Link>}</div>
        </article>;
      })}</div>}
    </div>
  </main>;
}
