"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import PortalHeader from "@/components/portal-header";
import Link from "next/link";
import { getTimeGreeting } from "@/lib/student/greeting.mjs";
import { buttonClass } from "@/components/school/portal";

const COMPETENCY_LABELS = {
  KUAT: { label: "Kuat", tone: "border-emerald-200 bg-emerald-50 text-emerald-700", bar: "bg-emerald-600" },
  CUKUP: { label: "Cukup", tone: "border-amber-200 bg-amber-50 text-amber-700", bar: "bg-amber-500" },
  KURANG: { label: "Perlu Pendalaman", tone: "border-rose-200 bg-rose-50 text-rose-700", bar: "bg-rose-600" },
  NA: { label: "Belum Terukur", tone: "border-slate-200 bg-slate-50 text-slate-600", bar: "bg-slate-400" },
};

function competencyMeta(level) {
  return COMPETENCY_LABELS[String(level || "").toUpperCase()] || COMPETENCY_LABELS.NA;
}

function formatScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1) : "—";
}

const modalInputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500";
const modalLabelClass = "block text-sm font-semibold text-slate-800";

/**
 * Modal tambah/edit siswa. Mode edit menampilkan NISN dan email login sebagai
 * baca-saja dan tidak mengirim password.
 */
function StudentFormModal({ mode, student, busy, error, onClose, onSubmit }) {
  const isEdit = mode === "edit";
  const [values, setValues] = useState({
    nisn: student?.nisn || "",
    email: student?.email || "",
    full_name: student?.full_name || "",
    wa_number: student?.wa_number || "",
    password: "",
    confirm_password: "",
  });
  const [localError, setLocalError] = useState("");

  function update(name) {
    return (event) => {
      setLocalError("");
      setValues((previous) => ({ ...previous, [name]: event.target.value }));
    };
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (!values.nisn.trim()) return setLocalError("NISN wajib diisi.");
    if (!/^[0-9]{10}$/.test(values.nisn.trim()))
      return setLocalError("NISN harus tepat 10 digit angka.");
    if (!values.email.trim()) return setLocalError("Email wajib diisi.");
    if (!values.full_name.trim()) return setLocalError("Nama lengkap wajib diisi.");
    if (!isEdit) {
      if (values.password.length < 8)
        return setLocalError("Password minimal 8 karakter.");
      if (values.password !== values.confirm_password)
        return setLocalError("Konfirmasi password tidak sama dengan password.");
    }
    onSubmit(event, values);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Tutup formulir siswa"
          className="absolute right-4 top-4 text-2xl leading-none text-slate-400 hover:text-slate-700 disabled:opacity-50"
        >
          ×
        </button>
        <h3 id="student-modal-title" className="text-xl font-extrabold text-slate-950">
          {isEdit ? "Ubah Data Siswa" : "Tambah Siswa"}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {isEdit
            ? "NISN dan email login tidak dapat diubah."
            : "Email yang diisi adalah email login siswa. School ID dan jenjang pendidikan terisi otomatis dari data sekolah."}
        </p>

        {(localError || error) && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {localError || error}
          </div>
        )}

        <form onSubmit={handleSubmit} aria-busy={busy} className="mt-5 space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <label className={modalLabelClass} htmlFor="student-nisn">
              NISN<span className="ml-1 text-rose-600">*</span>
              <input
                id="student-nisn"
                name="nisn"
                value={values.nisn}
                onChange={update("nisn")}
                readOnly={isEdit}
                inputMode="numeric"
                maxLength={10}
                required
                className={modalInputClass}
              />
            </label>
            <label className={modalLabelClass} htmlFor="student-email">
              Email login<span className="ml-1 text-rose-600">*</span>
              <input
                id="student-email"
                name="email"
                type="email"
                value={values.email}
                onChange={update("email")}
                readOnly={isEdit}
                required
                autoComplete="off"
                className={modalInputClass}
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Email ini dipakai siswa untuk masuk.
              </span>
            </label>
            <label className={modalLabelClass} htmlFor="student-name">
              Nama lengkap<span className="ml-1 text-rose-600">*</span>
              <input
                id="student-name"
                name="full_name"
                value={values.full_name}
                onChange={update("full_name")}
                minLength={2}
                maxLength={160}
                required
                className={modalInputClass}
              />
            </label>
            <label className={modalLabelClass} htmlFor="student-wa">
              Nomor WhatsApp
              <input
                id="student-wa"
                name="wa_number"
                type="tel"
                value={values.wa_number}
                onChange={update("wa_number")}
                placeholder="0812xxxxxxxx"
                className={modalInputClass}
              />
            </label>

            {!isEdit ? (
              <>
                <label className={modalLabelClass} htmlFor="student-password">
                  Password<span className="ml-1 text-rose-600">*</span>
                  <input
                    id="student-password"
                    name="password"
                    type="password"
                    value={values.password}
                    onChange={update("password")}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    className={modalInputClass}
                  />
                </label>
                <label className={modalLabelClass} htmlFor="student-password-confirm">
                  Ulangi password<span className="ml-1 text-rose-600">*</span>
                  <input
                    id="student-password-confirm"
                    name="confirm_password"
                    type="password"
                    value={values.confirm_password}
                    onChange={update("confirm_password")}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    className={modalInputClass}
                  />
                </label>
              </>
            ) : null}

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                className="min-h-11 flex-1 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800"
              >
                {busy ? "Menyimpan…" : isEdit ? "Simpan Perubahan" : "Simpan Siswa"}
              </button>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}

/**
 * Modal reset password siswa. Password harus diisi dua kali dan dicocokkan.
 */
function ResetPasswordModal({ student, busy, error, onClose, onSubmit }) {
  const [values, setValues] = useState({ password: "", confirm_password: "" });
  const [localError, setLocalError] = useState("");

  function update(name) {
    return (event) => {
      setLocalError("");
      setValues((previous) => ({ ...previous, [name]: event.target.value }));
    };
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (values.password.length < 8)
      return setLocalError("Password minimal 8 karakter.");
    if (values.password !== values.confirm_password)
      return setLocalError("Konfirmasi password tidak sama dengan password.");
    onSubmit(event, values.password);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-password-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Tutup form reset password"
          className="absolute right-4 top-4 text-2xl leading-none text-slate-400 hover:text-slate-700 disabled:opacity-50"
        >
          ×
        </button>
        <h3 id="reset-password-title" className="text-xl font-extrabold text-slate-950">
          Reset Password Siswa
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {student.full_name || "Tanpa nama"}
          {student.email ? ` · ${student.email}` : ""}
        </p>

        {(localError || error) && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {localError || error}
          </div>
        )}

        <form onSubmit={handleSubmit} aria-busy={busy} className="mt-5 space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <label className={modalLabelClass} htmlFor="reset-password">
              Password baru<span className="ml-1 text-rose-600">*</span>
              <input
                id="reset-password"
                name="password"
                type="password"
                value={values.password}
                onChange={update("password")}
                autoComplete="new-password"
                minLength={8}
                required
                className={modalInputClass}
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Minimal 8 karakter.
              </span>
            </label>
            <label className={modalLabelClass} htmlFor="reset-password-confirm">
              Ulangi password<span className="ml-1 text-rose-600">*</span>
              <input
                id="reset-password-confirm"
                name="confirm_password"
                type="password"
                value={values.confirm_password}
                onChange={update("confirm_password")}
                autoComplete="new-password"
                minLength={8}
                required
                className={modalInputClass}
              />
            </label>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                className="min-h-11 flex-1 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800"
              >
                {busy ? "Menyimpan…" : "Simpan Password Baru"}
              </button>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}

export default function SchoolPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const greeting = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [school, setSchool] = useState(null);
  const [students, setStudents] = useState([]);
  const [competency, setCompetency] = useState([]);
  const [competencyError, setCompetencyError] = useState("");
  const [activeSubject, setActiveSubject] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentModal, setStudentModal] = useState(null);
  const [studentNotice, setStudentNotice] = useState("");
  const [studentBusy, setStudentBusy] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [reloadStudents, setReloadStudents] = useState(0);
  const [selected, setSelected] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const pageSize = 5;

  const refreshStudents = useCallback(async () => {
    const { data, error: requestError } = await supabase.rpc("get_school_students");
    if (requestError) throw requestError;
    let merged = Array.isArray(data?.students)
      ? data.students.map((item) => ({ ...item, user_id: item.id }))
      : [];
    try {
      const { data: detailData, error: detailError } = await supabase.rpc(
        "get_school_students_detail",
      );
      // Email login (auth.users) dipakai; jangan kosongkan daftar bila detail
      // belum tersedia atau sekolah memakai konfigurasi berbeda.
      if (!detailError && Array.isArray(detailData) && detailData.length) merged = detailData;
    } catch {
      // Pertahankan daftar dasar bila RPC detail belum terpasang.
    }
    setStudents(merged);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      let denied = false;
      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) {
          denied = true;
          setRedirecting(true);
          router.replace("/");
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("is_subscribed, full_name, account_type, school_id")
          .eq("id", userData.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        const accountType = String(profileData?.account_type || "").toUpperCase();
        //TODO: add checking
        // if (accountType !== "SCHOOL" || !profileData?.school_id) {
        //   denied = true;
        //   setRedirecting(true);
        //   router.replace("/register");
        //   return;
        // }
        if (!mounted) return;
        if (profileData.is_subscribed !== true) {
          // Paket langganan kini menyatu di dashboard siswa, jadi akun sekolah
          // yang belum berlangganan diarahkan ke sana, bukan ke halaman paket.
          denied = true;
          setRedirecting(true);
          router.replace("/student");
          return;
        }

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

        if (mounted) setSchool(data.school);
        // Daftar siswa beserta detail kontak (email, WhatsApp, jenjang).
        await refreshStudents();

        // Kompetensi dimuat terpisah agar daftar siswa tetap tampil bila RPC gagal.
        try {
          const { data: competencyData, error: competencyFailure } =
            await supabase.rpc("get_school_competency");
          if (!mounted) return;
          if (competencyFailure) {
            if (competencyFailure.code === "PGRST202")
              throw new Error(
                "RPC get_school_competency belum tersedia. Jalankan migration-get-school-competency.sql di Supabase SQL Editor.",
              );
            throw competencyFailure;
          }
          if (!Array.isArray(competencyData))
            throw new Error("Respons kompetensi sekolah tidak valid.");

          const subjectCodes = [
            ...new Set(
              competencyData.map((item) => item.subject_code).filter(Boolean),
            ),
          ];
          setCompetency(competencyData);
          setCompetencyError("");
          setActiveSubject((current) =>
            current && subjectCodes.includes(current)
              ? current
              : subjectCodes[0] || "",
          );
        } catch (competencyErr) {
          if (mounted) {
            setCompetency([]);
            setActiveSubject("");
            setCompetencyError(
              competencyErr.message || "Kompetensi sekolah belum berhasil dimuat.",
            );
          }
        }
      } catch (err) {
        if (mounted)
          setError(err.message || "Dashboard sekolah belum berhasil dimuat.");
      } finally {
        if (mounted && !denied) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      mounted = false;
    };
  }, [router, refreshStudents]);

  useEffect(() => {
    if (reloadStudents === 0) return undefined;
    let active = true;

    async function reload() {
      await Promise.resolve();
      try {
        await refreshStudents();
        if (active) setStudentError("");
      } catch {
        if (active) setStudentError("Daftar siswa belum berhasil dimuat ulang.");
      }
    }

    void reload();
    return () => {
      active = false;
    };
  }, [reloadStudents, refreshStudents]);

  function openAddStudent() {
    setStudentError("");
    setStudentNotice("");
    setStudentModal({ mode: "create", student: null });
  }

  function openEditStudent(student) {
    setStudentError("");
    setStudentNotice("");
    setStudentModal({ mode: "edit", student });
  }

  async function submitStudent(event, values) {
    event.preventDefault();
    if (studentBusy) return;
    setStudentBusy(true);
    setStudentError("");
    setStudentNotice("");
    try {
      if (studentModal?.mode === "edit") {
        const { error: rpcError } = await supabase.rpc("update_school_student", {
          p_user_id: studentModal.student.id,
          p_full_name: values.full_name.trim(),
          p_wa_number: values.wa_number.trim() || null,
        });
        if (rpcError) {
          if (rpcError.code === "PGRST202")
            throw new Error(
              "RPC update_school_student belum tersedia. Jalankan migration-school-student-management.sql di Supabase SQL Editor.",
            );
          throw rpcError;
        }
        setStudentNotice("Data siswa berhasil diperbarui.");
      } else {
        const { error: rpcError } = await supabase.rpc("create_school_student", {
          p_nisn: values.nisn.trim(),
          p_email: values.email.trim(),
          p_full_name: values.full_name.trim(),
          p_wa_number: values.wa_number.trim() || null,
          p_password: values.password,
        });
        if (rpcError) {
          if (rpcError.code === "PGRST202")
            throw new Error(
              "RPC create_school_student belum tersedia. Jalankan migration-school-student-management.sql di Supabase SQL Editor.",
            );
          throw rpcError;
        }
        setStudentNotice("Siswa berhasil ditambahkan.");
      }
      setStudentModal(null);
      setReloadStudents((value) => value + 1);
    } catch (err) {
      setStudentError(err.message || "Perubahan siswa belum berhasil disimpan.");
    } finally {
      setStudentBusy(false);
    }
  }

  // Review membuka rekap hasil siswa terpilih pada halaman results.
  function openReviewStudent(student) {
    if (!student?.id) return;
    router.push(`/student/results?userId=${encodeURIComponent(student.id)}`);
  }

  function openResetPassword(student) {
    setResetError("");
    setResetTarget(student);
  }

  async function submitResetPassword(event, password) {
    event.preventDefault();
    if (resetBusy || !resetTarget?.id) return;
    setResetBusy(true);
    setResetError("");
    try {
      const { error: rpcError } = await supabase.rpc("reset_school_student_password", {
        p_user_id: resetTarget.id,
        p_password: password,
      });
      if (rpcError) {
        if (rpcError.code === "PGRST202")
          throw new Error(
            "RPC reset_school_student_password belum tersedia. Jalankan migration-school-student-management.sql di Supabase SQL Editor.",
          );
        throw rpcError;
      }
      setStudentNotice(`Password siswa ${resetTarget.full_name || ""} berhasil diperbarui.`);
      setResetTarget(null);
    } catch (err) {
      setResetError(err.message || "Password siswa belum berhasil diubah.");
    } finally {
      setResetBusy(false);
    }
  }

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

  // Normalisasi: get_school_students memakai id, versi detail memakai user_id.
  // Semua useMemo harus dipanggil sebelum cabang return lebih awal.
  const allStudents = useMemo(
    () =>
      students.map((item) => ({
        id: item.user_id || item.id,
        nisn: item.nisn || "",
        full_name: item.full_name || "",
        email: item.email || "",
        wa_number: item.wa_number || "",
        education_level: item.education_level || "",
      })),
    [students],
  );
  const filteredStudents = useMemo(() => {
    const keyword = studentSearch.trim().toLowerCase();
    if (!keyword) return allStudents;
    return allStudents.filter((student) =>
      [student.full_name, student.nisn, student.email]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [allStudents, studentSearch]);
  const totalStudentPages = Math.max(
    1,
    Math.ceil(filteredStudents.length / pageSize),
  );
  const safeStudentPage = Math.min(studentPage, totalStudentPages);
  const visibleStudents = filteredStudents.slice(
    (safeStudentPage - 1) * pageSize,
    safeStudentPage * pageSize,
  );

  if (redirecting) {
    // Jangan pernah merender dashboard sekolah saat akun tidak berhak mengaksesnya.
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p role="status" className="font-semibold text-slate-600">Mengalihkan…</p>
      </main>
    );
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

  if (
    !profile ||
    String(profile.account_type || "").toUpperCase() !== "SCHOOL" ||
    !profile.school_id
  ) {
    return null;
  }

  const displayName =
    profile.full_name || user?.email?.split("@")[0] || "Sekolah";
  // Grup: mapel → tema → daftar baris topik dari school_competency.
  const subjectGroups = competency.reduce((groups, item) => {
    const code = item.subject_code || item.subject_label;
    if (!code) return groups;
    const group = groups[code] || { label: item.subject_label || code, themes: {} };
    const theme = item.theme || "Tema belum tersedia";
    group.themes[theme] = [...(group.themes[theme] || []), item];
    groups[code] = group;
    return groups;
  }, {});
  const subjectIds = Object.keys(subjectGroups);
  const activeGroup = activeSubject ? subjectGroups[activeSubject] : null;
  const activeThemeEntries = activeGroup
    ? Object.entries(activeGroup.themes).sort((a, b) =>
        String(a[0]).localeCompare(String(b[0]), "id"),
      )
    : [];
  const activeTopicCount = activeThemeEntries.reduce(
    (total, [, rows]) => total + rows.length,
    0,
  );

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
              <Link
                className={buttonClass}
                href={`/school/profile`}
              >
                Profil Sekolah
              </Link>
              <Link className={buttonClass} href="/school/operator">
                Profil Operator
              </Link>
              <Link className={buttonClass} href="/school/assignment">
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

          <section id="students" className="mb-8 scroll-mt-28">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2
                id="label-riwayat"
                className="text-2xl font-extrabold tracking-tight text-slate-950"
              >
                Daftar Siswa
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="student-search">
                  Cari siswa
                </label>
                <input
                  id="student-search"
                  type="search"
                  value={studentSearch}
                  onChange={(event) => {
                    setStudentSearch(event.target.value);
                    setStudentPage(1);
                  }}
                  placeholder="Cari nama, NISN, atau email…"
                  className="min-h-11 w-56 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={openAddStudent}
                  className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800"
                >
                  Tambah
                </button>
              </div>
            </div>

            {studentNotice && (
              <div
                role="status"
                className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900"
              >
                {studentNotice}
              </div>
            )}

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
                    <th scope="col" className="px-4 py-3">
                      Email
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
                          {(safeStudentPage - 1) * pageSize + index + 1}
                        </td>
                        <td className="px-4 py-3">{student.nisn || "-"}</td>
                        <td className="px-4 py-3">
                          {student.full_name || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {student.email || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditStudent(student)}
                              className="whitespace-nowrap rounded-lg border border-blue-200 px-3 py-2 font-bold text-blue-700 hover:bg-blue-50"
                            >
                              Profil
                            </button>
                            <button
                              type="button"
                              onClick={() => openReviewStudent(student)}
                              className="whitespace-nowrap rounded-lg border border-blue-200 px-3 py-2 font-bold text-blue-700 hover:bg-blue-50"
                            >
                              Review
                            </button>
                            <button
                              type="button"
                              onClick={() => openResetPassword(student)}
                              className="whitespace-nowrap rounded-lg border border-blue-200 px-3 py-2 font-bold text-blue-700 hover:bg-blue-50"
                            >
                              Reset Password
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="5"
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        {allStudents.length
                          ? "Tidak ada siswa yang cocok dengan pencarian."
                          : "Belum ada siswa yang dikelola sekolah."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {allStudents.length > 0 && (
              <nav
                aria-label="Paging daftar siswa"
                className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <span className="text-slate-600">
                  {filteredStudents.length
                    ? `Menampilkan ${(safeStudentPage - 1) * pageSize + 1}–${Math.min(
                        safeStudentPage * pageSize,
                        filteredStudents.length,
                      )} dari ${filteredStudents.length} siswa · ${pageSize} baris per halaman`
                    : "Tidak ada siswa yang cocok"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Halaman sebelumnya"
                    disabled={safeStudentPage === 1}
                    onClick={() => setStudentPage(safeStudentPage - 1)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold disabled:opacity-40"
                  >
                    ← Sebelumnya
                  </button>
                  <span className="font-semibold text-slate-700">
                    Halaman {safeStudentPage} dari {totalStudentPages}
                  </span>
                  <button
                    type="button"
                    aria-label="Halaman berikutnya"
                    disabled={safeStudentPage === totalStudentPages}
                    onClick={() => setStudentPage(safeStudentPage + 1)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold disabled:opacity-40"
                  >
                    Berikutnya →
                  </button>
                </div>
              </nav>
            )}
          </section>

          {studentModal ? (
            <StudentFormModal
              key={`${studentModal.mode}-${studentModal.student?.id || "new"}`}
              mode={studentModal.mode}
              student={studentModal.student}
              busy={studentBusy}
              error={studentError}
              onClose={() => setStudentModal(null)}
              onSubmit={submitStudent}
            />
          ) : null}

          {resetTarget ? (
            <ResetPasswordModal
              key={resetTarget.id}
              student={resetTarget}
              busy={resetBusy}
              error={resetError}
              onClose={() => setResetTarget(null)}
              onSubmit={submitResetPassword}
            />
          ) : null}

          <section id="competency" className="mb-10 scroll-mt-28">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">
                  Kompetensi Sekolah
                </h2>
              </div>
              <p className="text-sm text-slate-500">
                {activeGroup
                  ? `${activeThemeEntries.length} tema · ${activeTopicCount} topik`
                  : "Sumber data: school_competency"}
              </p>
            </div>

            {competencyError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              >
                {competencyError}
              </div>
            )}

            {subjectIds.length ? (
              <div
                id="subject-list"
                role="tablist"
                aria-label="Mata pelajaran"
                className="mt-5 flex w-full flex-wrap gap-2 border-b border-slate-200 pb-3"
              >
                {subjectIds.map((subjectId) => {
                  const selected = activeSubject === subjectId;
                  return (
                    <button
                      key={subjectId}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveSubject(subjectId)}
                      className={`min-h-11 flex-1 basis-auto whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition ${
                        selected
                          ? "bg-blue-700 text-white shadow-sm"
                          : "bg-white text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      {subjectGroups[subjectId].label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {activeGroup ? (
              <div className="mt-4 space-y-4">
                {activeThemeEntries.map(([theme, rows]) => (
                  <article
                    key={`${activeSubject}-${theme}`}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <h4 className="font-bold text-slate-900">{theme}</h4>
                      <span className="text-xs text-slate-500">
                        {rows.length} topik
                      </span>
                    </header>
                    <ul className="divide-y divide-slate-100">
                      {rows
                        .slice()
                        .sort((a, b) =>
                          String(a.topic).localeCompare(String(b.topic), "id"),
                        )
                        .map((row) => {
                          const meta = competencyMeta(row.competency_level);
                          const valid = Number(row.no_of_valid_scores || 0);
                          return (
                            <li
                              key={`${activeSubject}-${theme}-${row.topic}`}
                              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">
                                  {row.topic}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Skor valid{" "}
                                  <strong className="text-slate-700">{valid}</strong>{" "}
                                  · rata-rata{" "}
                                  <strong className="text-slate-700">
                                    {formatScore(row.average_score)}
                                  </strong>
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 sm:w-24">
                                  <span
                                    className={`block h-full rounded-full ${meta.bar}`}
                                    style={{
                                      width: `${Math.min(100, Math.max(0, Number(row.average_score || 0)))}%`,
                                    }}
                                  />
                                </span>
                                <span
                                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${meta.tone}`}
                                >
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
            ) : !competencyError ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
                Belum ada data kompetensi untuk jenjang ini.
              </p>
            ) : null}
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

