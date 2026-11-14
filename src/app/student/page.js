"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const services = [
  {
    number: "01",
    title: "Simulasi TKA",
    description: "Kerjakan simulasi ujian dengan tampilan CBT, batas waktu, navigasi soal, dan mekanisme pengerjaan terstruktur.",
    status: "MULAI SIMULASI",
    href: "/student/subjects?activityType=simulasi",
  },
  {
    number: "02",
    title: "Latihan Akademik",
    description: "Latihan berdasarkan jenjang pendidikan, mata pelajaran, dan kompetensi yang diujikan.",
    status: "MULAI LATIHAN",
    href: "/student/subjects?activityType=latihan",
  },
];

function formatAttemptDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default function StudentPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [activeAttempts, setActiveAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) {
          router.replace("/login");
          return;
        }

        const [{ data: profileData, error: profileError }, { data: attemptsData, error: attemptsError }] = await Promise.all([
          supabase.from("profiles").select("full_name, education_level").eq("id", userData.user.id).maybeSingle(),
          supabase.rpc("get_student_active_attempts"),
        ]);
        if (profileError) throw profileError;
        if (attemptsError) throw attemptsError;
        if (!mounted) return;
        setProfile(profileData || { full_name: userData.user.email?.split("@")[0] || "Siswa" });
        setActiveAttempts(Array.isArray(attemptsData) ? attemptsData : []);
      } catch (err) {
        if (mounted) setError(err.message || "Dashboard belum berhasil dimuat.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadDashboard();
    return () => { mounted = false; };
  }, [router]);

  const initials = useMemo(() => {
    const name = profile?.full_name || "Siswa";
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "S";
  }, [profile]);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-slate-50"><p className="font-semibold text-slate-600">Memuat ruang belajar…</p></main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 lg:px-8">
          <Link href="/" aria-label="Kembali ke halaman utama TKA TryOn" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-700 text-lg font-black text-white">T</div>
            <div><h1 className="text-xl font-extrabold tracking-tight text-slate-900">TKA <span className="text-blue-700">TryOn</span></h1><p className="text-[10px] font-semibold tracking-widest text-slate-500">SKILL ON • CONFIDENCE ON</p></div>
          </Link>
          <div className="flex items-center gap-3">
            <nav aria-label="Navigasi siswa" className="flex items-center gap-1 sm:gap-2">
              <Link href="/school" className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:px-3 sm:text-sm">Sekolah</Link>
              <Link href="/school/messages" className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:px-3 sm:text-sm">Pesan</Link>
              <Link href="/student/assignments" className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:px-3 sm:text-sm">Tugas</Link>
              <Link href="/student/results" className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:px-3 sm:text-sm">Hasil</Link>
              <Link href="/student/subjects?activityType=latihan" className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:px-3 sm:text-sm">Belajar</Link>
              <span aria-label={`Profil ${profile?.full_name || "Siswa"}`} title={profile?.full_name || "Siswa"} className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 sm:h-10 sm:w-10">{initials}</span>
              <button type="button" aria-label="Keluar dari akun" onClick={handleSignOut} disabled={signingOut} className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 sm:px-3 sm:text-sm">{signingOut ? "Keluar…" : "Keluar"}</button>
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        {error && <div role="alert" aria-live="assertive" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>}
        <section className="mb-8 rounded-2xl border border-blue-100 bg-blue-50 p-6 sm:p-8">
          <p className="text-sm font-semibold text-blue-700">DASHBOARD PESERTA</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Halo, {profile?.full_name || "Siswa"} 👋</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">Lanjutkan latihan, kerjakan simulasi, dan pantau perkembangan belajar Anda.</p>
          {profile?.education_level && <p className="mt-4 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-blue-700">Jenjang: {profile.education_level}</p>}
        </section>

        {!error && (activeAttempts.length > 0 ? <section aria-labelledby="active-attempts-title" className="mb-10 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-amber-700">SESI TERSIMPAN</p><h3 id="active-attempts-title" className="mt-2 text-xl font-extrabold text-amber-950">Lanjutkan ujian Anda</h3><p className="mt-1 text-sm text-amber-800">Jawaban yang tersimpan di server dapat dilanjutkan tanpa mengulang dari awal.</p></div><span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold text-amber-900">{activeAttempts.length} aktif</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{activeAttempts.map((attempt) => <button key={attempt.attempt_id} type="button" aria-label={`Lanjutkan ujian ${attempt.subject}`} onClick={() => router.push(`/student/challenge?attemptId=${attempt.attempt_id}`)} className="min-h-11 rounded-xl border border-amber-200 bg-white p-4 text-left hover:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><p className="font-bold text-slate-900">{attempt.subject}</p><p className="mt-1 text-sm text-slate-600">{attempt.total_questions} soal · tersisa sekitar {Math.ceil(Number(attempt.remaining_seconds || 0) / 60)} menit</p><p className="mt-2 text-xs text-slate-500">Dimulai {formatAttemptDate(attempt.started_at)}</p><span className="mt-3 inline-block text-sm font-bold text-blue-700">Lanjutkan →</span></button>)}</div></section> : <section className="mb-10 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">BELUM ADA SESI TERSIMPAN</p><h3 className="mt-2 text-xl font-extrabold text-slate-900">Mulai dari aktivitas belajar</h3><p className="mt-1 text-sm text-slate-600">Pilih latihan atau simulasi untuk membuat sesi baru. Progres akan tersimpan otomatis.</p></section>)}

        <section id="layanan" className="mb-10 scroll-mt-28"><div className="mb-5"><p className="text-xs font-bold uppercase tracking-widest text-blue-700">AKTIVITAS BELAJAR</p><h3 className="mt-2 text-xl font-extrabold text-slate-950 sm:text-2xl">Pilih aktivitas Anda</h3><p className="mt-1 text-sm text-slate-500">Atur sesi sesuai tujuan belajar Anda.</p></div><div className="grid gap-5 md:grid-cols-2">{services.map((service) => <article key={service.number} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300"><span className="text-sm font-bold text-blue-700">LAYANAN {service.number}</span><h4 className="mt-6 text-lg font-extrabold text-slate-900">{service.title}</h4><p className="mt-3 flex-1 text-sm leading-6 text-slate-500">{service.description}</p><Link href={service.href} className="mt-6 flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800">{service.status} →</Link></article>)}</div></section>

        <section className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">HASIL DAN EVALUASI</p><h3 className="mt-2 text-xl font-extrabold text-slate-950">Lihat perkembangan Anda</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Hasil tersimpan secara permanen di akun Anda dan dapat dibuka kembali dari perangkat lain.</p></div><Link href="/student/results" className="rounded-lg border border-blue-200 px-5 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50">Buka histori hasil →</Link></div></section>

        <footer className="border-t border-slate-200 py-7 text-center"><p className="text-xs text-slate-500">© 2026 TKA TryOn</p><p className="mt-1 text-xs font-semibold tracking-wider text-blue-700">SKILL ON • CONFIDENCE ON</p></footer>
      </div>
    </main>
  );
}
