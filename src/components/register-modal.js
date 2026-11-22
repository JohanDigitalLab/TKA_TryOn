"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";
import {
  educationLevels,
  registrationEducationLevel,
} from "@/lib/student/registration.mjs";
import { text } from "@/lib/school/onboarding.mjs";

export default function RegisterModal({ level, onClose }) {
  const router = useRouter();
  const { theme } = useTheme();
  const light = theme === "light";
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
    try {
      const name = text(values.full_name, "Nama lengkap", 2, 160);
      const educationLevel = registrationEducationLevel(
        { level },
        values.education_level,
      );
      if (values.password.length < 8)
        throw new Error("Password minimal 8 karakter.");
      if (values.password !== values.confirm_password)
        throw new Error("Konfirmasi password tidak sama dengan password.");
      lock.current = true;
      setBusy(true);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: values.email.trim(),
        password: values.password,
        options: {
          data: {
            full_name: name,
            education_level: educationLevel,
            registration_method: "independent",
          },
          emailRedirectTo: window.location.origin,
        },
      });
      if (signUpError) throw signUpError;
      setNotice(
        "Pendaftaran berhasil dikirim. Cek emailmu untuk konfirmasi akun.",
      );
      if (data.session && data.user?.email_confirmed_at) router.push("/home");
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
        options: { emailRedirectTo: window.location.origin },
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

  const inputClass = `mt-2 w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-cyan-400 ${light ? "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400" : "border-white/15 bg-[#252552] text-white placeholder:text-white/50"}`;

  return (
    <div
      className={`fixed inset-0 z-50 grid place-items-center overflow-y-auto px-4 py-6 backdrop-blur-md ${light ? "bg-slate-900/25" : "bg-[#080817]/80"}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        onSubmit={register}
        className={`w-full max-w-lg rounded-[2rem] border p-6 shadow-2xl sm:p-8 ${light ? "border-slate-200 bg-white text-slate-900" : "border-white/15 bg-[#191940] text-white"}`}
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs font-black tracking-[.25em] text-cyan-400">
              JOIN THE CREW
            </p>
            <h2 className="mt-2 text-3xl font-black">Daftar akun baru ✦</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`text-2xl ${light ? "text-slate-400" : "text-white/60"}`}
          >
            ×
          </button>
        </div>
        <fieldset disabled={busy} className="space-y-4">
          <label className="block text-sm font-bold">
            Nama lengkap
            <input
              name="full_name"
              autoComplete="name"
              minLength={2}
              maxLength={160}
              required
              className={`mt-2 w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-cyan-400 ${light ? "border-slate-200 bg-slate-50 text-slate-900" : "border-white/15 bg-white/10 text-white"}`}
            />
          </label>
          <label className="block text-sm font-bold">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className={`mt-2 w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-cyan-400 ${light ? "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400" : "border-white/15 bg-white/10 text-white placeholder:text-white/50"}`}
            />
          </label>
          {level ? (
            <div
              className={`rounded-2xl border p-4 text-sm ${light ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/[.05]"}`}
            >
              Jenjang:{" "}
              <strong>
                {educationLevels.find((item) => item.value === level)?.label}
              </strong>
              <input type="hidden" name="education_level" value={level} />
            </div>
          ) : (
            <label className="block text-sm font-bold">
              Jenjang pendidikan
              <select
                name="education_level"
                required
                defaultValue=""
                className={`mt-2 w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-cyan-400 ${light ? "border-slate-200 bg-slate-50 text-slate-900" : "border-white/15 bg-[#252552] text-white"}`}
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
              name="password"
              type="password"
              minLength={8}
              required
              className={`mt-2 w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-cyan-400 ${light ? "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400" : "border-white/15 bg-white/10 text-white placeholder:text-white/50"}`}
            />
          </label>
          <label className="block text-sm font-bold">
            Ulangi password
            <input
              name="confirm_password"
              type="password"
              minLength={8}
              required
              className={`mt-2 w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-cyan-400 ${light ? "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400" : "border-white/15 bg-white/10 text-white placeholder:text-white/50"}`}
            />
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-2xl bg-red-400/15 p-4 text-sm text-red-200"
            >
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="rounded-2xl bg-emerald-400/15 p-4 text-sm text-emerald-200"
            >
              {notice}
            </p>
          )}
          <button
            className="w-full rounded-2xl bg-[#d9ff5b] py-4 font-black text-[#10102a] shadow-[4px_4px_0_#60a5fa] disabled:opacity-60"
            type="submit"
          >
            {busy ? "Memproses..." : "Mulai sekarang →"}
          </button>
        </fieldset>
        <div
          className={`mt-7 border-t pt-5 ${light ? "border-slate-200" : "border-white/10"}`}
        >
          <p className="text-sm font-bold">Belum menerima email verifikasi?</p>
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
      </form>
    </div>
  );
}
