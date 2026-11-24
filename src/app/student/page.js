"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getTimeGreeting } from "@/lib/student/greeting.mjs";
import PortalHeader from "@/components/portal-header";
import StudentActionTables from "@/components/student/action-tables";

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
    code: "mapadventure",
    title: "Petualangan Peta Materi",
    description: "Jelajahi pulau materi, latihan, dan tantangan dengan peralatan belajar.",
    status: "MULAI PETUALANGAN",
    href: "/student/mapadventure",
    buttonClass: "bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-200",
  },
  {
    code: "virtualpet",
    title: "Sahabat Virtual",
    description: "Adopsi dan rawat sahabat belajarmu.",
    status: "KUNJUNGI PELIHARAAN",
    href: "/student/virtualpet",
    buttonClass: "bg-lime-700 text-white hover:bg-lime-800 focus-visible:ring-lime-200",
  },
  {
    code: "fightboss",
    title: "Boss Fight",
    description: "Belajar sambil bertarung melawan boss atau bermain bersama teman.",
    status: "MULAI BERTARUNG",
    href: "/student/fightboss",
    buttonClass: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-200",
  },
  {
    code: "tryout",
    title: "Simulasi TKA",
    description:
      "Kerjakan simulasi ujian dengan tampilan CBT, batas waktu, navigasi soal, dan mekanisme pengerjaan terstruktur.",
    status: "MULAI SIMULASI",
    href: "/student/tryout",
    buttonClass:
      "bg-sky-400 text-slate-950 hover:bg-sky-500 focus-visible:ring-sky-200",
  },
  {
    code: "exercise",
    title: "Latihan Soal",
    description:
      "Latihan berdasarkan jenjang pendidikan, mata pelajaran, dan kompetensi yang diujikan.",
    status: "MULAI LATIHAN",
    href: "/student/exercise",
    buttonClass:
      "bg-violet-600 text-white hover:bg-violet-700 focus-visible:ring-violet-200",
  },
  {
    code: "review",
    title: "Hasil dan Evaluasi",
    description:
      "Lihat hasil pengerjaan dan identifikasi kompetensi yang perlu ditingkatkan.",
    status: "LIHAT HASIL",
    href: "/student/results",
    buttonClass:
      "bg-cyan-600 text-white hover:bg-cyan-700 focus-visible:ring-cyan-200",
  },
];

function formatAttemptDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getActivityDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 10 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (9 - index));
    return date;
  });
}

function sameCalendarDay(value, date) {
  if (!value) return false;
  const attemptDate = new Date(value);
  return (
    attemptDate.getFullYear() === date.getFullYear() &&
    attemptDate.getMonth() === date.getMonth() &&
    attemptDate.getDate() === date.getDate()
  );
}

function ActivityBadge({ attempts }) {
  const days = useMemo(() => getActivityDays(), []);
  return (
    <section className="mb-10" aria-label="Badge aktivitas 10 hari terakhir">
      <div className="mx-auto grid w-full grid-cols-5 gap-x-2 gap-y-5 sm:flex sm:items-start sm:justify-between sm:gap-x-3">
        {days.map((date) => {
          const active = attempts.some((attempt) => sameCalendarDay(attempt.started_at || attempt.created_at || attempt.submitted_at, date));
          const dayLabel = date.toLocaleDateString("id-ID", { weekday: "long" });
          return (
            <div key={date.toISOString()} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
              <span className={`text-[10px] font-extrabold capitalize sm:text-xs ${active ? "text-black" : "text-slate-400"}`}>{dayLabel}</span>
              <span className={`grid size-12 place-items-center rounded-full border-2 bg-white text-2xl text-black transition duration-300 sm:size-14 sm:text-3xl ${active ? "border-orange-400 shadow-lg shadow-orange-100 ring-4 ring-orange-50" : "border-slate-300 bg-transparent text-slate-400"}`} aria-label={`${dayLabel}, ${active ? "ada aktivitas" : "tidak ada aktivitas"}`}>
                <span aria-hidden="true" className={active ? "drop-shadow-[0_2px_2px_rgba(127,29,29,0.35)]" : "grayscale opacity-70"}>🔥</span>
              </span>
              <span className={`text-[10px] font-bold sm:text-xs ${active ? "text-black" : "text-slate-400"}`}>{date.getDate()}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function StudentDashboard({
  actionContent,
  subscriptionMode = false,
  requireIndependentStudent = false,
} = {}) {
  const router = useRouter();
  const greeting = useSyncExternalStore(
    subscribeToClock,
    getGreetingSnapshot,
    getServerGreetingSnapshot,
  );
  const [profile, setProfile] = useState(null);
  const [activeAttempts, setActiveAttempts] = useState([]);
  const [history, setHistory] = useState([]);
  const [activityAttempts, setActivityAttempts] = useState([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [managedActionsVisible, setManagedActionsVisible] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      let denied = false;

      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) {
          denied = true;
          setRedirecting(true);
          router.replace("/");
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select(
            subscriptionMode
              ? "account_type, is_managed, is_subscribed, full_name, education_level, profile_completed, has_tried_tryout, has_tried_exercise"
              : "account_type, is_managed, is_subscribed, full_name, education_level, profile_completed",
          )
          .eq("id", userData.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!mounted) return;
        if (
          requireIndependentStudent &&
          (String(profileData?.account_type || "").toUpperCase() !== "STUDENT" ||
            profileData?.is_managed !== false)
        ) {
          denied = true;
          setRedirecting(true);
          router.replace("/home");
          return;
        }
        if (profileData?.is_subscribed !== true) {
          if (subscriptionMode) {
            // Halaman /subscription memang untuk user belum berlangganan.
            // Jangan redirect ke dirinya sendiri; cukup tampilkan plan.
            setProfile(
              profileData || {
                full_name: userData.user.email?.split("@")[0] || "Siswa",
              },
            );
            return;
          }
          denied = true;
          setRedirecting(true);
          router.replace("/subscription");
          return;
        }

        const [
          { data: attemptsData, error: attemptsError },
          { data: historyData, error: historyError },
          { data: activityData, error: activityError },
        ] = await Promise.all([
          supabase.rpc("get_student_active_attempts"),
          supabase.rpc("get_student_history", { p_limit: 5 }),
          supabase.rpc("get_student_history", { p_limit: 0 }),
        ]);
        if (attemptsError) throw attemptsError;
        if (historyError) throw historyError;
        if (activityError) throw activityError;
        if (!mounted) return;
        setProfile(
          profileData || {
            full_name: userData.user.email?.split("@")[0] || "Siswa",
          },
        );
        setActiveAttempts(Array.isArray(attemptsData) ? attemptsData : []);
        setHistory(Array.isArray(historyData) ? historyData : []);
        setActivityAttempts(Array.isArray(activityData) ? activityData : []);
      } catch (err) {
        if (mounted)
          setError(err.message || "Dashboard belum berhasil dimuat.");
      } finally {
        if (mounted && !denied) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      mounted = false;
    };
  }, [router, subscriptionMode, requireIndependentStudent]);

  const initials = useMemo(() => {
    const name = profile?.full_name || "Siswa";
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "S"
    );
  }, [profile]);

  async function toggleHistory() {
    if (historyLoading) return;
    const nextShowAll = !showAllHistory;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const { data, error: requestError } = await supabase.rpc(
        "get_student_history",
        {
          p_limit: nextShowAll ? 0 : 5,
        },
      );
      if (requestError) throw requestError;
      if (!Array.isArray(data))
        throw new Error("Respons riwayat server tidak valid.");
      setHistory(data);
      setShowAllHistory(nextShowAll);
    } catch (err) {
      setHistoryError(err.message || "Riwayat belum berhasil dimuat.");
    } finally {
      setHistoryLoading(false);
    }
  }

  const handleManagedActionsVisibility = useCallback((visible) => {
    setManagedActionsVisible(visible);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (redirecting) {
    // Jangan pernah merender isi dashboard saat akun tidak berhak mengaksesnya.
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p role="status" className="font-semibold text-slate-600">Mengalihkan…</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p className="font-semibold text-slate-600">Memuat ruang belajar…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <PortalHeader
        displayName={profile?.full_name || "Siswa"}
        isManaged={profile?.is_managed}
        signingOut={signingOut}
        onSignOut={handleSignOut}
      />

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          >
            {error}
          </div>
        )}

        <section id="greeting" className="mb-10 scroll-mt-28">
          <div className="mb-5">
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
              {greeting}, {profile?.full_name || "Siswa"} 👋
            </h2>
            <p
              id="quote"
              className="mt-2 text-sm leading-6 text-slate-600 sm:text-base"
            >
              {subscriptionMode
                ? "Ayo berlangganan untuk bisa menggunakan semua fitur. Daftar satu sekolah, lebih murah dan lebih banyak fitur."
                : "Lanjutkan latihan, kerjakan simulasi, dan pantau perkembangan belajarmu."}
            </p>
          </div>
        </section>

        <ActivityBadge attempts={activityAttempts} />

        {(actionContent ||
          (profile?.is_managed !== true &&
            profile?.profile_completed !== true) ||
          (profile?.is_managed === true && managedActionsVisible !== false)) && (
          <section id="action" className="mb-10 scroll-mt-28">
            {actionContent ?? (profile?.is_managed === true ? (
            <StudentActionTables onVisibilityChange={handleManagedActionsVisibility} />
          ) : (
            <div className="mt-4">
              <Link
                id="profile-link"
                href="/student/profile"
                className="group relative inline-flex min-h-14 items-center gap-3 overflow-hidden rounded-full bg-gradient-to-r from-red-500 via-rose-500 to-orange-400 px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-red-200/70 ring-2 ring-white/70 transition duration-300 hover:-translate-y-0.5 hover:from-red-600 hover:via-rose-600 hover:to-orange-500 hover:shadow-xl hover:shadow-red-300/70 focus:outline-none focus:ring-4 focus:ring-red-200"
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" aria-hidden="true" />
                <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-white/20 ring-1 ring-white/40 transition-transform duration-300 group-hover:scale-110" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
                    <path d="M12 2l1.9 5.7 5.6 1.9-5.6 1.9L12 17.2l-1.9-5.7-5.6-1.9 5.6-1.9L12 2z" />
                    <path d="M19 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" opacity=".7" />
                  </svg>
                </span>
                <span className="relative">Lengkapi Profil</span>
                <span className="relative text-lg transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">
                  →
                </span>
              </Link>
            </div>
            ))}
          </section>
        )}

        <section id="layanan" className="mb-10 scroll-mt-28">
          <div className="mb-5">
            <h2
              id="label-layanan"
              className="text-2xl font-extrabold tracking-tight text-slate-950"
            >
              {subscriptionMode
                ? "Coba dulu sebelum memutuskan"
                : "Pilih aktifitas kamu"}
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {services.map((service) => {
              const disabled =
                subscriptionMode &&
                ((service.code === "tryout" &&
                  profile?.has_tried_tryout === true) ||
                  (service.code === "exercise" &&
                    profile?.has_tried_exercise === true));
              return (
                <article
                  key={service.code}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:-translate-y-2 hover:rotate-1"
                >
                  <h4 className="text-lg font-extrabold text-slate-900">
                    {service.title}
                  </h4>
                  <p className="mt-3 flex-1 text-sm leading-6 text-slate-500">
                    {service.description}
                  </p>
                  {disabled ? (
                    <button
                      type="button"
                      disabled
                      title="Kesempatan mencoba sudah digunakan. Silakan berlangganan."
                      className="mt-6 flex min-h-11 cursor-not-allowed items-center justify-center rounded-lg bg-slate-200 px-4 py-3 text-sm font-bold text-slate-500"
                    >
                      {service.status} →
                    </button>
                  ) : (
                    <Link
                      href={service.href}
                      className={`mt-6 flex min-h-11 items-center justify-center rounded-lg px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 ${service.buttonClass}`}
                    >
                      {service.status} →
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section id="riwayat" className="mb-10 scroll-mt-28">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h2
              id="label-riwayat"
              className="text-2xl font-extrabold tracking-tight text-slate-950"
            >
              {showAllHistory ? "Riwayat" : "Riwayat (5 Terakhir)"}
            </h2>
            <button
              type="button"
              onClick={toggleHistory}
              disabled={historyLoading}
              aria-controls="history-table"
              aria-pressed={showAllHistory}
              className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              {historyLoading
                ? "Memuat riwayat…"
                : showAllHistory
                  ? "Tampilkan 5 Terakhir"
                  : "Tampilkan Semua"}
            </button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            {historyError && (
              <p role="alert" className="p-4 text-sm text-amber-800">
                {historyError}
              </p>
            )}
            <table
              id="history-table"
              aria-busy={historyLoading}
              className="min-w-full text-left text-sm"
            >
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-4 font-bold">
                    #
                  </th>
                  <th className="px-5 py-4 font-bold">Tanggal</th>
                  <th className="px-5 py-4 font-bold">Tipe</th>
                  <th className="px-5 py-4 font-bold">Mata Pelajaran</th>
                  <th className="px-5 py-4 font-bold">Nilai</th>
                  <th className="px-5 py-4 text-right font-bold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.length ? (
                  history.map((attempt, index) => (
                    <tr key={attempt.attempt_id} className="text-slate-700">
                      <td className="px-5 py-4">{index + 1}</td>
                      <td className="whitespace-nowrap px-5 py-4">
                        {formatAttemptDate(attempt.started_at)}
                      </td>
                      <td className="px-5 py-4">
                        {attempt.attempt_type === "TRYOUT"
                          ? "Simulasi TKA"
                          : attempt.attempt_type === "ASSIGNMENT"
                            ? "Tugas Sekolah"
                            : "Latihan Soal"}
                      </td>
                      <td className="px-5 py-4">
                        {attempt.subject_name || "-"}
                      </td>
                      <td className="px-5 py-4 font-bold">
                        {attempt.score ?? "-"}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/student/review/${encodeURIComponent(attempt.attempt_id)}`}
                          aria-label={`Review ${attempt.subject_name || "simulasi"}`}
                          className="inline-flex rounded-lg bg-blue-700 px-4 py-2 font-bold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-5 py-8 text-center text-slate-500"
                    >
                      Belum ada riwayat simulasi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function StudentRoutePage() {
  return <StudentDashboard />;
}
