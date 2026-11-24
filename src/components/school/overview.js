"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Empty, Panel, SchoolSelect } from "@/components/school/portal";
import { supabase } from "@/lib/supabase";
import { schoolRpc, schoolWorkspaceSummary, staffMemberships } from "@/lib/school/rpc-contract.mjs";

export default function SchoolOverview({ context }) {
  const memberships = staffMemberships(context);
  const [selected, setSelected] = useState(memberships[0]?.school_id || "");
  const [result, setResult] = useState(null);
  const membership = memberships.find(m => m.school_id === selected);
  useEffect(() => {
    let alive = true;
    if (membership?.role === "school_admin") {
      schoolRpc(supabase, "school_admin_workspace", { p_school_id: membership.school_id })
        .then(data => { if (alive) setResult({ schoolId: membership.school_id, data }); })
        .catch(error => { if (alive) setResult({ schoolId: membership.school_id, error: error.message }); });
    }
    return () => { alive = false; };
  }, [membership]);
  const current = result?.schoolId === membership?.school_id ? result : null;
  const summary = current?.data && schoolWorkspaceSummary(current.data);
  return <Panel title="Ringkasan keanggotaan dan kelas">
    <SchoolSelect memberships={memberships} value={membership?.school_id || ""} onChange={setSelected} />
    {!memberships.length && <Empty>Keanggotaan staf aktif belum dipetakan. Hubungi koordinator/platform; afiliasi profil tidak memberikan hak manajemen kelas.</Empty>}
    {membership && <nav className="flex flex-wrap gap-4 font-bold text-blue-800"><Link href="/teacher">Tugas guru</Link><Link href="/school/agenda">Agenda sekolah SET</Link></nav>}
    {membership?.role === "teacher" && <p>Ringkasan admin hanya tersedia untuk admin sekolah. Tugas dan agenda memerlukan capability sekolah yang cocok dari server.</p>}
    {membership?.role === "school_admin" && <>
      {current?.error ? <p role="alert">{current.error}</p> : !summary ? <p role="status">Memuat ringkasan sekolah…</p> : <dl className="grid gap-4 sm:grid-cols-3">{[["Membership siswa aktif", summary.studentMemberships], ["Kelas tidak diarsipkan", summary.unarchivedClasses], ["Permintaan bergabung pending", summary.pendingRequests]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-4"><dt className="text-sm text-slate-600">{label}</dt><dd className="text-3xl font-black">{value}</dd></div>)}</dl>}
      <p className="text-sm text-slate-600">Hitungan mencakup semua tahun ajaran dalam workspace sekolah terpilih. Status membership bukan bukti akun Auth siswa aktif. Partisipasi, rata-rata nilai, dan aktivitas terbaru belum tersedia dari kontrak analitik terotorisasi; tidak ditampilkan sebagai nol.</p>
      <Link className="font-bold text-blue-800 underline" href={`/school/manage?school=${encodeURIComponent(membership.school_id)}`}>Kelola siswa, kelas, undangan, dan permintaan</Link>
    </>}
  </Panel>;
}
