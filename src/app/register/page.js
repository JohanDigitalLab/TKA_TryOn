"use client";

import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { text } from "@/lib/school/onboarding.mjs";
import { educationLevels, registrationContext, registrationEducationLevel } from "@/lib/student/registration.mjs";
import { Field, inputClass, buttonClass } from "@/components/school/portal";

const HOME = "/";

function Register({ context }) {
  const router = useRouter();
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
      const educationLevel = registrationEducationLevel(context, values.education_level);
      if (values.password.length < 8) throw new Error("Password minimal 8 karakter.");
      if (values.password !== values.confirm_password) throw new Error("Konfirmasi password tidak sama dengan password.");
      lock.current = true;
      setBusy(true);
      setResendEmail(values.email.trim());
      const { data, error } = await supabase.auth.signUp({
        email: values.email.trim(),
        password: values.password,
        options: {
          data: { full_name: name, education_level: educationLevel, registration_method: "independent" },
          emailRedirectTo: `${window.location.origin}${HOME}`,
        },
      });
      if (error) throw error;
      setNotice("Permintaan pendaftaran sudah dikirim. Periksa kotak masuk dan folder spam emailmu, lalu buka tautan konfirmasi untuk melanjutkan. Setelah terverifikasi, kamu akan diarahkan ke halaman utama. Jika emailmu sudah terdaftar, masuk dengan akun yang sudah ada.");
      if (data.session && data.user?.email_confirmed_at) router.push(HOME);
    } catch (e) {
      setError(e.message || "Pendaftaran belum berhasil.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function resend() {
    if (lock.current) return;
    if (!resendEmail.trim()) { setError("Masukkan email pendaftaran."); return; }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: resendEmail.trim(), options: { emailRedirectTo: `${window.location.origin}${HOME}` } });
      if (error) throw error;
      setNotice("Permintaan kirim ulang sudah diproses. Jika akunmu memenuhi syarat, email konfirmasi akan dikirim. Periksa kotak masuk dan folder spam emailmu.");
    } catch (e) {
      setError(e.message || "Email belum dapat dikirim.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10">
      <div className="mx-auto max-w-xl space-y-6 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <Link href="/" className="inline-flex items-center gap-3 font-bold text-blue-800">
          <BrandLogo className="h-14 w-14" />
          <span>← Beranda TKA TryOut</span>
        </Link>
        <h1 className="text-3xl font-black">Daftar Akun</h1>
        <p>Buat akun untuk mulai latihan, tryout, dan memantau perkembangan belajarmu.</p>
        <form onSubmit={register} aria-busy={busy}>
          <fieldset disabled={busy} className="space-y-4">
            <Field name="full_name" label="Nama lengkap" autoComplete="name" minLength={2} maxLength={160} required />
            <Field name="email" label="Email" type="email" autoComplete="email" required />
            {level ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <p>Jenjang pendidikan siswa: <strong>{level.label}</strong></p>
                <p className="mt-1 text-slate-600">Sesuai jenjang yang kamu pilih sebelumnya. <Link href="/#jenjang" className="font-bold text-blue-800 underline">Pilih jenjang lain</Link></p>
              </div>
            ) : <Field name="education_level" label="Jenjang pendidikan siswa" required options={educationLevels} />}
            <Field name="password" label="Password (minimal 8 karakter)" type="password" autoComplete="new-password" minLength={8} required />
            <Field name="confirm_password" label="Ulangi password" type="password" autoComplete="new-password" minLength={8} required />
            {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
            <button className={`${buttonClass} w-full`} type="submit">{busy ? "Memproses…" : "Daftar Akun"}</button>
          </fieldset>
        </form>
        {notice && <div role="status" className="space-y-2 rounded border border-green-200 bg-green-50 p-4 text-green-900"><p>{notice}</p><Link href="/" className="font-bold underline">Kembali ke halaman utama →</Link></div>}
        <section className="space-y-3 border-t border-slate-200 pt-5">
          <h2 className="font-bold">Kirim ulang verifikasi email</h2>
          <label className="block text-sm font-semibold">Email pendaftaran<input className={inputClass} type="email" value={resendEmail} disabled={busy} onChange={e => setResendEmail(e.target.value)} /></label>
          <button type="button" className={buttonClass} disabled={busy} onClick={resend}>Kirim ulang</button>
        </section>
        <p>Sudah punya akun? <Link href="/" className="font-bold text-blue-800 underline">Masuk</Link></p>
      </div>
    </main>
  );
}

function RegistrationContext() {
  const params = useSearchParams();
  const context = registrationContext(params);
  return <Register key={context.level?.value ?? "none"} context={context} />;
}

export default function RegisterPage() {
  return <Suspense fallback={<p role="status" className="p-8">Memuat pendaftaran…</p>}><RegistrationContext /></Suspense>;
}
