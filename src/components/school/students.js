"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { getTimeGreeting } from "@/lib/student/greeting.mjs";
import { buttonClass, Panel } from "@/components/school/portal";

function subscribe(onChange) {
  const timer = window.setInterval(onChange, 30000);
  window.addEventListener("focus", onChange);
  return () => { window.clearInterval(timer); window.removeEventListener("focus", onChange); };
}
const snapshot = () => getTimeGreeting();
const serverSnapshot = () => "Selamat Datang";

export default function SchoolDashboard({ userId }) {
  const greeting = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [school, setSchool] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data, error: requestError } = await supabase.rpc("get_school_students");
        if (requestError) {
          if (requestError.code === "PGRST202") throw new Error("RPC dashboard sekolah belum tersedia. Jalankan migrasi migration-school-dashboard.sql di Supabase SQL Editor.");
          throw requestError;
        }
        if (!data?.school || !Array.isArray(data.students)) throw new Error("Respons dashboard sekolah tidak valid.");
        if (active) {
          setSchool(data.school);
          setStudents(data.students);
        }
      } catch (err) {
        if (active) setError(err.message || "Dashboard sekolah belum berhasil dimuat.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [userId]);

  if (loading) return <p role="status">Memuat dashboard sekolah…</p>;
  return <div className="space-y-6">
    {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">{error}</p>}
    {school && <>
      <section id="greeting" className="scroll-mt-28"><h2 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{greeting}, {school.name}!</h2></section>

        <section id="action" className="mb-10 scroll-mt-28">
           <div className="flex flex-wrap gap-3 mt-4">
          <Link className={buttonClass} href={`/school/manage?school=${encodeURIComponent(school.id)}`}>Lengkapi Profil Sekolah</Link>
          <Link className={buttonClass} href="/teacher">Buat Tugas Sekolah</Link>
          <button type="button" className={buttonClass} onClick={() => setSelected({ action: "schedule" })}>Jadwalkan Try Out</button>
            </div>
         </section>

      <Panel title="Daftar Siswa">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-slate-500"><tr><th scope="col" className="px-4 py-3">#</th><th scope="col" className="px-4 py-3">NISN</th><th scope="col" className="px-4 py-3">Nama Siswa</th><th scope="col" className="px-4 py-3 text-right">Aksi</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{students.length ? students.map((student, index) => <tr key={student.id}>
              <td className="px-4 py-3">{index + 1}</td><td className="px-4 py-3">{student.nisn || "-"}</td><td className="px-4 py-3">{student.full_name || "-"}</td>
              <td className="px-4 py-3"><div className="flex justify-end gap-2">{["Profil", "Review", "Reset Password"].map(action => <button key={action} type="button" className="whitespace-nowrap rounded-lg border border-blue-200 px-3 py-2 font-bold text-blue-700 hover:bg-blue-50" onClick={() => setSelected({ student, action })}>{action}</button>)}</div></td>
            </tr>) : <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-500">Belum ada siswa yang dikelola sekolah.</td></tr>}</tbody>
          </table>
        </div>
      </Panel>
    </>}
    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5"><section role="dialog" aria-modal="true" aria-labelledby="school-dialog-title" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6">
      <h2 id="school-dialog-title" className="text-xl font-bold">{selected.action === "schedule" ? "Jadwalkan Try Out" : `${selected.action} — ${selected.student.full_name || "Siswa"}`}</h2>
      {selected.action === "Profil" ? <dl className="space-y-2"><div><dt className="font-bold">NISN</dt><dd>{selected.student.nisn || "-"}</dd></div><div><dt className="font-bold">Nama Siswa</dt><dd>{selected.student.full_name || "-"}</dd></div><div><dt className="font-bold">Sekolah</dt><dd>{school.name}</dd></div></dl> : <p className="text-sm text-slate-600">{selected.action === "schedule" ? "Form penjadwalan try out belum tersedia." : selected.action === "Review" ? "Review hasil siswa oleh sekolah belum tersedia pada halaman ini." : "Reset password siswa memerlukan layanan admin yang terotorisasi. Fitur ini belum tersedia; password siswa tidak diubah."}</p>}
      <button autoFocus type="button" className={buttonClass} onClick={() => setSelected(null)}>Tutup</button>
    </section></div>}
  </div>;
}
