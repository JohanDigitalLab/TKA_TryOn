"use client";

import Link from "next/link";
import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authLink, joinPath, text } from "@/lib/school/onboarding.mjs";
import { educationLevels, registrationContext, registrationEducationLevel } from "@/lib/student/registration.mjs";
import { Field, inputClass, buttonClass } from "@/components/school/portal";

function Register({ context }) {
  const router = useRouter();
  const { next, level } = context;
  const [selectedMethod, setSelectedMethod] = useState("independent");
  const method = context.method || selectedMethod;
  const school = method === "school";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const initialDestination = school && !next.startsWith("/school/join") ? "/school/join" : next;
  const [destination, setDestination] = useState(initialDestination);
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
      const target = school ? (values.code?.trim() ? joinPath(values.code) : next.startsWith("/school/join") ? next : "/school/join") : next;
      lock.current = true;
      setBusy(true);
      setDestination(target);
      setResendEmail(values.email.trim());
      const { data, error } = await supabase.auth.signUp({
        email: values.email.trim(),
        password: values.password,
        options: {
          data: { full_name: name, education_level: educationLevel, registration_method: method },
          emailRedirectTo: `${window.location.origin}${target}`,
        },
      });
      if (error) throw error;
      setNotice(`Permintaan pendaftaran sudah dikirim. Periksa kotak masuk dan folder spam emailmu, lalu buka tautan konfirmasi untuk melanjutkan. Jika emailmu sudah terdaftar, masuk dengan akun yang sudah ada.${school ? " Untuk bergabung ke sekolah, periksa dan konfirmasi undangan setelah masuk, lalu tunggu persetujuan admin sekolah." : ""}`);
      if (data.session && data.user?.email_confirmed_at) router.push(target);
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
      const { error } = await supabase.auth.resend({ type: "signup", email: resendEmail.trim(), options: { emailRedirectTo: `${window.location.origin}${destination}` } });
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
        <Link href="/" className="font-bold text-blue-800">← Beranda</Link>
        <h1 className="text-3xl font-black">{context.method ? school ? "Daftar siswa sekolah" : "Daftar siswa mandiri" : "Daftar akun siswa"}</h1>
        <p>{school ? "Gunakan undangan dari admin sekolah untuk bergabung. Pendaftaran akun tidak langsung mengaktifkan keanggotaan sekolah." : "Belajar secara mandiri tanpa perlu bergabung ke sekolah."} Untuk guru atau staf sekolah, <Link href="/school/register" className="font-bold text-blue-800 underline">daftar akun staf / sekolah di sini</Link>.</p>
        {context.method ? (
          school && <section aria-label="Pilihan pendaftaran" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <p>Jenis pendaftaran: <strong>{school ? "Siswa undangan sekolah" : "Siswa mandiri"}</strong></p>
            <p className="mt-1">Pilihan dari halaman sebelumnya sudah diterapkan.</p>
          </section>
        ) : (
          <div className="flex flex-wrap gap-3" aria-label="Jenis pendaftaran siswa">
            <button type="button" disabled={busy} aria-pressed={!school} className="min-h-11 rounded border px-4 py-2 font-bold aria-pressed:bg-blue-100" onClick={() => setSelectedMethod("independent")}>Siswa mandiri</button>
            <button type="button" disabled={busy} aria-pressed={school} className="min-h-11 rounded border px-4 py-2 font-bold aria-pressed:bg-blue-100" onClick={() => setSelectedMethod("school")}>Siswa undangan sekolah</button>
          </div>
        )}
        {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
        {notice && <div role="status" className="space-y-2 rounded border border-green-200 bg-green-50 p-4 text-green-900"><p>{notice}</p><Link href={authLink("login", destination)} className="font-bold underline">Masuk dan lanjutkan →</Link></div>}
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
            {school && <>
              <Field name="code" label="Kode undangan (opsional bila akan dimasukkan setelah login)" minLength={64} maxLength={64} defaultValue={next.startsWith("/school/join") ? new URL(next, "https://local.invalid").searchParams.get("code") || "" : ""} />
              <p className="text-sm text-slate-600">Setelah mengonfirmasi email dan masuk, kamu perlu memeriksa serta mengonfirmasi undangan di portal sekolah. Keanggotaanmu baru aktif setelah disetujui admin sekolah.</p>
            </>}
            <Field name="password" label="Password (minimal 8 karakter)" type="password" autoComplete="new-password" minLength={8} required />
            <button className={`${buttonClass} w-full`} type="submit">{busy ? "Memproses…" : school ? "Buat akun siswa sekolah" : "Buat akun siswa mandiri"}</button>
          </fieldset>
        </form>
        <section className="space-y-3 border-t border-slate-200 pt-5">
          <h2 className="font-bold">Kirim ulang verifikasi email</h2>
          <label className="block text-sm font-semibold">Email pendaftaran<input className={inputClass} type="email" value={resendEmail} disabled={busy} onChange={e => setResendEmail(e.target.value)} /></label>
          <button type="button" className={buttonClass} disabled={busy} onClick={resend}>Kirim ulang</button>
        </section>
        <p>Sudah punya akun? <Link href={authLink("login", school && !next.startsWith("/school/join") ? "/school/join" : next)} className="font-bold text-blue-800 underline">Masuk</Link> · <Link href="/school/join" className="font-bold text-blue-800 underline">Gabung sekolah</Link></p>
      </div>
    </main>
  );
}

function RegistrationContext() {
  const params = useSearchParams();
  const context = registrationContext(params);
  return <Register key={`${context.method}:${context.level?.value}:${context.next}`} context={context} />;
}

export default function RegisterPage() {
  return <Suspense fallback={<p role="status" className="p-8">Memuat pendaftaran…</p>}><RegistrationContext /></Suspense>;
}
