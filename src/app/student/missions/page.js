
"use client";

import BrandLogo from "@/components/brand-logo";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import LearningAccess from "@/components/learning-access";
import { studentAttemptRequest } from "@/lib/student/rpc-contract.mjs";

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
  const level = params.get("level") || "";
  const schoolType = params.get("schoolType") || "";
  const subjects = (params.get("subjects") || "")
    .split(",")
    .map((subject) => subject.trim())
    .filter(Boolean);
  const [selectedSubjects, setSelectedSubjects] = useState([]);

  const [activityType, setActivityType] = useState(() =>
    params.get("activityType") === "simulasi" ? "simulasi" : "latihan"
  );
  const [difficulty, setDifficulty] = useState("sedang");
  const [questionCount, setQuestionCount] = useState("20");
  const [duration, setDuration] = useState("30");
  const [message, setMessage] = useState("");

  const isReady = Boolean(level && selectedSubjects.length > 0);

  function toggleSubject(subject) {
    setSelectedSubjects((previous) => {
      if (previous.includes(subject)) {
        return previous.filter((item) => item !== subject);
      }

      return [...previous, subject];
    });

    setMessage("");
  }

  function saveConfiguration() {
    if (!level || selectedSubjects.length === 0) {
      setMessage(
        "Pilih minimal satu mata pelajaran sebelum memulai kegiatan."
      );
      return;
    }

    const grade =
      level === "smp" ? 9 : level === "sma" ? 12 : 6;

    const configuration = {
      simulationId: crypto.randomUUID(),

      level,
      grade,
      schoolType,

      // Hanya mata pelajaran yang dipilih peserta.
      subjects: selectedSubjects,

      activityType,

      difficulty:
        activityType === "latihan" ? difficulty : null,

      questionCount: Number(questionCount),
      duration: Number(duration),

      currentSubjectIndex: 0,
      sessionResults: [],

      status: "in_progress",
      savedAt: new Date().toISOString(),
    };

    // Validate before overwriting existing config/results. The legacy form does
    // not yet carry the server-owned subject/configuration identifiers.
    try {
      studentAttemptRequest({ config: configuration });
    } catch (error) {
      setMessage(error.message);
      return;
    }

    sessionStorage.setItem(
      "tryon-exam-config",
      JSON.stringify(configuration)
    );

    sessionStorage.setItem(
      "tryon-simulation-results",
      JSON.stringify([])
    );

    sessionStorage.removeItem("tryon-exam-result");

    router.push("/student/challenge");
  }

  return (
    <main className="min-h-screen bg-surface-muted text-ink-body">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-5 sm:py-4 lg:px-8">
          <Link href="/student" aria-label="Kembali ke dashboard TKA TryOn" className="flex items-center gap-3">
            <BrandLogo className="h-12 w-14" />

            <div>
              <h1 className="text-xl font-extrabold text-ink">
                TKA <span className="text-accent-ink">TryOn</span>
              </h1>
              <p className="text-[10px] font-semibold tracking-widest text-ink-muted">
                SKILL ON • CONFIDENCE ON
              </p>
            </div>
          </Link>

          <Link
            href="/student"
            className="min-h-11 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink-secondary hover:bg-surface-muted"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        {/* PAGE TITLE */}
        <section className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-ink">
            PERSIAPAN UJIAN
          </p>

          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Persiapan {activityType === "simulasi" ? "Simulasi TKA" : "Latihan Akademik"}
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-secondary sm:text-base">
            Pilih mata pelajaran dan atur sesi {activityType === "simulasi" ? "simulasi" : "latihan"}mu.
          </p>
        </section>

        <div className="mb-7"><LearningAccess mode={activityType === "latihan" ? "mission" : "simulation"} /></div>

        {/* INFORMASI UJIAN */}
        <section className="mb-7 rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-ink">
            Informasi Ujian
          </h3>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-surface-muted p-4">
              <p className="text-xs font-semibold text-ink-muted">
                JENJANG PENDIDIKAN
              </p>
              <p className="mt-2 font-bold text-ink">
                {levelLabels[level] || "Belum dipilih"}
              </p>
            </div>

            <div className="rounded-lg bg-surface-muted p-4">
              <p className="text-xs font-semibold text-ink-muted">
                SATUAN PENDIDIKAN
              </p>
              <p className="mt-2 font-bold text-ink">
                {schoolType
                  ? schoolType.toUpperCase()
                  : level === "sd" || level === "smp"
                    ? "Sesuai jenjang"
                    : "Belum dipilih"}
              </p>
            </div>
          </div>

          <div className="mt-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-ink">
                  Pilih Mata Pelajaran
                </h4>
                <p className="mt-1 text-sm text-ink-muted">
                  Centang mata pelajaran yang ingin kamu kerjakan.
                </p>
              </div>

              <span className="rounded-md bg-accent-soft px-3 py-2 text-xs font-bold text-accent-ink">
                {selectedSubjects.length} DIPILIH
              </span>
            </div>

            {subjects.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {subjects.map((subject, index) => {
                  const checked = selectedSubjects.includes(subject);

                  return (
                    <label
                      key={subject}
                      className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 p-4 transition ${
                        checked
                          ? "border-accent bg-accent-soft"
                          : "border-line bg-surface hover:border-accent"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSubject(subject)}
                        className="h-5 w-5 accent-accent"
                      />

                      <div className="flex-1">
                        <p className="font-bold text-ink">
                          {subject}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-ink-muted">
                          {checked ? "DIPILIH" : "BELUM DIPILIH"}
                        </p>
                      </div>

                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-tint font-bold text-accent-ink">
                        {index + 1}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-lg bg-warning-soft p-4 text-sm text-warning-ink">
                Data mata pelajaran belum diterima.{" "}
                <a
                  href={`/student/subjects?activityType=${activityType}`}
                  className="font-bold underline"
                >
                  Kembali memilih mata pelajaran
                </a>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setSelectedSubjects([...subjects])}
                disabled={subjects.length === 0}
                className="min-h-11 rounded-lg px-2 text-sm font-semibold text-accent-ink hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:text-ink-muted"
              >
                Pilih Semua
              </button>

              <button
                type="button"
                onClick={() => setSelectedSubjects([])}
                disabled={selectedSubjects.length === 0}
                className="min-h-11 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:text-ink-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:text-inverse-muted"
              >
                Hapus Semua Pilihan
              </button>
            </div>
          </div>

          <Link
            href={`/student/subjects?activityType=${activityType}`}
            className="mt-6 inline-flex min-h-11 items-center text-sm font-bold text-accent-ink hover:text-accent-strong"
          >
            ← Ubah pilihan mata pelajaran awal
          </Link>
        </section>

        {/* PENGATURAN */}
        <section className="mb-7 rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-ink">
            Pengaturan Kegiatan
          </h3>

          <p className="mt-1 text-sm text-ink-muted">
            Pengaturan berlaku untuk setiap mata pelajaran yang dikerjakan dalam {activityType === "simulasi" ? "simulasi" : "latihan"} ini.
          </p>

          {activityType === "latihan" && (
            <div className="mt-6">
              <label className="mb-3 block text-sm font-bold text-ink-body">
                Tingkat Kesulitan
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["mudah", "Mudah"],
                  ["sedang", "Sedang"],
                  ["sulit", "Sulit"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={difficulty === value}
                    onClick={() => setDifficulty(value)}
                    className={`min-h-11 rounded-lg border-2 px-4 py-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                      difficulty === value
                        ? "border-accent bg-accent-soft text-accent-strong"
                        : "border-line text-ink-secondary hover:border-accent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="questionCount"
                className="mb-2 block text-sm font-bold text-ink-body"
              >
                Jumlah Soal per Mata Pelajaran
              </label>

              <select
                id="questionCount"
                value={questionCount}
                onChange={(event) => setQuestionCount(event.target.value)}
                className="w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
              >
                <option value="10">10 Soal</option>
                <option value="20">20 Soal</option>
                <option value="30">30 Soal</option>
                <option value="40">40 Soal</option>
                <option value="50">50 Soal</option>
              </select>
            </div>

            {/* DURASI: TERSEDIA UNTUK KEDUA JENIS KEGIATAN */}
            <div>
              <label
                htmlFor="duration"
                className="mb-2 block text-sm font-bold text-ink-body"
              >
                Durasi per Mata Pelajaran
              </label>

              <select
                id="duration"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className="w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
              >
                <option value="20">20 Menit</option>
                <option value="30">30 Menit</option>
                <option value="45">45 Menit</option>
                <option value="60">60 Menit</option>
                <option value="90">90 Menit</option>
              </select>
            </div>
          </div>
        </section>

        {/* RINGKASAN */}
        <section className="rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-ink">
            Ringkasan Konfigurasi
          </h3>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-surface-muted p-4">
              <p className="text-xs text-ink-muted">Jenis Kegiatan</p>
              <p className="mt-2 font-bold text-ink">
                {activityType === "latihan"
                  ? "Latihan Terarah"
                  : "Simulasi TKA"}
              </p>
            </div>

            <div className="rounded-lg bg-surface-muted p-4">
              <p className="text-xs text-ink-muted">Mata Pelajaran</p>
              <p className="mt-2 font-bold text-ink">
                {selectedSubjects.length} mata pelajaran
              </p>
            </div>

            <div className="rounded-lg bg-surface-muted p-4">
              <p className="text-xs text-ink-muted">Jumlah Soal per Sesi</p>
              <p className="mt-2 font-bold text-ink">
                {questionCount} soal
              </p>
            </div>

            <div className="rounded-lg bg-surface-muted p-4">
              <p className="text-xs text-ink-muted">
                {activityType === "latihan" ? "Kesulitan" : "Durasi per Sesi"}
              </p>
              <p className="mt-2 font-bold text-ink">
                {activityType === "latihan"
                  ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
                  : `${duration} menit`}
              </p>
            </div>
          </div>

          {/* RINGKASAN DURASI */}
          {activityType === "latihan" && (
            <div className="mt-3 rounded-lg bg-surface-muted p-4">
              <p className="text-xs text-ink-muted">Durasi per Sesi</p>
              <p className="mt-2 font-bold text-ink">
                {duration} menit
              </p>
            </div>
          )}

          {selectedSubjects.length > 0 && (
            <div className="mt-5 rounded-lg bg-accent-soft p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-accent-ink">
                Mata Pelajaran yang Akan Dikerjakan
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {selectedSubjects.map((subject, index) => (
                  <span
                    key={subject}
                    className="rounded-md bg-surface px-3 py-2 text-sm font-semibold text-accent-strong"
                  >
                    Sesi {index + 1}: {subject}
                  </span>
                ))}
              </div>

              <p className="mt-3 text-xs leading-5 text-accent-strong">
                Setiap mata pelajaran akan dikerjakan dalam sesi terpisah
                dengan hasil masing-masing.
              </p>
            </div>
          )}

          <p role="status" className="mt-5 text-sm text-ink-secondary">
            Estimasi total: {selectedSubjects.length * Number(duration)} menit untuk {selectedSubjects.length} mata pelajaran, tidak termasuk jeda.
          </p>
          <button
            type="button"
            disabled={!isReady}
            onClick={saveConfiguration}
            className="mt-6 min-h-12 w-full rounded-lg bg-primary px-6 py-3 text-sm font-bold text-on-primary transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-surface-strong sm:w-auto"
          >
            Mulai {activityType === "simulasi" ? "Simulasi" : "Latihan"} →
          </button>

          {!isReady && (
            <p className="mt-3 text-sm text-warning-ink">
              Pilih minimal satu mata pelajaran untuk melanjutkan.
            </p>
          )}

          {message && (
            <div
              role="status"
              className="mt-5 rounded-lg border border-accent-line bg-accent-soft p-4 text-sm leading-6 text-accent-strong"
            >
              {message}
            </div>
          )}
        </section>

        <footer className="mt-10 border-t border-line py-6 text-center text-xs text-ink-muted">
          © 2026 TKA TryOn · SKILL ON • CONFIDENCE ON
        </footer>
      </div>
    </main>
  );
}
