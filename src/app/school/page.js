"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import PortalHeader from "@/components/portal-header";
import Link from "next/link";
import { getTimeGreeting } from "@/lib/student/greeting.mjs";
import { buttonClass, Panel } from "@/components/school/portal";
import SchoolOverview from "@/components/school/overview";
import { assertSchoolMembership, schoolRpc } from "@/lib/school/rpc-contract.mjs";

export default function SchoolPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const greeting = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [school, setSchool] = useState(null);
  const [students, setStudents] = useState([]);
  const [topics, setTopics] = useState([]);
  const [activeSubject, setActiveSubject] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [context, setContext] = useState(null);
  const pageSize = 10;

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) {
          router.replace("/");
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, account_type, school_id")
          .eq("id", userData.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!mounted) return;

        setUser(userData.user);
        setProfile(profileData);
        const trustedContext = await schoolRpc(supabase, "school_portal_context");
        if (!mounted) return;
        setContext(trustedContext);
        // Managed profiles are legacy read-only, never the class authority.
        if (profileData?.account_type !== "SCHOOL" || !profileData.school_id) return;
        assertSchoolMembership(trustedContext, profileData.school_id);
        const data = await schoolRpc(supabase, "get_school_students");
        if (data.school.id !== profileData.school_id) throw new Error("SCHOOL_SCOPE_MISMATCH: Sekolah respons tidak cocok dengan pemetaan akun. Hubungi platform.");
        if (mounted) { setSchool(data.school); setStudents(data.students); }
        const topicData = await schoolRpc(supabase, "get_school_subject_topics");

        const subjectIds = [
          ...new Set(
            topicData.map((item) => item.subject_code).filter(Boolean),
          ),
        ];
        const filteredTopics = topicData.filter((item) =>
          subjectIds.includes(item.subject_code),
        );
        if (mounted) {
          setSchool(data.school);
          setStudents(data.students);
          setTopics(
            filteredTopics.map((item) => ({
              ...item,
              subjectLabel: item.subject_label || item.subject_code,
            })),
          );
          setActiveSubject((current) => current || subjectIds[0] || "");
        }
      } catch (err) {
        if (mounted)
          setError(err.message || "Dashboard sekolah belum berhasil dimuat.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleSignOut() {
    setSigningOut(true);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message || "Akun belum berhasil dikeluarkan.");
      setSigningOut(false);
      return;
    }
    router.replace("/");
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface-muted">
        <p className="font-semibold text-ink-secondary">
          Memuat dashboard sekolah…
        </p>
      </main>
    );
  }


  const displayName =
    profile?.full_name || user?.email?.split("@")[0] || "Sekolah";

  const totalStudentPages = Math.max(1, Math.ceil(students.length / pageSize));
  const visibleStudents = students.slice(
    (studentPage - 1) * pageSize,
    studentPage * pageSize,
  );
  const subjectGroups = topics.reduce((groups, item) => {
    const group = groups[item.subject_code] || {
      label: item.subjectLabel,
      themes: {},
    };
    group.themes[item.theme] = [
      ...(group.themes[item.theme] || []),
      item.topic,
    ];
    groups[item.subject_code] = group;
    return groups;
  }, {});
  const subjectIds = Object.keys(subjectGroups);

  return (
    <main className="min-h-screen bg-surface-muted text-ink-body">
      <PortalHeader
        displayName={displayName}
        signingOut={signingOut}
        onSignOut={handleSignOut}
      />

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-6 rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning-ink"
          >
            {error}
          </div>
        )}

          <section id="greeting" className="mb-10 scroll-mt-28">
            <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              {greeting}, {profile?.full_name || "Sekolah"} 👋
            </h2>
            <p
              id="quote"
              className="mt-2 text-sm leading-6 text-ink-secondary sm:text-base"
            >
              {school?.name || "Sekolah"} - {school?.city || "-"} - {school?.province || "-"}
            </p>
          </section>

          {context && <SchoolOverview context={context} />}
          {!context && <Panel title="Konteks sekolah belum tersedia"><p>Pastikan email terverifikasi dan akun aktif, lalu masuk kembali atau hubungi koordinator/platform untuk memeriksa membership. Akses tidak diberikan dari profil saja.</p><Link className="text-accent-strong underline" href="/school/register">Periksa pengajuan sekolah</Link></Panel>}
          <section id="action" className="mb-10 scroll-mt-28">
            <div className="flex flex-wrap gap-3 mt-4">
              {school?.id && (
                <Link
                  className={buttonClass}
                  href={`/school/manage?school=${encodeURIComponent(school.id)}`}
                >
                  Lengkapi Profil Sekolah
                </Link>
              )}
              <Link className={buttonClass} href="/teacher">
                Tugas guru (capability gated)
              </Link>
              <Link className={buttonClass} href="/school/agenda">Agenda sekolah SET</Link>
              <p className="text-sm text-ink-secondary">Tugas dan agenda hanya aktif setelah capability sekolah terverifikasi server. Review lintas siswa dan reset sandi tidak tersedia di sini.</p>
            </div>
          </section>

          <section id="students" className="mb-10 scroll-mt-28">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <h2
                id="label-riwayat"
                className="text-2xl font-extrabold tracking-tight text-ink"
              >
                Daftar Siswa — Profil Terkelola Legacy (Baca-saja)
              </h2>
            </div>
            <p className="mb-4 text-sm text-ink-secondary">Daftar ini bukan membership kelas. Penempatan kelas dan akses siswa dikelola pada Kelola sekolah. Profil yang belum dipetakan tidak diberi hak otomatis.</p>
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
              <table id="student-list" className="min-w-full text-left text-sm">
                <thead className="border-y border-line bg-surface-muted text-ink-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      #
                    </th>
                    <th scope="col" className="px-4 py-3">
                      NISN
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Nama Siswa
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {visibleStudents.length ? (
                    visibleStudents.map((student, index) => (
                      <tr key={student.id}>
                        <td className="px-4 py-3">
                          {(studentPage - 1) * pageSize + index + 1}
                        </td>
                        <td className="px-4 py-3">{student.nisn || "-"}</td>
                        <td className="px-4 py-3">
                          {student.full_name || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <details className="max-w-sm"><summary className="cursor-pointer font-bold text-accent-ink">Detail profil baca-saja</summary><dl className="space-y-2 py-3"><dt className="font-bold">Nama</dt><dd>{student.full_name || "—"}</dd><dt className="font-bold">NISN</dt><dd>{student.nisn || "—"}</dd><dt className="font-bold">Sekolah profil legacy</dt><dd>{school?.name || "—"}</dd></dl><p className="text-xs text-ink-secondary">Membership dan kelas tidak disimpulkan dari afiliasi profil ini.</p></details>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="4"
                        className="px-4 py-8 text-center text-ink-muted"
                      >
                        {school ? "Belum ada profil siswa terkelola pada sekolah ini." : "Daftar legacy belum tersedia: diperlukan akun SCHOOL dan membership admin aktif pada sekolah yang sama. Gunakan manajemen membership untuk daftar siswa kelas."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {students.length > pageSize && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  type="button"
                  disabled={studentPage === 1}
                  onClick={() => setStudentPage((page) => page - 1)}
                  className="rounded-lg border border-line-strong px-3 py-2 font-bold disabled:opacity-40"
                >
                  Sebelumnya
                </button>
                <span>
                  Halaman {studentPage} dari {totalStudentPages}
                </span>
                <button
                  type="button"
                  disabled={studentPage === totalStudentPages}
                  onClick={() => setStudentPage((page) => page + 1)}
                  className="rounded-lg border border-line-strong px-3 py-2 font-bold disabled:opacity-40"
                >
                  Berikutnya
                </button>
              </div>
            )}
          </section>

          <section id="competency" className="mb-10 scroll-mt-28">
            <h2 className="mb-5 text-2xl font-extrabold tracking-tight text-ink">
              Kompetensi
            </h2>
            <div id="subject-list" className="grid w-full grid-cols-1 gap-2 border-b border-line pb-3 sm:grid-cols-2">
              {subjectIds.map((subjectId) => (
                <button
                  key={subjectId}
                  type="button"
                  onClick={() => setActiveSubject(subjectId)}
                  className={`w-full rounded-lg px-4 py-2 text-sm font-bold ${activeSubject === subjectId ? "bg-primary text-on-primary" : "bg-surface text-accent-ink ring-1 ring-accent-line"}`}
                >
                  {subjectGroups[subjectId].label}
                </button>
              ))}
            </div>
            {activeSubject && subjectGroups[activeSubject] ? (
                <div className="mt-4 space-y-4">
                  {Object.entries(subjectGroups[activeSubject].themes).map(
                    ([theme, topicList]) => (
                      <div key={theme}>
                        <h4 className="font-bold text-ink">{theme}</h4>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-secondary">
                          {topicList.map((topic) => (
                            <li key={topic}>{topic}</li>
                          ))}
                        </ul>
                      </div>
                    ),
                  )}
                </div>
            ) : (
              <p className="rounded-xl border border-line bg-surface p-5 text-sm text-ink-muted">
                Belum ada data kompetensi untuk jenjang ini.
              </p>
            )}
          </section>

       </div>
    </main>
  );
}

function subscribe(onChange) {
  const timer = window.setInterval(onChange, 30000);
  window.addEventListener("focus", onChange);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", onChange);
  };
}
const snapshot = () => getTimeGreeting();
const serverSnapshot = () => "Selamat Datang";

