
"use client";

import { Suspense, startTransition, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const requiredSubjects = {
  sd: ["Bahasa Indonesia", "Matematika"],
  smp: ["Bahasa Indonesia", "Matematika"],
  sma: ["Bahasa Indonesia", "Matematika", "Bahasa Inggris"],
};

const electiveSubjects = [
  "Matematika Lanjutan",
  "Bahasa Indonesia Lanjutan",
  "Bahasa Inggris Lanjutan",
  "Fisika",
  "Kimia",
  "Biologi",
  "Ekonomi",
  "Sosiologi",
  "Geografi",
  "Sejarah",
  "Antropologi",
  "Pendidikan Pancasila (PPKn)",
  "Bahasa Arab",
  "Bahasa Jerman",
  "Bahasa Prancis",
  "Bahasa Jepang",
  "Bahasa Korea",
  "Bahasa Mandarin",
  "Produk/Projek Kreatif dan Kewirausahaan",
];

const levelOptions = {
  sd: {
    value: "sd",
    label: "SD / MI",
    grade: "Kelas 6",
  },
  smp: {
    value: "smp",
    label: "SMP / MTs",
    grade: "Kelas 9",
  },
  sma: {
    value: "sma",
    label: "SMA / MA / SMK",
    grade: "Kelas 12",
  },
};

export default function SubjectsPage() {
  return (
    <Suspense fallback={<p className="p-8">Memuat pilihan mata pelajaran...</p>}>
      <SubjectsConfiguration />
    </Suspense>
  );
}

function SubjectsConfiguration() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activityType =
    searchParams.get("activityType") === "simulasi" ? "simulasi" : "latihan";

  const [level, setLevel] = useState(null);
  const [schoolType, setSchoolType] = useState("sma");
  const [selectedElectives, setSelectedElectives] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStudentProfile = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, education_level")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      if (!profile) {
        setError(
          "Profil siswa belum ditemukan. Silakan hubungi administrator."
        );
        return;
      }

      const studentLevel = String(
        profile.education_level || ""
      ).toLowerCase();

      if (!Object.prototype.hasOwnProperty.call(levelOptions, studentLevel)) {
        setLevel(null);
        setError(
          "Jenjang pendidikan belum ditetapkan pada profil Anda. Silakan selesaikan penetapan jenjang melalui administrator."
        );
        return;
      }

      setLevel(studentLevel);
    } catch (err) {
      console.error("Gagal memuat profil siswa:", err);

      setError(
        err.message ||
          "Terjadi kesalahan saat memuat profil siswa. Silakan coba kembali."
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    startTransition(() => loadStudentProfile());
  }, [loadStudentProfile]);

  const isHighSchool = level === "sma";

  const mandatorySubjects = level
    ? requiredSubjects[level]
    : [];

  const availableElectives = electiveSubjects.filter(
    (subject) =>
      subject !== "Produk/Projek Kreatif dan Kewirausahaan" ||
      schoolType === "smk"
  );

  function toggleElective(subject) {
    setSelectedElectives((previous) => {
      if (previous.includes(subject)) {
        return previous.filter((item) => item !== subject);
      }

      if (previous.length >= 2) {
        return previous;
      }

      return [...previous, subject];
    });
  }

  function handleContinue() {
    if (!level || !mandatorySubjects.length) {
      return;
    }

    if (isHighSchool && selectedElectives.length !== 2) {
      return;
    }

    const allSubjects = [
      ...mandatorySubjects,
      ...selectedElectives,
    ];

    const params = new URLSearchParams({
      level,
      schoolType: isHighSchool ? schoolType : "",
      subjects: allSubjects.join(","),
    });

    params.set("activityType", activityType);
    router.push(`/student/missions?${params.toString()}`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-700" />
          <h2 className="mt-5 text-lg font-bold text-slate-900">
            Memuat Profil Siswa
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Sedang memeriksa identitas akademik Anda.
          </p>
        </div>
      </main>
    );
  }

  if (error || !level) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 text-slate-800">
        <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-2xl">
            !
          </div>

          <h1 className="mt-5 text-xl font-extrabold text-slate-900">
            Jenjang Pendidikan Belum Tersedia
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            {error ||
              "Jenjang pendidikan belum ditetapkan pada profil Anda."}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError("");
                void loadStudentProfile();
              }}
              className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800"
            >
              Coba Kembali
            </button>

            <button
              type="button"
              onClick={() => router.push("/student")}
              className="rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Kembali ke Dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  const currentLevel = levelOptions[level];

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
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
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
            Kembali ke Dashboard
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:py-10 lg:px-8">
        {/* JUDUL */}
        <section className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
            PERSIAPAN UJIAN
          </p>

          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Pilih Mata Pelajaran TKA
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Anda memilih {activityType === "simulasi" ? "Simulasi TKA" : "Latihan Akademik"}.
            Pilih mata pelajaran yang akan digunakan sesuai jenjang pendidikan Anda.
          </p>
        </section>

        {/* JENJANG PENDIDIKAN DARI PROFIL */}
        <section className="mb-8 rounded-xl border border-blue-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Jenjang Pendidikan
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Jenjang mengikuti identitas akademik yang tercatat pada profil
                siswa.
              </p>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                {currentLevel.grade}
              </p>

              <p className="mt-1 text-lg font-extrabold text-slate-900">
                {currentLevel.label}
              </p>

              <p className="mt-1 text-xs font-semibold text-blue-700">
                <span aria-hidden="true">✓ </span>
                Jenjang terverifikasi
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 border-t border-slate-100 pt-4">
            <span className="text-slate-400" aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>

            <p className="text-xs leading-5 text-slate-500">
              Jenjang pendidikan terkunci sebagai identitas akademik. Jika
              terdapat kesalahan, pengajuan perubahan dilakukan melalui
              mekanisme resmi dan persetujuan administrator.
            </p>
          </div>

          {isHighSchool && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <label
                htmlFor="schoolType"
                className="mb-2 block text-sm font-bold text-slate-800"
              >
                Jenis Satuan Pendidikan
              </label>

              <select
                id="schoolType"
                value={schoolType}
                onChange={(event) => {
                  setSchoolType(event.target.value);
                  setSelectedElectives([]);
                }}
                className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              >
                <option value="sma">SMA</option>
                <option value="ma">MA</option>
                <option value="smk">SMK / MAK</option>
              </select>
            </div>
          )}
        </section>

        {/* MATA PELAJARAN WAJIB */}
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900">
                1. Mata Pelajaran Wajib
              </h3>

              <span className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                {mandatorySubjects.length} MATA PELAJARAN
              </span>
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Mata pelajaran wajib otomatis disertakan dalam paket latihan
              sesuai jenjang pendidikan.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mandatorySubjects.map((subject, index) => (
              <div
                key={subject}
                className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-sm font-bold text-white">
                  {index + 1}
                </div>

                <div>
                  <p className="font-bold text-slate-900">{subject}</p>
                  <p className="mt-0.5 text-xs font-semibold text-blue-700">
                    WAJIB
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* MATA PELAJARAN PILIHAN */}
        {isHighSchool && (
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-900">
                  2. Mata Pelajaran Pilihan
                </h3>

                <span className="rounded-md bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
                  PILIH TEPAT 2
                </span>
              </div>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Pilih dua mata pelajaran yang pernah ditempuh dan tercantum
                dalam rapor. Pilihan dapat disesuaikan dengan minat dan
                rencana studi lanjutan.
              </p>
            </div>

            <div className="mb-5 flex items-center justify-between rounded-lg bg-slate-50 p-4">
              <span className="text-sm font-semibold text-slate-700">
                Pilihan Anda
              </span>

              <span className="text-lg font-extrabold text-blue-700">
                {selectedElectives.length} / 2
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {availableElectives.map((subject) => {
                const selected = selectedElectives.includes(subject);
                const limitReached = selectedElectives.length >= 2;

                return (
                  <button
                    key={subject}
                    type="button"
                    aria-pressed={selected}
                    disabled={!selected && limitReached}
                    onClick={() => toggleElective(subject)}
                    className={`flex min-h-16 items-center justify-between gap-3 rounded-lg border p-4 text-left text-sm font-semibold transition ${
                      selected
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : limitReached
                          ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                          : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                    }`}
                  >
                    <span>{subject}</span>

                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs ${
                        selected
                          ? "border-blue-700 bg-blue-700 text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {selected ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">
              Pastikan pilihan sesuai mata pelajaran yang tercatat dalam rapor.
            </p>
          </section>
        )}

        {/* RINGKASAN */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-slate-900">
            Ringkasan Mata Pelajaran
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Berikut mata pelajaran yang akan dimasukkan ke persiapan ujian.
          </p>

          <div className="mt-5 space-y-2">
            {mandatorySubjects.map((subject) => (
              <div
                key={subject}
                className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3"
              >
                <span className="text-sm font-semibold text-slate-800">
                  {subject}
                </span>

                <span className="text-xs font-bold text-blue-700">
                  WAJIB
                </span>
              </div>
            ))}

            {selectedElectives.map((subject) => (
              <div
                key={subject}
                className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3"
              >
                <span className="text-sm font-semibold text-slate-800">
                  {subject}
                </span>

                <span className="text-xs font-bold text-amber-700">
                  PILIHAN
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">
                Total{" "}
                {mandatorySubjects.length + selectedElectives.length} mata
                pelajaran
              </p>

              {isHighSchool && selectedElectives.length !== 2 && (
                <p className="mt-1 text-xs text-amber-700">
                  Silakan pilih {2 - selectedElectives.length} mata pelajaran
                  pilihan lagi.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleContinue}
              disabled={isHighSchool && selectedElectives.length !== 2}
              className="min-h-12 rounded-lg bg-blue-700 px-7 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Lanjut ke Persiapan Ujian →
            </button>
          </div>
        </section>

        <footer className="mt-10 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
          © 2026 TKA TryOn · SKILL ON • CONFIDENCE ON
        </footer>
      </div>
    </main>
  );
}
