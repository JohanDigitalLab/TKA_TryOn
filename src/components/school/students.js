"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { getTimeGreeting } from "@/lib/student/greeting.mjs";
import { Panel } from "@/components/school/portal";
import { loadLegacySchoolStudents } from "@/lib/school/rpc-contract.mjs";

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

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth.user || auth.user.id !== userId) throw new Error("SCHOOL_ACCESS_DENIED: Masuk kembali dengan akun yang sesuai.");
        const { data: profile, error: profileError } = await supabase.from("profiles").select("account_type,school_id").eq("id", auth.user.id).maybeSingle();
        if (profileError) throw profileError;
        const data = await loadLegacySchoolStudents(supabase, profile);
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
    {error && <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-4 text-warning-ink">{error}</p>}
    {school && <>
      <section id="greeting" className="scroll-mt-28"><h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{greeting}, {school.name}!</h2></section>

        <section id="action" className="mb-10 scroll-mt-28">
           <div className="flex flex-wrap gap-3 mt-4">
          <Link className="font-bold text-accent-strong underline" href={`/school/manage?school=${encodeURIComponent(school.id)}`}>Kelola kelas dan membership</Link>
          <Link className="font-bold text-accent-strong underline" href="/teacher">Status akses tugas guru</Link>
          <p className="text-sm text-ink-secondary">Penjadwalan, review lintas siswa, dan reset sandi belum diaktifkan melalui kontrak terotorisasi.</p>
            </div>
         </section>

      <Panel title="Daftar Siswa — Profil Terkelola Legacy (Baca-saja)">
        <p>Daftar ini bukan membership kelas dan tidak memberikan akses manajemen. Profil belum dipetakan harus direkonsiliasi oleh koordinator/platform.</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-y border-line bg-surface-muted text-ink-muted"><tr><th scope="col" className="px-4 py-3">#</th><th scope="col" className="px-4 py-3">NISN</th><th scope="col" className="px-4 py-3">Nama Siswa</th><th scope="col" className="px-4 py-3 text-right">Aksi</th></tr></thead>
            <tbody className="divide-y divide-line-subtle">{students.length ? students.map((student, index) => <tr key={student.id}>
              <td className="px-4 py-3">{index + 1}</td><td className="px-4 py-3">{student.nisn || "-"}</td><td className="px-4 py-3">{student.full_name || "-"}</td>
              <td className="px-4 py-3"><details><summary className="cursor-pointer font-bold text-accent-ink">Detail profil baca-saja</summary><p>{student.full_name || "—"} · NISN {student.nisn || "—"} · {school.name}</p><p>Membership dan kelas tidak disimpulkan dari profil legacy.</p></details></td>
            </tr>) : <tr><td colSpan="4" className="px-4 py-8 text-center text-ink-muted">Belum ada siswa yang dikelola sekolah.</td></tr>}</tbody>
          </table>
        </div>
      </Panel>
    </>}
  </div>;
}
