"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import PortalHeader from "@/components/portal-header";
import Link from "next/link";
import { getTimeGreeting } from "@/lib/student/greeting.mjs";
import { buttonClass, Panel } from "@/components/school/portal";

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
  const [selected, setSelected] = useState(null);
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
        if (profileData?.account_type !== "SCHOOL" || !profileData?.school_id) {
          router.replace("/home");
          return;
        }
        if (!mounted) return;

        setUser(userData.user);
        setProfile(profileData);

        const { data, error: requestError } = await supabase.rpc(
          "get_school_students",
        );
        if (requestError) {
          if (requestError.code === "PGRST202")
            throw new Error(
              "RPC dashboard sekolah belum tersedia. Jalankan migrasi migration-school-dashboard.sql di Supabase SQL Editor.",
            );
          throw requestError;
        }
        if (!data?.school || !Array.isArray(data.students))
          throw new Error("Respons dashboard sekolah tidak valid.");

        const { data: topicData, error: topicError } = await supabase.rpc(
          "get_school_subject_topics",
        );
        if (topicError) {
          if (topicError.code === "PGRST202")
            throw new Error(
              "RPC kompetensi sekolah belum tersedia. Jalankan migration-school-subject-topics.sql di Supabase SQL Editor.",
            );
          throw topicError;
        }
        if (!Array.isArray(topicData))
          throw new Error("Respons kompetensi sekolah tidak valid.");

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
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p className="font-semibold text-slate-600">
          Memuat dashboard sekolah…
        </p>
      </main>
    );
  }

  if (!profile || profile.account_type !== "SCHOOL" || !profile.school_id) {
    return null;
  }

  const displayName =
    profile.full_name || user?.email?.split("@")[0] || "Sekolah";

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
    <main className="min-h-screen bg-slate-50 text-slate-800">
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
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          >
            {error}
          </div>
        )}

          <section id="greeting" className="mb-10 scroll-mt-28">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
              {greeting}, {profile?.full_name || "Sekolah"} 👋
            </h2>
            <p
              id="quote"
              className="mt-2 text-sm leading-6 text-slate-600 sm:text-base"
            >
              {school?.name || "Sekolah"} - {school?.city || "-"} - {school?.province || "-"}
            </p>
          </section>

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
                Buat Tugas Sekolah
              </Link>
              <button
                type="button"
                className={buttonClass}
                onClick={() => setSelected({ action: "schedule" })}
              >
                Jadwalkan Try Out
              </button>
            </div>
          </section>

          <section id="students" className="mb-10 scroll-mt-28">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <h2
                id="label-riwayat"
                className="text-2xl font-extrabold tracking-tight text-slate-950"
              >
                Daftar Siswa
              </h2>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table id="student-list" className="min-w-full text-left text-sm">
                <thead className="border-y border-slate-200 bg-slate-50 text-slate-500">
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
                <tbody className="divide-y divide-slate-100">
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
                            {["Profil", "Review", "Reset Password"].map(
                              (action) => (
                                <button
                                  key={action}
                                  type="button"
                                  className="whitespace-nowrap rounded-lg border border-blue-200 px-3 py-2 font-bold text-blue-700 hover:bg-blue-50"
                                  onClick={() =>
                                    setSelected({ student, action })
                                  }
                                >
                                  {action}
                                </button>
                              ),
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="4"
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        Belum ada siswa yang dikelola sekolah.
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
                  className="rounded-lg border border-slate-300 px-3 py-2 font-bold disabled:opacity-40"
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
                  className="rounded-lg border border-slate-300 px-3 py-2 font-bold disabled:opacity-40"
                >
                  Berikutnya
                </button>
              </div>
            )}
          </section>

          <section id="competency" className="mb-10 scroll-mt-28">
            <h2 className="mb-5 text-2xl font-extrabold tracking-tight text-slate-950">
              Kompetensi
            </h2>
            <div id="subject-list" className="grid w-full grid-cols-1 gap-2 border-b border-slate-200 pb-3 sm:grid-cols-2">
              {subjectIds.map((subjectId) => (
                <button
                  key={subjectId}
                  type="button"
                  onClick={() => setActiveSubject(subjectId)}
                  className={`w-full rounded-lg px-4 py-2 text-sm font-bold ${activeSubject === subjectId ? "bg-blue-700 text-white" : "bg-white text-blue-700 ring-1 ring-blue-200"}`}
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
                        <h4 className="font-bold text-slate-900">{theme}</h4>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                          {topicList.map((topic) => (
                            <li key={topic}>{topic}</li>
                          ))}
                        </ul>
                      </div>
                    ),
                  )}
                </div>
            ) : (
              <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
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

