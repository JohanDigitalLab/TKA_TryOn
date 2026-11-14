"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const roleLabels = {
  school_admin: "Admin sekolah",
  teacher: "Guru",
  student: "Siswa",
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

function Metric({ label, value, detail }) {
  return (
    <article className="border-l-2 border-blue-600 bg-white px-5 py-4 shadow-[0_1px_0_#e2e8f0]">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </article>
  );
}

export default function SchoolDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadWorkspace() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) {
          router.replace("/login");
          return;
        }
        const { data: membershipData, error: membershipError } = await supabase
          .from("school_memberships")
          .select("school_id, user_id, role, status, joined_at")
          .eq("user_id", authData.user.id)
          .eq("status", "active");
        if (membershipError) throw membershipError;
        const schoolIds = (membershipData || []).map((item) => item.school_id);
        if (!schoolIds.length) {
          if (mounted) {
            setUser(authData.user);
            setMemberships([]);
          }
          return;
        }
        const [schoolResult, classResult, studentResult, inviteResult] = await Promise.all([
          supabase.from("schools").select("id, name, npsn, city, province, status, created_at").in("id", schoolIds),
          supabase.from("classes").select("id, school_id, name, grade, academic_year, homeroom_teacher_id").in("school_id", schoolIds).order("grade").order("name"),
          supabase.from("student_academic_profiles").select("user_id, school_id, class_id, grade, academic_year").in("school_id", schoolIds),
          supabase.from("school_invites").select("id, school_id, invite_code, role, expires_at, max_uses, used_count, status, created_at").in("school_id", schoolIds).order("created_at", { ascending: false }).limit(12),
        ]);
        for (const result of [schoolResult, classResult, studentResult, inviteResult]) {
          if (result.error) throw result.error;
        }
        if (!mounted) return;
        setUser(authData.user);
        setMemberships(membershipData || []);
        setSchools(schoolResult.data || []);
        setClasses(classResult.data || []);
        setStudents(studentResult.data || []);
        setInvites(inviteResult.data || []);
      } catch (err) {
        if (mounted) setError(err.message || "Ruang sekolah belum berhasil dimuat.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadWorkspace();
    return () => { mounted = false; };
  }, [router]);

  const activeSchools = useMemo(() => schools.filter((school) => school.status === "active"), [schools]);
  const teacherCount = memberships.filter((item) => item.role === "teacher").length;
  const studentCount = students.length;
  const firstSchool = activeSchools[0];
  const role = memberships[0]?.role || "student";

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f5f6f3]"><p className="font-semibold text-slate-600">Menyiapkan ruang sekolah…</p></main>;

  return (
    <main className="min-h-screen bg-[#f5f6f3] text-slate-900">
      <header className="border-b border-slate-200 bg-[#f5f6f3]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Kembali ke beranda">
            <span className="flex h-10 w-10 items-center justify-center bg-blue-700 text-lg font-black text-white">T</span>
            <span><strong className="block text-lg tracking-tight">TKA <span className="text-blue-700">TryOn</span></strong><small className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Ruang sekolah</small></span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">{user?.email}</span>
            {memberships.some((m) => ["school_admin", "teacher"].includes(m.role)) && <Link href="/teacher" className="border border-blue-700 bg-blue-700 px-3 py-2 font-bold text-white">Kelola tugas</Link>}
            <Link href="/student" className="border border-slate-300 bg-white px-3 py-2 font-bold hover:border-blue-500">Ruang siswa</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
        {error && <div role="alert" className="mb-6 border-l-2 border-amber-500 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}
        {!memberships.length ? (
          <section className="max-w-2xl border border-slate-200 bg-white p-8 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Akses sekolah</p><h1 className="mt-3 text-3xl font-black tracking-tight">Belum ada keanggotaan aktif</h1><p className="mt-3 leading-7 text-slate-600">Akun ini belum terhubung ke sekolah. Gunakan kode undangan dari sekolah saat pendaftaran atau hubungi administrator sekolah.</p><Link href="/student" className="mt-6 inline-flex bg-blue-700 px-5 py-3 text-sm font-bold text-white">Kembali ke ruang siswa</Link></section>
        ) : (
          <>
            <section className="mb-10 grid gap-8 border-b border-slate-300 pb-10 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
              <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Dashboard sekolah · {roleLabels[role] || role}</p><h1 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">Data belajar yang bisa ditindaklanjuti.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">Pantau struktur kelas dan keterhubungan siswa dari satu ruang kerja yang sederhana.</p></div>
              <div className="border-l-2 border-blue-700 pl-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Sekolah aktif</p><p className="mt-2 text-xl font-black">{firstSchool?.name || "—"}</p><p className="mt-1 text-sm text-slate-500">{firstSchool?.city || "Lokasi belum diisi"}</p></div>
            </section>
            <section className="grid gap-3 sm:grid-cols-3" aria-label="Ringkasan sekolah"><Metric label="Sekolah" value={activeSchools.length} detail="keanggotaan aktif" /><Metric label="Kelas" value={classes.length} detail="struktur kelas terdaftar" /><Metric label="Siswa" value={studentCount} detail={`${teacherCount} guru pada akun ini`} /></section>
            <section className="mt-12 grid gap-8 lg:grid-cols-[1fr_0.75fr]">
              <div><div className="mb-4 flex items-end justify-between border-b border-slate-300 pb-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Struktur akademik</p><h2 className="mt-1 text-2xl font-black">Daftar kelas</h2></div><span className="text-sm text-slate-500">{classes.length} kelas</span></div><div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">{classes.length ? classes.map((item) => { const count = students.filter((student) => student.class_id === item.id).length; return <article key={item.id} className="flex items-center justify-between gap-4 px-5 py-4"><div><h3 className="font-bold">{item.name}</h3><p className="mt-1 text-sm text-slate-500">Kelas {item.grade} · {item.academic_year || "Tahun ajaran belum diisi"}</p></div><span className="text-right"><strong className="block text-xl font-black text-blue-700">{count}</strong><small className="text-xs text-slate-500">siswa</small></span></article>; }) : <p className="p-6 text-sm text-slate-500">Belum ada kelas yang terdaftar.</p>}</div></div>
              <aside className="border border-slate-200 bg-white p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Undangan terbaru</p><h2 className="mt-2 text-xl font-black">Akses bergabung</h2><div className="mt-5 space-y-4">{invites.length ? invites.slice(0, 5).map((invite) => <div key={invite.id} className="border-b border-slate-200 pb-3 last:border-0"><div className="flex items-center justify-between gap-3"><code className="font-bold tracking-wider text-slate-900">{invite.invite_code}</code><span className="text-xs font-bold text-slate-500">{roleLabels[invite.role] || invite.role}</span></div><p className="mt-1 text-xs text-slate-500">{invite.used_count || 0}{invite.max_uses ? `/${invite.max_uses}` : ""} digunakan · dibuat {formatDate(invite.created_at)}</p></div>) : <p className="text-sm leading-6 text-slate-500">Belum ada undangan yang tercatat.</p>}</div></aside>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
