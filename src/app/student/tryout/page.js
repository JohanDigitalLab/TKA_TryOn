
"use client";

import BrandLogo from "@/components/brand-logo";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PortalHeader from "@/components/portal-header";
import DashboardBreadcrumb from "@/components/dashboard-breadcrumb";

const levelLabels = {
  sd: "SD / MI - Kelas 6",
  smp: "SMP / MTs - Kelas 9",
  sma: "SMA / MA / SMK - Kelas 12",
};

export default function MissionsPage() {
  return (
    <Suspense fallback={<p className="p-8">Memuat konfigurasi latihan...</p>}>
      <MissionsConfiguration />
    </Suspense>
  );
}

function MissionsConfiguration() {
  const params = useSearchParams();
  return <MissionsForm key={params.toString()} params={params} />;
}

function MissionsForm({ params }) {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const [level, setLevel] = useState("");
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);

  const [activityType, setActivityType] = useState(() =>
    params.get("activityType") === "simulasi" ? "simulasi" : "latihan"
  );
  const [message, setMessage] = useState("");
  const selectedSubject = subjects.find((subject) => subject.subject_code === selectedSubjects[0]);
  const selectedConfiguration = selectedSubject?.configuration;
  const questionCount = Number(selectedConfiguration?.total_questions || 0);
  const duration = Number(selectedConfiguration?.duration_minutes || 0);
  const durationLabel = selectedConfiguration
    ? `${Math.floor(duration / 60)} jam ${duration % 60} menit`
    : "—";
  const isReady = Boolean(level && selectedConfiguration && questionCount > 0 && duration > 0);

  async function handleSignOut() {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (!error) router.replace("/");
    setSigningOut(false);
  }

  useEffect(() => {
    let active = true;
    async function loadSubjects() {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!data.user) {
          router.replace("/");
          return;
        }
        const { data: profile, error: profileError } = await supabase
          .from("profiles").select("full_name, education_level, is_managed").eq("id", data.user.id).maybeSingle();
        if (profileError) throw profileError;
        const studentLevel = String(profile?.education_level || "").toLowerCase();
        if (!studentLevel) throw new Error("Jenjang pendidikan belum ditetapkan pada profilmu.");
        const { data: catalog, error: subjectError } = await supabase
          .rpc("get_student_subjects");
        if (subjectError) throw subjectError;
        if (!active) return;
        setProfile(profile);
        setLevel(studentLevel);
        setSubjects(catalog || []);
      } catch (error) {
        if (active) setMessage(error.message || "Gagal memuat mata pelajaran.");
      }
    }
    void loadSubjects();
    return () => { active = false; };
  }, [router]);

  function toggleSubject(subject) {
    setSelectedSubjects([subject]);

    setMessage("");
  }

  async function saveConfiguration() {
    if (startingRef.current) return;
    if (!isReady) {
      setMessage("Pilih satu mata pelajaran dengan konfigurasi TKA yang tersedia.");
      return;
    }
    startingRef.current = true;
    setStarting(true);
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("start_tka_tryout", {
        p_tka_code: selectedConfiguration.tka_code,
      });
      if (error) throw error;
      if (!data?.attempt_id) throw new Error("Server tidak mengembalikan sesi tryout.");
      router.push(`/student/challenge?attemptId=${encodeURIComponent(data.attempt_id)}`);
    } catch (error) {
      setMessage(error.message || "Gagal memulai tryout. Silakan coba kembali.");
      startingRef.current = false;
      setStarting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* HEADER */}
      <PortalHeader
        displayName={profile?.full_name || "Siswa"}
        isManaged={profile?.is_managed}
        signingOut={signingOut}
        onSignOut={handleSignOut}
      />
      <header className="hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-5 sm:py-4 lg:px-8">
          <Link href="/student" aria-label="Kembali ke dashboard TKA TryOut" className="flex items-center gap-3">
            <BrandLogo className="h-12 w-14" />

            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                TKA <span className="text-blue-700">TryOut</span>
              </h1>
              <p className="text-[10px] font-semibold tracking-widest text-slate-500">
                SKILL ON • CONFIDENCE ON
              </p>
            </div>
          </Link>

          <Link
            href="/student"
            className="min-h-11 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <DashboardBreadcrumb current="Simulasi TKA" />
        {/* PAGE TITLE */}
        <section className="mb-8">
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Simulasi TKA
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Pilih mata pelajaran dan atur sesi try-outmu.
          </p>
        </section>

        {/* INFORMASI UJIAN */}
        <section className="mb-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-slate-900">
                  Pilih Mata Pelajaran
                </h4>
                <p className="mt-1 text-sm text-slate-500">
                  Pilih satu mata pelajaran yang ingin kamu kerjakan.
                </p>
              </div>

            </div>

            {subjects.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {subjects.map((subject, index) => {
                  const checked = selectedSubjects.includes(subject.subject_code);

                  return (
                    <label
                      key={subject.subject_code}
                      className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 p-4 transition ${
                        checked
                          ? "border-blue-600 bg-blue-50"
                          : "border-slate-200 bg-white hover:border-blue-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="tryout-subject"
                        checked={checked}
                        onChange={() => toggleSubject(subject.subject_code)}
                        className="h-5 w-5 accent-blue-700"
                      />

                      <div className="flex-1">
                        <p className="font-bold text-slate-900">
                          {subject.name}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {checked ? "DIPILIH" : "BELUM DIPILIH"}
                        </p>
                      </div>

                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 font-bold text-blue-700">
                        {index + 1}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                Data mata pelajaran belum diterima.
              </div>
            )}

          </div>

        </section>

        {/* RINGKASAN */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-slate-900">
            Ringkasan Konfigurasi
          </h3>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Mata Pelajaran</p>
              <p className="mt-2 font-bold text-slate-900">
                {selectedSubject?.name || "Belum dipilih"}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Jumlah Soal</p>
              <p className="mt-2 font-bold text-slate-900">
                {selectedConfiguration ? `${questionCount} soal` : "—"}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Durasi</p>
              <p className="mt-2 font-bold text-slate-900">
                {durationLabel}
              </p>
            </div>

         </div>

            {selectedSubject && !selectedConfiguration && (
              <p role="status" className="mt-5 text-sm text-amber-700">Konfigurasi TKA belum tersedia untuk mata pelajaran ini.</p>
            )}
            {message && <p role="alert" className="mt-5 text-sm text-red-700">{message}</p>}
            <button
              type="button"
              disabled={!isReady || starting}
              onClick={saveConfiguration}
              className="mt-5 w-full rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {starting ? "Menyiapkan sesi..." : "Mulai Simulasi TKA"}
            </button>
          
        </section>

      </div>
    </main>
  );
}
