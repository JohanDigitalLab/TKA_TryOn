"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PortalHeader from "@/components/portal-header";
import DashboardBreadcrumb from "@/components/dashboard-breadcrumb";
import { supabase } from "@/lib/supabase";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];
const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelClass = "block text-sm font-semibold text-slate-800";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-60";

function initialsOf(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "A";
}

function avatarPathOf(url) {
  const value = String(url || "");
  const marker = `/${AVATAR_BUCKET}/`;
  const index = value.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(value.slice(index + marker.length));
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

export default function SchoolOperatorPage() {
  const router = useRouter();
  const lock = useRef(false);

  const [userId, setUserId] = useState(null);
  const [accountType, setAccountType] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    full_name: "",
    nickname: "",
    avatar_url: "",
    email: "",
    wa_number: "",
    education_level: "",
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
            "full_name, nickname, avatar_url, wa_number, education_level, account_type, school_id, profile_completed"
          )
          .eq("id", sessionData.user.id)
          .maybeSingle();
        if (!active) return;
        if (profileError) throw profileError;

        const type = String(profile?.account_type || "").toUpperCase();
        if (type !== "SCHOOL" && type !== "ADMIN") {
          denied = true;
          setRedirecting(true);
          router.replace("/home");
          return;
        }

        setUserId(sessionData.user.id);
        setAccountType(type);
        setSchoolId(profile.school_id || "");
        setForm({
          full_name: profile.full_name || "",
          nickname: profile.nickname || "",
          avatar_url: profile.avatar_url || "",
          // Email selalu merujuk email login (auth.users), bukan kolom profiles.
          email: sessionData.user.email || "",
          wa_number: profile.wa_number || "",
          education_level: profile.education_level || "",
        });
        setError("");
      } catch (err) {
        if (active && !denied) setError(err.message || "Profil belum berhasil dimuat.");
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
      setNotice("");
      setForm((previous) => ({ ...previous, [name]: event.target.value }));
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

    lock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data, error: rpcError } = await supabase.rpc("update_operator_profile", {
        p_full_name: form.full_name.trim(),
        p_nickname: form.nickname.trim() || null,
        p_avatar_url: form.avatar_url.trim() || null,
        p_wa_number: form.wa_number.trim() || null,
      });
      if (rpcError) {
        if (rpcError.code === "PGRST202")
          throw new Error(
            "RPC update_operator_profile belum tersedia. Jalankan migration-school-profile-operator.sql di Supabase SQL Editor.",
          );
        throw rpcError;
      }

      setForm((previous) => ({
        ...previous,
        full_name: data?.full_name ?? previous.full_name,
        nickname: data?.nickname ?? previous.nickname,
        avatar_url: data?.avatar_url ?? previous.avatar_url,
        email: data?.email ?? previous.email,
        wa_number: data?.wa_number ?? previous.wa_number,
        education_level: data?.education_level ?? previous.education_level,
      }));
      setNotice(
        data?.profile_completed
          ? "Profil tersimpan dan sudah lengkap."
          : "Profil tersimpan. Jenjang pendidikan akan terisi otomatis setelah admin menautkan akun ini ke sekolah."
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
      {
        label: "Jenjang pendidikan",
        done: ["sd", "smp", "sma"].includes(String(form.education_level || "").toLowerCase()),
      },
    ],
    [form]
  );
  const isComplete = checklist.every((item) => item.done);
  const busy = saving || avatarBusy;

  if (redirecting) {
    // Jangan pernah merender formulir saat akun tidak berhak mengakses halaman ini.
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p role="status" className="font-semibold text-slate-600">Mengalihkan…</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p role="status" className="font-semibold text-slate-600">Memuat profil…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <PortalHeader displayName={form.full_name || "Operator"} signingOut={signingOut} onSignOut={handleSignOut} />

      <div className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
        <DashboardBreadcrumb current="Profil Operator" />

       <section id="greeting" className="mb-10 scroll-mt-28">
          <div className="mb-5">
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Profil Pengelola
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Perbarui identitas dan kontak kamu sebagai pengelola akun sekolah.
          </p>
          </div>
        </section>

        {error && (
          <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            {notice}
          </div>
        )}

       <section id="completion" className="mb-10 scroll-mt-28">
          <div
            className={`mt-5 rounded-xl border p-4 text-sm ${
              isComplete
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <p className="font-bold">{isComplete ? "Profil lengkap" : "Profil belum lengkap"}</p>
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
            {!isComplete ? (
              <p className="mt-2 text-xs">
                Jenjang pendidikan diambil dari sekolah tempat akun ini ditautkan.
              </p>
            ) : null}
          </div>
       </section>

        {!schoolId && accountType === "SCHOOL" ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Kamu belum terdaftar untuk menjadi admin sekolah manapun. Minta admin yang sekarang untuk
            mendaftarkan akunmu sebagai admin sekolah.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} aria-busy={busy} className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <fieldset disabled={busy} className="space-y-5">
            <div className="flex flex-wrap items-center gap-5">
              <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-100 text-xl font-black text-blue-700">
                {form.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.avatar_url} alt={`Avatar ${form.full_name || "operator"}`} className="h-full w-full object-cover" />
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
            <Field
              label="Nama panggilan"
              name="nickname"
              value={form.nickname}
              onChange={update("nickname")}
              maxLength={50}
              placeholder="Contoh: Aisyah"
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-slate-500">Email akun</p>
                <p className="mt-1 break-all font-bold text-slate-900">{form.email || "-"}</p>
                <p className="mt-1 text-xs text-slate-500">Email tidak dapat diubah dari halaman ini.</p>
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
            </div>

            <button
              type="submit"
              className="min-h-14 w-full rounded-2xl bg-gradient-to-r from-blue-700 to-indigo-600 px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 hover:from-blue-800 hover:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:opacity-60"
            >
              {saving ? "Menyimpan…" : "Simpan Perubahan"}
            </button>
          </fieldset>
        </form>

      </div>
    </main>
  );
}
