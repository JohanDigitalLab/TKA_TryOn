"use client";

import Link from "next/link";
import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BrandLogo from "@/components/brand-logo";
import { supabase } from "@/lib/supabase";
import { text } from "@/lib/school/onboarding.mjs";
import {
  educationLevels,
  registrationContext,
  registrationEducationLevel,
} from "@/lib/student/registration.mjs";
import { useTheme } from "@/components/theme-provider";

const HOME = "/";

function RegisterNewForm({ context }) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { level } = context;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const lock = useRef(false);

  async function register(event) {
    event.preventDefault();
    if (lock.current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError("");
    setNotice("");
    try {
      const name = text(values.full_name, "Nama lengkap", 2, 160);
      const educationLevel = registrationEducationLevel(
        context,
        values.education_level,
      );
      if (values.password.length < 8)
        throw new Error("Password minimal 8 karakter.");
      if (values.password !== values.confirm_password)
        throw new Error("Konfirmasi password tidak sama dengan password.");
      lock.current = true;
      setBusy(true);
      setResendEmail(values.email.trim());
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: values.email.trim(),
        password: values.password,
        options: {
          data: {
            full_name: name,
            education_level: educationLevel,
            registration_method: "independent",
          },
          emailRedirectTo: `${window.location.origin}${HOME}`,
        },
      });
      if (signUpError) throw signUpError;
      setNotice(
        "Pendaftaran berhasil dikirim. Cek emailmu untuk konfirmasi akun.",
      );
      if (data.session && data.user?.email_confirmed_at) router.push(HOME);
    } catch (caughtError) {
      setError(caughtError.message || "Pendaftaran belum berhasil.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function resend() {
    if (lock.current) return;
    if (!resendEmail.trim()) {
      setError("Masukkan email pendaftaran.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: resendEmail.trim(),
        options: { emailRedirectTo: `${window.location.origin}${HOME}` },
      });
      if (resendError) throw resendError;
      setNotice("Email verifikasi dikirim ulang. Cek inbox dan folder spam.");
    } catch (caughtError) {
      setError(caughtError.message || "Email belum dapat dikirim.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const light = theme === "light";
  const inputClass = `mt-2 w-full rounded-2xl border px-4 py-3.5 outline-none transition focus:border-cyan-400 ${light ? "border-slate-200 bg-slate-50 text-slate-900" : "border-white/15 bg-white/10 text-white"}`;

  return (
    <main
      className={`min-h-screen overflow-hidden px-5 py-6 sm:px-8 ${light ? "bg-slate-50 text-[#171735]" : "bg-[#10102a] text-white"}`}
    >
      <div
        className={`pointer-events-none fixed inset-0 opacity-30 ${light ? "hidden" : ""}`}
        aria-hidden="true"
      >
        <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-cyan-400 blur-[120px]" />
        <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-blue-500 blur-[140px]" />
      </div>
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo className="h-25 w-25" priority />
          <div>
            <p className="text-lg font-black tracking-tight">
              TKA <span className="text-cyan-300">TryOn</span>
            </p>
            <p className="theme-subtle text-[9px] font-bold tracking-[0.2em]">
              SKILL ON • CONFIDENCE ON
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className={`rounded-full border px-3 py-2 text-sm ${light ? "border-slate-300" : "border-white/20"}`}
            aria-label="Ganti tema"
          >
            {light ? "🌙" : "☀️"}
          </button>
        </div>
      </header>
      <div className="relative z-10 mx-auto grid max-w-6xl gap-10 py-10 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:py-16">
        <section
          className={`rounded-[2rem] border p-6 shadow-2xl backdrop-blur-xl sm:p-8 ${light ? "border-slate-200 bg-white" : "border-white/15 bg-white/[.08]"}`}
        >
          <div className="mb-7">
            <p className="text-xs font-black tracking-[.25em] text-cyan-400">
              JOIN THE CREW
            </p>
            <h2 className="mt-2 text-3xl font-black">Daftar akun baru ✦</h2>
          </div>
          <form onSubmit={register} aria-busy={busy}>
            <fieldset disabled={busy} className="space-y-4">
              <label className="block text-sm font-bold">
                Nama lengkap
                <input
                  className={inputClass}
                  name="full_name"
                  autoComplete="name"
                  minLength={2}
                  maxLength={160}
                  required
                />
              </label>
              <label className="block text-sm font-bold">
                Email
                <input
                  className={inputClass}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              {level ? (
                <div
                  className={`rounded-2xl border p-4 text-sm ${light ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/[.05]"}`}
                >
                  <p>
                    Jenjang: <strong>{level.label}</strong>
                  </p>
                  <Link
                    href="/#jenjang"
                    className="mt-1 inline-block font-bold text-cyan-500 underline"
                  >
                    Pilih jenjang lain
                  </Link>
                </div>
              ) : (
                <label className="block text-sm font-bold">
                  Jenjang pendidikan
                  <select
                    className={inputClass}
                    name="education_level"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Pilih jenjang
                    </option>
                    {educationLevels.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block text-sm font-bold">
                Password
                <input
                  className={inputClass}
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <label className="block text-sm font-bold">
                Ulangi password
                <input
                  className={inputClass}
                  name="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              {error && (
                <p
                  role="alert"
                  className="rounded-2xl bg-red-400/15 p-4 text-sm text-red-300"
                >
                  {error}
                </p>
              )}
              <button
                className="w-full rounded-2xl bg-[#d9ff5b] py-4 font-black text-[#10102a] shadow-[4px_4px_0_#f5a8ff] transition hover:-translate-y-1 disabled:opacity-60"
                type="submit"
              >
                {busy ? "Memproses..." : "Mulai sekarang →"}
              </button>
            </fieldset>
          </form>
          {notice && (
            <div
              role="status"
              className="mt-5 rounded-2xl bg-emerald-400/15 p-4 text-sm text-emerald-300"
            >
              {notice}
            </div>
          )}
          <div
            className={`mt-7 border-t pt-5 ${light ? "border-slate-200" : "border-white/10"}`}
          >
            <p className="text-sm font-bold">
              Belum menerima email verifikasi?
            </p>
            <div className="mt-3 flex gap-2">
              <input
                className={inputClass}
                type="email"
                placeholder="Email pendaftaran"
                value={resendEmail}
                disabled={busy}
                onChange={(event) => setResendEmail(event.target.value)}
              />
              <button
                type="button"
                className="rounded-2xl border border-cyan-400 px-4 text-sm font-bold text-cyan-400"
                disabled={busy}
                onClick={resend}
              >
                Kirim
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function RegistrationContext() {
  const params = useSearchParams();
  return <RegisterNewForm context={registrationContext(params)} />;
}

export default function RegisterNewPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#10102a] p-8 text-white">
          Memuat pendaftaran...
        </main>
      }
    >
      <RegistrationContext />
    </Suspense>
  );
}
