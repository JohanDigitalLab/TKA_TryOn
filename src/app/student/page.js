"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getTimeGreeting } from "@/lib/student/greeting.mjs";
import { studentHistoryRequest, normalizeStudentHistory } from "@/lib/student/rpc-contract.mjs";
import PortalHeader from "@/components/portal-header";

function subscribeToClock(onChange) {
  const timer = window.setInterval(onChange, 30_000);
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

const getGreetingSnapshot = () => getTimeGreeting();
const getServerGreetingSnapshot = () => "Selamat Datang";

const services = [
  {
    code: "tryout",
    title: "Simulasi TKA",
    description: "Kerjakan simulasi ujian dengan tampilan CBT, batas waktu, navigasi soal, dan mekanisme pengerjaan terstruktur.",
    status: "MULAI SIMULASI",
    href: "/student/tryout",
  },
  {
    code: "exercise",
    title: "Latihan Soal",
    description: "Latihan berdasarkan jenjang pendidikan, mata pelajaran, dan kompetensi yang diujikan.",
    status: "MULAI LATIHAN",
    href: "/student/exercise",
  },
  {
    code: "review",
    title: "Hasil dan Evaluasi",
    description: "Lihat hasil pengerjaan dan identifikasi kompetensi yang perlu ditingkatkan.",
    status: "LIHAT HASIL",
    href: "/student/results",
  },
];

function formatAttemptDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default function StudentPage({ actionContent, subscriptionMode = false } = {}) {
  const router = useRouter();
  const greeting = useSyncExternalStore(subscribeToClock, getGreetingSnapshot, getServerGreetingSnapshot);
  const [profile, setProfile] = useState(null);
  const [activeAttempts, setActiveAttempts] = useState([]);
  const [history, setHistory] = useState([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
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
          router.replace("/");
          return;
        }

        const historyRequest = studentHistoryRequest({ dashboard: true });
        const [{ data: profileData, error: profileError }, { data: attemptsData, error: attemptsError }, { data: historyData, error: historyError }] = await Promise.all([
          supabase.from("profiles").select(subscriptionMode ? "full_name, education_level, profile_completed, has_tried_tryout, has_tried_exercise" : "full_name, education_level, profile_completed").eq("id", userData.user.id).maybeSingle(),
          supabase.rpc("get_student_active_attempts"),
          supabase.rpc(historyRequest.name, historyRequest.args),
        ]);
        if (profileError) throw profileError;
        if (attemptsError) throw attemptsError;
        if (historyError) throw historyError;
        if (!mounted) return;
        setProfile(profileData || { full_name: userData.user.email?.split("@")[0] || "Siswa" });
        setActiveAttempts(Array.isArray(attemptsData) ? attemptsData : []);
        setHistory(normalizeStudentHistory(historyData));
      } catch (err) {
        if (mounted) setError(err.message || "Dashboard belum berhasil dimuat.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadDashboard();
    return () => { mounted = false; };
  }, [router, subscriptionMode]);

  const initials = useMemo(() => {
    const name = profile?.full_name || "Siswa";
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "S";
  }, [profile]);

  async function toggleHistory() {
    if (historyLoading) return;
    const nextShowAll = !showAllHistory;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const request = studentHistoryRequest({ dashboard: true, limit: nextShowAll ? 0 : 5 });
      const { data, error: requestError } = await supabase.rpc(request.name, request.args);
      if (requestError) throw requestError;
      setHistory(normalizeStudentHistory(data));
      setShowAllHistory(nextShowAll);
    } catch (err) {
      setHistoryError(err.message || "Riwayat belum berhasil dimuat.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-surface-muted"><p className="font-semibold text-ink-secondary">Memuat ruang belajar…</p></main>;
  }

  return (
    <main className="min-h-screen bg-surface-muted text-ink-body">
      <PortalHeader displayName={profile?.full_name || "Siswa"} signingOut={signingOut} onSignOut={handleSignOut} />

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        {error && <div role="alert" aria-live="assertive" className="mb-6 rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning-ink">{error}</div>}

        <section id="greeting" className="mb-10 scroll-mt-28">
          <div className="mb-5">
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{greeting}, {profile?.full_name || "Siswa"} 👋</h2>
            <p id="quote" className="mt-2 text-sm leading-6 text-ink-secondary sm:text-base">{subscriptionMode ? "Ayo berlangganan untuk bisa menggunakan semua fitur. Daftar satu sekolah, lebih murah dan lebih banyak fitur." : "Lanjutkan latihan, kerjakan simulasi, dan pantau perkembangan belajarmu."}</p>
          </div>

        </section>

        <section id="action" className="mb-10 scroll-mt-28">
           {actionContent ?? <div className="mt-4">
              <Link id="profile-link" href="/student/profile" className="group inline-flex min-h-14 items-center gap-3 rounded-2xl bg-gradient-to-r from-primary to-secondary px-7 py-4 text-base font-extrabold text-on-primary shadow-lg shadow-accent-line transition hover:-translate-y-0.5 hover:from-primary-hover hover:to-secondary hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-accent-line">
                {profile?.profile_completed === true ? "Perbaharui Profil" : "Lengkapi Profil"}
              </Link>
            </div>}
         </section>

        <nav aria-label="Aktivitas sekolah" className="mb-6 flex flex-wrap gap-4 font-bold text-accent-strong"><Link href="/student/assignments">Tugas sekolah</Link><Link href="/student/agenda">Agenda sekolah SET</Link></nav>
        <section id="layanan" className="mb-10 scroll-mt-28">
          <div className="mb-5">
            <h2 id="label-layanan" className="text-2xl font-extrabold tracking-tight text-ink">{subscriptionMode ? "Coba dulu sebelum memutuskan" : "Pilih aktifitas kamu"}</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {services.map((service) => {
              const disabled = subscriptionMode && (
                (service.code === "tryout" && profile?.has_tried_tryout === true) ||
                (service.code === "exercise" && profile?.has_tried_exercise === true)
              );
              return (
                <article key={service.code} className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-sm transition hover:border-accent">
                  <h4 className="text-lg font-extrabold text-ink">{service.title}</h4>
                  <p className="mt-3 flex-1 text-sm leading-6 text-ink-muted">{service.description}</p>
                  {disabled ? (
                    <button type="button" disabled title="Kesempatan mencoba sudah digunakan. Silakan berlangganan." className="mt-6 flex min-h-11 cursor-not-allowed items-center justify-center rounded-lg bg-surface-strong px-4 py-3 text-sm font-bold text-ink-muted">{service.status} →</button>
                  ) : (
                    <Link href={service.href} className="mt-6 flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-bold text-on-primary hover:bg-primary-hover">{service.status} →</Link>
                  )}
                </article>
              );
            })}
          </div>

        </section>
        
        <section id="riwayat" className="mb-10 scroll-mt-28">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h2 id="label-riwayat" className="text-2xl font-extrabold tracking-tight text-ink">{showAllHistory ? "Riwayat" : "Riwayat (5 Terakhir)"}</h2>
            <button type="button" onClick={toggleHistory} disabled={historyLoading} aria-controls="history-table" aria-pressed={showAllHistory} className="rounded-lg border border-accent-line bg-surface px-4 py-2 text-sm font-bold text-accent-ink hover:bg-accent-soft disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {historyLoading ? "Memuat riwayat…" : showAllHistory ? "Tampilkan 5 Terakhir" : "Tampilkan Semua"}
            </button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
            {historyError && <p role="alert" className="p-4 text-sm text-warning-ink">{historyError}</p>}
            <table id="history-table" aria-busy={historyLoading} className="min-w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
                <tr><th scope="col" className="px-5 py-4 font-bold">#</th><th className="px-5 py-4 font-bold">Tanggal</th><th className="px-5 py-4 font-bold">Tipe</th><th className="px-5 py-4 font-bold">Mata Pelajaran</th><th className="px-5 py-4 font-bold">Nilai</th><th className="px-5 py-4 text-right font-bold">Aksi</th></tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {history.length ? history.map((attempt, index) => (
                  <tr key={attempt.attempt_id} className="text-ink-body">
                    <td className="px-5 py-4">{index + 1}</td>
                    <td className="whitespace-nowrap px-5 py-4">{formatAttemptDate(attempt.started_at)}</td>
                    <td className="px-5 py-4">{attempt.attempt_type === "TRYOUT" ? "Simulasi TKA" : attempt.attempt_type === "EXERCISE" ? "Latihan Soal" : attempt.attempt_type === "ASSIGNMENT" ? "Tugas Sekolah" : "Sesi Belajar"}</td>
                    <td className="px-5 py-4">{attempt.subject_name || "-"}</td>
                    <td className="px-5 py-4 font-bold">{attempt.score ?? "-"}</td>
                    <td className="px-5 py-4 text-right"><Link href={`/student/review/${encodeURIComponent(attempt.attempt_id)}`} aria-label={`Review ${attempt.subject_name || "simulasi"}`} className="inline-flex rounded-lg bg-primary px-4 py-2 font-bold text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Review</Link></td>
                  </tr>
                )) : <tr><td colSpan="6" className="px-5 py-8 text-center text-ink-muted">Belum ada riwayat simulasi.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
