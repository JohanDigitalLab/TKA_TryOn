"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PortalHeader from "@/components/portal-header";
import DashboardBreadcrumb from "@/components/dashboard-breadcrumb";
import { educationLevels } from "@/lib/student/registration.mjs";
import { supabase } from "@/lib/supabase";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];
const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelClass = "block text-sm font-semibold text-slate-800";

function initialsOf(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "S";
}

function avatarPathOf(url) {
  const value = String(url || "");
  const marker = `/${AVATAR_BUCKET}/`;
  const index = value.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(value.slice(index + marker.length));
}

function AlertPopup({ tone = "notice", message, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        role={tone === "error" ? "alert" : "status"}
        aria-live={tone === "error" ? "assertive" : "polite"}
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className={`w-full max-w-md rounded-2xl border p-6 shadow-xl ${
          tone === "error"
            ? "border-red-200 bg-red-50 text-red-900"
            : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}
      >
        <p className="text-sm font-extrabold">
          {tone === "error" ? "Terjadi kesalahan" : "Informasi"}
        </p>
        <p className="mt-2 text-sm leading-6">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className={`mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-bold text-white ${
            tone === "error"
              ? "bg-red-600 hover:bg-red-700"
              : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          Tutup
        </button>
      </div>
    </div>
  );
}

function Field({ label, name, hint, required = false, ...props }) {
  return (
    <label className={labelClass} htmlFor={name}>
      {label}
      {required ? <span className="ml-1 text-rose-600">*</span> : null}
      <input id={name} name={name} className={inputClass} {...props} />
      {hint ? <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}

export default function StudentProfilePage() {
  const router = useRouter();
  const lock = useRef(false);

  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    nickname: "",
    avatar_url: "",
    education_level: "",
    nisn: "",
    email: "",
    wa_number: "",
  });

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      let denied = false;
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
        if (!active) return;
        if (sessionError) throw sessionError;
        if (!sessionData?.user) {
          denied = true;
          setRedirecting(true);
          router.replace("/");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select(
            "full_name, nickname, avatar_url, education_level, nisn, wa_number, account_type, is_managed, profile_completed"
          )
          .eq("id", sessionData.user.id)
          .maybeSingle();
        if (!active) return;
        if (profileError) throw profileError;

        const isIndependentStudent =
          String(profile?.account_type || "").toUpperCase() === "STUDENT" &&
          profile?.is_managed === false;

        if (!isIndependentStudent) {
          denied = true;
          setRedirecting(true);
          router.replace("/home");
          return;
        }

        setUserId(sessionData.user.id);
        setForm({
          full_name: profile.full_name || "",
          nickname: profile.nickname || "",
          avatar_url: profile.avatar_url || "",
          education_level: profile.education_level || "",
          nisn: profile.nisn ? String(profile.nisn).trim() : "",
          // Email selalu merujuk email login (auth.users), bukan kolom profiles.
          email: sessionData.user.email || "",
          wa_number: profile.wa_number || "",
        });
        setError("");
      } catch (err) {
        if (active) setError(err.message || "Profil belum berhasil dimuat.");
      } finally {
        if (active && !denied) setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, [router]);

  function update(name) {
    return (event) => {
      const value = event.target.value;
      setNotice("");
      setForm((previous) => ({ ...previous, [name]: value }));
    };
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !userId) return;

    if (!AVATAR_TYPES.includes(file.type)) {
      setError("Format avatar harus PNG, JPG, atau WEBP.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError("Ukuran avatar maksimal 2 MB.");
      return;
    }

    setError("");
    setNotice("");
    setAvatarBusy(true);
    try {
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const previousPath = avatarPathOf(form.avatar_url);

      setForm((previous) => ({ ...previous, avatar_url: data.publicUrl }));
      setNotice("Avatar berhasil diunggah. Tekan Simpan untuk menyimpan perubahan.");

      if (previousPath && previousPath !== path) {
        // Best effort: hapus avatar lama milik sendiri agar storage tidak menumpuk.
        await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);
      }
    } catch (err) {
      setError(err.message || "Avatar belum berhasil diunggah.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (lock.current) return;
    if (form.full_name.trim().length < 2) {
      setError("Nama lengkap minimal 2 karakter.");
      return;
    }
    if (form.nisn.trim() && !/^[0-9]{10}$/.test(form.nisn.trim())) {
      setError("NISN harus tepat 10 digit angka.");
      return;
    }

    lock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data, error: rpcError } = await supabase.rpc("update_student_profile", {
        p_full_name: form.full_name.trim(),
        p_nickname: form.nickname.trim() || null,
        p_avatar_url: form.avatar_url.trim() || null,
        p_education_level: form.education_level || null,
        p_nisn: form.nisn.trim() || null,
        p_wa_number: form.wa_number.trim() || null,
      });
      if (rpcError) throw rpcError;

      setForm((previous) => ({
        ...previous,
        full_name: data?.full_name ?? previous.full_name,
        nickname: data?.nickname ?? previous.nickname,
        avatar_url: data?.avatar_url ?? previous.avatar_url,
        education_level: data?.education_level ?? previous.education_level,
        nisn: data?.nisn ?? previous.nisn,
        email: data?.email ?? previous.email,
        wa_number: data?.wa_number ?? previous.wa_number,
      }));
      setNotice(
        data?.profile_completed
          ? "Profil tersimpan dan sudah lengkap."
          : "Profil tersimpan. Lengkapi nama, email, nomor WhatsApp, dan jenjang agar profil dianggap selesai."
      );
    } catch (err) {
      setError(err.message || "Profil belum berhasil disimpan.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/");
  }

  const checklist = useMemo(
    () => [
      { label: "Nama lengkap", done: form.full_name.trim().length > 0 },
      { label: "Email", done: form.email.trim().length > 0 },
      { label: "Nomor WhatsApp", done: form.wa_number.trim().length > 0 },
      { label: "Jenjang pendidikan", done: ["sd", "smp", "sma"].includes(form.education_level) },
    ],
    [form]
  );
  const isComplete = checklist.every((item) => item.done);
  const busy = saving || avatarBusy;

  if (redirecting) {
    // Jangan pernah merender formulir profil saat akun tidak berhak mengaksesnya.
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p role="status" className="font-semibold text-slate-600">Mengalihkan…</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p role="status" className="font-semibold text-slate-600">
          Memuat profil…
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <PortalHeader
        displayName={form.full_name || "Siswa"}
        signingOut={signingOut}
        onSignOut={handleSignOut}
      />

      <div className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
        <DashboardBreadcrumb current="Profil Siswa" />
       {/* PAGE TITLE */}
        <section className="mb-8">
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Perbarui Data Profil
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Perbarui identitas dan kontak belajar kamu.
          </p>
        </section>

        {!isComplete && (
          <section className="mb-8">
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-bold">Profil belum lengkap</p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {checklist.map((item) => (
                  <li key={item.label} className="flex items-center gap-2">
                    <span aria-hidden="true" className="font-bold">
                      {item.done ? "✓" : "○"}
                    </span>
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {error && (
          <AlertPopup tone="error" message={error} onClose={() => setError("")} />
        )}
        {notice && (
          <AlertPopup tone="notice" message={notice} onClose={() => setNotice("")} />
        )}

        <form onSubmit={handleSubmit} aria-busy={busy} className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <fieldset disabled={busy} className="space-y-5">
            <div className="flex flex-wrap items-center gap-5">
              <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-100 text-xl font-black text-blue-700">
                {form.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.avatar_url} alt={`Avatar ${form.full_name || "siswa"}`} className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden="true">{initialsOf(form.full_name)}</span>
                )}
              </span>
              <div className="min-w-0">
                <label className={labelClass} htmlFor="avatar_file">
                  Avatar
                </label>
                <input
                  id="avatar_file"
                  name="avatar_file"
                  type="file"
                  accept={AVATAR_TYPES.join(",")}
                  onChange={handleAvatarChange}
                  className="mt-2 block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-blue-700 file:px-4 file:text-sm file:font-bold file:text-white hover:file:bg-blue-800"
                />
                <p className="mt-1 text-xs text-slate-500">
                  PNG, JPG, atau WEBP · maksimal 2 MB{avatarBusy ? " · sedang mengunggah…" : ""}
                </p>
              </div>
            </div>

            <Field
              label="Nama lengkap"
              name="full_name"
              value={form.full_name}
              onChange={update("full_name")}
              autoComplete="name"
              minLength={2}
              maxLength={160}
              required
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Nama panggilan"
                name="nickname"
                value={form.nickname}
                onChange={update("nickname")}
                maxLength={50}
                placeholder="Contoh: Aisha"
              />
              <label className={labelClass} htmlFor="education_level">
                Jenjang pendidikan
                <select
                  id="education_level"
                  name="education_level"
                  value={form.education_level}
                  onChange={update("education_level")}
                  className={inputClass}
                >
                  <option value="">Pilih jenjang…</option>
                  {educationLevels.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Pilih jenjang yang sesuai dengan kelas kamu saat ini.
                </span>
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="NISN"
                name="nisn"
                value={form.nisn}
                onChange={update("nisn")}
                inputMode="numeric"
                maxLength={10}
                placeholder="10 digit angka"
                hint="Opsional, namun harus tepat 10 digit bila diisi."
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-slate-500">Email akun</p>
                <p className="mt-1 break-all font-bold text-slate-900">{form.email || "-"}</p>
                <p className="mt-1 text-xs text-slate-500">Email tidak dapat diubah dari halaman ini.</p>
              </div>

            </div>

            <Field
              label="Nomor WhatsApp"
              name="wa_number"
              type="tel"
              value={form.wa_number}
              onChange={update("wa_number")}
              autoComplete="tel"
              placeholder="0812xxxxxxxx"
              hint="Dinormalisasi menjadi format +62 saat disimpan."
            />

            <button
              type="submit"
              className="min-h-14 w-full rounded-2xl bg-gradient-to-r from-blue-700 to-indigo-600 px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 hover:from-blue-800 hover:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:opacity-60"
            >
              {saving ? "Menyimpan…" : "Simpan Perubahan"}
            </button>
          </fieldset>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          TKA TryOut · Data profil hanya dapat diubah oleh pemilik akun.
        </p>
      </div>
    </main>
  );
}
