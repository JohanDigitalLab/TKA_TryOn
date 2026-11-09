
"use client";

import { useEffect, useState } from "react";

const levelLabels = {
  sd: "SD / MI - Kelas 6",
  smp: "SMP / MTs - Kelas 9",
  sma: "SMA / MA / SMK - Kelas 12",
};

export default function MissionsPage() {
  const [level, setLevel] = useState("");
  const [schoolType, setSchoolType] = useState("");
  const [subjects, setSubjects] = useState([]);

  const [activityType, setActivityType] = useState("latihan");
  const [difficulty, setDifficulty] = useState("sedang");
  const [questionCount, setQuestionCount] = useState("20");
  const [duration, setDuration] = useState("60");

  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    setLevel(params.get("level") || "");
    setSchoolType(params.get("schoolType") || "");

    const selectedSubjects = params.get("subjects");

    if (selectedSubjects) {
      setSubjects(
        selectedSubjects
          .split(",")
          .map((subject) => subject.trim())
          .filter(Boolean)
      );
    }
  }, []);

  const isReady = level && subjects.length > 0;

  function saveConfiguration() {
    if (!isReady) {
      setMessage(
        "Data mata pelajaran belum tersedia. Silakan kembali ke halaman pemilihan mata pelajaran."
      );
      return;
    }

    const configuration = {
      level,
      schoolType,
      subjects,
      activityType,
      difficulty: activityType === "latihan" ? difficulty : null,
      questionCount: Number(questionCount),
      duration:
        activityType === "simulasi" ? Number(duration) : null,
      savedAt: new Date().toISOString(),
      status: "draft",
    };

    sessionStorage.setItem(
      "tryon-exam-config",
      JSON.stringify(configuration)
    );

    setMessage(
      "Konfigurasi berhasil disimpan di sesi browser. Bank soal dan ruang ujian CBT akan dihubungkan pada tahap berikutnya."
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">

      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <a href="/student" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-700 text-lg font-black text-white">
              T
            </div>

            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                TKA <span className="text-blue-700">TryOn</span>
              </h1>
              <p className="text-[10px] font-semibold tracking-widest text-slate-500">
                SKILL ON • CONFIDENCE ON
              </p>
            </div>
          </a>

          <a
            href="/student"
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Dashboard
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">

        {/* PAGE TITLE */}
        <section className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
            PERSIAPAN UJIAN
          </p>

          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Konfigurasi Latihan dan Simulasi
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Periksa mata pelajaran dan tentukan jenis kegiatan yang ingin
            dilakukan sebelum masuk ke ruang latihan TKA.
          </p>
        </section>

        {/* DATA PESERTA */}
        <section className="mb-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-slate-900">
            Informasi Ujian
          </h3>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">
                JENJANG PENDIDIKAN
              </p>
              <p className="mt-2 font-bold text-slate-900">
                {levelLabels[level] || "Belum dipilih"}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">
                SATUAN PENDIDIKAN
              </p>
              <p className="mt-2 font-bold text-slate-900">
                {schoolType
                  ? schoolType.toUpperCase()
                  : level === "sd" || level === "smp"
                    ? "Sesuai jenjang"
                    : "Belum dipilih"}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
              Mata Pelajaran Terpilih
            </p>

            {subjects.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {subjects.map((subject) => (
                  <span
                    key={subject}
                    className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800"
                  >
                    {subject}
                  </span>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                Data mata pelajaran belum diterima.{" "}
                <a
                  href="/student/subjects"
                  className="font-bold underline"
                >
                  Kembali memilih mata pelajaran
                </a>
              </div>
            )}
          </div>

          <a
            href="/student/subjects"
            className="mt-5 inline-block text-sm font-bold text-blue-700 hover:text-blue-900"
          >
            ← Ubah pilihan mata pelajaran
          </a>
        </section>

        {/* JENIS KEGIATAN */}
        <section className="mb-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-slate-900">
            Jenis Kegiatan
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Pilih bentuk kegiatan akademik yang ingin dilakukan.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">

            <button
              type="button"
              aria-pressed={activityType === "latihan"}
              onClick={() => {
                setActivityType("latihan");
                setMessage("");
              }}
              className={`rounded-xl border-2 p-5 text-left transition ${
                activityType === "latihan"
                  ? "border-blue-600 bg-blue-50"
                  : "border-slate-200 hover:border-blue-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-slate-900">
                  Latihan Terarah
                </span>
                <span className="text-xl text-blue-700">01</span>
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                Latihan berdasarkan mata pelajaran dan tingkat kesulitan.
                Cocok untuk memperkuat pemahaman materi.
              </p>

              <p className="mt-4 text-sm font-bold text-blue-700">
                {activityType === "latihan" ? "✓ Dipilih" : "Pilih latihan"}
              </p>
            </button>

            <button
              type="button"
              aria-pressed={activityType === "simulasi"}
              onClick={() => {
                setActivityType("simulasi");
                setMessage("");
              }}
              className={`rounded-xl border-2 p-5 text-left transition ${
                activityType === "simulasi"
                  ? "border-blue-600 bg-blue-50"
                  : "border-slate-200 hover:border-blue-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-slate-900">
                  Simulasi TKA
                </span>
                <span className="text-xl text-blue-700">02</span>
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                Simulasi pengerjaan ujian berbasis komputer dengan batas
                waktu dan navigasi soal.
              </p>

              <p className="mt-4 text-sm font-bold text-blue-700">
                {activityType === "simulasi" ? "✓ Dipilih" : "Pilih simulasi"}
              </p>
            </button>

          </div>
        </section>

        {/* PENGATURAN */}
        <section className="mb-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-slate-900">
            Pengaturan Kegiatan
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Pengaturan berikut masih bersifat prototipe dan belum mengacu
            pada konfigurasi paket ujian resmi.
          </p>

          {activityType === "latihan" && (
            <div className="mt-6">
              <label className="mb-3 block text-sm font-bold text-slate-800">
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
                    className={`rounded-lg border-2 px-4 py-3 text-sm font-bold ${
                      difficulty === value
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 text-slate-600 hover:border-blue-300"
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
                className="mb-2 block text-sm font-bold text-slate-800"
              >
                Jumlah Soal
              </label>

              <select
                id="questionCount"
                value={questionCount}
                onChange={(event) => setQuestionCount(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-600"
              >
                <option value="10">10 Soal</option>
                <option value="20">20 Soal</option>
                <option value="30">30 Soal</option>
                <option value="40">40 Soal</option>
              </select>
            </div>

            {activityType === "simulasi" && (
              <div>
                <label
                  htmlFor="duration"
                  className="mb-2 block text-sm font-bold text-slate-800"
                >
                  Durasi Simulasi
                </label>

                <select
                  id="duration"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-600"
                >
                  <option value="30">30 Menit</option>
                  <option value="45">45 Menit</option>
                  <option value="60">60 Menit</option>
                  <option value="90">90 Menit</option>
                </select>
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
              <p className="text-xs text-slate-500">Jenis Kegiatan</p>
              <p className="mt-2 font-bold text-slate-900">
                {activityType === "latihan"
                  ? "Latihan Terarah"
                  : "Simulasi TKA"}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Mata Pelajaran</p>
              <p className="mt-2 font-bold text-slate-900">
                {subjects.length} mata pelajaran
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Jumlah Soal</p>
              <p className="mt-2 font-bold text-slate-900">
                {questionCount} soal
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">
                {activityType === "latihan" ? "Kesulitan" : "Durasi"}
              </p>
              <p className="mt-2 font-bold text-slate-900">
                {activityType === "latihan"
                  ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
                  : `${duration} menit`}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!isReady}
            onClick={saveConfiguration}
            className="mt-6 min-h-12 w-full rounded-lg bg-blue-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
          >
            Simpan Konfigurasi →
          </button>

          {message && (
            <div
              role="status"
              className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900"
            >
              {message}
            </div>
          )}
        </section>

        <footer className="mt-10 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
          © 2026 TKA TryOn · SKILL ON • CONFIDENCE ON
        </footer>

      </div>
    </main>
  );
}
