
"use client";

import { Suspense, startTransition, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BrandLogo from "@/components/brand-logo";

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
  const [validationMessage, setValidationMessage] = useState("");

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
          "Jenjang pendidikan belum ditetapkan pada profilmu. Hubungi admin untuk menetapkan jenjang pendidikan sebelum memilih mata pelajaran."
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
    setValidationMessage("");
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
      setValidationMessage("Profil belum siap digunakan. Periksa jenjang pendidikan lalu coba lagi.");
      return;
    }

    if (isHighSchool && selectedElectives.length !== 2) {
      setValidationMessage(`Pilih tepat 2 mata pelajaran pilihan. Saat ini ${selectedElectives.length} mata pelajaran dipilih.`);
      return;
    }

    setValidationMessage("");

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
      <main className="flex min-h-screen items-center justify-center bg-surface-muted px-5">
        <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-line border-t-accent" />
          <h2 className="mt-5 text-lg font-bold text-ink">
            Memuat Profil Siswa
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Sedang memeriksa data jenjang pendidikanmu.
          </p>
        </div>
      </main>
    );
  }

  if (error || !level) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-muted px-5 py-10 text-ink-body">
        <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning-soft text-2xl">
            !
          </div>

          <h1 className="mt-5 text-xl font-extrabold text-ink">
            Jenjang Pendidikan Belum Tersedia
          </h1>

          <p className="mt-3 text-sm leading-6 text-ink-secondary">
            {error ||
              "Jenjang pendidikan belum ditetapkan pada profilmu."}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError("");
                void loadStudentProfile();
              }}
              className="rounded-lg bg-primary px-5 py-3 text-sm font-bold text-on-primary hover:bg-primary-hover"
            >
              Coba Kembali
            </button>

            <button
              type="button"
              onClick={() => router.push("/student")}
              className="rounded-lg border border-line px-5 py-3 text-sm font-semibold text-ink-secondary hover:bg-surface-muted"
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
    <main className="min-h-screen bg-surface-muted text-ink-body">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-5 sm:py-4 lg:px-8">
          <Link href="/student" aria-label="Kembali ke dashboard TKA TryOn" className="flex items-center gap-3">
            <BrandLogo className="h-12 w-14" />

            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-ink">
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
            Kembali ke Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:py-10 lg:px-8">
        {/* JUDUL */}
        <section className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-ink">
            PERSIAPAN UJIAN
          </p>

          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Pilih Mata Pelajaran TKA
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-secondary sm:text-base">
            Kamu memilih {activityType === "simulasi" ? "Simulasi TKA" : "Latihan Akademik"}.
            Pilih mata pelajaran yang akan digunakan sesuai jenjang pendidikanmu.
          </p>
        </section>

        {/* JENJANG PENDIDIKAN DARI PROFIL */}
        <section className="mb-8 rounded-xl border border-accent-line bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-ink">
                Jenjang Pendidikan
              </h3>

              <p className="mt-1 text-sm text-ink-muted">
                Jenjang mengikuti identitas akademik yang tercatat pada profil
                siswa.
              </p>
            </div>

            <div className="rounded-xl border border-accent-line bg-accent-soft px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-accent-ink">
                {currentLevel.grade}
              </p>

              <p className="mt-1 text-lg font-extrabold text-ink">
                {currentLevel.label}
              </p>

              <p className="mt-1 text-xs font-semibold text-accent-ink">
                <span aria-hidden="true">✓ </span>
                Jenjang terverifikasi
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 border-t border-line-subtle pt-4">
            <span className="text-ink-muted" aria-hidden="true">
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

            <p className="text-xs leading-5 text-ink-muted">
              Jenjang pendidikan terkunci sebagai identitas akademik. Jika
              terdapat kesalahan, pengajuan perubahan dilakukan melalui
              mekanisme resmi dan persetujuan administrator.
            </p>
          </div>

          {isHighSchool && (
            <div className="mt-6 border-t border-line-subtle pt-5">
              <label
                htmlFor="schoolType"
                className="mb-2 block text-sm font-bold text-ink-body"
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
                className="w-full max-w-md rounded-lg border border-line-strong bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-line"
              >
                <option value="sma">SMA</option>
                <option value="ma">MA</option>
                <option value="smk">SMK / MAK</option>
              </select>
            </div>
          )}
        </section>

        {/* MATA PELAJARAN WAJIB */}
        <section className="mb-8 rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-ink">
                1. Mata Pelajaran Wajib
              </h3>

              <span className="rounded-md bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent-ink">
                {mandatorySubjects.length} MATA PELAJARAN
              </span>
            </div>

            <p className="mt-2 text-sm leading-6 text-ink-muted">
              Mata pelajaran wajib otomatis disertakan dalam paket latihan
              sesuai jenjang pendidikan.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mandatorySubjects.map((subject, index) => (
              <div
                key={subject}
                className="flex items-center gap-3 rounded-lg border border-accent-line bg-accent-soft p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-primary">
                  {index + 1}
                </div>

                <div>
                  <p className="font-bold text-ink">{subject}</p>
                  <p className="mt-0.5 text-xs font-semibold text-accent-ink">
                    WAJIB
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* MATA PELAJARAN PILIHAN */}
        {isHighSchool && (
          <section className="mb-8 rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-ink">
                  2. Mata Pelajaran Pilihan
                </h3>

                <span className="rounded-md bg-warning-soft px-3 py-1.5 text-xs font-bold text-warning-ink">
                  PILIH TEPAT 2
                </span>
              </div>

              <p className="mt-2 text-sm leading-6 text-ink-muted">
                Pilih dua mata pelajaran yang pernah ditempuh dan tercantum
                dalam rapor. Pilihan dapat disesuaikan dengan minat dan
                rencana studi lanjutan.
              </p>
            </div>

            <div className="mb-5 flex items-center justify-between rounded-lg bg-surface-muted p-4">
              <span className="text-sm font-semibold text-ink-body">
                Pilihanmu
              </span>

              <span className="text-lg font-extrabold text-accent-ink">
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
                        ? "border-accent bg-accent-soft text-accent-strong"
                        : limitReached
                          ? "cursor-not-allowed border-line-subtle bg-surface-muted text-ink-muted"
                          : "border-line bg-surface text-ink-body hover:border-accent hover:bg-accent-soft"
                    }`}
                  >
                    <span>{subject}</span>

                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs ${
                        selected
                          ? "border-accent bg-primary text-on-primary"
                          : "border-line-strong bg-surface"
                      }`}
                    >
                      {selected ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-xs leading-5 text-ink-muted">
              Pastikan pilihan sesuai mata pelajaran yang tercatat dalam rapor.
            </p>
          </section>
        )}

        {/* RINGKASAN */}
        <section className="rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-ink">
            Ringkasan Mata Pelajaran
          </h3>

          <p className="mt-1 text-sm text-ink-muted">
            Berikut mata pelajaran yang akan dimasukkan ke persiapan ujian.
          </p>

          <div className="mt-5 space-y-2">
            {mandatorySubjects.map((subject) => (
              <div
                key={subject}
                className="flex items-center justify-between rounded-lg bg-accent-soft px-4 py-3"
              >
                <span className="text-sm font-semibold text-ink-body">
                  {subject}
                </span>

                <span className="text-xs font-bold text-accent-ink">
                  WAJIB
                </span>
              </div>
            ))}

            {selectedElectives.map((subject) => (
              <div
                key={subject}
                className="flex items-center justify-between rounded-lg bg-warning-soft px-4 py-3"
              >
                <span className="text-sm font-semibold text-ink-body">
                  {subject}
                </span>

                <span className="text-xs font-bold text-warning-ink">
                  PILIHAN
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-line-subtle pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-ink">
                Total{" "}
                {mandatorySubjects.length + selectedElectives.length} mata
                pelajaran
              </p>

              {isHighSchool && selectedElectives.length !== 2 && (
                <p className="mt-1 text-xs text-warning-ink">
                  Silakan pilih {2 - selectedElectives.length} mata pelajaran
                  pilihan lagi.
                </p>
              )}
              {validationMessage && (
                <p id="subjects-validation" role="alert" aria-live="assertive" className="mt-2 text-xs font-semibold text-danger-ink">
                  {validationMessage}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleContinue}
              aria-describedby={validationMessage ? "subjects-validation" : undefined}
              className="min-h-12 rounded-lg bg-primary px-7 py-3 text-sm font-bold text-on-primary transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Lanjut ke Persiapan Ujian →
            </button>
          </div>
        </section>

        <footer className="mt-10 border-t border-line py-6 text-center text-xs text-ink-muted">
          © 2026 TKA TryOn · SKILL ON • CONFIDENCE ON
        </footer>
      </div>
    </main>
  );
}
