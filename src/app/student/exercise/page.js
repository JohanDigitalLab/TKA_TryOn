
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
  const schoolType = params.get("schoolType") || "";
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);

  const [activityType, setActivityType] = useState(() =>
    params.get("activityType") === "simulasi" ? "simulasi" : "latihan"
  );
  const [message, setMessage] = useState("");
  const selectedSubjectDetails = subjects.filter((subject) => selectedSubjects.includes(subject.subject_code));
  const [questionCountInput, setQuestionCountInput] = useState("20");
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const questionCount = Number(questionCountInput);
  const isReady = Boolean(level && selectedSubjectDetails.length > 0 && Number.isInteger(questionCount) && questionCount > 0);

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
    setSelectedSubjects((previous) => previous.includes(subject)
      ? previous.filter((item) => item !== subject)
      : [...previous, subject]);

    setMessage("");
  }

  async function saveConfiguration() {
    if (startingRef.current) return;
    if (!isReady) {
      setMessage(
        "Pilih minimal satu mata pelajaran dan isi jumlah soal dengan bilangan bulat positif."
      );
      return;
    }

    startingRef.current = true;
    setStarting(true);
    setMessage("");
    try {
    const { data, error } = await supabase.rpc("start_student_exercise", {
      p_subject_code: selectedSubjectDetails[0].subject_code,
      p_question_count: questionCount,
    });
    if (error) throw error;
    if (!data?.attempt_id) throw new Error("Sesi latihan tidak tersedia.");
    const grade =
      level === "smp" ? 9 : level === "sma" ? 12 : 6;

    const configuration = {
      simulationId: crypto.randomUUID(),

      level,
      grade,
      schoolType,

      // Hanya mata pelajaran yang dipilih peserta.
      subjects: selectedSubjectDetails.map((subject) => subject.name),
      subject_codes: selectedSubjectDetails.map((subject) => subject.subject_code),
      tka_codes: selectedSubjectDetails.map((subject) => subject.configuration?.tka_code).filter(Boolean),
      type: "RANDOM",

      activityType: "latihan",

      adaptiveExercise: true,
      exerciseAttemptId: data.attempt_id,

      questionCount: Number(questionCount),
      duration: null,

      currentSubjectIndex: 0,
      sessionResults: [],

      status: "in_progress",
      savedAt: new Date().toISOString(),
    };

    sessionStorage.setItem(
      "tryout-exam-config",
      JSON.stringify(configuration)
    );

    sessionStorage.setItem(
      "tryout-simulation-results",
      JSON.stringify([])
    );

    sessionStorage.removeItem("tryout-exam-result");

    router.push("/student/challenge");
    } catch (error) {
      setMessage(error.message || "Latihan gagal dimulai.");
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
        <DashboardBreadcrumb current="Latihan Soal" />
        {/* PAGE TITLE */}
        <section className="mb-8">
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Latihan Soal
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Pilih mata pelajaran dan atur sesi latihan soalmu.
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
                  Pilih satu atau lebih mata pelajaran yang ingin kamu kerjakan.
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
                        type="checkbox"
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

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
              Jumlah Soal Per Mata Pelajaran
              <input
                type="number"
                min="1"
                step="1"
                required
                value={questionCountInput}
                onChange={(event) => setQuestionCountInput(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 focus:border-blue-600 focus:outline-none"
              />
            </label>
            <p className="text-sm text-slate-600">Soal dipilih adaptif berdasarkan kompetensi. Latihan tanpa batas waktu.</p>
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
                {selectedSubjectDetails.length > 0
                  ? selectedSubjectDetails.map((subject) => subject.name).join(", ")
                  : "Belum dipilih"}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Jumlah Soal Per Mata Pelajaran</p>
              <p className="mt-2 font-bold text-slate-900">
                {Number.isInteger(questionCount) && questionCount > 0 ? `${questionCount} soal` : "Jumlah soal tidak valid"}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Pemilihan Soal</p>
              <p className="mt-2 font-bold text-slate-900">Adaptif · Tanpa timer</p>
            </div>

         </div>

            {message && <p role="alert" className="mt-5 text-sm text-red-700">{message}</p>}
            <button
              type="button"
              disabled={!isReady || starting}
              onClick={saveConfiguration}
              className="mt-5 w-full rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Mulai Latihan Soal
            </button>
          
        </section>

      </div>
    </main>
  );
}
