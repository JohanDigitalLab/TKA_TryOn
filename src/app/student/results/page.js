"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PortalHeader from "@/components/portal-header";
import DashboardBreadcrumb from "@/components/dashboard-breadcrumb";
import ResultsTrendChart from "@/components/student/results-trend-chart";
import { supabase } from "@/lib/supabase";

// =====================================================
// KONSTANTA TAMPILAN
// =====================================================

const COMPETENCY_LABELS = {
  KUAT: { label: "Kuat", tone: "border-emerald-200 bg-emerald-50 text-emerald-700", bar: "bg-emerald-600" },
  CUKUP: { label: "Cukup", tone: "border-amber-200 bg-amber-50 text-amber-700", bar: "bg-amber-500" },
  KURANG: { label: "Perlu Pendalaman", tone: "border-rose-200 bg-rose-50 text-rose-700", bar: "bg-rose-600" },
  NA: { label: "Belum Terukur", tone: "border-slate-200 bg-slate-50 text-slate-600", bar: "bg-slate-400" },
};

const TRYOUT_TONE = { accent: "#7c3aed", label: "Tryout" };
const EXAM_TONE = { accent: "#2563eb", label: "Latihan & Tugas" };

function competencyMeta(level) {
  return COMPETENCY_LABELS[String(level || "").toUpperCase()] || COMPETENCY_LABELS.NA;
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function attemptTime(attempt) {
  return new Date(attempt.submitted_at || attempt.started_at || 0).getTime();
}

function chartPoint(attempt) {
  const label = new Date(attemptTime(attempt));
  const valid = Number.isFinite(label.getTime());
  return {
    attemptId: attempt.attempt_id,
    subject: attempt.subject_name || "Mata pelajaran",
    score: Number(attempt.score || 0),
    completedAt: attempt.submitted_at || attempt.started_at || null,
    label: valid
      ? label.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })
      : "Sesi",
  };
}

// =====================================================
// PENGELAMAN DATA PER MATA PELAJARAN
// =====================================================

function buildSubjectSections({ subjects = [], attempts = [], competency = [] }) {
  const attemptsBySubject = new Map();
  const competencyBySubject = new Map();

  const pushAttempt = (key, attempt) => {
    if (!attemptsBySubject.has(key)) attemptsBySubject.set(key, []);
    attemptsBySubject.get(key).push(attempt);
  };
  const pushCompetency = (key, row) => {
    if (!competencyBySubject.has(key)) competencyBySubject.set(key, []);
    competencyBySubject.get(key).push(row);
  };

  attempts.forEach((attempt) => {
    pushAttempt(normalizeKey(attempt.subject_name), attempt);
  });
  competency.forEach((row) => {
    pushCompetency(normalizeKey(row.subject), row);
  });

  const declared = subjects.map((subject) => ({
    key: normalizeKey(subject.subject_code),
    nameKey: normalizeKey(subject.name),
    title: subject.name || subject.subject_code || "Mata pelajaran",
  }));

  const seen = new Set();
  const sections = [];

  const resolveAttempts = (entry) =>
    attemptsBySubject.get(entry.nameKey) || attemptsBySubject.get(entry.key) || [];
  const resolveCompetency = (entry) =>
    competencyBySubject.get(entry.key) || competencyBySubject.get(entry.nameKey) || [];

  declared.forEach((entry) => {
    seen.add(entry.key);
    seen.add(entry.nameKey);
    sections.push({ ...entry, attempts: resolveAttempts(entry), competency: resolveCompetency(entry) });
  });

  // Mata pelajaran yang tidak ada pada katalog jenjang tetap ditampilkan
  // supaya riwayat dan kompetensi siswa tidak hilang dari layar.
  const extras = new Map();
  const addExtra = (rawKey, title) => {
    const key = normalizeKey(rawKey);
    if (!key || seen.has(key)) return null;
    if (!extras.has(key)) extras.set(key, { key, nameKey: key, title: title || rawKey, attempts: [], competency: [] });
    const section = extras.get(key);
    if (title && section.title === rawKey) section.title = title;
    return section;
  };
  attempts.forEach((attempt) => {
    const section = addExtra(attempt.subject_name, attempt.subject_name);
    if (section) section.attempts.push(attempt);
  });
  competency.forEach((row) => {
    const section = addExtra(row.subject, row.subject_label || row.subject);
    if (section) section.competency.push(row);
  });

  extras.forEach((section) => sections.push(section));

  return sections
    .sort((a, b) => String(a.title).localeCompare(String(b.title), "id"))
    .map((section) => {
      const ordered = section.attempts
        .slice()
        .sort((a, b) => attemptTime(a) - attemptTime(b));
      const tryout = ordered.filter((a) => normalizeKey(a.attempt_type) === "tryout").slice(-5);
      const exam = ordered
        .filter((a) => ["exercise", "assignment"].includes(normalizeKey(a.attempt_type)))
        .slice(-5);

      const themes = new Map();
      section.competency.forEach((row) => {
        const themeKey = normalizeKey(row.theme) || "tema belum tersedia";
        if (!themes.has(themeKey)) themes.set(themeKey, { title: row.theme || "Tema belum tersedia", topics: [] });
        themes.get(themeKey).topics.push(row);
      });

      const grouped = [...themes.values()]
        .map((theme) => ({
          ...theme,
          topics: theme.topics.sort((a, b) => String(a.topic).localeCompare(String(b.topic), "id")),
        }))
        .sort((a, b) => String(a.title).localeCompare(String(b.title), "id"));

      return {
        ...section,
        tryout,
        exam,
        themes: grouped,
        summaryScore: (() => {
          const competencyScores = section.competency
            .map((row) => {
              const explicitScore = Number(row.score ?? row.average_score ?? row.percentage);
              if (Number.isFinite(explicitScore) && explicitScore > 0) return explicitScore;

              const answered = Number(row.no_of_questions || 0);
              const correct = Number(row.correct_answers ?? row.correct_anwers ?? 0);
              return answered > 0 && correct > 0 ? (correct / answered) * 100 : 0;
            })
            .filter((score) => Number.isFinite(score) && score > 0);
          const attemptScores = section.attempts
            .map((attempt) => Number(attempt.score))
            .filter((score) => Number.isFinite(score) && score > 0);
          const scores = competencyScores.length ? competencyScores : attemptScores;
          return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
        })(),
        hasData: ordered.length > 0 || section.competency.length > 0,
      };
    });
}

// =====================================================
// TAMPILAN PER MATA PELAJARAN
// =====================================================

function SubjectSection({ section, index }) {
  return (
    <section
      aria-labelledby={`subject-title-${index}`}
      className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
            Mata pelajaran {index + 1}
          </p>
          <h2 id={`subject-title-${index}`} className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            {section.title}
          </h2>
        </div>
        <p className="text-sm text-slate-500">
          {section.attempts.length} sesi tersimpan · {section.competency.length} topik terukur
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ResultsTrendChart
          title="Skor Tryout"
          sessions={section.tryout.map(chartPoint)}
          accent={TRYOUT_TONE.accent}
          emptyText="Belum ada tryout selesai pada mata pelajaran ini."
        />
        <ResultsTrendChart
          title="Skor Latihan & Tugas"
          sessions={section.exam.map(chartPoint)}
          accent={EXAM_TONE.accent}
          emptyText="Belum ada latihan atau tugas selesai pada mata pelajaran ini."
        />
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Kompetensi per tema</h3>
        {!section.themes.length ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            Kompetensi belum tersedia untuk mata pelajaran ini. Jalankan perhitungan kompetensi setelah siswa menyelesaikan soal.
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            {section.themes.map((theme) => (
              <article key={`${section.key}-${theme.title}`} className="rounded-xl border border-slate-200">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <h4 className="font-bold text-slate-900">{theme.title}</h4>
                  <span className="text-xs text-slate-500">{theme.topics.length} topik</span>
                </header>
                <ul className="divide-y divide-slate-100">
                  {theme.topics.map((topic) => {
                    const meta = competencyMeta(topic.competency_level);
                    const answered = Number(topic.no_of_questions || 0);
                    const correct = Number(topic.correct_answers || 0);
                    return (
                      <li
                        key={`${section.key}-${theme.title}-${topic.topic}`}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{topic.topic}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Dikerjakan <strong className="text-slate-700">{answered}</strong> · Benar{" "}
                            <strong className="text-slate-700">{correct}</strong>
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 sm:w-24">
                            <span
                              className={`block h-full rounded-full ${meta.bar}`}
                              style={{ width: `${answered > 0 ? Math.min(100, (correct / answered) * 100) : 0}%` }}
                            />
                          </span>
                          <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${meta.tone}`}>
                            {meta.label}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// =====================================================
// HALAMAN
// =====================================================

function ResultsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedUser = params.get("userId") || params.get("user_id") || "";

  const [viewer, setViewer] = useState(null);
  const [students, setStudents] = useState([]);
  const [payload, setPayload] = useState({ viewer: null, subjects: [], attempts: [], competency: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Parameter URL adalah satu-satunya sumber pilihan siswa.
  const selectedUser = requestedUser;

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
        if (!active) return;
        if (sessionError) throw sessionError;
        if (!sessionData?.user) throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("account_type, full_name")
          .eq("id", sessionData.user.id)
          .maybeSingle();
        if (!active) return;
        if (profileError) throw profileError;

        const accountType = String(profile?.account_type || "").toUpperCase();
        const isManagerAccount = accountType === "SCHOOL" || accountType === "ADMIN";
        setViewer({ accountType, fullName: profile?.full_name || "Siswa" });

        const { data, error: rpcError } = await supabase.rpc("get_student_results", {
          p_user_id: isManagerAccount ? selectedUser || null : null,
        });
        if (!active) return;
        if (rpcError) throw rpcError;

        setStudents(Array.isArray(data?.students) ? data.students : []);
        // VirtualPet adalah gamifikasi, bukan mata pelajaran: jangan pernah
        // dimasukkan ke pengelompokan hasil/kompetensi meskipun RPC lama mengirimnya.
        const isVirtualpet = (value) => normalizeKey(value) === "virtualpet";
        setPayload({
          viewer: data?.viewer || null,
          subjects: Array.isArray(data?.subjects) ? data.subjects : [],
          attempts: (Array.isArray(data?.attempts) ? data.attempts : []).filter((attempt) => !isVirtualpet(attempt.subject_name)),
          competency: (Array.isArray(data?.competency) ? data.competency : []).filter((row) => !isVirtualpet(row.subject)),
        });
        setError("");
      } catch (err) {
        if (active) setError(err.message || "Hasil belajar belum berhasil dimuat.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [selectedUser, reloadToken]);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/");
  }

  function chooseStudent(event) {
    const value = event.target.value;
    // Parameter URL menjadi sumber tunggal pilihan siswa.
    router.replace(value ? `/student/results?userId=${encodeURIComponent(value)}` : "/student/results");
  }

  const sections = useMemo(() => buildSubjectSections(payload), [payload]);
  const isManager = ["SCHOOL", "ADMIN"].includes(String(viewer?.accountType || ""));
  const studentName =
    payload.viewer?.full_name ||
    students.find((student) => student.id === selectedUser)?.full_name ||
    viewer?.fullName ||
    "Siswa";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <PortalHeader displayName={studentName} signingOut={signingOut} onSignOut={handleSignOut} />

        <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <DashboardBreadcrumb current="Hasil Belajar" />
       <section id="greeting" className="mb-10 scroll-mt-28">
          <div className="mb-5">
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Kompetensi dan Hasil Belajar
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
            
            {isManager
              ? `${studentName}.`
              : "Perkembangan nilai dan kompetensi belajar berdasarkan mata pelajaran."}
          </p>
          </div>
        </section>

        {!loading && !error && sections.length > 0 && (
          <section className="mb-6 min-w-0" aria-label="Ringkasan skor per mata pelajaran">
            <div className="mt-3 flex flex-wrap items-stretch justify-between gap-3">
            {sections.map((section) => (
              <article key={`summary-${section.key}`} className="min-w-0 flex-1 basis-40 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-500">{section.title}</p>
                {section.summaryScore === null ? (
                  <p className="mt-2 text-sm font-bold text-slate-500">Belum ada skor</p>
                ) : (
                  <p className="mt-2 text-2xl font-black text-blue-700">{section.summaryScore.toFixed(2)}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">Nilai kompetensi rata-rata</p>
              </article>
            ))}
            </div>
          </section>
        )}

        {error && (
          <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {error}
            <button
              type="button"
              onClick={() => setReloadToken((value) => value + 1)}
              className="mt-3 block rounded-lg border border-amber-400 px-4 py-2 font-bold hover:bg-amber-100"
            >
              Coba muat ulang
            </button>
          </div>
        )}
 
          {isManager && !selectedUser && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label htmlFor="student-picker" className="block text-sm font-bold text-slate-800">
                Siswa
              </label>
              <select
                id="student-picker"
                value={selectedUser}
                onChange={chooseStudent}
                disabled={loading}
                className="mt-2 block min-h-11 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
              >
                <option value="">Pilih siswa…</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.full_name || "Tanpa nama"}
                    {student.nisn ? ` · ${student.nisn}` : ""}
                    {student.education_level ? ` · ${student.education_level.toUpperCase()}` : ""}
                  </option>
                ))}
              </select>
              {students.length === 0 && !loading && (
                <p className="mt-2 text-xs text-slate-500">Belum ada siswa terdaftar pada akun ini.</p>
              )}
            </div>
          )}

        {loading ? (
          <p role="status" className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center font-semibold text-slate-600">
            Memuat hasil belajar…
          </p>
        ) : isManager && !selectedUser ? (
          <p className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            Pilih siswa terlebih dahulu untuk menampilkan grafik dan kompetensi.
          </p>
        ) : sections.length === 0 || sections.every((section) => !section.hasData) ? (
          <p className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            Belum ada hasil belajar yang tersimpan.
          </p>
        ) : (
          sections.map((section, index) => <SubjectSection key={`${section.key}-${index}`} section={section} index={index} />)
        )}

</div>
    </main>
  );
}

export default function StudentResultsPage() {
  return (
    <Suspense fallback={<p role="status" className="grid min-h-screen place-items-center text-slate-600">Memuat hasil…</p>}>
      <ResultsContent />
    </Suspense>
  );
}
